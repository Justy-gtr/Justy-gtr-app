import { berlinDate, calendarList, calendarStart, formatEUR, formatPct, orderCalendarEvents } from "./logic.js";
import { berlinClock, hourMove } from "./seasonality.js";
import { lampState } from "./sentiment.js";

export const NEWS_CHIPS = ["alle", "SPCX", "TSLA", "RKLB", "MRVL", "NVDA", "Markt"];
const STOCKS = new Set(["SPCX", "TSLA", "RKLB", "MRVL", "NVDA"]);

export function headlineOf(text, max = 110) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentence = clean.split(/(?<=[.!?])\s/)[0] || clean;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

function stamp(value) {
  const at = Date.parse(value || "");
  return Number.isFinite(at) ? at : 0;
}

function symbolsOf(list) {
  return [...new Set((list || []).filter((symbol) => STOCKS.has(symbol)))];
}

function sourceOf(sources) {
  const source = (sources || []).find((item) => item && (item.title || item.url));
  return {
    source: source?.title || "",
    href: typeof source?.url === "string" ? source.url : ""
  };
}

export function buildNews(data) {
  const items = [];
  for (const post of data?.posts?.posts || []) {
    if (!post) continue;
    const symbols = symbolsOf(post.tickers);
    const link = sourceOf(post.sources);
    const href = post.url || link.href;
    const body = String(post.summaryDe || "").trim();
    items.push({
      id: `post:${post.id || items.length}`,
      at: stamp(post.postedAt),
      symbols,
      market: symbols.length === 0,
      importance: post.importance === "wichtig" ? "wichtig" : "normal",
      headline: headlineOf(body) || post.displayName || post.account || "Beitrag",
      body,
      source: post.displayName || post.account || link.source || "Beitrag",
      href
    });
  }
  for (const alert of data?.alerts?.alerts || []) {
    if (!alert) continue;
    const symbols = symbolsOf([alert.symbol]);
    const link = sourceOf(alert.sources);
    const pct = formatPct(alert.changePct);
    items.push({
      id: `alert:${alert.id || alert.timestamp || items.length}`,
      at: stamp(alert.timestamp),
      symbols,
      market: symbols.length === 0,
      importance: "wichtig",
      headline: `${alert.symbol || "Kurs"} ${pct}`,
      body: [alert.name, alert.priceEur != null ? `Kurs ${formatEUR(alert.priceEur)}` : ""].filter(Boolean).join(", "),
      source: link.source || "Meldung",
      href: link.href
    });
  }
  const briefing = data?.briefing;
  if (briefing && (briefing.summary || (briefing.bullets || []).length)) {
    const link = sourceOf(briefing.sources);
    const body = String(briefing.summary || (briefing.bullets || []).join(" ")).trim();
    items.push({
      id: `briefing:${briefing.date || "tag"}`,
      at: stamp(briefing.date ? `${briefing.date}T06:30:00+01:00` : ""),
      symbols: [],
      market: true,
      importance: "normal",
      headline: headlineOf(briefing.title || "Morgen-Briefing") || "Morgen-Briefing",
      body,
      source: link.source || "Morgen-Briefing",
      href: link.href
    });
  }
  const weekly = data?.weekly;
  if (weekly && (weekly.lede || weekly.summary || weekly.title)) {
    const link = sourceOf(weekly.sources);
    const day = weekly.sessions?.end || weekly.weekOf;
    items.push({
      id: `weekly:${weekly.weekOf || "woche"}`,
      at: stamp(day ? `${day}T18:00:00+01:00` : weekly.updatedAt),
      symbols: [],
      market: true,
      importance: "normal",
      headline: headlineOf(weekly.title || weekly.lede) || "Wochenrückblick",
      body: String(weekly.lede || weekly.summary || "").trim(),
      source: link.source || "Wochenrückblick",
      href: link.href
    });
  }
  items.sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)));
  return items;
}

export function filterNews(items, filter) {
  const key = NEWS_CHIPS.includes(filter) ? filter : "alle";
  if (key === "alle") return items || [];
  if (key === "Markt") return (items || []).filter((item) => item.market);
  return (items || []).filter((item) => (item.symbols || []).includes(key));
}

export const AGENDA_SYMBOLS = ["SPCX", "TSLA", "RKLB", "MRVL", "NVDA"];

function fundRows(data) {
  const symbols = data?.fundamentals?.symbols;
  if (Array.isArray(symbols)) return symbols;
  if (symbols && typeof symbols === "object") return Object.values(symbols);
  return [];
}

function weekdayDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function meanOf(values) {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/**
 * Last five weekday prints of the current Berlin hour.
 * Share of rising hours, plus the average rise and the average drop.
 */
export function hourWeek(ticker, now = new Date()) {
  const clock = berlinClock(now);
  if (!clock) return { hour: null, n: 0, up: 0, down: 0, share: null, avgUp: null, avgDown: null };
  const moves = [];
  const seen = new Set();
  const points = [...(ticker?.history?.["1H"] || [])].reverse();
  for (const point of points) {
    const at = berlinClock(point?.t);
    if (!at || at.hour !== clock.hour) continue;
    const day = weekdayDate(at.date);
    if (day === 0 || day === 6 || seen.has(at.date)) continue;
    const move = hourMove({ open: point.open, close: point.eur ?? point.close, eur: point.eur });
    if (move == null) continue;
    seen.add(at.date);
    moves.push(move);
    if (moves.length === 5) break;
  }
  const upMoves = moves.filter((value) => value > 0);
  const downMoves = moves.filter((value) => value < 0);
  const n = moves.length;
  return {
    hour: clock.hour,
    n,
    up: upMoves.length,
    down: downMoves.length,
    share: n ? Math.round((upMoves.length / n) * 100) : null,
    avgUp: meanOf(upMoves),
    avgDown: meanOf(downMoves)
  };
}

const LIGHT = {
  gut: { color: "#22c55e", word: "positiv" },
  gemischt: { color: "#f59e0b", word: "gemischt" },
  schlecht: { color: "#ef4444", word: "negativ" }
};

/** X mood from sentiment.json. News-site score only when X has no tone. */
export function sentimentLight(data, symbol) {
  const mood = lampState(data?.sentiment?.symbols?.[symbol], new Date()).mood;
  if (LIGHT[mood]) return LIGHT[mood];
  const score = Number(data?.posts?.sentiment?.[symbol]?.score);
  if (!Number.isFinite(score)) return { color: "#6b7280", word: "ohne Stimmung" };
  if (score >= 0.15) return LIGHT.gut;
  if (score <= -0.15) return LIGHT.schlecht;
  return LIGHT.gemischt;
}

export function hourShareStyle(share) {
  if (!Number.isFinite(share)) return "";
  const dist = Math.min(1, Math.abs(share - 50) / 50);
  const alpha = Math.round((0.35 + dist * 0.5) * 100) / 100;
  const rgb = share >= 50 ? "125, 222, 192" : "255, 139, 152";
  return `background:rgba(${rgb},${alpha})`;
}

/** Timed events that start within the next few hours. */
export function eventsWithin(data, now = new Date(), hours = 3) {
  const from = now.getTime();
  const until = from + hours * 60 * 60 * 1000;
  return calendarList(data?.calendar?.events || [], now).filter((event) => {
    if (!event?.time) return false;
    const at = calendarStart(event)?.getTime();
    return Number.isFinite(at) && at >= from && at <= until;
  });
}

/** Soonest events that have not started. */
export function nextUpcoming(data, now = new Date(), limit = 4) {
  const from = now.getTime();
  return calendarList(data?.calendar?.events || [], now).filter((event) => {
    const at = calendarStart(event)?.getTime();
    return Number.isFinite(at) && at >= from;
  }).slice(0, limit);
}

/** Next one to three announcements for one stock. Nothing that ended more than 24 hours ago. */
export function stockAgenda(data, symbol, now = new Date(), limit = 3) {
  const rows = calendarList(data?.calendar?.events || [], now)
    .filter((event) => (event?.tickers || []).includes(symbol));
  const fund = fundRows(data).find((item) => item?.symbol === symbol);
  const today = berlinDate(now);
  const known = new Set(rows.map((event) => `${event.date}|${(event.tickers || []).join(",")}`));
  const add = (date, title) => {
    if (!date || date < today || known.has(`${date}|${symbol}`)) return;
    rows.push({
      id: `fund-${symbol}-${date}-${title}`,
      date,
      time: null,
      timezone: "Europe/Berlin",
      title,
      tickers: [symbol]
    });
  };
  if (fund) {
    add(fund.earningsDate, `${symbol} legt Zahlen vor.`);
    add(fund.dividendDate, `${symbol} schüttet eine Dividende aus.`);
  }
  rows.sort((a, b) => {
    const left = calendarStart(a)?.getTime() || 0;
    const right = calendarStart(b)?.getTime() || 0;
    return left - right;
  });
  return rows.slice(0, limit);
}

function fewWords(text, max = 5) {
  return String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, max).join(" ");
}

export function glancePoints(data, now = new Date()) {
  const lines = [];
  const movers = [...(data?.prices?.tickers || [])]
    .filter((ticker) => ticker?.symbol && Number.isFinite(Number(ticker.changePct)))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  if (movers[0]) lines.push(`${movers[0].symbol} ${formatPct(movers[0].changePct)}`);
  const next = orderCalendarEvents(data?.calendar?.events || [], now)[0];
  if (next?.title) lines.push(fewWords(next.title, 4));
  if (movers[1]) lines.push(`${movers[1].symbol} ${formatPct(movers[1].changePct)}`);
  else {
    const bullet = (data?.briefing?.bullets || []).find((item) => String(item || "").trim());
    if (bullet) lines.push(fewWords(bullet, 4));
    else if (data?.briefing?.title) lines.push(fewWords(data.briefing.title, 4));
  }
  return lines.slice(0, 3).map((line) => fewWords(line, 6));
}
