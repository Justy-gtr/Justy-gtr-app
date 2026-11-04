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

export function seriesFor(ticker, range, langfrist) {
  const effective = langfrist && (range === "Tag" || range === "1M") ? "1J" : range;
  const key = RANGE_KEY[effective] || "1M";
  let points = (ticker?.history?.[key] || []).filter((point) => point && point.eur != null);
  if (langfrist) {
    points = movingAverage(weeklyCloses(points), effective === "5J" ? 4 : 3);
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
  const sorted = [...(events || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const future = sorted.filter((event) => {
    const date = parseDay(event.date);
    return date && date.getTime() >= today;
  });
  return (future.length ? future : sorted).slice(0, count);
}

export function methodLabel(ticker) {
  if (ticker?.example || ticker?.eurMethod === "example") return "Beispielkurs";
  if (ticker?.eurMethod === "direct_eur") {
    return ticker.eurVenue ? `${ticker.eurVenue} · Euro` : "Euro-Kurs";
  }
  if (ticker?.eurMethod === "usd_div_eurusd") return "Nasdaq · Dollar in Euro";
  return ticker?.venue || "";
}

export function freshPrices(meta, now = Date.now()) {
  if (!meta?.pricesUpdated) return false;
  const then = new Date(meta.pricesUpdated).getTime();
  if (Number.isNaN(then)) return false;
  return now - then < 30 * 60 * 1000;
}
