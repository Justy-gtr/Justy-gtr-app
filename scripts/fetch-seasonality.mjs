import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EARLY_NOTE_DE,
  EARLY_NOTE_MIX,
  HOUR_SLOTS,
  WEEKDAY_LABELS,
  aggregateHours,
  berlinDay,
  buildWindows,
  chooseEarlyBars,
  collectSlotBars,
  keepSettledDaily,
  keepSettledHours,
  seasonalityHeadline,
  slotIsEarly
} from "../js/seasonality.js";
import { MIN_CASES } from "../js/analysis.js";
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

async function tryChart(symbol, interval, range, options) {
  try {
    return await fetchChart(symbol, interval, range, options);
  } catch (error) {
    console.log(`::warning::${symbol} ${interval}: ${error.message}`);
    return null;
  }
}

function earlyScore(bars) {
  const hours = aggregateHours(bars);
  let slots = 0;
  let total = 0;
  HOUR_SLOTS.forEach((label, index) => {
    if (!slotIsEarly(label)) return;
    total += hours[index].n;
    if (hours[index].n >= MIN_CASES) slots += 1;
  });
  return { slots, total };
}

async function loadEarly(spec) {
  const german = [];
  const symbols = spec.earlySymbols?.length ? spec.earlySymbols : spec.eurSymbols;
  for (const symbol of symbols) {
    const hourly = await tryChart(symbol, "60m", "2y");
    const half = await tryChart(symbol, "30m", "60d");
    const bars = [
      ...collectSlotBars(hourly?.points, 60, "de"),
      ...collectSlotBars(half?.points, 30, "de")
    ];
    if (!bars.length) continue;
    german.push({ symbol, bars, ...earlyScore(bars) });
  }
  german.sort((a, b) => b.slots - a.slots || b.total - a.total || a.symbol.localeCompare(b.symbol));
  const best = german[0] || null;
  const usHourly = await tryChart(spec.usdSymbol, "60m", "2y", { includePrePost: true });
  const usHalf = await tryChart(spec.usdSymbol, "30m", "60d", { includePrePost: true });
  const usBars = [
    ...collectSlotBars(usHourly?.points, 60, "us"),
    ...collectSlotBars(usHalf?.points, 30, "us")
  ].filter((bar) => slotIsEarly(bar.slot));
  const early = chooseEarlyBars(best?.bars || [], usBars);
  const usesGerman = early.note === EARLY_NOTE_DE || early.note === EARLY_NOTE_MIX;
  return { ...early, symbol: usesGerman ? best?.symbol || null : null };
}

async function loadSymbol(spec, now) {
  const daily = await fetchChart(spec.usdSymbol, "1d", "2y");
  const hours = await fetchChart(spec.usdSymbol, "60m", "2y", { includePrePost: false });
  const regular = collectSlotBars(barsOf(hours), 60, "us").filter((bar) => !slotIsEarly(bar.slot));
  const early = await loadEarly(spec);
  return {
    germanSymbol: early.symbol,
    pack: {
      name: spec.name,
      earlyNote: early.note,
      ranges: buildWindows(
        keepSettledDaily(barsOf(daily), now),
        keepSettledHours([...regular, ...early.bars], now)
      )
    }
  };
}

export async function buildSeasonality(previous, now = new Date()) {
  const symbols = {};
  const germanSymbols = [];
  let fresh = 0;
  for (const spec of TICKERS) {
    try {
      const loaded = await loadSymbol(spec, now);
      symbols[spec.symbol] = loaded.pack;
      if (loaded.germanSymbol) germanSymbols.push(loaded.germanSymbol);
      fresh += 1;
      const note = loaded.pack.earlyNote || "keine frühen Stunden";
      console.log(`${spec.symbol}: ${seasonalityHeadline(spec.symbol, symbols[spec.symbol].ranges.all)} | ${note}${loaded.germanSymbol ? ` (${loaded.germanSymbol})` : ""}`);
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
  const sources = TICKERS.map((spec) => quoteSource(spec.usdSymbol));
  for (const symbol of germanSymbols) sources.push(quoteSource(symbol));
  return {
    asOf: now.toISOString(),
    timezone: "Europe/Berlin",
    session: "08:00-22:00",
    hourSlots: HOUR_SLOTS,
    weekdays: WEEKDAY_LABELS,
    sources,
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
