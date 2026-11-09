/** Kurzfristige Zahlentermine: Fenster, Zählung, Reihenfolge. Kein Netz. */

import { HISTORY_MIN_N, MOVE_THRESHOLD, shiftIso } from "./moonshot-stats.mjs";

/** Volle Schließungen der NYSE. Frühe Schlüsse bleiben Handelstage. */
export const NYSE_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
  "2027-12-31",
  "2028-01-17",
  "2028-02-21",
  "2028-04-14",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-11-23",
  "2028-12-25"
]);

export const FOCUS_SYMBOLS = ["TSLA", "RKLB", "SPCX"];
export const NEAR_LIMIT = 3;
export const NARROW_AHEAD = 3;
export const WIDE_AHEAD = 5;

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MINUS = "−";

export function germanDate(iso) {
  const [year, month, day] = String(iso || "").split("-");
  const index = Number(month) - 1;
  if (!year || !day || index < 0 || index > 11) return "";
  return `${Number(day)}. ${MONTHS[index]} ${year}`;
}

export function isTradingDay(iso, holidays = NYSE_HOLIDAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return false;
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(iso);
}

function collectTradingDays(start, count, holidays) {
  const days = [];
  let cursor = start;
  let guard = 0;
  while (days.length < count && guard < 40) {
    if (isTradingDay(cursor, holidays)) days.push(cursor);
    cursor = shiftIso(cursor, 1);
    guard += 1;
  }
  return days;
}

/** Heute, wenn es ein Handelstag ist, plus `ahead` weitere. Sonst die nächsten `ahead` Handelstage. */
export function tradingWindow(today, ahead, holidays = NYSE_HOLIDAYS) {
  if (isTradingDay(today, holidays)) return collectTradingDays(today, ahead + 1, holidays);
  return collectTradingDays(shiftIso(today, 1), ahead, holidays);
}

export function normalizeSession(time) {
  if (time === "time-pre-market") return "bmo";
  if (time === "time-after-hours") return "amc";
  return "na";
}

export function parseHistoricalDates(html) {
  const found = [];
  const pattern = /<td[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/td>/gi;
  let match = pattern.exec(html || "");
  while (match) {
    const month = match[1].padStart(2, "0");
    const day = match[2].padStart(2, "0");
    const iso = `${match[3]}-${month}-${day}`;
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) found.push(iso);
    match = pattern.exec(html);
  }
  return [...new Set(found)].sort();
}

