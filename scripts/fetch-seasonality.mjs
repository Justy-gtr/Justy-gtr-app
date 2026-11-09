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
import { DAYPATH_SCHEMA, mergeIntradayPaths } from "../js/daypath.js";
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

function pointsOf(chart) {
  return (chart?.points || []).map((point) => ({
    t: point.t,
    eur: Number(point.close)
  })).filter((point) => point.t && Number.isFinite(point.eur) && point.eur > 0);
}

const DAY_VENUES = [
  [".F", "Frankfurt"],
  [".DE", "Xetra"],
  [".SG", "Stuttgart"],
  [".MU", "München"]
];

/** Frankfurt first, then Xetra, Stuttgart and Munich fill the gaps Yahoo actually has. */
export function dayPathVenues(spec) {
  const stems = [];
  for (const symbol of [...(spec.earlySymbols || []), ...(spec.eurSymbols || [])]) {
    const stem = String(symbol || "").replace(/\.[A-Za-z0-9]+$/, "");
    if (stem && !stems.includes(stem)) stems.push(stem);
  }
  const venues = [];
  for (const stem of stems) {
    for (const [suffix, label] of DAY_VENUES) {
      venues.push({ symbol: `${stem}${suffix}`, label });
    }
  }
  return venues;
}

async function loadEurPoints(symbol) {
  const hourly = await tryChart(symbol, "60m", "2y");
  const half = await tryChart(symbol, "30m", "60d");
  const rows = [];
  for (const chart of [hourly, half]) {
    if (chart?.currency === "EUR") rows.push(...pointsOf(chart));
  }
  return rows;
}

async function loadUsPoints(symbol) {
  const hourly = await tryChart(symbol, "60m", "2y", { includePrePost: true });
  const half = await tryChart(symbol, "30m", "60d", { includePrePost: true });
  return [...pointsOf(hourly), ...pointsOf(half)];
}

/**
 * Longest free intraday path. 60m goes back about two years, 30m about 60 days.
 * Each listing stays in its own price; the merge uses percent changes.
 */
async function loadDayPaths(spec) {
  const series = [];
  const used = [];
  for (const venue of dayPathVenues(spec)) {
    const points = await loadEurPoints(venue.symbol);
    if (!points.length) continue;
    series.push({ id: venue.symbol, label: venue.label, points });
    used.push(venue.symbol);
  }
  const usPoints = await loadUsPoints(spec.usdSymbol);
  if (usPoints.length) {
    series.push({ id: spec.usdSymbol, label: "US", points: usPoints });
  }
  const paths = mergeIntradayPaths(series);
  const days = (paths.days || []).map((day) => {
    const filled = (day.points || []).filter((point) => point.avg != null).length;
    return `${day.name} n=${day.n} Felder=${filled}`;
  }).join(" | ");
  const empty = (paths.coverage || []).filter((row) => row.n === 0).map((row) => row.slot);
  console.log(`${spec.symbol} Tagesverlauf: ${days}`);
  console.log(`${spec.symbol} leere Körbe: ${empty.length ? empty.join(", ") : "keine"}`);
  return { paths, symbols: used };
}

export function dayPathsStale(previous) {
  for (const spec of TICKERS) {
    const paths = previous?.symbols?.[spec.symbol]?.dayPaths;
    if (!paths || paths.schema !== DAYPATH_SCHEMA || !Array.isArray(paths.days) || paths.days.length !== 5) {
      return true;
    }
  }
  return false;
}

/** Skip only when today is already written and dayPaths is on the current schema. */
export function shouldSkipSeasonality(previous, now = new Date(), force = false) {
  if (force) return false;
  if (dayPathsStale(previous)) return false;
  if (!previous?.asOf) return false;
  return berlinDay(previous.asOf) === berlinDay(now);
}

async function loadSymbol(spec, now) {
  const daily = await fetchChart(spec.usdSymbol, "1d", "2y");
  const hours = await fetchChart(spec.usdSymbol, "60m", "2y", { includePrePost: false });
  const regular = collectSlotBars(barsOf(hours), 60, "us").filter((bar) => !slotIsEarly(bar.slot));
  const early = await loadEarly(spec);
  let dayPaths = null;
  let daySymbols = [];
  try {
    const loadedPaths = await loadDayPaths(spec);
    dayPaths = loadedPaths.paths;
    daySymbols = loadedPaths.symbols;
  } catch (error) {
    console.log(`::warning::Tagesverlauf ${spec.symbol}: ${error.message}`);
  }
  return {
    germanSymbol: early.symbol,
    daySymbols,
    pack: {
      name: spec.name,
      earlyNote: early.note,
      dayPaths,
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
  const daySymbols = [];
  let fresh = 0;
  for (const spec of TICKERS) {
    try {
      const loaded = await loadSymbol(spec, now);
      symbols[spec.symbol] = loaded.pack;
      if (loaded.germanSymbol) germanSymbols.push(loaded.germanSymbol);
      for (const symbol of loaded.daySymbols || []) daySymbols.push(symbol);
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
    const paths = symbols[spec.symbol].dayPaths;
    if (!paths || paths.schema !== DAYPATH_SCHEMA) {
      const kept = previous?.symbols?.[spec.symbol]?.dayPaths;
      if (kept?.schema === DAYPATH_SCHEMA) {
        symbols[spec.symbol].dayPaths = kept;
        console.log(`${spec.symbol}: letzter Tagesverlauf behalten`);
      } else {
        console.log(`::warning::${spec.symbol}: Tagesverlauf fehlt. Datei bleibt.`);
        return null;
      }
    }
  }
  const sources = [];
  const seenSources = new Set();
  for (const symbol of [...TICKERS.map((spec) => spec.usdSymbol), ...germanSymbols, ...daySymbols]) {
    if (!symbol || seenSources.has(symbol)) continue;
    seenSources.add(symbol);
    sources.push(quoteSource(symbol));
  }
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
  if (shouldSkipSeasonality(previous, now, force)) {
    console.log("Saisonalität ist für heute schon geschrieben.");
    return;
  }
  if (!force && dayPathsStale(previous)) {
    console.log("Tagesverlauf fehlt oder die Fassung ist alt. Neu rechnen.");
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
