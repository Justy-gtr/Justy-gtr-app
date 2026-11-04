import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  failedTicker,
  fxFor,
  meaningful,
  mergeTicker,
  roundTo,
  updateAlerts,
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

async function fetchChart(symbol, interval, range) {
  let lastError = null;
  for (const host of HOSTS) {
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, host);
    url.searchParams.set("interval", interval);
    url.searchParams.set("range", range);
    url.searchParams.set("includePrePost", "false");
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
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close == null || Number.isNaN(close)) continue;
    points.push({ t: new Date(timestamps[index] * 1000).toISOString(), close: Number(close) });
  }
  return {
    currency: meta.currency || null,
    price: numberOrNull(meta.regularMarketPrice),
    previousClose: numberOrNull(meta.chartPreviousClose ?? meta.previousClose),
    dayHigh: numberOrNull(meta.regularMarketDayHigh),
    dayLow: numberOrNull(meta.regularMarketDayLow),
    exchange: meta.exchangeName || null,
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
    return { t: point.t, eur: roundTo(usdToEur(point.close, rate), 2), usd: roundTo(point.close, 2) };
  });
}

function directPoints(points) {
  return points.map((point) => ({ t: point.t, eur: roundTo(point.close, 2) }));
}

async function loadTicker(spec, fx) {
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

  for (const [key, interval, range] of RANGES) {
    if (key === "intraday") {
      let intra = null;
      if (useEur) {
        try {
          intra = await fetchChart(eurSymbol, interval, range);
        } catch (error) {
          console.log(`::warning::Intraday ${eurSymbol}: ${error.message}`);
        }
      }
      if (!intra || intra.points.length < 20) {
        const usdIntra = await fetchChart(spec.usdSymbol, interval, range);
        history.intraday = convertPoints(usdIntra.points, fx, fx.rate);
        intradayMethod = "usd_div_eurusd";
      } else {
        history.intraday = directPoints(intra.points);
        intradayMethod = "direct_eur";
      }
      continue;
    }
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
  if (!useEur || intradayMethod === "usd_div_eurusd") sources.push(fx.source);
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

export async function buildPrices(previous) {
  const fx = await loadFx();
  const prevTickers = new Map((previous?.tickers || []).map((ticker) => [ticker.symbol, ticker]));
  const tickers = [];
  let okCount = 0;
  for (const spec of TICKERS) {
    try {
      const fresh = await loadTicker(spec, fx);
      tickers.push(mergeTicker(prevTickers.get(spec.symbol), fresh));
      okCount += 1;
      console.log(`${spec.symbol} ${fresh.priceEur} EUR ${fresh.changePct}% via ${fresh.eurMethod} ${fresh.eurSymbol || fresh.usdSymbol}`);
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
        eurMethod: ticker.eurMethod,
        eurVenue: ticker.eurVenue,
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
