/**
 * Alpaca Market Data, free IEX feed only.
 * Host is data.alpaca.markets. Snapshots and bars. No trading routes, no orders.
 * Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY means the caller keeps its old source.
 */

import { nyParts, sessionBaseline, usClockSession } from "./market.mjs";

export const ALPACA_SOURCE = "alpaca-iex";
export const IEX_LABEL = "IEX";
export const DATA_ORIGIN = "https://data.alpaca.markets";
export const MIN_MINUTE_BARS = 12;
export const MIN_FIVE_BARS = 12;
export const MIN_HOUR_BARS = 8;

const BAR_LIMIT = 10000;
const MAX_PAGES = 8;
const CHUNK = 50;
const ALLOWED_PATH = /^\/v2\/stocks\/(?:snapshots|bars)$/;
const FOREIGN = /\.(DE|F|MU|SG|HM|DU|BE|HA|VI|PA|AS|L|SW|MI|TO|HK|SS|SZ|KS|TW|TWO|AX|NZ|IR|SA)$/i;

export function isUsSymbol(symbol) {
  const text = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(text)) return false;
  if (text.includes("=")) return false;
  if (FOREIGN.test(text)) return false;
  return true;
}

export function usSymbols(symbols) {
  const seen = new Set();
  const out = [];
  for (const symbol of symbols || []) {
    const text = String(symbol || "").trim().toUpperCase();
    if (!isUsSymbol(text) || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  out.sort();
  return out;
}

export function alpacaCredentials(env = process.env) {
  const key = String(env?.ALPACA_KEY_ID || "").trim();
  const secret = String(env?.ALPACA_SECRET_KEY || "").trim();
  if (key.length < 8 || secret.length < 8) return null;
  return { key, secret };
}

export function alpacaConfigured(env = process.env) {
  return Boolean(alpacaCredentials(env));
}

export function publicError(error, creds) {
  let text = String(error?.message || error || "fehlgeschlagen");
  for (const secret of [creds?.key, creds?.secret]) {
    if (secret && secret.length >= 8) text = text.split(secret).join("***");
  }
  return text.replace(/APCA-API-(?:KEY-ID|SECRET-KEY)/g, "APCA").slice(0, 240);
}

export function marketLink(symbol) {
  const text = String(symbol || "").trim().toUpperCase();
  return {
    title: `Alpaca Markets IEX ${text}`,
    url: `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(text)}/snapshot?feed=iex`
  };
}

export function assertMarketDataUrl(value) {
  const url = value instanceof URL ? value : new URL(String(value));
  if (url.origin !== DATA_ORIGIN) throw new Error("Nur Marktdaten");
  if (!ALLOWED_PATH.test(url.pathname)) throw new Error("Nur Kurse und Kerzen");
  if (url.searchParams.get("feed") !== "iex") throw new Error("Nur IEX");
  return url;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function parseBar(bar) {
  if (!bar || typeof bar !== "object") return null;
  const close = numberOrNull(bar.c);
  const time = parseTime(bar.t);
  if (close == null || !time) return null;
  return {
    t: time,
    close,
    open: numberOrNull(bar.o),
    high: numberOrNull(bar.h),
    low: numberOrNull(bar.l)
  };
}

export function parseSnapshot(symbol, snap) {
  if (!snap || typeof snap !== "object") return null;
  const latest = numberOrNull(snap.latestTrade?.p);
  const latestAt = parseTime(snap.latestTrade?.t);
  const daily = parseBar(snap.dailyBar);
  const prevDaily = parseBar(snap.prevDailyBar);
  const minute = parseBar(snap.minuteBar);
  if (latest == null && !daily && !prevDaily) return null;
  return {
    symbol,
    source: ALPACA_SOURCE,
    latest,
    latestAt,
    daily,
    prevDaily,
    minute
  };
}

export function parseSnapshots(body) {
  const out = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const [symbol, snap] of Object.entries(body)) {
    if (!isUsSymbol(symbol)) continue;
    const parsed = parseSnapshot(symbol, snap);
    if (parsed) out[symbol] = parsed;
  }
  return out;
}

export function parseBarsPage(body) {
  const bars = {};
  const raw = body?.bars;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [symbol, list] of Object.entries(raw)) {
      if (!isUsSymbol(symbol) || !Array.isArray(list)) continue;
      bars[symbol] = list.map(parseBar).filter(Boolean);
    }
  }
  const token = body?.next_page_token;
  return { bars, next: typeof token === "string" && token ? token : null };
}

