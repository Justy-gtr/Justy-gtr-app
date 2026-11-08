import { maxPoints, scrubDelta } from "./logic.js";

/** Chartanalyse ranges, in Robin's order. No 1-minute button. */
export const ANALYSE_RANGES = ["5 Min", "15 Min", "4 Std", "1T", "3T", "1W", "1M", "6M", "1J", "Max"];

const RANGE_LABEL = {
  "5 Min": "5-Minuten-Kerzen",
  "15 Min": "15-Minuten-Kerzen",
  "4 Std": "4-Stunden-Kerzen",
  "1T": "Eine Tageskerze",
  "3T": "Drei Tageskerzen",
  "1W": "Sieben Tage",
  "1M": "Ein Monat, Tageskerzen",
  "6M": "Sechs Monate, Tageskerzen",
  "1J": "Ein Jahr, Tageskerzen",
  "Max": "Lange Reihe"
};

const RANGE_ARIA = {
  "5 Min": "5 Minuten",
  "15 Min": "15 Minuten",
  "4 Std": "4 Stunden",
  "1T": "1 Tag",
  "3T": "3 Tage",
  "1W": "1 Woche",
  "1M": "1 Monat",
  "6M": "6 Monate",
  "1J": "1 Jahr",
  "Max": "Maximal"
};

const VISIBLE_4H = 120;

export function rangeLabel(range) {
  return RANGE_LABEL[range] || range;
}

export function rangeAria(range) {
  return RANGE_ARIA[range] || range;
}

export function candleOf(point) {
  const close = Number(point?.eur ?? point?.close);
  if (!point?.t || !Number.isFinite(close)) return null;
  const openRaw = Number(point.open);
  const highRaw = Number(point.high);
  const lowRaw = Number(point.low);
  const open = Number.isFinite(openRaw) ? openRaw : close;
  const high = Number.isFinite(highRaw) ? Math.max(highRaw, open, close) : Math.max(open, close);
  const low = Number.isFinite(lowRaw) ? Math.min(lowRaw, open, close) : Math.min(open, close);
  return {
    t: point.t,
    open,
    high,
    low,
    close,
    eur: close,
    session: point.session || null
  };
}

/** OHLC of each N-minute bucket. Open, high, low and close come only from prints inside the bucket. */
export function bucketCandles(points, minutes) {
  const list = (points || []).filter((point) => point && point.t && (point.eur != null || point.close != null));
  if (!minutes || minutes <= 1) return list.map(candleOf).filter(Boolean);
  const size = minutes * 60 * 1000;
  const buckets = new Map();
  for (const point of list) {
    const time = Date.parse(point.t);
    const bar = candleOf(point);
    if (!Number.isFinite(time) || !bar) continue;
    const key = Math.floor(time / size);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...bar, t: new Date(key * size).toISOString() });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.eur = bar.close;
    if (bar.session) existing.session = bar.session;
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
}

/** A stored 4h series is usable only when it covers more than one session. */
export function isUsefulFourHour(series) {
  const rows = (series || []).filter((point) => point && point.eur != null && point.t);
  if (rows.length < 2) return false;
  const start = Date.parse(rows[0].t);
  const end = Date.parse(rows.at(-1).t);
  return Number.isFinite(start) && Number.isFinite(end) && end - start > 36 * 3600 * 1000;
}

function dailyPoints(ticker) {
  const month = (ticker?.history?.["1M"] || []).filter((point) => point && point.eur != null && point.t);
  if (month.length >= 3) return month;
  return (ticker?.history?.["6M"] || []).filter((point) => point && point.eur != null && point.t);
}

export function candlesFor(ticker, range) {
  const asked = ANALYSE_RANGES.includes(range) ? range : "15 Min";
  if (asked === "5 Min") {
    return { candles: bucketCandles(ticker?.history?.intraday, 5), range: asked, missing: false };
  }
  if (asked === "15 Min") {
    return { candles: bucketCandles(ticker?.history?.intraday, 15), range: asked, missing: false };
  }
  if (asked === "4 Std") {
    const series = ticker?.history?.["4H"];
    if (!isUsefulFourHour(series)) return { candles: [], range: asked, missing: true };
    const all = series.map(candleOf).filter(Boolean);
    return { candles: all.slice(-VISIBLE_4H), history: all, range: asked, missing: false };
  }
  let points;
  if (asked === "1T") points = dailyPoints(ticker).slice(-1);
  else if (asked === "3T") points = dailyPoints(ticker).slice(-3);
  else if (asked === "1W") points = dailyPoints(ticker).slice(-7);
  else if (asked === "1M") points = ticker?.history?.["1M"] || [];
  else if (asked === "6M") points = ticker?.history?.["6M"] || [];
  else if (asked === "1J") points = ticker?.history?.["1Y"] || [];
  else points = maxPoints(ticker?.history);
  return { candles: (points || []).map(candleOf).filter(Boolean), range: asked, missing: false };
}

export function formatMove(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(number));
  if (number > 0) return `+${body} %`;
  if (number < 0) return `−${body} %`;
  return `${body} %`;
}

function euroNumber(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value));
}

function scrubWhen(iso, spanMs) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || "").slice(0, 16);
  const zone = "Europe/Berlin";
  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  if (spanMs < 36 * 3600 * 1000) {
    const time = new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
    return `${day}, ${time}`;
  }
  return day;
}

/** Date, euro OHLC when the candle has a real range, and the move versus the first visible candle. */
export function scrubLabel(candle, firstClose, spanMs) {
  if (!candle) return "";
  const when = scrubWhen(candle.t, spanMs);
  const percent = scrubDelta(firstClose, candle.close)?.text || "—";
  const flat = candle.high === candle.low && candle.open === candle.close;
  const price = flat
    ? `${euroNumber(candle.close)} €`
    : `E ${euroNumber(candle.open)} · H ${euroNumber(candle.high)} · T ${euroNumber(candle.low)} · S ${euroNumber(candle.close)} €`;
  return `${when}\n${price}\n${percent}`;
}
