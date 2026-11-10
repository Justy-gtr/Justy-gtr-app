import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { morningSwing, sortByMorning } from "../js/germany.js";
import { fetchChart } from "./fetch-prices.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = path.join(ROOT, "data");

function readJson(name) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function berlinDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function universe() {
  const raw = readJson("de-turbos.json");
  const symbols = Array.isArray(raw) ? raw : raw?.symbols;
  if (!Array.isArray(symbols) || !symbols.length) throw new Error("data/de-turbos.json ohne Namen");
  return { asOf: raw?.asOf || "2026-11-10", symbols };
}

function quoteLink(symbol) {
  return {
    title: `Yahoo Finance ${symbol}`,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
}

function latestSession(points) {
  const days = points.map((point) => berlinDay(new Date(point.t))).filter(Boolean);
  const day = days.at(-1);
  if (!day) return [];
  return points.filter((point) => berlinDay(new Date(point.t)) === day);
}

async function loadSymbol(item, previous) {
  const five = await fetchChart(item.symbol, "5m", "1d").catch(() => null);
  const quarter = await fetchChart(item.symbol, "15m", "1mo");
  if (quarter.currency && quarter.currency !== "EUR") {
    throw new Error(`${item.symbol} nicht in Euro (${quarter.currency})`);
  }
  const spot = five?.currency === "EUR" ? five : quarter;
  const price = spot.price ?? spot.points.at(-1)?.close;
  const previousClose = spot.chartPreviousClose ?? spot.metaPrevious;
  if (price == null) throw new Error(`${item.symbol} ohne Kurs`);
  const changePct = previousClose ? ((price - previousClose) / previousClose) * 100 : null;
  const session = latestSession((five?.points?.length ? five.points : quarter.points).map((point) => ({
    t: point.t,
    eur: round(point.close, 2)
  })));
  const morning = morningSwing(quarter.points.map((point) => ({
    t: point.t,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close
  })));
  if (!morning.n && previous?.morning?.n) return { ...previous, priceEur: round(price, 2), changePct: changePct == null ? previous.changePct : round(changePct, 2) };
  return {
    symbol: item.symbol,
    name: item.name,
    underlyingIsin: item.underlyingIsin,
    priceEur: round(price, 2),
    changePct: changePct == null ? null : round(changePct, 2),
    sparkline: session.map((point) => point.eur),
    intraday: session,
    morning,
    trKnockouts: { long: true, short: true },
    longExample: item.longExample,
    shortExample: item.shortExample,
    source: item.source,
    sources: [
      quoteLink(item.symbol),
      { title: `onvista Knock-outs ${item.name}`, url: item.source }
    ],
    asOf: new Date().toISOString()
  };
}

export async function buildGermany() {
  const list = universe();
  const previous = new Map((readJson("germany.json")?.symbols || []).map((row) => [row.symbol, row]));
  const symbols = [];
  const errors = [];
  for (const item of list.symbols) {
    try {
      symbols.push(await loadSymbol(item, previous.get(item.symbol)));
      console.log(`${item.symbol} ok`);
    } catch (error) {
      const kept = previous.get(item.symbol);
      if (kept?.priceEur != null) {
        symbols.push(kept);
        console.log(`${item.symbol} behalten (${error.message})`);
      } else {
        errors.push(`${item.symbol}: ${error.message}`);
        console.log(`${item.symbol} fehlgeschlagen: ${error.message}`);
      }
    }
  }
  if (symbols.length !== list.symbols.length) {
    throw new Error(errors.join("; ") || "Deutschland unvollständig");
  }
  return {
    example: false,
    asOf: new Date().toISOString(),
    knockoutsAsOf: list.asOf,
    timezone: "Europe/Berlin",
    window: "09:00-10:30",
    symbols: sortByMorning(symbols)
  };
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  buildGermany().then((file) => {
    fs.writeFileSync(path.join(DATA, "germany.json"), `${JSON.stringify(file, null, 2)}\n`);
    console.log(`data/germany.json geschrieben (${file.symbols.length}).`);
  }).catch((error) => {
    console.log(error.stack || error.message);
    process.exitCode = 1;
  });
}