function stamp(date) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function nyDate(value) {
  const time = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  return nyParts(time).date;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function alpacaGet(url, creds, fetchImpl, delay, attempt = 0) {
  assertMarketDataUrl(url);
  const response = await fetchImpl(url, {
    headers: {
      "APCA-API-KEY-ID": creds.key,
      "APCA-API-SECRET-KEY": creds.secret,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 429 && attempt < 1) {
    await delay(1000);
    return alpacaGet(url, creds, fetchImpl, delay, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function tryStep(label, creds, fn) {
  try {
    return await fn();
  } catch (error) {
    console.log(`::warning::Alpaca ${label}: ${publicError(error, creds)}`);
    return null;
  }
}

function chunks(list) {
  const out = [];
  for (let index = 0; index < list.length; index += CHUNK) out.push(list.slice(index, index + CHUNK));
  return out;
}

async function loadSnapshots(symbols, creds, fetchImpl, delay) {
  const merged = {};
  for (const group of chunks(symbols)) {
    const url = new URL("/v2/stocks/snapshots", DATA_ORIGIN);
    url.searchParams.set("symbols", group.join(","));
    url.searchParams.set("feed", "iex");
    const body = await alpacaGet(url, creds, fetchImpl, delay);
    Object.assign(merged, parseSnapshots(body));
  }
  return merged;
}

function mergeSeries(into, page) {
  for (const [symbol, rows] of Object.entries(page || {})) {
    const map = into[symbol] || new Map();
    for (const row of rows) map.set(row.t, row);
    into[symbol] = map;
  }
}

function finishSeries(into) {
  const out = {};
  for (const [symbol, map] of Object.entries(into)) {
    out[symbol] = [...map.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  }
  return out;
}

async function loadBars(symbols, { timeframe, start, end, adjustment }, creds, fetchImpl, delay) {
  const into = {};
  for (const group of chunks(symbols)) {
    let token = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL("/v2/stocks/bars", DATA_ORIGIN);
      url.searchParams.set("symbols", group.join(","));
      url.searchParams.set("timeframe", timeframe);
      url.searchParams.set("feed", "iex");
      url.searchParams.set("adjustment", adjustment || "raw");
      url.searchParams.set("limit", String(BAR_LIMIT));
      url.searchParams.set("start", stamp(start));
      url.searchParams.set("end", stamp(end));
      if (token) url.searchParams.set("page_token", token);
      const body = await alpacaGet(url, creds, fetchImpl, delay);
      const parsed = parseBarsPage(body);
      mergeSeries(into, parsed.bars);
      token = parsed.next;
      if (!token) break;
      if (page === MAX_PAGES - 1) console.log(`::warning::Alpaca ${timeframe}: Seite abgeschnitten`);
    }
  }
  return finishSeries(into);
}

function clientOptions(options) {
  const env = options.env || process.env;
  const creds = alpacaCredentials(env);
  if (!creds) return null;
  return {
    creds,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    delay: options.delay || sleep,
    now: options.now instanceof Date ? options.now : new Date()
  };
}

export async function loadPricePack(symbols, options = {}) {
  const client = clientOptions(options);
  if (!client) return null;
  const list = usSymbols(symbols);
  if (!list.length) return null;
  const { creds, fetchImpl, delay, now } = client;
  const snapshots = await tryStep("snapshots", creds, () => loadSnapshots(list, creds, fetchImpl, delay));
  const daily = await tryStep("1Day", creds, () => loadBars(list, {
    timeframe: "1Day",
    start: new Date(now.getTime() - 14 * 86400000),
    end: now,
    adjustment: "raw"
  }, creds, fetchImpl, delay));
  const intraday = await tryStep("1Min", creds, () => loadBars(list, {
    timeframe: "1Min",
    start: new Date(now.getTime() - 36 * 3600000),
    end: now,
    adjustment: "raw"
  }, creds, fetchImpl, delay));
  const five = await tryStep("5Min", creds, () => loadBars(list, {
    timeframe: "5Min",
    start: new Date(now.getTime() - 8 * 86400000),
    end: now,
    adjustment: "raw"
  }, creds, fetchImpl, delay));
  const hour = await tryStep("1Hour", creds, () => loadBars(list, {
    timeframe: "1Hour",
    start: new Date(now.getTime() - 24 * 86400000),
    end: now,
    adjustment: "raw"
  }, creds, fetchImpl, delay));
  if (!snapshots && !daily && !intraday && !five && !hour) return null;
  return {
    source: ALPACA_SOURCE,
    snapshots: snapshots || {},
    daily: daily || {},
    intraday: intraday || {},
    five: five || {},
    hour: hour || {}
  };
}

export async function loadQuotePack(symbols, options = {}) {
  const client = clientOptions(options);
  if (!client) return null;
  const list = usSymbols(symbols);
  if (!list.length) return null;
  const { creds, fetchImpl, delay, now } = client;
  const snapshots = await tryStep("snapshots", creds, () => loadSnapshots(list, creds, fetchImpl, delay));
  const daily = await tryStep("1Day", creds, () => loadBars(list, {
    timeframe: "1Day",
    start: new Date(now.getTime() - 14 * 86400000),
    end: now,
    adjustment: "raw"
  }, creds, fetchImpl, delay));
  if (!snapshots && !daily) return null;
  return { source: ALPACA_SOURCE, snapshots: snapshots || {}, daily: daily || {} };
}

/** Long US bars for weekday paths. 1Hour ~two years, 30Min ~70 days. Split-adjusted. */
export async function loadPathPack(symbols, options = {}) {
  const client = clientOptions(options);
  if (!client) return null;
  const list = usSymbols(symbols);
  if (!list.length) return null;
  const { creds, fetchImpl, delay, now } = client;
  const hour = await tryStep("1Hour", creds, () => loadBars(list, {
    timeframe: "1Hour",
    start: new Date(now.getTime() - 800 * 86400000),
    end: now,
    adjustment: "split"
  }, creds, fetchImpl, delay));
  const half = await tryStep("30Min", creds, () => loadBars(list, {
    timeframe: "30Min",
    start: new Date(now.getTime() - 70 * 86400000),
    end: now,
    adjustment: "split"
  }, creds, fetchImpl, delay));
  if (!hour && !half) return null;
  return { source: ALPACA_SOURCE, hour: hour || {}, half: half || {} };
}

/**
 * Regular-session dollar quote.
 * During the cash session the last IEX trade is the price.
 * After the close the daily bar stays the price; the later trade is extended.
 * Before the open the last completed session stands.
 */
export function standingQuote(symbol, pack, now = new Date()) {
  const key = String(symbol || "").trim().toUpperCase();
  if (!isUsSymbol(key) || !pack) return null;
  const when = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(when.getTime())) return null;
  const snapshot = pack.snapshots?.[key] || null;
  const history = Array.isArray(pack.daily?.[key]) ? pack.daily[key] : [];
  const today = nyDate(when);
  const phase = usClockSession(when.getTime());
  let points = history.filter((point) => point?.t && Number.isFinite(Number(point.close)));
  if (!points.length) points = [snapshot?.prevDaily, snapshot?.daily].filter(Boolean);
  else if (snapshot?.daily && !points.some((point) => point.t === snapshot.daily.t)) points = points.concat(snapshot.daily);
  points = points.slice().sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const sessionPoints = phase === "pre" ? points.filter((point) => nyDate(point.t) < today) : points;
  if (!today || sessionPoints.length < 2) return null;
  const todayBar = points.find((point) => nyDate(point.t) === today) || null;
  const last = sessionPoints[sessionPoints.length - 1];
  let price = last.close;
  let high = last.high ?? last.close;
  let low = last.low ?? last.close;
  let asOf = last.t;
  if (phase === "regular" && snapshot?.latest != null) {
    price = snapshot.latest;
    asOf = snapshot.latestAt || asOf;
    high = Math.max(snapshot.daily?.high ?? todayBar?.high ?? high, price);
    low = Math.min(snapshot.daily?.low ?? todayBar?.low ?? low, price);
  } else if ((phase === "post" || phase == null) && todayBar) {
    price = snapshot?.daily?.close ?? todayBar.close;
    high = snapshot?.daily?.high ?? todayBar.high ?? price;
    low = snapshot?.daily?.low ?? todayBar.low ?? price;
    asOf = snapshot?.daily?.t || todayBar.t;
  }
  if (!(price > 0)) return null;
  if (high != null && low != null && high < low) {
    const swap = high;
    high = low;
    low = swap;
  }
  return {
    symbol: key,
    source: ALPACA_SOURCE,
    currency: "USD",
    price,
    chartPreviousClose: snapshot?.prevDaily?.close ?? null,
    metaPrevious: snapshot?.prevDaily?.close ?? null,
    dayHigh: high,
    dayLow: low,
    regularTime: Number.isFinite(Date.parse(asOf)) ? Math.floor(Date.parse(asOf) / 1000) : null,
    hasPrePost: true,
    exchange: "IEX",
    periods: null,
    points: sessionPoints,
    previousClose: sessionBaseline({ points: sessionPoints })
  };
}

/** Last extended trade when the minute history has no pre/post candle yet. */
export function extendedPrint(snapshot, now = new Date()) {
  if (!snapshot || snapshot.latest == null || !snapshot.latestAt) return null;
  const when = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(when.getTime())) return null;
  const tradePhase = usClockSession(Date.parse(snapshot.latestAt));
  const nowPhase = usClockSession(when.getTime());
  const showPost = tradePhase === "post" && nowPhase !== "regular" && nowPhase !== "pre";
  const showPre = tradePhase === "pre" && nowPhase === "pre";
  if (!showPost && !showPre) return null;
  const high = snapshot.minute?.high ?? snapshot.latest;
  const low = snapshot.minute?.low ?? snapshot.latest;
  return {
    phase: showPre ? "vorboerse" : "nachhandel",
    price: snapshot.latest,
    high: Math.max(high, snapshot.latest),
    low: Math.min(low, snapshot.latest),
    asOf: snapshot.latestAt
  };
}

export function minutePoints(symbol, pack) {
  const key = String(symbol || "").trim().toUpperCase();
  if (!pack || !isUsSymbol(key)) return [];
  const map = new Map();
  for (const point of pack.intraday?.[key] || []) {
    if (point?.t) map.set(point.t, point);
  }
  const extra = pack.snapshots?.[key]?.minute;
  if (extra?.t) map.set(extra.t, extra);
  return [...map.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function pathPoints(symbol, pack) {
  const key = String(symbol || "").trim().toUpperCase();
  if (!pack || !isUsSymbol(key)) return [];
  const rows = [...(pack.hour?.[key] || []), ...(pack.half?.[key] || [])];
  return rows
    .filter((point) => point?.t && Number(point.close) > 0)
    .map((point) => ({ t: point.t, eur: Number(point.close) }));
}
