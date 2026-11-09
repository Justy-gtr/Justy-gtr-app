import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  HOUR_SLOTS,
  WEEKDAY_LABELS,
  berlinDay,
  buildWindows,
  keepSettledDaily,
  keepSettledHours,
  seasonalityHeadline
} from "../js/seasonality.js";
import { fetchChart, TICKERS } from "./fetch-prices.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "data", "seasonality.json");

function readPrevious() {
  if (!fs.existsSync(FILE)) return null;
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function barsOf(chart) {
  return (chart?.points || []).map((point) => ({
    t: point.t,
    open: point.open,
    close: point.close
  }));
}

function quoteSource(symbol) {
  return {
    title: `Yahoo Finance ${symbol}`,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
}

async function loadSymbol(spec, now) {
  const daily = await fetchChart(spec.usdSymbol, "1d", "2y");
  const hours = await fetchChart(spec.usdSymbol, "60m", "2y", { includePrePost: false });
  let pre = [];
  try {
    const extended = await fetchChart(spec.usdSymbol, "60m", "2y", { includePrePost: true });
    pre = barsOf(extended);
  } catch (error) {
    console.log(`::warning::Vorbörse ${spec.symbol}: ${error.message}`);
  }
  return {
    name: spec.name,
    ranges: buildWindows(
      keepSettledDaily(barsOf(daily), now),
      keepSettledHours(barsOf(hours), now),
      keepSettledHours(pre, now)
    )
  };
}

export async function buildSeasonality(previous, now = new Date()) {
  const symbols = {};
  let fresh = 0;
  for (const spec of TICKERS) {
    try {
      symbols[spec.symbol] = await loadSymbol(spec, now);
      fresh += 1;
      console.log(`${spec.symbol}: ${seasonalityHeadline(spec.symbol, symbols[spec.symbol].ranges.all)}`);
    } catch (error) {
      console.log(`::warning::Saison ${spec.symbol}: ${error.message}`);
      if (previous?.symbols?.[spec.symbol]) {
        symbols[spec.symbol] = previous.symbols[spec.symbol];
        console.log(`${spec.symbol}: letzte Fassung behalten`);
      }
    }
  }
  if (!fresh) return null;
  for (const spec of TICKERS) {
    if (!symbols[spec.symbol]) return null;
  }
  return {
    asOf: now.toISOString(),
    timezone: "Europe/Berlin",
    session: "15:30-22:00",
    premarket: "10:00-15:00",
    hourSlots: HOUR_SLOTS,
    weekdays: WEEKDAY_LABELS,
    sources: TICKERS.map((spec) => quoteSource(spec.usdSymbol)),
    symbols
  };
}

function payload(doc) {
  if (!doc) return "";
  const { asOf, ...rest } = doc;
  return JSON.stringify(rest);
}

async function main() {
  const force = process.argv.includes("--force");
  const now = new Date();
  const previous = readPrevious();
  const today = berlinDay(now);
  if (!force && previous?.asOf && berlinDay(previous.asOf) === today) {
    console.log("Saisonalität ist für heute schon geschrieben.");
    return;
  }
  let next;
  try {
    next = await buildSeasonality(previous, now);
  } catch (error) {
    console.log(`::warning::Saisonalität nicht geladen: ${error.message}`);
    return;
  }
  if (!next) {
    console.log("::warning::Saisonalität unvollständig. Datei bleibt.");
    return;
  }
  if (previous && payload(previous) === payload(next)) {
    console.log("Zahlen unverändert, Stempel für heute.");
  }
  fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log("data/seasonality.json geschrieben.");
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  main().catch((error) => {
    console.log(`::warning::${error.stack || error.message}`);
    process.exitCode = 0;
  });
}
