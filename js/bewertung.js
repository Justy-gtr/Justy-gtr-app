export const VALUE_SYMBOLS = ["SPCX", "TSLA", "RKLB", "MRVL", "NVDA"];
export const HISTORY_MIN = 20;
export const PEER_MIN = 2;

function round2(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100)) / 100;
}

export function rawNum(value) {
  if (value == null || value === "") return null;
  const number = typeof value === "object" ? Number(value.raw) : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function bandWord(position) {
  if (position < 1 / 3) return "günstig";
  if (position > 2 / 3) return "teuer";
  return "normal";
}

export function peHistory(closes, eps) {
  if (!(Number(eps) > 0)) return { n: 0, min: null, max: null, current: null };
  const series = (closes || []).map(Number).filter((close) => Number.isFinite(close) && close > 0).map((close) => close / Number(eps));
  if (series.length < HISTORY_MIN) {
    return { n: series.length, min: null, max: null, current: series.length ? round2(series.at(-1)) : null };
  }
  return {
    n: series.length,
    min: round2(Math.min(...series)),
    max: round2(Math.max(...series)),
    current: round2(series.at(-1))
  };
}

/**
 * One symbol from Yahoo quoteSummary modules summaryDetail, defaultKeyStatistics and price.
 * A negative trailing or forward profit clears the ratio instead of showing a misleading number.
 */
export function buildSymbolRecord({ symbol, summary = {}, stats = {}, price = {}, closes = [], fxRate = null } = {}) {
  const eps = rawNum(stats.trailingEps);
  const reportedPe = rawNum(summary.trailingPE);
  const px = rawNum(price.regularMarketPrice);
  let trailingPe = null;
  let peState = "fehlt";
  if (eps != null && eps <= 0) peState = "negativ";
  else if (reportedPe != null && reportedPe > 0) {
    trailingPe = round2(reportedPe);
    peState = "gemeldet";
  } else if (eps > 0 && px > 0) {
    trailingPe = round2(px / eps);
    peState = "gerechnet";
  }
  const forwardReported = rawNum(summary.forwardPE);
  const forwardEps = rawNum(stats.forwardEps);
  let forwardPe = null;
  let forwardState = "fehlt";
  if (forwardEps != null && forwardEps <= 0) forwardState = "negativ";
  else if (forwardReported != null && forwardReported > 0) {
    forwardPe = round2(forwardReported);
    forwardState = "gemeldet";
  }
  const ps = rawNum(summary.priceToSalesTrailing12Months);
  const cap = rawNum(summary.marketCap) ?? rawNum(price.marketCap);
  const currency = price.currency || "USD";
  const rate = Number(fxRate);
  let marketCapUsd = null;
  let marketCapEur = null;
  if (cap != null && cap > 0) {
    if (currency === "EUR") marketCapEur = cap;
    else if (rate > 0) {
      marketCapUsd = cap;
      marketCapEur = cap / rate;
    }
  }
  return {
    symbol,
    name: price.longName || price.shortName || symbol,
    currency,
    trailingPe,
    peState,
    forwardPe,
    forwardState,
    priceToSales: ps != null && ps > 0 ? round2(ps) : null,
    marketCapUsd,
    marketCapEur,
    epsTrailing: eps,
    history: peState === "negativ" ? { n: 0, min: null, max: null, current: null } : peHistory(closes, eps),
    sources: [{ title: `Yahoo Finance ${symbol}`, url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}` }]
  };
}

export function historyPlacement(history) {
  if (!history || !Number.isFinite(history.min) || !Number.isFinite(history.max) || !Number.isFinite(history.current)) {
    return { enough: false, text: "noch zu wenig Daten" };
  }
  if (!Number.isInteger(history.n) || history.n < HISTORY_MIN) return { enough: false, text: "noch zu wenig Daten" };
  if (history.max <= history.min) return { enough: true, word: "normal", position: 0.5 };
  const position = clamp01((history.current - history.min) / (history.max - history.min));
  return { enough: true, word: bandWord(position), position };
}

export function peerValues(symbols, symbol, key) {
  return (symbols || [])
    .filter((item) => item && item.symbol !== symbol && Number.isFinite(item[key]) && item[key] > 0)
    .map((item) => item[key]);
}

export function peerPlacement(current, peers) {
  const list = (peers || []).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!Number.isFinite(current) || current <= 0 || list.length < PEER_MIN) {
    return { enough: false, text: "noch zu wenig Daten", median: null };
  }
  const mid = Math.floor(list.length / 2);
  const median = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  const ratio = current / median;
  const position = clamp01((ratio - 0.5) / 1);
  let word = "normal";
  if (ratio <= 0.8) word = "günstig";
  else if (ratio >= 1.25) word = "teuer";
  return { enough: true, word, position, median };
}

export function shouldSkipFundamentals(previous, now = new Date(), force = false, dayOf = null) {
  if (force) return false;
  if (!previous?.asOf || !Array.isArray(previous.symbols)) return false;
  const have = new Set(previous.symbols.map((item) => item?.symbol));
  if (!VALUE_SYMBOLS.every((symbol) => have.has(symbol))) return false;
  if (typeof dayOf !== "function") return false;
  return dayOf(previous.asOf) != null && dayOf(previous.asOf) === dayOf(now);
}

export function symbolsOf(file) {
  if (Array.isArray(file?.symbols)) return file.symbols.filter((item) => item && item.symbol);
  if (file?.symbols && typeof file.symbols === "object") return Object.values(file.symbols).filter((item) => item && item.symbol);
  return [];
}
