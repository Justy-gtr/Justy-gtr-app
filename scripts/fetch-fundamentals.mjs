import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { UNIVERSE, VALUE_SYMBOLS, buildSymbolRecord, shouldSkipFundamentals } from "../js/bewertung.js";
import { berlinDay } from "../js/seasonality.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const filePath = path.join(root, "data", "fundamentals.json");
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fxFallback() {
  try {
    const prices = JSON.parse(fs.readFileSync(path.join(root, "data", "prices.json"), "utf8"));
    const rate = Number(prices?.fx?.rate);
    if (!(rate > 0)) return null;
    return {
      pair: "EURUSD",
      rate,
      asOf: prices.fx.asOf || null,
      source: prices.fx.source || {
        title: "Yahoo Finance EURUSD=X",
        url: "https://finance.yahoo.com/quote/EURUSD=X"
      }
    };
  } catch {
    return null;
  }
}

function curl(url, jar) {
  const args = ["-sS", "--max-time", "25", "-A", UA, "-c", jar];
  if (fs.existsSync(jar) && fs.statSync(jar).size > 0) args.push("-b", jar);
  args.push("-w", "\n%{http_code}", url);
  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || "curl").trim());
  const text = result.stdout || "";
  const split = text.lastIndexOf("\n");
  return { status: Number(text.slice(split + 1)), body: text.slice(0, split) };
}

function yahooSession(jar) {
  curl("https://fc.yahoo.com", jar);
  const crumb = curl("https://query1.finance.yahoo.com/v1/test/getcrumb", jar);
  const token = crumb.body.trim();
  if (crumb.status !== 200 || !/^[A-Za-z0-9._-]+$/.test(token)) throw new Error(token.slice(0, 40) || String(crumb.status));
  return token;
}

function getJson(url, jar) {
  const response = curl(url, jar);
  if (response.status !== 200) throw new Error(String(response.status));
  return JSON.parse(response.body);
}

function closesOf(chart) {
  const series = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  return series.map(Number).filter((value) => Number.isFinite(value) && value > 0);
}

function loadSymbol(symbol, jar, crumb, fxRate, withHistory) {
  const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,price&crumb=${encodeURIComponent(crumb)}`;
  const summary = getJson(summaryUrl, jar);
  const chart = withHistory
    ? getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`, jar)
    : null;
  const result = summary?.quoteSummary?.result?.[0];
  if (!result) throw new Error("leere Antwort");
  return buildSymbolRecord({
    symbol,
    summary: result.summaryDetail || {},
    stats: result.defaultKeyStatistics || {},
    price: result.price || {},
    closes: chart ? closesOf(chart) : [],
    fxRate
  });
}

function loadFx(jar) {
  const chart = getJson("https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d", jar);
  const rate = Number(chart?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!(rate > 0)) return fxFallback();
  return {
    pair: "EURUSD",
    rate,
    asOf: new Date().toISOString(),
    source: { title: "Yahoo Finance EURUSD=X", url: "https://finance.yahoo.com/quote/EURUSD=X" }
  };
}

export function refreshFundamentals({ force = false, write = true } = {}) {
  const previous = readPrevious();
  if (shouldSkipFundamentals(previous, new Date(), force, berlinDay)) {
    console.log("Bewertung ist von heute.");
    return previous;
  }
  const jar = path.join(os.tmpdir(), `jgtr-yahoo-${process.pid}.txt`);
  const crumb = yahooSession(jar);
  let fx = null;
  try {
    fx = loadFx(jar);
  } catch {
    fx = fxFallback();
  }
  const kept = new Map((previous?.symbols || []).map((item) => [item.symbol, item]));
  let fresh = 0;
  for (const symbol of UNIVERSE) {
    try {
      kept.set(symbol, loadSymbol(symbol, jar, crumb, fx?.rate, VALUE_SYMBOLS.includes(symbol)));
      fresh += 1;
    } catch (error) {
      console.log(`::warning::Bewertung ${symbol}: ${error.message}`);
    }
  }
  if (!fresh) {
    console.log("Bewertung unverändert.");
    return previous;
  }
  const next = {
    example: false,
    asOf: new Date().toISOString(),
    timezone: "Europe/Berlin",
    note: "KGV und KUV beschreiben nur die Lage der Zahl. Ein fehlender oder negativer Gewinn bleibt leer.",
    historyNote: "Die eigene Spanne teilt die Tagesschlüsse der letzten zwölf Monate durch den heutigen Gewinn je Aktie. Frühere Gewinne sind nicht zurückgerechnet.",
    fx: fx || previous?.fx || null,
    symbols: UNIVERSE.map((symbol) => kept.get(symbol)).filter(Boolean)
  };
  if (write) fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const force = process.argv.includes("--force");
  try {
    refreshFundamentals({ force, write: !process.argv.includes("--dry-run") });
  } catch (error) {
    console.log(`::warning::Bewertung: ${error.message}`);
  }
}
