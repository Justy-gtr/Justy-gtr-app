/** Pure helpers. No DOM at import time. */

export function appBase() {
  const path = location.pathname;
  const marker = "/Justy-gtr-app";
  const index = path.indexOf(marker);
  if (index >= 0) return path.slice(0, index + marker.length).replace(/\/$/, "");
  return "";
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    /* ignore */
  }
  return "";
}

export function formatEUR(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value));
}

export function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value));
}

export function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(Math.abs(number));
  if (number > 0) return `+${body} %`;
  if (number < 0) return `−${body} %`;
  return `${body} %`;
}

/** Prozent erst ab sieben Fällen. Darunter nur n, wie bei der Saisonalität. */
export function historySentence(label, stats, threshold = 5) {
  const n = Number(stats?.n);
  if (!Number.isInteger(n) || n < 7) {
    return `${label}: n = ${Number.isInteger(n) && n > 0 ? n : 0}, keine Prozentzahl.`;
  }
  if (stats.up != null && stats.down != null) {
    return `${label}: ${stats.up} von ${n} Mal ≥ +${threshold} %, ${stats.down} von ${n} Mal ≤ −${threshold} %. n = ${n}.`;
  }
  return `${label}: ${stats.sharePct} % der Tage mit Bewegung von mindestens ${threshold} %. n = ${n}.`;
}

function roundHalfAway(value, digits) {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

/**
 * Percent of a hovered price versus the first visible point of the range.
 * Two German decimals, with a sign. Zero stays `0,00 %`.
 * @returns {{ text: string, direction: "up" | "down" | "flat" } | null}
 */
export function scrubDelta(startEur, pointEur) {
  const start = Number(startEur);
  const point = Number(pointEur);
  if (!Number.isFinite(start) || start === 0 || !Number.isFinite(point)) return null;
  const rounded = roundHalfAway(((point - start) / start) * 100, 2);
  if (rounded > 0) return { text: `+${formatNumber(rounded, 2)} %`, direction: "up" };
  if (rounded < 0) return { text: `−${formatNumber(Math.abs(rounded), 2)} %`, direction: "down" };
  return { text: "0,00 %", direction: "flat" };
}

/** Gaps at least this long are a new day, not a finer bar. */
const SUB_DAY_MS = 18 * 60 * 60 * 1000;

function sortedTimes(points) {
  const times = [];
  for (const point of points || []) {
    const time = Date.parse(point?.t);
    if (Number.isFinite(time)) times.push(time);
  }
  times.sort((a, b) => a - b);
  return times;
}

/** True when typical spacing is finer than one bar per day. A lone point is not enough. */
export function seriesIsSubDaily(points) {
  const times = sortedTimes(points);
  if (times.length < 2) return false;
  const gaps = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return false;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor((gaps.length - 1) / 2)] < SUB_DAY_MS;
}

function berlinClockParts(date) {
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
}

/**
 * Scrub date in Europe/Berlin.
 * Sub-daily series show weekday, date and 24h time (`Mo 09.11. · 15:45`).
 * Daily series stay a date, with no clock.
 * `endIso` appends a candle close, e.g. `15:45–16:00`.
 */
export function formatScrubWhen(iso, series, endIso = null) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || "").slice(0, 16);
  if (!seriesIsSubDaily(series)) {
    return date.toLocaleDateString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }
  const parts = berlinClockParts(date);
  const weekday = String(parts.weekday || "").replace(/\.$/, "");
  let time = `${parts.hour}:${parts.minute}`;
  if (endIso) {
    const end = new Date(endIso);
    if (!Number.isNaN(end.getTime()) && end.getTime() > date.getTime()) {
      const endParts = berlinClockParts(end);
      time = `${time}–${endParts.hour}:${endParts.minute}`;
    }
  }
  return `${weekday} ${parts.day}.${parts.month}. · ${time}`;
}

export function parseDay(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(value) {
  const date = parseDay(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long"
  }).format(date);
}

export function formatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/** Wall clock in a named zone → instant. Used so feed times are never left in US time. */
export function zonedWallTime(dateStr, timeStr, timeZone = "Europe/Berlin") {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  const clockMatch = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ""));
  if (!dateMatch || !clockMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const zoned = (ms) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute)
    );
  };
  let utc = desired;
  for (let step = 0; step < 3; step += 1) {
    const delta = zoned(utc) - desired;
    if (delta === 0) break;
    utc -= delta;
  }
  return new Date(utc);
}

export function formatFeedTime(value, now = new Date(), { withClock = true } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = "Europe/Berlin";
  const day = berlinDate(date);
  const today = berlinDate(now);
  const yesterday = berlinDate(new Date(now.getTime() - 86400000));
  const clock = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
  if (!withClock) {
    if (day === today) return "heute";
    if (day === yesterday) return "gestern";
    return new Intl.DateTimeFormat("de-DE", { timeZone: zone, day: "numeric", month: "short" }).format(date);
  }
  if (day === today) return `heute ${clock}`;
  if (day === yesterday) return `gestern ${clock}`;
  const short = new Intl.DateTimeFormat("de-DE", { timeZone: zone, day: "numeric", month: "short" }).format(date);
  return `${short} · ${clock}`;
}

