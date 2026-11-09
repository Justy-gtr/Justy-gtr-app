import { fitSessionBars, formatScrubWhen, hourlyPoints, HOURLY_BAR_CAP, limitTradingSessions, maxPoints, minuteSource, minuteWindow, scrubDelta, seriesIsSubDaily, sessionMinutePack, tradingSessionCount, trimVisibleBars, VISIBLE_BARS } from "./logic.js";

/** Chartanalyse ranges, in Robin's order. No 1-minute button. 1 Std replaces 3T. */
export const ANALYSE_RANGES = ["5 Min", "15 Min", "4 Std", "1T", "1 Std", "1W", "1M", "6M", "1J", "Max"];

const RANGE_LABEL = {
  "5 Min": "5-Minuten-Kerzen",
  "15 Min": "15-Minuten-Kerzen",
  "4 Std": "4-Stunden-Kerzen",
  "1T": "Ein Handelstag",
  "1 Std": "Stundenkerzen",
  "1W": "Sieben Tage, engere Kerzen",
  "1M": "Ein Monat, engere Kerzen",
  "6M": "Sechs Monate, Tageskerzen",
  "1J": "Ein Jahr, Tageskerzen",
  "Max": "Lange Reihe"
};

const RANGE_ARIA = {
  "5 Min": "5 Minuten",
  "15 Min": "15 Minuten",
  "4 Std": "4 Stunden",
  "1T": "1 Tag",
  "1 Std": "1 Stunde",
  "1W": "1 Woche",
  "1M": "1 Monat",
  "6M": "6 Monate",
  "1J": "1 Jahr",
  "Max": "Maximal"
};

const VISIBLE_4H = VISIBLE_BARS;
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function rangeLabel(range) {
  return RANGE_LABEL[range] || range;
}

export function rangeAria(range) {
  return RANGE_ARIA[range] || range;
}

