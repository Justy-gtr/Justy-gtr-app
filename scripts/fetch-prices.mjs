import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  extendedQuote,
  failedTicker,
  fxFor,
  meaningful,
  mergeTicker,
  normalizePeriods,
  resolveOvernight,
  roundTo,
  sessionEnded,
  stitchIntraday,
  tagSessions,
  updateAlerts,
  usClockSession,
  usdToEur,
  venueFor
} from "./market.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = path.join(ROOT, "data");
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (compatible; JustyGTR/1.0; +https://github.com/Justy-gtr/Justy-gtr-app)";

const TICKERS = [
  {
    symbol: "SPCX",
    name: "SpaceX",
    venue: "Nasdaq",
    role: "Fokus",
    usdSymbol: "SPCX",
    eurSymbols: []
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    venue: "Nasdaq",
    role: "Tesla",
    usdSymbol: "TSLA",
    eurSymbols: ["TL0.DE", "TL0.F"]
  },
  {
    symbol: "RKLB",
    name: "Rocket Lab",
    venue: "Nasdaq",
    role: "Vergleich",
    usdSymbol: "RKLB",
    eurSymbols: ["6RJ0.F", "6RJ0.MU"]
  }
];

const RANGES = [
  ["intraday", "5m", "1d"],
  ["1M", "1d", "1mo"],
  ["6M", "1d", "6mo"],
  ["1Y", "1d", "1y"],
  ["5Y", "1wk", "5y"]
];

function readJson(name) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(DATA, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchChart(symbol, interval, range, { includePrePost = false } = {}) {
  let lastError = null;
  for (const host of HOSTS) {
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, host);
    url.searchParams.set("interval", interval);
    url.searchParams.set("range", range);
    url.searchParams.set("includePrePost", includePrePost ? "true" : "false");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(15000)
        });
        if (response.status === 404) {
          lastError = new Error(`${symbol} nicht gefunden`);
          break;
        }
        if (!response.ok) throw new Error(`${symbol} HTTP ${response.status}`);
        const body = await response.json();
        const result = body?.chart?.result?.[0];
        if (!result) {
          lastError = new Error(body?.chart?.error?.description || `${symbol} ohne Daten`);
          break;
        }
        return normalizeChart(result);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error(`${symbol} fehlgeschlagen`);
}

function normalizeChart(result) {
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const points = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close == null || Number.isNaN(close)) continue;
    points.push({
      t: new Date(timestamps[index] * 1000).toISOString(),
      close: Number(close),
      high: numberOrNull(highs[index]),
      low: numberOrNull(lows[index])
    });
  }
  return {
    currency: meta.currency || null,
    price: numberOrNull(meta.regularMarketPrice),
    previousClose: numberOrNull(meta.chartPreviousClose ?? meta.previousClose),
    dayHigh: numberOrNull(meta.regularMarketDayHigh),
    dayLow: numberOrNull(meta.regularMarketDayLow),
    regularTime: numberOrNull(meta.regularMarketTime),
    hasPrePost: meta.hasPrePostMarketData === true,
    exchange: meta.exchangeName || null,
    periods: normalizePeriods(meta),
    points
  };
}