function clip(text, max = 88) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function eventInstant(event) {
  if (event?.time) return zonedWallTime(event.date, event.time, event.timezone || "Europe/Berlin");
  return parseDay(event?.date);
}

export function formatEventClock(event, now = new Date()) {
  if (!event) return "";
  if (!event.time) return formatFeedTime(parseDay(event.date), now, { withClock: false });
  const at = zonedWallTime(event.date, event.time, event.timezone || "Europe/Berlin");
  return at ? formatFeedTime(at, now) : event.time;
}

const VENUES = [
  { id: "tokyo", zone: "Asia/Tokyo", open: "09:00", close: "15:00", openTitle: "Tokio auf", closeTitle: "Tokio zu" },
  { id: "xetra", zone: "Europe/Berlin", open: "09:00", close: "17:30", openTitle: "Xetra auf", closeTitle: "Xetra zu" },
  { id: "nyse", zone: "America/New_York", open: "09:30", close: "16:00", openTitle: "NYSE / Nasdaq auf", closeTitle: "NYSE / Nasdaq zu" }
];

const MARKET_LABEL = {
  earnings: "Zahlen",
  politik: "Politik",
  zinsen: "Politik",
  regulierung: "Politik",
  makro: "Politik"
};

export function sessionBlurb(id) {
  switch (id) {
    case "xetra": return "Xetra handelt werktags von 9:00 bis 17:30 Uhr Berliner Zeit.";
    case "nyse": return "NYSE und Nasdaq: 9:30 bis 16:00 Uhr New York. Die Uhr hier ist Berlin.";
    case "tokyo": return "Tokio handelt werktags von 9:00 bis 15:00 Uhr japanischer Zeit. Die Uhr hier ist Berlin.";
    default: return "Samstag und Sonntag bleiben Xetra, New York und Tokio zu.";
  }
}

function berlinClock(date) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function berlinHour(date) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(date);
  return Number(hour) % 24;
}

function addBerlinDays(dateStr, days) {
  let cursor = zonedWallTime(dateStr, "12:00", "Europe/Berlin");
  for (let step = 0; step < days; step += 1) cursor = new Date(cursor.getTime() + 86400000);
  return berlinDate(cursor);
}

function isWeekend(dateStr) {
  const noon = zonedWallTime(dateStr, "12:00", "Europe/Berlin");
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(noon);
  return day === "Sat" || day === "Sun";
}

function nextTradingDay(dateStr) {
  let day = addBerlinDays(dateStr, 1);
  for (let guard = 0; guard < 6 && isWeekend(day); guard += 1) day = addBerlinDays(day, 1);
  return day;
}

function timeLabelFor(instant, now) {
  const clock = berlinClock(instant);
  const day = berlinDate(instant);
  if (day === berlinDate(now)) return clock;
  if (day === addBerlinDays(berlinDate(now), 1)) return `morgen ${clock}`;
  const weekday = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short" }).format(instant);
  return `${weekday} ${clock}`;
}

function markerStatus(now, openAt, closeAt, role) {
  const t = now.getTime();
  if (role === "open") {
    if (t >= closeAt.getTime()) return "";
    if (t >= openAt.getTime()) return "offen";
    if (openAt.getTime() - t <= 90 * 60 * 1000) return "bald";
    return "";
  }
  return "";
}

function venueMarkers(dateStr, now, { earlyOnly = false } = {}) {
  if (isWeekend(dateStr)) return [];
  const rows = [];
  for (const venue of VENUES) {
    const openAt = zonedWallTime(dateStr, venue.open, venue.zone);
    const closeAt = zonedWallTime(dateStr, venue.close, venue.zone);
    if (!openAt || !closeAt) continue;
    const bounds = [
      { at: openAt, role: "open", title: venue.openTitle },
      { at: closeAt, role: "close", title: venue.closeTitle }
    ];
    for (const bound of bounds) {
      if (berlinDate(bound.at) !== dateStr) continue;
      if (earlyOnly && berlinHour(bound.at) >= 10) continue;
      rows.push({
        id: `${venue.id}-${bound.role}-${dateStr}`,
        at: bound.at.getTime(),
        timeLabel: timeLabelFor(bound.at, now),
        label: "Börse",
        title: bound.title,
        status: markerStatus(now, openAt, closeAt, bound.role),
        action: "open-session",
        target: venue.id
      });
    }
  }
  return rows;
}

