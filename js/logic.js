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

const RANGE_KEY = {
  Tag: "intraday",
  "1M": "1M",
  "6M": "6M",
  "1J": "1Y",
  "5J": "5Y"
};

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

export function seriesFor(ticker, range, langfrist) {
  const effective = langfrist && (range === "Tag" || range === "1M") ? "1J" : range;
  let points;
  if (effective === "Max") {
    points = maxPoints(ticker?.history);
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

export function freshPrices(meta, now = Date.now()) {
  if (!meta?.pricesUpdated) return false;
  const then = new Date(meta.pricesUpdated).getTime();
  if (Number.isNaN(then)) return false;
  return now - then < 30 * 60 * 1000;
}