function numberOrNull(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

function berlinDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function quoteLink(symbol) {
  return {
    title: `Yahoo Finance ${symbol}`,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  };
}

async function loadFx() {
  const daily = await fetchChart("EURUSD=X", "1d", "5y");
  const spot = daily.price;
  if (!spot) throw new Error("EURUSD ohne Kurs");
  return {
    rate: roundTo(spot, 4),
    daily: daily.points,
    source: {
      title: "Yahoo Finance EURUSD=X",
      url: "https://finance.yahoo.com/quote/EURUSD=X"
    }
  };
}

function convertPoints(points, fx, spot) {
  return points.map((point) => {
    const rate = fxFor(fx.daily, point.t, spot);
    const row = { t: point.t, eur: roundTo(usdToEur(point.close, rate), 2), usd: roundTo(point.close, 2) };
    if (point.session) row.session = point.session;
    return row;
  });
}

function directPoints(points) {
  return points.map((point) => {
    const row = { t: point.t, eur: roundTo(point.close, 2) };
    if (point.session) row.session = point.session;
    return row;
  });
}

function toEurQuote(quote, rate) {
  if (!quote || quote.price == null) return null;
  return {
    phase: quote.phase,
    eur: roundTo(usdToEur(quote.price, rate), 2),
    high: roundTo(usdToEur(quote.high, rate), 2),
    low: roundTo(usdToEur(quote.low, rate), 2),
    asOf: quote.asOf
  };
}

async function loadTicker(spec, fx, previous, now = new Date()) {
  let eurChart = null;
  let eurSymbol = null;
  for (const candidate of spec.eurSymbols) {
    try {
      const chart = await fetchChart(candidate, "1d", "5d");
      if (chart?.currency === "EUR" && (chart.price != null || chart.points.length)) {
        eurChart = chart;
        eurSymbol = candidate;
        break;
      }
    } catch (error) {
      console.log(`::warning::${candidate}: ${error.message}`);
    }
  }

  const usd = await fetchChart(spec.usdSymbol, "1d", "5d");
  const useEur = Boolean(eurSymbol);
  const method = useEur ? "direct_eur" : "usd_div_eurusd";
  const spotUsd = usd.price;
  const spotEur = useEur ? eurChart.price : roundTo(usdToEur(spotUsd, fx.rate), 2);
  const prevUsd = usd.previousClose;
  const prevEur = useEur
    ? roundTo(eurChart.previousClose, 2)
    : roundTo(usdToEur(prevUsd, fx.rate), 2);
  const changePct = spotEur != null && prevEur ? roundTo(((spotEur - prevEur) / prevEur) * 100, 2) : null;

  const history = { intraday: [], "1M": [], "6M": [], "1Y": [], "5Y": [] };
  let intradayMethod = method;

  let euIntra = null;
  if (useEur && eurSymbol) {
    try {
      euIntra = await fetchChart(eurSymbol, "5m", "1d");
    } catch (error) {
      console.log(`::warning::Intraday ${eurSymbol}: ${error.message}`);
    }
  }
  let usdIntra = null;
  try {
    usdIntra = await fetchChart(spec.usdSymbol, "5m", "1d", { includePrePost: true });
  } catch (error) {
    console.log(`::warning::Intraday ${spec.usdSymbol}: ${error.message}`);
    try {
      usdIntra = await fetchChart(spec.usdSymbol, "5m", "1d");
    } catch (fallbackError) {
      console.log(`::warning::Intraday ${spec.usdSymbol}: ${fallbackError.message}`);
    }
  }

  const usdIntraday = usdIntra
    ? convertPoints(tagSessions(usdIntra.points, usdIntra.periods, { clock: true }), fx, fx.rate)
    : [];
  const euIntraday = euIntra
    ? directPoints(euIntra.points).map((point) => ({ ...point, session: "regular" }))
    : [];
  if (euIntraday.length >= 20) {
    history.intraday = stitchIntraday(euIntraday, usdIntraday);
    intradayMethod = history.intraday.length > euIntraday.length ? "direct_eur_plus_us" : "direct_eur";
  } else if (usdIntraday.length) {
    history.intraday = usdIntraday;
    intradayMethod = "usd_div_eurusd";
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  // fulldayPrice is not the last print: it keeps moving after the last candle. Unused.
  let computedUsd = usdIntra
    ? extendedQuote(usdIntra.points, usdIntra.periods, now.getTime(), { clock: true })
    : null;
  const regularLive = usClockSession(now.getTime()) === "regular";
  if (!computedUsd && useEur && regularLive && sessionEnded((euIntra || eurChart)?.periods, nowSec) && usd.price != null) {
    computedUsd = {
      phase: "us",
      price: usd.price,
      high: usd.dayHigh,
      low: usd.dayLow,
      asOf: usd.regularTime ? new Date(usd.regularTime * 1000).toISOString() : now.toISOString()
    };
  }
  const overnight = resolveOvernight(toEurQuote(computedUsd, fx.rate), previous, { regularLive });

  for (const [key, interval, range] of RANGES) {
    if (key === "intraday") continue;
    if (useEur) {
      const chart = await fetchChart(eurSymbol, interval, range);
      history[key] = directPoints(chart.points);
    } else {
      const chart = await fetchChart(spec.usdSymbol, interval, range);
      history[key] = convertPoints(chart.points, fx, fx.rate);
    }
  }

  if (history["1M"].length && spotEur != null) {
    const last = history["1M"][history["1M"].length - 1];
    last.eur = roundTo(spotEur, 2);
  }

  const sparkline = (history.intraday.length ? history.intraday : history["1M"]).slice(-32).map((point) => point.eur);
  const highs = [spotEur, ...history["5Y"].map((point) => point.eur), ...history["1Y"].map((point) => point.eur)]
    .filter((value) => value != null);
  const sources = [quoteLink(useEur ? eurSymbol : spec.usdSymbol)];
  const needsFx = !useEur || intradayMethod !== "direct_eur" || overnight.eur != null;
  if (needsFx) sources.push(fx.source);
  if (useEur) sources.push(quoteLink(spec.usdSymbol));

  const dayHigh = useEur ? eurChart.dayHigh : usdToEur(usd.dayHigh, fx.rate);
  const dayLow = useEur ? eurChart.dayLow : usdToEur(usd.dayLow, fx.rate);

  return {
    symbol: spec.symbol,
    name: spec.name,
    role: spec.role,
    venue: spec.venue,
    currency: "EUR",
    priceEur: roundTo(spotEur, 2),
    priceUsd: roundTo(spotUsd, 2),
    previousCloseEur: prevEur,
    changeEur: spotEur != null && prevEur != null ? roundTo(spotEur - prevEur, 2) : null,
    changePct,
    dayHighEur: roundTo(dayHigh, 2),
    dayLowEur: roundTo(dayLow, 2),
    overnightPhase: overnight.phase,
    overnightEur: overnight.eur,
    overnightHighEur: overnight.high,
    overnightLowEur: overnight.low,
    overnightAsOf: overnight.asOf,
    eurMethod: method,
    eurVenue: useEur ? venueFor(eurSymbol) : null,
    eurSymbol: eurSymbol,
    usdSymbol: spec.usdSymbol,
    intradayMethod,
    fxRate: fx.rate,
    sparkline,
    history,
    recordHighEur: highs.length ? roundTo(Math.max(...highs), 2) : null,
    sources
  };
}

export async function buildPrices(previous, now = new Date()) {
  const fx = await loadFx();
  const prevTickers = new Map((previous?.tickers || []).map((ticker) => [ticker.symbol, ticker]));
  const tickers = [];
  let okCount = 0;
  for (const spec of TICKERS) {
    try {
      const fresh = await loadTicker(spec, fx, prevTickers.get(spec.symbol), now);
      tickers.push(mergeTicker(prevTickers.get(spec.symbol), fresh));
      okCount += 1;
      console.log(`${spec.symbol} ${fresh.priceEur} EUR ${fresh.changePct}% via ${fresh.eurMethod} ${fresh.eurSymbol || fresh.usdSymbol} overnight=${fresh.overnightPhase || "-"} ${fresh.overnightEur ?? "-"}`);
    } catch (error) {
      console.log(`::warning::${spec.symbol}: ${error.message}`);
      tickers.push(failedTicker(prevTickers.get(spec.symbol), spec.symbol, spec.name, error.message));
    }
  }
  return { fx, tickers, okCount };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const nowIso = now.toISOString();
  const previousPrices = readJson("prices.json") || { tickers: [] };
  const previousAlerts = readJson("alerts.json") || { alerts: [] };
  const previousMeta = readJson("meta.json") || {};

  let built;
  try {
    built = await buildPrices(previousPrices);
  } catch (error) {
    console.log(`::warning::Kurse nicht geladen: ${error.message}`);
    process.exitCode = 0;
    return;
  }
  if (!built.okCount) {
    console.log("::warning::Kein Ticker aktualisiert. Dateien bleiben unverändert.");
    return;
  }

  const nextPrices = {
    asOf: previousPrices.asOf || null,
    example: false,
    fx: {
      pair: "EURUSD",
      rate: built.fx.rate,
      meaning: "USD je 1 EUR. Umrechnung: Preis_EUR = Preis_USD / rate.",
      asOf: nowIso,
      source: built.fx.source
    },
    tickers: built.tickers
  };
  const nextAlerts = updateAlerts(previousAlerts, built.tickers, nowIso, berlinDay(now));
  const nextMeta = {
    ...previousMeta,
    pricesUpdated: previousMeta.pricesUpdated || null,
    fx: nextPrices.fx,
    priceStatus: Object.fromEntries(built.tickers.map((ticker) => [
      ticker.symbol,
      {
        ok: !ticker.stale && ticker.example !== true,
        stale: Boolean(ticker.stale),
        method: ticker.eurMethod || null,
        venue: ticker.eurVenue || null,
        symbol: ticker.eurSymbol || ticker.usdSymbol || null,
        intradayMethod: ticker.intradayMethod || null,
        overnight: ticker.overnightPhase || null,
        error: ticker.fetchError || null
      }
    ]))
  };

  const changed = meaningful(nextPrices) !== meaningful(previousPrices)
    || meaningful(nextAlerts) !== meaningful(previousAlerts)
    || meaningful(nextMeta.priceStatus) !== meaningful(previousMeta.priceStatus || {})
    || meaningful(nextMeta.fx) !== meaningful(previousMeta.fx || null);

  if (!changed) {
    console.log("Keine inhaltliche Änderung.");
    return;
  }

  nextPrices.asOf = nowIso;
  nextMeta.pricesUpdated = nowIso;
  nextMeta.lastUpdated = nowIso;

  if (dryRun) {
    console.log(JSON.stringify({
      asOf: nowIso,
      fx: nextPrices.fx.rate,
      tickers: nextPrices.tickers.map((ticker) => ({
        symbol: ticker.symbol,
        priceEur: ticker.priceEur,
        changePct: ticker.changePct,
        dayHighEur: ticker.dayHighEur,
        dayLowEur: ticker.dayLowEur,
        eurMethod: ticker.eurMethod,
        eurVenue: ticker.eurVenue,
        overnightPhase: ticker.overnightPhase,
        overnightEur: ticker.overnightEur,
        overnightHighEur: ticker.overnightHighEur,
        overnightLowEur: ticker.overnightLowEur,
        points: ticker.history["1M"].length,
        intraday: ticker.history.intraday.length
      })),
      alerts: nextAlerts.alerts.map((alert) => ({ id: alert.id, changePct: alert.changePct, notified: alert.notified }))
    }, null, 2));
    return;
  }

  writeJson("prices.json", nextPrices);
  writeJson("alerts.json", nextAlerts);
  writeJson("meta.json", nextMeta);
  console.log("Kursdateien geschrieben.");
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