export function buildMarketTimeline(data, now = new Date()) {
  const today = berlinDate(now);
  const sessions = venueMarkers(today, now);
  const events = (data?.calendar?.events || []).flatMap((event) => {
    const label = MARKET_LABEL[event?.category];
    if (!label || !event.time) return [];
    const at = zonedWallTime(event.date, event.time, event.timezone || "Europe/Berlin");
    if (!at || berlinDate(at) !== today) return [];
    return [{
      id: `mkt-${event.id}`,
      at: at.getTime(),
      timeLabel: timeLabelFor(at, now),
      label,
      title: clip(event.title, 48),
      status: "",
      action: "open-event",
      target: event.id
    }];
  });
  let rows = [...sessions, ...events];
  const nyClose = sessions.find((row) => row.target === "nyse" && row.title.endsWith("zu"));
  const evening = (nyClose && now.getTime() >= nyClose.at) || (isWeekend(today) && berlinHour(now) >= 18);
  if (evening) rows = rows.concat(venueMarkers(nextTradingDay(today), now, { earlyOnly: true }));
  if (!rows.length) {
    return [{
      id: "markets-closed",
      at: now.getTime(),
      timeLabel: "—",
      label: "Börse",
      title: "Wochenende",
      status: "zu",
      action: "open-session",
      target: "weekend"
    }];
  }
  return rows.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title, "de"));
}

