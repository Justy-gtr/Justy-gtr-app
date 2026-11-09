import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadQuotePack, marketLink, standingQuote } from "./alpaca.mjs";
import { fetchChart } from "./fetch-prices.mjs";
import { fxFor, roundTo, sessionBaseline, usdToEur } from "./market.mjs";
import { barsInWindow, catalystMoves, wideDays } from "./moonshot-stats.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "data", "moonshots.json");

function readFile() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function writeFile(value) {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, FILE);
}

function nyDate(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

export function isoBerlin(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMin = Math.round((asUtc - date.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}

export function sessionBars(points) {
  const byDate = new Map();
  for (const point of points || []) {
    if (!point?.t || !(point.close > 0)) continue;
    const date = nyDate(point.t);
    byDate.set(date, { date, close: point.close, t: point.t });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCandidate(candidate, patch) {
  return {
    ...candidate,
    ...patch,
    for: candidate.for,
    against: candidate.against,
    catalyst: candidate.catalyst,
    leverage: candidate.leverage,
    sources: candidate.sources,
    pastCatalysts: candidate.pastCatalysts,
    history: {
      ...(candidate.history || {}),
      ...(patch.history || {})
    }
  };
}

function quoteSource(symbol) {
  return {
    title: `Yahoo Finance ${symbol}`,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
}

export async function loadFx() {
  const daily = await fetchChart("EURUSD=X", "1d", "5y");
  if (!daily.price) throw new Error("EURUSD ohne Kurs");
  return {
    rate: roundTo(daily.price, 4),
    points: daily.points,
    asOf: daily.regularTime ? isoBerlin(new Date(daily.regularTime * 1000)) : isoBerlin(new Date()),
    source: {
      title: "Yahoo Finance EURUSD=X",
      url: "https://finance.yahoo.com/quote/EURUSD=X"
    }
  };
}

function eurAt(usd, fx, iso) {
  const rate = fxFor(fx.points.map((point) => ({ t: point.t, close: point.close })), iso, fx.rate);
  return roundTo(usdToEur(usd, rate), 2);
}

export function applyQuote(candidate, chart, fx, { recomputeHistory = true } = {}) {
  const symbol = candidate.usdSymbol || candidate.symbol;
  if (chart.currency && chart.currency !== "USD") {
    throw new Error(`${symbol} nicht in USD (${chart.currency})`);
  }
  const windowBars = barsInWindow(sessionBars(chart.points));
  if (windowBars.length < 100) throw new Error(`${symbol} zu wenig Tage (${windowBars.length})`);
  const jumps = [];
  for (let index = 1; index < windowBars.length; index += 1) {
    const raw = ((windowBars[index].close - windowBars[index - 1].close) / windowBars[index - 1].close) * 100;
    if (Math.abs(raw) >= 50) jumps.push(`${windowBars[index].date} ${raw.toFixed(1)}%`);
  }
  if (jumps.length) throw new Error(`${symbol} Sprung wie ein Split: ${jumps.join(", ")}`);
  const last = windowBars.at(-1);
  const asOf = chart.regularTime
    ? isoBerlin(new Date(chart.regularTime * 1000))
    : isoBerlin(new Date(last.t));
  const priceDate = chart.regularTime ? nyDate(new Date(chart.regularTime * 1000).toISOString()) : last.date;
  const live = priceDate > last.date;
  const priceUsd = chart.price ?? last.close;
  // chartPreviousClose ist der Schluss vor der ganzen Spanne, nicht der Vortag.
  const prevUsd = live ? last.close : windowBars.at(-2)?.close;
  if (!(priceUsd > 0) || !(prevUsd > 0)) throw new Error(`${symbol} ohne Kurs`);
  const spark = windowBars.slice(-24).map((bar) => eurAt(bar.close, fx, bar.t));
  if (live) spark.push(eurAt(priceUsd, fx, new Date(chart.regularTime * 1000).toISOString()));
  const patch = {
    priceUsd: roundTo(priceUsd, 2),
    priceEur: eurAt(priceUsd, fx, asOf),
    previousCloseUsd: roundTo(prevUsd, 2),
    changePct: roundTo(((priceUsd - prevUsd) / prevUsd) * 100, 2),
    eurMethod: "usd_div_eurusd",
    sparkline: spark.filter((value) => value != null),
    asOf,
    marketSource: quoteSource(symbol)
  };
  if (recomputeHistory) {
    const catalyst = catalystMoves(windowBars, candidate.pastCatalysts?.dates || []);
    const days = wideDays(windowBars);
    const { moves, ...catalystStats } = catalyst;
    patch.history = {
      from: windowBars[0].date,
      to: windowBars.at(-1).date,
      catalyst: catalystStats,
      days,
      moves
    };
  }
  return { quote: mergeCandidate(candidate, patch), windowBars, asOf };
}

/** Live US quote from IEX. The multi-year count stays on the daily series already applied. */
export function applyLiveUsd(quote, chart, fx) {
  if (!quote || !chart || chart.source !== "alpaca-iex" || !(chart.price > 0)) return quote;
  const priceUsd = roundTo(chart.price, 2);
  if (quote.priceUsd > 0 && Math.abs(priceUsd - quote.priceUsd) / quote.priceUsd > 0.15) return quote;
  const prevFromIex = chart.previousClose ?? sessionBaseline(chart);
  const prevUsd = prevFromIex > 0 ? roundTo(prevFromIex, 2) : quote.previousCloseUsd;
  const asOf = chart.regularTime ? isoBerlin(new Date(chart.regularTime * 1000)) : quote.asOf;
  const priceEur = eurAt(priceUsd, fx, asOf);
  const spark = Array.isArray(quote.sparkline) ? quote.sparkline.slice() : [];
  if (priceEur != null && spark.length) spark[spark.length - 1] = priceEur;
  return {
    ...quote,
    priceUsd,
    priceEur: priceEur ?? quote.priceEur,
    previousCloseUsd: prevUsd,
    changePct: prevUsd > 0 ? roundTo(((priceUsd - prevUsd) / prevUsd) * 100, 2) : quote.changePct,
    asOf,
    source: "alpaca-iex",
    sparkline: spark,
    marketSource: marketLink(chart.symbol || quote.symbol)
  };
}

export async function refreshMoonshots(file = readFile()) {
  const fx = await loadFx();
  const symbols = (file.candidates || []).map((candidate) => candidate.usdSymbol || candidate.symbol);
  const quotePack = await loadQuotePack(symbols);
  const candidates = [];
  for (const candidate of file.candidates || []) {
    const symbol = candidate.usdSymbol || candidate.symbol;
    const chart = await fetchChart(symbol, "1d", "5y");
    const applied = applyQuote(candidate, chart, fx);
    const quote = applyLiveUsd(applied.quote, standingQuote(symbol, quotePack), fx);
    const { windowBars } = applied;
    const days = quote.history?.days;
    const stats = quote.history?.catalyst;
    candidates.push(quote);
    console.log(`${symbol} ${stats?.up}/${stats?.n} hoch, ${stats?.down}/${stats?.n} runter, Tage ${days?.sharePct}% n=${days?.n} (${windowBars.length} Tage)`);
  }
  return {
    ...file,
    example: false,
    asOf: candidates.map((item) => item.asOf).sort().at(-1) || isoBerlin(new Date()),
    fx: {
      pair: "EURUSD",
      rate: fx.rate,
      meaning: "USD je 1 EUR. Umrechnung: Preis_EUR = Preis_USD / rate.",
      asOf: fx.asOf,
      source: fx.source
    },
    candidates
  };
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  refreshMoonshots().then(async (next) => {
    try {
      const { refreshNearTerm } = await import("./fetch-near-term.mjs");
      next = await refreshNearTerm(next, { force: process.argv.includes("--force-near") });
    } catch (error) {
      console.log(`::warning::Kurzfristig: ${error.stack || error.message}`);
    }
    writeFile(next);
    console.log("data/moonshots.json geschrieben.");
  }).catch((error) => {
    console.log(`::warning::${error.stack || error.message}`);
    process.exitCode = 0;
  });
}
