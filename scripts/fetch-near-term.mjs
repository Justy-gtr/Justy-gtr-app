import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadQuotePack, standingQuote } from "./alpaca.mjs";
import { fetchChart } from "./fetch-prices.mjs";
import { applyLiveUsd, applyQuote, isoBerlin, loadFx } from "./fetch-moonshots.mjs";
import {
  FOCUS_SYMBOLS,
  NEAR_LIMIT,
  WIDE_AHEAD,
  buildCandidate,
  lastEventMoves,
  nearCopy,
  nearScore,
  parseHistoricalDates,
  pickNearTerm,
  tradingWindow
} from "./near-term.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "data", "moonshots.json");
const UNIVERSE = path.join(ROOT, "data", "turbo-universe.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function zonedDay(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function getText(url, accept) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

async function fetchEarningsRows(iso) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const body = JSON.parse(await getText(
        `https://api.nasdaq.com/api/calendar/earnings?date=${iso}`,
        "application/json"
      ));
      return body?.data?.rows || [];
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function fetchPastDates(symbol) {
  try {
    const html = await getText(
      `https://www.historicalearnings.com/${symbol.toLowerCase()}.html`,
      "text/html"
    );
    return parseHistoricalDates(html);
  } catch (error) {
    console.log(`::warning::${symbol} Historie: ${error.message}`);
    return [];
  }
}

function cookieHeader(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return list.map((row) => row.split(";")[0]).filter(Boolean).join("; ");
}

async function yahooAuth() {
  try {
    const home = await fetch("https://finance.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
    const cookie = cookieHeader(home);
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" },
      signal: AbortSignal.timeout(15000)
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumbRes.ok || !crumb || /[<>\s]/.test(crumb)) return null;
    return { cookie, crumb };
  } catch (error) {
    console.log(`::warning::Optionen ohne Crumb: ${error.message}`);
    return null;
  }
}

async function fetchOptions(symbol, auth, expirySec) {
  const url = new URL(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
  url.searchParams.set("crumb", auth.crumb);
  if (expirySec) url.searchParams.set("date", String(expirySec));
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Cookie: auth.cookie },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${symbol} Optionen HTTP ${response.status}`);
  return response.json();
}

async function loadImplied(symbol, eventDate, auth) {
  if (!auth) return null;
  try {
    const { chooseExpiry, straddlePct } = await import("./near-term.mjs");
    const first = await fetchOptions(symbol, auth, null);
    const result = first?.optionChain?.result?.[0];
    const spot = result?.quote?.regularMarketPrice;
    const chosen = chooseExpiry(result?.expirationDates, eventDate);
    if (!chosen || !(spot > 0)) return null;
    const chosenSec = Math.round(chosen / 1000);
    let pack = result;
    if (result?.options?.[0]?.expirationDate !== chosenSec) {
      const second = await fetchOptions(symbol, auth, chosenSec);
      pack = second?.optionChain?.result?.[0];
    }
    const option = pack?.options?.[0];
    const pct = straddlePct(option?.calls, option?.puts, spot);
    if (pct == null) return null;
    return {
      pct,
      expiry: new Date(chosenSec * 1000).toISOString().slice(0, 10),
      source: {
        title: `Yahoo Finance Optionen ${symbol}`,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options`
      }
    };
  } catch (error) {
    console.log(`::warning::${symbol} Optionen: ${error.message}`);
    return null;
  }
}

async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  const width = Math.min(limit, items.length);
  if (width > 0) await Promise.all(Array.from({ length: width }, () => run()));
  return out;
}

function blockedSymbols(file, universe) {
  const long = (file?.candidates || []).map((item) => item?.symbol).filter(Boolean);
  return [...FOCUS_SYMBOLS, ...(universe?.exclude || []), ...long];
}

function withStats(candidate, chart, fx, today, includesToday) {
  const { quote, windowBars } = applyQuote(candidate, chart, fx, { recomputeHistory: false });
  const history = lastEventMoves(windowBars, candidate.pastCatalysts?.dates, candidate.catalyst?.session, today);
  const copy = nearCopy({
    daysAway: candidate.daysAway,
    includesToday,
    session: candidate.catalyst?.session,
    history
  });
  const { moves, ...catalystStats } = history;
  return {
    ...quote,
    for: copy.for,
    against: copy.against,
    pastCatalysts: {
      ...(candidate.pastCatalysts || {}),
      dates: moves.map((move) => move.date)
    },
    history: {
      catalystLabel: copy.catalystLabel,
      note: copy.note,
      from: windowBars[0]?.date || null,
      to: windowBars.at(-1)?.date || null,
      catalyst: catalystStats,
      moves
    }
  };
}

async function reprice(file, near, fx, today) {
  const symbols = (near.candidates || []).map((candidate) => candidate.usdSymbol || candidate.symbol);
  const quotePack = await loadQuotePack(symbols);
  const candidates = [];
  for (const candidate of near.candidates || []) {
    try {
      const symbol = candidate.usdSymbol || candidate.symbol;
      const chart = await fetchChart(symbol, "1d", "5y");
      const card = withStats(candidate, chart, fx, today, near.includesToday === true);
      candidates.push(applyLiveUsd(card, standingQuote(symbol, quotePack), fx));
    } catch (error) {
      console.log(`::warning::${candidate.symbol} Kurs: ${error.message}`);
      candidates.push(candidate);
    }
  }
  return {
    ...file,
    nearTerm: {
      ...near,
      asOf: candidates.map((item) => item.asOf).filter(Boolean).sort().at(-1) || near.asOf,
      candidates
    }
  };
}