export function buildFeed(data, now = new Date(), limit = 12) {
  const nowMs = now.getTime();
  const items = [];
  const posts = [...(data?.posts?.posts || [])]
    .filter((post) => post?.postedAt)
    .sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)))
    .slice(0, 3);
  for (const post of posts) {
    const at = new Date(post.postedAt);
    if (Number.isNaN(at.getTime())) continue;
    if (nowMs - at.getTime() > 5 * 86400000) continue;
    items.push({
      id: `post-${post.id}`,
      kind: "post",
      label: "Post",
      title: clip(post.summaryDe || post.displayName || post.account),
      at: at.getTime(),
      withClock: true,
      action: "open-post",
      target: post.id
    });
  }

  const seenAlert = new Set();
  const alerts = [...(data?.alerts?.alerts || [])]
    .filter((alert) => alert && Math.abs(Number(alert.changePct)) >= 2 && alert.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  for (const alert of alerts) {
    if (seenAlert.has(alert.symbol)) continue;
    const at = new Date(alert.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    if (nowMs - at.getTime() > 3 * 86400000) continue;
    seenAlert.add(alert.symbol);
    const price = alert.priceEur == null ? "" : ` auf ${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(alert.priceEur)}`;
    const pct = new Intl.NumberFormat("de-DE", { signDisplay: "exceptZero", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(alert.changePct));
    items.push({
      id: `alert-${alert.id}`,
      kind: "alert",
      label: "Kurs",
      title: clip(`${alert.symbol} ${pct} %${price}`),
      at: at.getTime(),
      withClock: true,
      action: "open-alerts",
      target: ""
    });
    if (seenAlert.size >= 3) break;
  }

  const briefing = data?.briefing;
  if (briefing?.date && Array.isArray(briefing.bullets)) {
    const at = zonedWallTime(briefing.date, "07:00", "Europe/Berlin");
    if (at && Math.abs(nowMs - at.getTime()) < 2 * 86400000) {
      briefing.bullets.slice(0, 3).forEach((bullet, index) => {
        items.push({
          id: `brief-${briefing.date}-${index}`,
          kind: "briefing",
          label: "Briefing",
          title: clip(bullet),
          at: at.getTime(),
          tie: index,
          withClock: true,
          action: "open-briefing",
          target: ""
        });
      });
    }
  }

  const horizon = 7 * 86400000;
  const recent = 36 * 3600000;
  const events = (data?.calendar?.events || [])
    .map((event) => ({ event, at: eventInstant(event) }))
    .filter((item) => item.at && item.at.getTime() >= nowMs - recent && item.at.getTime() <= nowMs + horizon)
    .sort((a, b) => a.at - b.at)
    .slice(0, 4);
  for (const { event, at } of events) {
    items.push({
      id: `event-${event.id}`,
      kind: "event",
      label: "Termin",
      title: clip(event.title),
      at: at.getTime(),
      withClock: Boolean(event.time),
      action: "open-event",
      target: event.id
    });
  }

  const past = items.filter((item) => item.at <= nowMs).sort((a, b) => b.at - a.at || (a.tie || 0) - (b.tie || 0));
  const future = items.filter((item) => item.at > nowMs).sort((a, b) => a.at - b.at).slice(0, 3);
  const room = Math.max(limit - future.length, 0);
  return [...past.slice(0, room), ...future].map((item) => ({
    ...item,
    timeLabel: formatFeedTime(item.at, now, { withClock: item.withClock })
  }));
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Gute Nacht";
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  if (hour < 22) return "Guten Abend";
  return "Gute Nacht";
}

export function berlinDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"} ${clock}`;
  return clock;
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

const STORE_KEY = "jgtr-v1";

export function loadStore() {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveStore(store) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

const RANGE_KEY = {
  Tag: "intraday",
  "1 Min": "intraday",
  "5 Min": "intraday",
  "1M": "1M",
  "6M": "6M",
  "1J": "1Y",
  "5J": "5Y"
};

/** Last print of each N-minute bucket. One-minute series stays as it is. */
export function bucketMinutes(points, minutes = 5) {
  const list = (points || []).filter((point) => point && point.eur != null && point.t);
  if (!minutes || minutes <= 1 || list.length < 2) return list;
  const size = minutes * 60 * 1000;
  const buckets = new Map();
  for (const point of list) {
    const time = Date.parse(point.t);
    if (!Number.isFinite(time)) continue;
    buckets.set(Math.floor(time / size), point);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
}

/** Evenly spaced points so a spark still shows the whole session. */
export function sparkSample(points, count = 32) {
  const list = (points || []).filter((point) => point && point.eur != null);
  if (list.length <= count) return list;
  const last = count - 1;
  const sampled = [];
  for (let index = 0; index < count; index += 1) {
    sampled.push(list[Math.round((index * (list.length - 1)) / last)]);
  }
  return sampled;
}

/** Longest history: weekly first, then daily series overwrite the same day. */
export function maxPoints(history) {
  const byDay = new Map();
  for (const key of ["5Y", "1Y", "6M", "1M"]) {
    for (const point of history?.[key] || []) {
      if (!point || point.eur == null || !point.t) continue;
      byDay.set(String(point.t).slice(0, 10), point);
    }
  }
  return [...byDay.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

/** Last close of each ISO week. The Langfrist-Brille draws this, not the noisy day. */
export function weeklyCloses(points) {
  const buckets = new Map();
  for (const point of points || []) {
    if (!point || point.eur == null || !point.t) continue;
    const date = new Date(point.t);
    if (Number.isNaN(date.getTime())) continue;
    buckets.set(isoWeekKey(date), point);
  }
  return [...buckets.values()];
}

function isoWeekKey(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((copy - yearStart) / 86400000 + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function movingAverage(points, window = 4) {
  return (points || []).map((point, index) => {
    const slice = points.slice(Math.max(0, index - window + 1), index + 1);
    const avg = slice.reduce((sum, item) => sum + Number(item.eur), 0) / slice.length;
    return { t: point.t, eur: avg };
  });
}

const DAY_RANGES = new Set(["Tag", "1 Min", "5 Min", "15 Min", "4 Std", "1T", "3T", "1W", "1M"]);

/** 4h closes only when the stored series covers more than one session. */
export function fourHourPoints(history) {
  const rows = (history?.["4H"] || []).filter((point) => point && point.eur != null && point.t);
  if (rows.length < 2) return [];
  const span = Date.parse(rows.at(-1).t) - Date.parse(rows[0].t);
  if (!Number.isFinite(span) || span <= 36 * 3600 * 1000) return [];
  return rows.map((point) => ({ t: point.t, eur: Number(point.eur), session: point.session || null }));
}

function recentDaily(ticker) {
  const month = (ticker?.history?.["1M"] || []).filter((point) => point && point.eur != null && point.t);
  if (month.length >= 3) return month;
  return (ticker?.history?.["6M"] || []).filter((point) => point && point.eur != null && point.t);
}

const FIVE_MS = 5 * 60 * 1000;

function newYorkDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function asPricePoint(point) {
  const time = Date.parse(point?.t);
  const eur = Number(point?.eur ?? point?.close);
  if (!Number.isFinite(time) || !Number.isFinite(eur)) return null;
  const row = { t: point.t, eur };
  if (point.session) row.session = point.session;
  for (const key of ["open", "high", "low"]) {
    const value = Number(point[key]);
    if (Number.isFinite(value)) row[key] = value;
  }
  return row;
}

/** Stored 5-minute bars, with today's 1-minute prints replacing the overlapping tail. */
export function minuteSource(ticker) {
  const intraday = [];
  for (const point of ticker?.history?.intraday || []) {
    const row = asPricePoint(point);
    if (row) intraday.push(row);
  }
  const stored = [];
  for (const point of ticker?.history?.["5m"] || []) {
    const row = asPricePoint(point);
    if (row) stored.push(row);
  }
  if (stored.length < 2) return { points: intraday, extended: false };
  let liveStart = Infinity;
  for (const point of intraday) liveStart = Math.min(liveStart, Date.parse(point.t));
  const cutoff = Number.isFinite(liveStart) ? liveStart - FIVE_MS : Infinity;
  const older = stored.filter((point) => Date.parse(point.t) < cutoff);
  const points = older.concat(intraday).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return { points, extended: true };
}

/** Last N New York dates in the series. Does not invent bars for missing sessions. */
export function limitTradingSessions(points, sessions) {
  const list = (points || []).filter((point) => point && point.t && Number.isFinite(Date.parse(point.t)));
  const count = Number(sessions);
  if (!Number.isFinite(count) || count < 1) return list;
  const ordered = list.length > 1 ? [...list].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)) : list;
  const keys = [];
  const seen = new Set();
  for (const point of ordered) {
    const key = newYorkDay(point.t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  if (keys.length <= count) return ordered;
  const keep = new Set(keys.slice(-count));
  return ordered.filter((point) => keep.has(newYorkDay(point.t)));
}

/** Phone charts stay readable: about 60–80 bars, each a few pixels wide. */
export const VISIBLE_BARS = 68;
const SIX_HOURS = 6 * 60 * 60 * 1000;

/** 5 Min is the latest session. 15 Min is the last two. */
export function minuteWindow(minutes) {
  return Number(minutes) >= 15 ? 2 : 1;
}

/**
 * Drop older bars from the left.
 * `maxSpanMs` keeps the tail of a long session (5 Min: last six hours).
 */
export function trimVisibleBars(points, { max = VISIBLE_BARS, maxSpanMs = 0 } = {}) {
  let list = (points || []).filter((point) => point && point.t && Number.isFinite(Date.parse(point.t)));
  if (maxSpanMs > 0 && list.length) {
    const end = Date.parse(list.at(-1).t);
    const cut = list.filter((point) => Date.parse(point.t) >= end - maxSpanMs);
    if (cut.length >= 2) list = cut;
  }
  if (max > 0 && list.length > max) list = list.slice(-max);
  return list;
}

const GUIDE = {
  support: { color: "#5dbebf", label: "Unterstützung", dash: [3, 3] },
  resistance: { color: "#e7a29a", label: "Widerstand", dash: [3, 3] },
  trend: { color: "#b4b6f2", label: "Trend", dash: [4, 3] },
  pattern: { color: "rgba(232, 234, 240, 0.55)", label: "Muster", dash: [3, 3] }
};

export function guideStyle(kind) {
  return GUIDE[kind] || null;
}

/** When two captions sit on the same height, the one closer to the price stays. */
export function guideLabelsToDraw(labels, priceY, gap = 14) {
  const sorted = [...(labels || [])].sort((a, b) => Math.abs(a.y - priceY) - Math.abs(b.y - priceY));
  const kept = [];
  for (const label of sorted) {
    if (kept.some((other) => Math.abs(other.y - label.y) < gap)) continue;
    kept.push(label);
  }
  return kept;
}

function berlinAxisParts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
}

function berlinDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/**
 * Four axis captions. Intraday uses Berlin HH:MM, and a short date only when the day changes.
 * The same caption is never repeated.
 */
export function chartAxisLabels(points) {
  const list = (points || []).filter((point) => point && point.t);
  const count = list.length;
  if (!count) return [];
  const sub = seriesIsSubDaily(list);
  const indexes = [];
  const seen = new Set();
  for (const ratio of [0, 0.33, 0.66, 1]) {
    const index = Math.round(ratio * (count - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    indexes.push(index);
  }
  const span = Math.abs(Date.parse(list.at(-1).t) - Date.parse(list[0].t)) || 0;
  let previousDay = "";
  const labels = [];
  for (const index of indexes) {
    const iso = list[index].t;
    const parts = berlinAxisParts(iso);
    if (!parts) continue;
    const day = berlinDayKey(iso);
    const freshDay = !previousDay || day !== previousDay;
    let text;
    if (sub) {
      const weekday = String(parts.weekday || "").replace(/\.$/, "");
      text = freshDay ? `${weekday} ${parts.day}.${parts.month}.` : `${parts.hour}:${parts.minute}`;
    } else if (span < 400 * 86400000) {
      text = new Date(iso).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "numeric",
        month: "short"
      });
    } else {
      text = new Date(iso).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        month: "short",
        year: "2-digit"
      });
    }
    previousDay = day || previousDay;
    if (!text || (labels.length && labels.at(-1).text === text)) continue;
    labels.push({ index, text });
  }
  return labels;
}

function storedFiveCount(ticker) {
  return (ticker?.history?.["5m"] || []).filter((point) => point && point.eur != null && point.t).length;
}

/**
 * Last N New York sessions of stored 5-minute bars merged with today's 1-minute prints.
 * One session can be today's intraday alone. More than one session needs history["5m"].
 * Returns null when that series is not there, so the caller can keep daily closes.
 */
export function sessionMinutePack(ticker, sessions) {
  const count = Number(sessions);
  if (!Number.isFinite(count) || count < 1) return null;
  if (count > 1 && storedFiveCount(ticker) < 2) return null;
  const { points, extended } = minuteSource(ticker);
  if (points.length < 2) return null;
  const visible = limitTradingSessions(points, count);
  if (visible.length < 2) return null;
  return {
    points: visible,
    history: extended ? points : visible,
    extended
  };
}

function fiveMinuteCloses(points) {
  const bars = bucketMinutes(points, 5);
  return bars.length >= 2 ? bars : null;
}

export function rangeMinutePoints(ticker, minutes, windowed = false) {
  const { points, extended } = minuteSource(ticker);
  const bars = bucketMinutes(points, minutes);
  if (!windowed) return bars;
  const limited = extended ? limitTradingSessions(bars, minuteWindow(minutes)) : bars;
  const span = Number(minutes) <= 5 ? SIX_HOURS : 0;
  return trimVisibleBars(limited, { max: VISIBLE_BARS, maxSpanMs: span });
}

export function seriesFor(ticker, range, langfrist = false) {
  const asked = range === "Tag" ? "1 Min" : range;
  const jump = DAY_RANGES.has(range) || DAY_RANGES.has(asked);
  const effective = langfrist && jump ? "1J" : asked;
  let points;
  if (effective === "Max") {
    points = maxPoints(ticker?.history);
  } else if (effective === "5 Min") {
    points = rangeMinutePoints(ticker, 5, true);
  } else if (effective === "15 Min") {
    points = rangeMinutePoints(ticker, 15, true);
  } else if (effective === "4 Std") {
    points = fourHourPoints(ticker?.history);
  } else if (effective === "1 Min") {
    points = (ticker?.history?.intraday || []).filter((point) => point && point.eur != null);
  } else if (effective === "1T") {
    const pack = sessionMinutePack(ticker, 1);
    const bars = pack && fiveMinuteCloses(pack.points);
    points = bars
      ? trimVisibleBars(bars, { max: VISIBLE_BARS, maxSpanMs: SIX_HOURS })
      : recentDaily(ticker).slice(-1);
  } else if (effective === "3T") {
    const pack = sessionMinutePack(ticker, 3);
    const bars = pack && fiveMinuteCloses(pack.points);
    points = bars ? trimVisibleBars(bars, { max: VISIBLE_BARS }) : recentDaily(ticker).slice(-3);
  } else if (effective === "1W") {
    points = recentDaily(ticker).slice(-7);
  } else {
    const key = RANGE_KEY[effective] || "1M";
    points = (ticker?.history?.[key] || []).filter((point) => point && point.eur != null);
  }
  if (langfrist) {
    points = movingAverage(weeklyCloses(points), effective === "5J" || effective === "Max" ? 4 : 3);
  }
  return { points, range: effective };
}

export function rangeChange(points) {
  if (!points || points.length < 2) return null;
  const first = Number(points[0].eur);
  const last = Number(points[points.length - 1].eur);
  if (!first) return null;
  return ((last - first) / first) * 100;
}

export function bigDrop(data, now = new Date()) {
  const today = berlinDate(now);
  const tickers = (data?.prices?.tickers || []).filter(
    (ticker) => ticker.example !== true && typeof ticker.changePct === "number" && ticker.changePct <= -2
  );
  const alerts = (data?.alerts?.alerts || []).filter((alert) => {
    if (alert.example === true || alert.direction !== "down") return false;
    if (typeof alert.changePct !== "number" || alert.changePct > -2) return false;
    const day = String(alert.timestamp || "").slice(0, 10);
    return day === today || String(alert.id || "").endsWith(today);
  });
  return { active: tickers.length > 0 || alerts.length > 0, tickers, alerts };
}

export function questionsOf(file) {
  const items = [];
  if (file?.current) items.push(file.current);
  for (const item of file?.history || []) items.push(item);
  return items;
}

/** Score only questions both sides answered and that already have an outcome. */
export function scoreboard(file, store) {
  let justy = 0;
  let karl = 0;
  let decided = 0;
  for (const question of questionsOf(file)) {
    if (!question?.outcome || !question.karlAnswer) continue;
    const mine = store?.answers?.[question.id]?.answer;
    if (!mine) continue;
    decided += 1;
    if (mine === question.outcome) justy += 1;
    if (question.karlAnswer === question.outcome) karl += 1;
  }
  return { justy, karl, decided };
}

/**
 * Open Tagesfrage until this phone has answered Ja or Nein.
 * The question id decides, not the morning: an answered question stays hidden
 * if it is still current the next day. A new id shows again.
 * A question that already has an outcome is no longer a wager.
 */
export function pendingDailyQuestion(data, store) {
  const question = data?.daily_question?.current;
  if (!question?.id || !String(question.question || "").trim()) return null;
  if (question.outcome === "ja" || question.outcome === "nein") return null;
  const answer = store?.answers?.[question.id]?.answer;
  if (answer === "ja" || answer === "nein") return null;
  return question;
}

const TAB_IDS = ["heute", "kalender", "posts", "schwarm", "charts", "mehr"];

function uniqSorted(list) {
  return [...new Set(list.filter(Boolean))].sort();
}

function heuteSignals(data, store) {
  const question = pendingDailyQuestion(data, store);
  return question ? [`frage\u001f${question.id}`] : [];
}

/** Row the calendar list actually shows. The long note is not a new item. */
function calendarSignals(data) {
  return uniqSorted((data?.calendar?.events || []).map((event) => {
    if (!event?.id) return "";
    return [
      "termin",
      event.id,
      event.date || "",
      event.time || "",
      event.probabilityPct ?? "",
      event.title || ""
    ].join("\u001f");
  }));
}

function postSignals(data) {
  return uniqSorted((data?.posts?.posts || []).map((post) => (post?.id ? `post\u001f${post.id}` : "")));
}

function schwarmSignals(data) {
  const favorites = data?.favorites?.favorites || [];
  const picks = favorites.length ? favorites : (data?.crowd?.comparison?.picks || []);
  const voices = picks.map((item) => {
    const id = item?.id || item?.symbol;
    if (!id) return "";
    return [
      "stimme",
      id,
      item.score ?? item.karlScore ?? "",
      item.vsSwarm || "",
      item.swarmStance || "",
      item.karlStance || "",
      item.karlTake || ""
    ].join("\u001f");
  });
  const investors = (data?.crowd?.investors || []).map((investor) => {
    if (!investor?.id) return "";
    const ticks = (investor.tickers || [])
      .map((ticker) => [ticker.symbol || "", ticker.mentions ?? "", ticker.stance || ""].join(":"))
      .join(",");
    return ["investor", investor.id, investor.hitRatePct ?? "", ticks].join("\u001f");
  });
  const comparison = data?.crowd?.comparison || {};
  const summary = comparison.summary
    ? ["text", comparison.summary, comparison.swarmHitRatePct ?? "", comparison.karlHitRatePct ?? ""].join("\u001f")
    : "";
  return uniqSorted([...voices, ...investors, summary]);
}

/** Moonshot-Kandidaten. Der Kurs zählt nicht: der ändert sich jeden Handelstag. */
function mehrSignals(data) {
  return uniqSorted((data?.moonshots?.candidates || []).map((item) => {
    if (!item?.id) return "";
    return [
      "moonshot",
      item.id,
      item.catalyst?.date || "",
      item.catalyst?.label || "",
      (item.for || []).join("|"),
      (item.against || []).join("|")
    ].join("\u001f");
  }));
}

/**
 * What can light a tab dot. Charts stay empty: a moving price is not new content.
 * Mehr lights when a Moonshot text or its date is new.
 */
export function tabSignals(data, store) {
  return {
    heute: heuteSignals(data, store),
    kalender: calendarSignals(data),
    posts: postSignals(data),
    schwarm: schwarmSignals(data),
    charts: [],
    mehr: mehrSignals(data)
  };
}

/** Signals in the tab that were not stored the last time it was opened. */
export function unreadTabs(data, store) {
  const signals = tabSignals(data, store);
  const seen = store?.seen && typeof store.seen === "object" ? store.seen : {};
  const unread = {};
  for (const tab of TAB_IDS) {
    const known = new Set(Array.isArray(seen[tab]) ? seen[tab] : []);
    unread[tab] = (signals[tab] || []).filter((item) => !known.has(item));
  }
  return unread;
}

/** Remember the tab's current items. Returns true when the stored list changed. */
export function markTabSeen(store, data, tab) {
  const items = tabSignals(data, store)[tab];
  if (!items || !store || typeof store !== "object") return false;
  if (!store.seen || typeof store.seen !== "object") store.seen = {};
  const prev = store.seen[tab];
  if (Array.isArray(prev) && prev.length === items.length && prev.every((item, index) => item === items[index])) return false;
  store.seen[tab] = items.slice();
  return true;
}

export function trackSummary(picks) {
  const list = picks || [];
  const hits = list.filter((pick) => pick.result === "treffer").length;
  const misses = list.filter((pick) => pick.result === "daneben").length;
  const open = list.filter((pick) => pick.result === "offen").length;
  const decided = hits + misses;
  return {
    hits,
    misses,
    open,
    hitRatePct: decided ? Math.round((hits / decided) * 100) : null
  };
}

export function upcomingEvents(events, now = new Date(), count = 3) {
  const sorted = [...(events || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)) || impactRank(b) - impactRank(a));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const future = sorted.filter((event) => {
    const date = parseDay(event.date);
    return date && date.getTime() >= today;
  });
  return (future.length ? future : sorted).slice(0, count);
}

const IMPACT = { hoch: 3, mittel: 2, niedrig: 1 };

function impactRank(event) {
  return IMPACT[event?.impact] || 0;
}

/** Soonest upcoming event. Same day: higher impact first. */
export function headlineEvent(events, now = new Date()) {
  return upcomingEvents(events, now, 1)[0] || null;
}

export function isInAppUrl(url, origin = location.origin, base = "") {
  if (!url || url.origin !== origin) return false;
  const path = url.pathname.replace(/\/$/, "");
  const root = String(base || "").replace(/\/$/, "");
  return path === root || path === `${root}/index.html`;
}

export function methodLabel(ticker) {
  if (ticker?.example || ticker?.eurMethod === "example") return "Beispielkurs";
  if (ticker?.intradayMethod === "direct_eur_plus_us" && ticker?.eurVenue) {
    return `${ticker.eurVenue} · danach Nasdaq`;
  }
  if (ticker?.eurMethod === "direct_eur") {
    return ticker.eurVenue ? `${ticker.eurVenue} · Euro` : "Euro-Kurs";
  }
  if (ticker?.eurMethod === "usd_div_eurusd") return "in Euro gerechnet";
  return ticker?.venue || "";
}

export const OVERNIGHT_LABEL = {
  nachhandel: "Nachhandel",
  vorboerse: "Vorbörse",
  us: "US-Handel"
};

/** Same words the Schwarm/Karl chips show. The badge must use this, not againstCrowd. */
export function compactStances(item) {
  return {
    swarm: opinionWord(item?.swarmStance),
    karl: opinionWord(item?.karlStance)
  };
}

export function opinionWord(value) {
  switch (String(value || "")) {
    case "kauf": return "optimistisch";
    case "halten": return "neutral";
    case "vorsichtig":
    case "verkauf": return "vorsichtig";
    case "kaum": return "redet kaum darüber";
    case "beobachten": return "keine klare Meinung";
    default: return value || "offen";
  }
}

/**
 * Badge from the two chip labels.
 * Einig only when both chips say the same thing.
 * Karl dagegen only when one side is optimistisch and the other vorsichtig.
 * Anything else, including neutral next to a different chip, is Nicht gleich.
 */
export function verdictForStances(swarmStance, karlStance) {
  const swarm = opinionWord(swarmStance);
  const karl = opinionWord(karlStance);
  if (swarm === karl) return { label: "Einig", kind: "agree" };
  const opposed = (swarm === "optimistisch" && karl === "vorsichtig")
    || (swarm === "vorsichtig" && karl === "optimistisch");
  if (opposed) return { label: "Karl dagegen", kind: "against" };
  return { label: "Nicht gleich", kind: "mixed" };
}

/**
 * Headline on Schwarm gegen Karl.
 * Explicit `vsSwarm` wins. Otherwise heat: vorsichtig < kaum < halten < kauf.
 * Karl warmer than the swarm → zuversichtlicher, otherwise skeptischer.
 * Equal heat stays skeptischer so the page does not fall back to "neutral".
 */
const SWARM_HEAT = {
  verkauf: 0,
  vorsichtig: 0,
  kaum: 1,
  beobachten: 1,
  halten: 2,
  kauf: 3
};

export function vsSwarmVerdict(item) {
  const raw = String(item?.vsSwarm || "");
  const key = raw === "zuversichtlicher" || raw === "skeptischer" ? raw : inferVsSwarm(item);
  if (key === "zuversichtlicher") {
    return { key, label: "Karl zuversichtlicher", kind: "warm" };
  }
  return { key: "skeptischer", label: "Karl skeptischer", kind: "cool" };
}

function inferVsSwarm(item) {
  const karl = SWARM_HEAT[String(item?.karlStance || "")] ?? 2;
  const swarm = SWARM_HEAT[String(item?.swarmStance || "")] ?? 2;
  return karl > swarm ? "zuversichtlicher" : "skeptischer";
}

const KARL_HEDGE = /keine\s+prognose|\bunklar\b|\bvielleicht\b|\babwarten\b|\bmal sehen\b|\bkommt darauf an\b|\beher\b/i;
const KARL_TIP = /\b(kaufen|verkaufen|kaufe|verkaufe)\b/i;

/** Flags hedge words and buy/sell tips in Karl's comparison lines. */
export function karlVoiceIssues(text) {
  const value = String(text || "");
  const issues = [];
  if (KARL_HEDGE.test(value)) issues.push("weich");
  if (KARL_TIP.test(value)) issues.push("tipp");
  return issues;
}

const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function zonedClock(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday]
  };
}

/**
 * Poll while a new snapshot can exist: Berlin weekday 05:00–22:15,
 * or the US pre/regular/post session plus the same 30-minute buffer as the workflow.
 * Weekend slots do not keep the chart polling through a closed market.
 */
export function marketWatch(date = new Date()) {
  const berlin = zonedClock(date, "Europe/Berlin");
  if (berlin.weekday >= 0 && berlin.weekday <= 4) {
    const minutes = berlin.hour * 60 + berlin.minute;
    if (minutes >= 5 * 60 && minutes <= 22 * 60 + 15) return true;
  }
  const ny = zonedClock(date, "America/New_York");
  if (ny.weekday == null || ny.weekday > 4) return false;
  const minutes = ny.hour * 60 + ny.minute;
  return minutes >= 4 * 60 && minutes <= 20 * 60 + 30;
}

export function freshPrices(meta, now = Date.now()) {
  if (!meta?.pricesUpdated) return false;
  const then = new Date(meta.pricesUpdated).getTime();
  if (Number.isNaN(then)) return false;
  return now - then < 30 * 60 * 1000;
}