function sortedBars(bars) {
  return [...(bars || [])]
    .filter((bar) => bar?.date && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function tally(moves, threshold = MOVE_THRESHOLD) {
  let up = 0;
  let down = 0;
  for (const move of moves) {
    if (move.pct >= threshold) up += 1;
    if (move.pct <= -threshold) down += 1;
  }
  const n = moves.length;
  return { n, up, down, showPct: n >= HISTORY_MIN_N, moves };
}

/**
 * Reaktion auf einen Zahlentermin.
 * Nachbörslich: Schluss am Termin bis zum nächsten Handelstag.
 * Vorbörslich: Schluss am Vortag bis zum Schluss am Termin.
 * Sprünge ab 50 Prozent zählen nicht mit, das ist ein Split und keine Reaktion.
 */
export function eventMoves(bars, events, threshold = MOVE_THRESHOLD) {
  const series = sortedBars(bars);
  const moves = [];
  const seen = new Set();
  const ordered = [...(events || [])].filter((event) => event?.date).sort((a, b) => a.date.localeCompare(b.date));
  for (const event of ordered) {
    if (seen.has(event.date)) continue;
    seen.add(event.date);
    let base = null;
    let next = null;
    if (event.session === "bmo") {
      const reaction = series.findIndex((bar) => bar.date === event.date);
      if (reaction <= 0) continue;
      base = series[reaction - 1];
      next = series[reaction];
    } else {
      let baseIndex = -1;
      for (let index = series.length - 1; index >= 0; index -= 1) {
        if (series[index].date <= event.date) {
          baseIndex = index;
          break;
        }
      }
      if (baseIndex < 0 || baseIndex >= series.length - 1) continue;
      base = series[baseIndex];
      next = series[baseIndex + 1];
    }
    const raw = ((next.close - base.close) / base.close) * 100;
    if (Math.abs(raw) >= 50) continue;
    moves.push({
      date: event.date,
      base: base.date,
      reaction: next.date,
      pct: Math.round(raw * 100) / 100
    });
  }
  return tally(moves, threshold);
}

/** Die letzten gemessenen Reaktionen, höchstens `limit`, nur Termine vor `today`. */
export function lastEventMoves(bars, dates, session, today, limit = 8) {
  const past = [...new Set((dates || []).filter((date) => typeof date === "string" && date < today))].sort();
  const kind = session === "bmo" ? "bmo" : "amc";
  const pack = eventMoves(bars, past.map((date) => ({ date, session: kind })));
  return tally(pack.moves.slice(-limit));
}

export function historyFrame(session) {
  if (session === "bmo") {
    return {
      catalystLabel: "Am Zahlentag",
      note: "Schluss am Vortag bis zum Schluss am Zahlentag. Frühere Termine sind wie der nächste vor der Eröffnung gezählt."
    };
  }
  if (session === "na") {
    return {
      catalystLabel: "Am Folgetag",
      note: "Uhrzeit fehlt. Gezählt wird der nächste Handelstag, Schluss zu Schluss."
    };
  }
  return {
    catalystLabel: "Am Folgetag",
    note: "Schluss am Zahlentag bis zum nächsten Handelstag."
  };
}

export function nearnessLine(daysAway, includesToday) {
  const days = Number(daysAway) || 0;
  if (days <= 0) return includesToday ? "Der Termin liegt heute." : "Der Termin liegt am ersten Handelstag im Fenster.";
  if (days === 1) return "Der Termin liegt am nächsten Handelstag.";
  return `Der Termin liegt in ${days} Handelstagen.`;
}

export function nearCopy({ daysAway, includesToday, session, history }) {
  const frame = historyFrame(session);
  const stats = history || {};
  const where = session === "bmo" ? "am Zahlentag" : "am Folgetag";
  const upLine = stats.showPct
    ? `In ${stats.n} früheren Quartalen lag die Bewegung ${where} ${stats.up} Mal bei mindestens +5 %.`
    : `Bisher n = ${Number.isInteger(stats.n) ? stats.n : 0}. Keine Prozentzahl.`;
  const downLine = stats.showPct
    ? `In denselben ${stats.n} Quartalen lag die Bewegung ${where} ${stats.down} Mal bei mindestens ${MINUS}5 %.`
    : "Unter 7 früheren Terminen steht hier keine Prozentzahl.";
  return {
    ...frame,
    for: [nearnessLine(daysAway, includesToday), upLine],
    against: [downLine, "Das sind frühere Termine. Keine Vorhersage."]
  };
}

export function windowNote({ expanded, from, to, includesToday }) {
  const end = germanDate(to);
  if (expanded) {
    return `In den nächsten 3 Handelstagen lagen zu wenig Termine. Fenster bis 5 Handelstage, ${end}.`;
  }
  if (includesToday) return `Fenster: heute und die nächsten 3 Handelstage, bis ${end}.`;
  return `Fenster: die nächsten 3 Handelstage, ${germanDate(from)} bis ${end}.`;
}

/** Näher Termin plus große Folgetage. Die Options-Spanne ist nur ein kleiner Zusatz. */
export function nearScore(item) {
  const days = Number(item?.daysAway) || 0;
  const near = 1 / (1 + days);
  const n = item?.history?.n || 0;
  const hits = (item?.history?.up || 0) + (item?.history?.down || 0);
  let hist = n > 0 ? hits / n : 0;
  if (n < HISTORY_MIN_N) hist *= n / HISTORY_MIN_N;
  const implied = Number(item?.implied?.pct);
  const extra = Number.isFinite(implied) && implied > 0 ? Math.min(implied, 25) / 25 : 0;
  return near + hist * 0.85 + extra * 0.3;
}

export function rankNear(items) {
  return [...(items || [])].sort((a, b) => {
    const delta = nearScore(b) - nearScore(a);
    if (Math.abs(delta) > 1e-9) return delta;
    const away = (a.daysAway || 0) - (b.daysAway || 0);
    if (away) return away;
    const hits = ((b.history?.up || 0) + (b.history?.down || 0)) - ((a.history?.up || 0) + (a.history?.down || 0));
    if (hits) return hits;
    return String(a.symbol).localeCompare(String(b.symbol));
  });
}

export function dedupeFamilies(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = item.family || item.symbol;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Nächste Fälligkeit am Termin oder bis zu 14 Tage danach. Unix-Sekunden oder Millisekunden. */
export function chooseExpiry(expirations, eventIso, maxExtraDays = 14) {
  const eventMs = Date.parse(`${eventIso}T00:00:00Z`);
  if (!Number.isFinite(eventMs)) return null;
  const max = eventMs + maxExtraDays * 86400000;
  const candidates = (expirations || [])
    .map((value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return Date.parse(value);
      return number < 1e12 ? number * 1000 : number;
    })
    .filter((ms) => Number.isFinite(ms) && ms >= eventMs && ms <= max)
    .sort((a, b) => a - b);
  return candidates[0] ?? null;
}

function legMid(leg) {
  const bid = Number(leg?.bid);
  const ask = Number(leg?.ask);
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  const last = Number(leg?.lastPrice);
  return last > 0 ? last : null;
}

/** Spanne aus dem Straddle am Basispreis, in Prozent des Kurses. */
export function straddlePct(calls, puts, spot) {
  if (!(spot > 0)) return null;
  const strikes = new Set([
    ...(calls || []).map((leg) => leg?.strike),
    ...(puts || []).map((leg) => leg?.strike)
  ].filter((strike) => Number(strike) > 0));
  let best = null;
  let bestDist = Infinity;
  for (const strike of strikes) {
    const dist = Math.abs(strike - spot);
    if (dist < bestDist) {
      best = strike;
      bestDist = dist;
    }
  }
  if (best == null) return null;
  const call = (calls || []).find((leg) => leg?.strike === best);
  const put = (puts || []).find((leg) => leg?.strike === best);
  const callMid = legMid(call);
  const putMid = legMid(put);
  if (callMid == null || putMid == null) return null;
  const pct = ((callMid + putMid) / spot) * 100;
  if (!(pct > 0) || pct > 80) return null;
  return Math.round(pct * 10) / 10;
}

function rowsOn(rowsByDate, dates, known, blocked) {
  const bySymbol = new Map();
  for (const date of dates) {
    for (const row of rowsByDate?.[date] || []) {
      const symbol = String(row?.symbol || "").toUpperCase();
      const entry = known.get(symbol);
      if (!entry || blocked.has(symbol)) continue;
      const hit = {
        symbol,
        name: entry.name,
        family: entry.family || symbol,
        date,
        session: normalizeSession(row.time)
      };
      const prev = bySymbol.get(symbol);
      if (!prev || hit.date < prev.date) bySymbol.set(symbol, hit);
    }
  }
  return [...bySymbol.values()];
}

export function buildCandidate(item, includesToday) {
  const copy = nearCopy({
    daysAway: item.daysAway,
    includesToday,
    session: item.session,
    history: item.history
  });
  const { moves, ...catalystStats } = item.history;
  const sources = [
    {
      title: `Nasdaq: Zahlentermine am ${germanDate(item.date)}`,
      url: "https://www.nasdaq.com/market-activity/earnings"
    },
    {
      title: `Historische Zahlentermine ${item.symbol}`,
      url: `https://www.historicalearnings.com/${item.symbol.toLowerCase()}.html`
    },
    {
      title: "Universum mit verbreiteten Knock-outs",
      url: "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies"
    }
  ];
  if (item.implied?.source) sources.push(item.implied.source);
  const candidate = {
    id: `${item.symbol.toLowerCase()}-${item.date}`,
    symbol: item.symbol,
    name: item.name,
    usdSymbol: item.symbol,
    daysAway: item.daysAway,
    for: copy.for,
    against: copy.against,
    catalyst: {
      label: "Zahlen",
      date: item.date,
      time: null,
      timezone: "Europe/Berlin",
      session: item.session,
      detail: item.session === "bmo"
        ? "Nasdaq: vorbörslich. Die Uhr ist die US-Eröffnung in Berliner Zeit."
        : item.session === "amc"
          ? "Nasdaq: nachbörslich. Die Uhr ist der US-Schluss in Berliner Zeit."
          : "Nasdaq nennt keine Uhrzeit."
    },
    pastCatalysts: {
      kind: item.session === "bmo" ? "earnings_before_open" : "earnings_after_close",
      dates: item.dates
    },
    history: {
      catalystLabel: copy.catalystLabel,
      note: copy.note,
      catalyst: catalystStats,
      moves
    }
  };
  if (item.implied?.pct != null) {
    candidate.implied = {
      pct: item.implied.pct,
      expiry: item.implied.expiry,
      source: item.implied.source
    };
  }
  if (item.leverage?.isin) candidate.leverage = item.leverage;
  candidate.sources = sources;
  return candidate;
}

/**
 * Drei Kandidaten aus dem Universum.
 * Zuerst heute und die nächsten 3 Handelstage. Liegen dort zu wenig Termine, bis 5 Handelstage.
 */
export function pickNearTerm({
  today,
  berlinToday = today,
  rowsByDate,
  symbols,
  exclude = [],
  blocked = [],
  pastBySymbol = {},
  barsBySymbol = {},
  impliedBySymbol = {},
  leverageBySymbol = {}
}) {
  const known = new Map((symbols || []).filter((item) => item?.symbol).map((item) => [String(item.symbol).toUpperCase(), item]));
  const skip = new Set([...FOCUS_SYMBOLS, ...exclude, ...blocked].map((symbol) => String(symbol).toUpperCase()));
  const narrow = tradingWindow(today, NARROW_AHEAD);
  const wide = tradingWindow(today, WIDE_AHEAD);
  const narrowHits = rowsOn(rowsByDate, narrow, known, skip);
  const expanded = narrowHits.length < NEAR_LIMIT;
  const dates = expanded ? wide : narrow;
  const hits = expanded ? rowsOn(rowsByDate, dates, known, skip) : narrowHits;
  const includesToday = dates[0] === berlinToday || dates[0] === today;
  const enriched = hits.map((hit) => {
    const history = lastEventMoves(barsBySymbol[hit.symbol], pastBySymbol[hit.symbol], hit.session, today);
    return {
      ...hit,
      daysAway: Math.max(0, dates.indexOf(hit.date)),
      dates: history.moves.map((move) => move.date),
      history,
      implied: impliedBySymbol[hit.symbol] || null,
      leverage: leverageBySymbol[hit.symbol] || null
    };
  });
  const ranked = dedupeFamilies(rankNear(enriched));
  return {
    pickedOn: berlinToday,
    window: expanded ? WIDE_AHEAD : NARROW_AHEAD,
    expanded,
    from: dates[0] || today,
    to: dates.at(-1) || today,
    includesToday,
    note: windowNote({
      expanded,
      from: dates[0] || today,
      to: dates.at(-1) || today,
      includesToday
    }),
    tradingDays: dates,
    ranked,
    candidates: ranked.slice(0, NEAR_LIMIT).map((item) => buildCandidate(item, includesToday))
  };
}
