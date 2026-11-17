import { formatEUR, formatPct, orderCalendarEvents } from "./logic.js";

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

const DRIVER_ORDER = ["SPCX", "TSLA", "RKLB", "MRVL", "NVDA"];

function fewWords(text, max = 5) {
  return String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, max).join(" ");
}

const REASON = /Treiber|Gestützt|Gegenwind|Getragen|Meldung|Bericht|Anleger/;
const PRICE_DUMP = /schließt bei|Xetra-Schluss|nachbörslich|Gesamtmarkt|Nasdaq Composite|S&P 500|Der Dax hatte|Huang hat|Vor Nvidias Zahlen|Nach Börsenschluss/;
const BANNED_WHY = /\b(kaufen|verkaufen|Empfehlung|Kaufsignal)\b/i;

function tidy(text) {
  return String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function pieces(text) {
  const masked = String(text || "").replace(/\b(Mrd|Mio|St|bzw|ca|Nr)\./gi, "$1§");
  return masked.split(/(?<=[.!?])\s/).map((part) => tidy(part.replace(/§/g, "."))).filter(Boolean);
}

function closeSentence(text) {
  let line = tidy(text).replace(/[,:;–\-]+\s*$/, "").replace(/\s+(und|für|oder|sowie|nach|von|mit|dass)$/i, "");
  if (!line) return "";
  line = line.charAt(0).toUpperCase() + line.slice(1);
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** One complete sentence on the reason. Price prints are left out. */
export function shortWhy(text, changePct = null) {
  const parts = pieces(text);
  const useful = parts.filter((part) => !PRICE_DUMP.test(part));
  let hit = useful.find((part) => REASON.test(part)) || "";
  if (hit && /\bnicht\b/.test(hit.split(";")[0]) && hit.includes(";")) hit = hit.split(";").slice(1).join(";");
  else hit = hit.split(";")[0];
  hit = hit.split(/\s[–—]\s/)[0];
  if (BANNED_WHY.test(hit)) hit = hit.split(BANNED_WHY)[0];
  const sentence = closeSentence(hit);
  if (sentence.split(" ").filter(Boolean).length >= 5 && !BANNED_WHY.test(sentence)) return sentence;
  if (Number(changePct) < 0) return "Kein klarer Anlass, Markt insgesamt schwächer.";
  if (Number(changePct) > 0) return "Kein klarer Anlass, Markt insgesamt fester.";
  return "Kein klarer Anlass.";
}

export function courseDrivers(data) {
  const rank = (symbol) => {
    const index = DRIVER_ORDER.indexOf(symbol);
    return index < 0 ? 50 : index;
  };
  return [...(data?.prices?.tickers || [])]
    .filter((ticker) => ticker && ticker.symbol)
    .sort((a, b) => rank(a.symbol) - rank(b.symbol))
    .map((ticker) => ({
      symbol: ticker.symbol,
      name: ticker.name || ticker.symbol,
      priceEur: ticker.priceEur,
      changePct: ticker.changePct,
      why: shortWhy(ticker.why, ticker.changePct)
    }));
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