/** Up is green, down is red. Pre-market and the live tail use the same two colors. */
export function candleColor(candle) {
  const close = Number(candle?.close ?? candle?.eur);
  const open = Number.isFinite(Number(candle?.open)) ? Number(candle.open) : close;
  return close >= open ? "#3ddea0" : "#ff5d6c";
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

function minuteCandles(ticker, minutes) {
  const { points, extended } = minuteSource(ticker);
  const all = bucketCandles(points, minutes);
  const span = minutes <= 5 ? SIX_HOURS : 0;
  const windowed = extended ? limitTradingSessions(all, minuteWindow(minutes)) : all;
  const candles = trimVisibleBars(windowed, { max: VISIBLE_BARS, maxSpanMs: span });
  if (!extended) return { candles };
  return { candles, history: all };
}

/** 5-minute candles of the last N sessions. Null when the minute series is missing. */
function sessionCandles(ticker, sessions, range) {
  const pack = sessionMinutePack(ticker, sessions);
  if (!pack) return null;
  const built = bucketCandles(pack.points, 5);
  const candles = trimVisibleBars(built, {
    max: VISIBLE_BARS,
    maxSpanMs: sessions === 1 ? SIX_HOURS : 0
  });
  if (candles.length < 2) return null;
  return {
    candles,
    history: bucketCandles(pack.history, 5),
    range,
    missing: false
  };
}

function asCandles(points) {
  return (points || []).map(candleOf).filter(Boolean);
}

/** 1 Std: hourly candles, about the last 5–10 sessions, pre and post kept when the series has them. */
function hourCandles(ticker) {
  const all = hourlyPoints(ticker);
  const visible = fitSessionBars(all, { prefer: 8, maxBars: HOURLY_BAR_CAP });
  return { candles: asCandles(visible), history: asCandles(all), range: "1 Std", missing: false };
}

/**
 * 1W: hourly candles of the last five sessions when that span is really a week.
 * Otherwise 30-minute candles from the minute series, still capped so a phone can read them.
 * Daily closes only when neither series is there.
 */
function weekCandles(ticker) {
  const hours = hourlyPoints(ticker);
  const week = fitSessionBars(limitTradingSessions(hours, 5), { prefer: 5, maxBars: HOURLY_BAR_CAP });
  if (tradingSessionCount(week) >= 4 && week.length >= 16) {
    return { candles: asCandles(week), history: asCandles(hours), range: "1W", missing: false };
  }
  const { points } = minuteSource(ticker);
  const half = bucketCandles(points, 30);
  const halfWeek = fitSessionBars(limitTradingSessions(half, 5), { prefer: 5, maxBars: HOURLY_BAR_CAP });
  if (halfWeek.length >= 16) {
    return { candles: halfWeek, history: half, range: "1W", missing: false };
  }
  if (week.length >= 12) {
    return { candles: asCandles(week), history: asCandles(hours), range: "1W", missing: false };
  }
  const daily = asCandles(dailyPoints(ticker).slice(-7));
  return { candles: daily, history: daily, range: "1W", missing: false };
}

/** 1M: 4-hour candles of about the last month when that series covers more than one session. */
function monthCandles(ticker) {
  const series = ticker?.history?.["4H"];
  if (isUsefulFourHour(series)) {
    const all = asCandles(series);
    const end = Date.parse(all.at(-1).t);
    const month = all.filter((candle) => Date.parse(candle.t) >= end - 32 * 86400000);
    const visible = month.length > HOURLY_BAR_CAP ? month.slice(-HOURLY_BAR_CAP) : month;
    if (visible.length >= 16) return { candles: visible, history: all, range: "1M", missing: false };
  }
  const daily = asCandles(ticker?.history?.["1M"] || []);
  return { candles: daily, history: daily, range: "1M", missing: false };
}

export function candlesFor(ticker, range) {
  const named = range === "3T" ? "1 Std" : range;
  const asked = ANALYSE_RANGES.includes(named) ? named : "15 Min";
  if (asked === "5 Min" || asked === "15 Min") {
    const packed = minuteCandles(ticker, asked === "5 Min" ? 5 : 15);
    return { candles: packed.candles, history: packed.history, range: asked, missing: false };
  }
  if (asked === "4 Std") {
    const series = ticker?.history?.["4H"];
    if (!isUsefulFourHour(series)) return { candles: [], range: asked, missing: true };
    const all = series.map(candleOf).filter(Boolean);
    return { candles: all.slice(-VISIBLE_4H), history: all, range: asked, missing: false };
  }
  if (asked === "1 Std") return hourCandles(ticker);
  if (asked === "1W") return weekCandles(ticker);
  if (asked === "1M") return monthCandles(ticker);
  let points;
  if (asked === "1T") {
    const packed = sessionCandles(ticker, 1, asked);
    if (packed) return packed;
    points = dailyPoints(ticker).slice(-1);
  } else if (asked === "6M") points = ticker?.history?.["6M"] || [];
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

function scrubSeries(candle, pointsOrSpan) {
  if (Array.isArray(pointsOrSpan)) return pointsOrSpan;
  const span = Number(pointsOrSpan);
  const start = Date.parse(candle?.t);
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(start)) return [candle];
  return [candle, { t: new Date(start + span).toISOString() }];
}

/** Bucket width from the usual gap, ignoring the overnight jump. */
function candleEndIso(candle, candles) {
  if (!seriesIsSubDaily(candles)) return null;
  const times = candles.map((item) => Date.parse(item?.t)).filter((time) => Number.isFinite(time)).sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap >= 60 * 1000 && gap < 18 * 60 * 60 * 1000) gaps.push(gap);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const start = Date.parse(candle.t);
  if (!Number.isFinite(start)) return null;
  return new Date(start + gaps[Math.floor((gaps.length - 1) / 2)]).toISOString();
}

/** Date, euro OHLC when the candle has a real range, and the move versus the first visible candle. */
export function scrubLabel(candle, firstClose, pointsOrSpan) {
  if (!candle) return "";
  const series = scrubSeries(candle, pointsOrSpan);
  const end = Array.isArray(pointsOrSpan) ? candleEndIso(candle, series) : null;
  const when = formatScrubWhen(candle.t, series, end);
  const percent = scrubDelta(firstClose, candle.close)?.text || "—";
  const flat = candle.high === candle.low && candle.open === candle.close;
  const price = flat
    ? `${euroNumber(candle.close)} €`
    : `E ${euroNumber(candle.open)} · H ${euroNumber(candle.high)} · T ${euroNumber(candle.low)} · S ${euroNumber(candle.close)} €`;
  return `${when}\n${price}\n${percent}`;
}