function sectionSources() {
  return [
    { title: "Nasdaq: Zahlentermine", url: "https://www.nasdaq.com/market-activity/earnings" },
    { title: "Wikipedia: List of NASDAQ-100 companies", url: "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies" }
  ];
}

export async function refreshNearTerm(file, { now = new Date(), force = false } = {}) {
  const today = zonedDay(now, "America/New_York");
  const berlinToday = zonedDay(now, "Europe/Berlin");
  const fx = await loadFx();
  const existing = file?.nearTerm;
  if (!force && existing?.pickedOn === berlinToday && Array.isArray(existing.candidates) && existing.candidates.length) {
    console.log("Kurzfristig ist für heute schon gewählt. Nur Kurse.");
    const next = await reprice(file, existing, fx, today);
    next.fx = fxBlock(fx);
    return next;
  }
  const universe = readJson(UNIVERSE);
  const dates = tradingWindow(today, WIDE_AHEAD);
  const rowsByDate = {};
  for (const date of dates) {
    try {
      rowsByDate[date] = await fetchEarningsRows(date);
      console.log(`Kalender ${date}: ${rowsByDate[date].length} Zeilen`);
    } catch (error) {
      console.log(`::warning::Kalender ${date}: ${error.message}`);
      console.log("Kurzfristig bleibt auf dem letzten Stand.");
      return file;
    }
  }
  const blocked = new Set(blockedSymbols(file, universe).map((symbol) => String(symbol).toUpperCase()));
  const known = new Map((universe.symbols || []).map((item) => [item.symbol, item]));
  const symbols = [];
  for (const date of dates) {
    for (const row of rowsByDate[date] || []) {
      const symbol = String(row?.symbol || "").toUpperCase();
      if (!known.has(symbol) || blocked.has(symbol)) continue;
      if (!symbols.some((item) => item.symbol === symbol)) symbols.push(known.get(symbol));
    }
  }
  console.log(`Kurzfristig: ${symbols.length} Namen im Fenster bis ${dates.at(-1)}.`);
  const packs = await mapPool(symbols, 4, async (item) => {
    const [past, chart] = await Promise.all([
      fetchPastDates(item.symbol),
      fetchChart(item.symbol, "1d", "5y").catch((error) => {
        console.log(`::warning::${item.symbol} Kurs: ${error.message}`);
        return null;
      })
    ]);
    return { symbol: item.symbol, past, chart };
  });
  const pastBySymbol = {};
  const barsBySymbol = {};
  const charts = new Map();
  const { sessionBars } = await import("./fetch-moonshots.mjs");
  const { barsInWindow } = await import("./moonshot-stats.mjs");
  for (const pack of packs) {
    if (!pack) continue;
    pastBySymbol[pack.symbol] = pack.past;
    if (!pack.chart) continue;
    charts.set(pack.symbol, pack.chart);
    barsBySymbol[pack.symbol] = barsInWindow(sessionBars(pack.chart.points));
  }
  const auth = await yahooAuth();
  const impliedBySymbol = {};
  if (auth) {
    const preview = pickNearTerm({
      today,
      berlinToday,
      rowsByDate,
      symbols: universe.symbols,
      exclude: universe.exclude,
      blocked: blockedSymbols(file, universe),
      pastBySymbol,
      barsBySymbol
    });
    const interesting = preview.ranked.slice(0, 12);
    await mapPool(interesting, 3, async (item) => {
      impliedBySymbol[item.symbol] = await loadImplied(item.symbol, item.date, auth);
    });
  }
  const picked = pickNearTerm({
    today,
    berlinToday,
    rowsByDate,
    symbols: universe.symbols,
    exclude: universe.exclude,
    blocked: blockedSymbols(file, universe),
    pastBySymbol,
    barsBySymbol,
    impliedBySymbol
  });
  const chosen = [];
  const quotePack = await loadQuotePack(picked.ranked.map((item) => item.symbol));
  for (const item of picked.ranked) {
    if (chosen.length >= NEAR_LIMIT) break;
    const chart = charts.get(item.symbol);
    if (!chart) continue;
    try {
      const card = withStats(buildCandidate(item, picked.includesToday), chart, fx, today, picked.includesToday);
      chosen.push(applyLiveUsd(card, standingQuote(item.symbol, quotePack), fx));
      const stats = card.history.catalyst;
      console.log(`${item.symbol} ${item.date} ${item.session} score ${nearScore(item).toFixed(2)} ${stats.up}/${stats.n} hoch, ${stats.down}/${stats.n} runter`);
    } catch (error) {
      console.log(`::warning::${item.symbol}: ${error.message}`);
    }
  }
  const { ranked, candidates, ...rest } = picked;
  return {
    ...file,
    fx: fxBlock(fx),
    nearTerm: {
      ...rest,
      asOf: chosen.map((item) => item.asOf).filter(Boolean).sort().at(-1) || isoBerlin(now),
      sources: sectionSources(),
      candidates: chosen
    }
  };
}

function fxBlock(fx) {
  return {
    pair: "EURUSD",
    rate: fx.rate,
    meaning: "USD je 1 EUR. Umrechnung: Preis_EUR = Preis_USD / rate.",
    asOf: fx.asOf,
    source: fx.source
  };
}

function writeFile(value) {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, FILE);
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const file = readJson(FILE);
  refreshNearTerm(file, { force: process.argv.includes("--force-near") }).then((next) => {
    writeFile(next);
    console.log("data/moonshots.json Kurzfristig geschrieben.");
  }).catch((error) => {
    console.log(`::warning::${error.stack || error.message}`);
    process.exitCode = 0;
  });
}
