/** Market-data helpers shared by the price workflow and tests. */

export function roundTo(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

/** EURUSD is quoted as USD per 1 EUR, so euros = dollars / rate. */
export function usdToEur(usd, eurusd) {
  if (usd == null || eurusd == null || Number(eurusd) === 0) return null;
  return Number(usd) / Number(eurusd);
}

export function fxFor(series, iso, fallback) {
  const day = String(iso || "").slice(0, 10);
  let chosen = null;
  for (const point of series || []) {
    if (String(point.t).slice(0, 10) <= day) chosen = point.close;
    else break;
  }
  return chosen || fallback || null;
}

export function venueFor(symbol) {
  if (!symbol) return null;
  if (symbol.endsWith(".DE")) return "Xetra";
  if (symbol.endsWith(".F")) return "Frankfurt";
  if (symbol.endsWith(".SG")) return "Stuttgart";
  if (symbol.endsWith(".MU")) return "München";
  return null;
}

/**
 * Minute symbols for one ticker: Frankfurt, then Stuttgart, then Xetra, then the rest.
 * Xetra is not first. It opens at 09:00, the other two around 08:00.
 */
export function germanMinuteSymbols(spec) {
  const seen = new Set();
  const frankfurt = [];
  const stuttgart = [];
  const xetra = [];
  const rest = [];
  for (const symbol of [...(spec?.eurSymbols || []), ...(spec?.earlySymbols || [])]) {
    const text = String(symbol || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (/\.F$/i.test(text)) frankfurt.push(text);
    else if (/\.SG$/i.test(text)) stuttgart.push(text);
    else if (/\.DE$/i.test(text)) xetra.push(text);
    else rest.push(text);
  }
  return [...frankfurt, ...stuttgart, ...xetra, ...rest];
}

const NARRATIVE_KEYS = ["why", "whySources", "longTermOutlook", "counterArgument", "firstPrinciples", "notes"];

export function mergeTicker(prev, fresh) {
  const next = { ...(prev || {}), ...fresh, example: false, stale: false, fetchError: null };
  if (prev) {
    for (const key of NARRATIVE_KEYS) {
      if (prev[key] != null && prev[key] !== "") next[key] = prev[key];
    }
    if (prev.narrativeExample === false) next.narrativeExample = false;
    else next.narrativeExample = prev.example === true || prev.narrativeExample === true;
    if (prev.example === true || prev.recordHighEur == null) next.recordHighEur = fresh.recordHighEur;
    else next.recordHighEur = roundTo(Math.max(Number(prev.recordHighEur) || 0, Number(fresh.recordHighEur) || 0), 2);
  } else {
    next.narrativeExample = false;
  }
  return next;
}

export function failedTicker(prev, symbol, name, message) {
  if (prev && prev.fetchError === message) return prev;
  if (prev) return { ...prev, stale: true, fetchError: message, fetchErrorAt: new Date().toISOString() };
  return {
    symbol,
    name,
    example: true,
    narrativeExample: true,
    stale: true,
    fetchError: message,
    priceEur: null,
    changePct: null,
    history: { intraday: [], "5m": [], "1H": [], "4H": [], "1M": [], "6M": [], "1Y": [], "5Y": [] },
    sparkline: [],
    sources: []
  };
}

export function impliedChangePct(priceEur, previousCloseEur) {
  const price = Number(priceEur);
  const prev = Number(previousCloseEur);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
  return ((price - prev) / prev) * 100;
}

export function berlinDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dailyBars(ticker) {
  return (ticker?.history?.["1M"] || [])
    .filter((bar) => bar && bar.t && Number.isFinite(Number(bar.eur)))
    .slice()
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/** Last session close from daily history. The final bar counts as today when it is today or still the live print. */
export function priorCloseFromHistory(ticker, now = new Date()) {
  const bars = dailyBars(ticker);
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const today = berlinDayKey(now instanceof Date ? now : new Date(now));
  const price = Number(ticker.priceEur);
  const lastEur = Number(last.eur);
  const lastIsSpot = String(last.t).slice(0, 10) === today
    || (Number.isFinite(price) && price !== 0 && Math.abs(lastEur - price) / Math.abs(price) < 0.01);
  return lastIsSpot ? Number(prev.eur) : lastEur;
}

/**
 * Percent that may open an alert.
 * Rejects a stale changePct that still uses the close before the 5-day window
 * (that made the weekly move look like the day) when the last session says otherwise.
 */
export function trustedChange(ticker, now = new Date()) {
  if (!ticker || ticker.example === true || ticker.stale) return null;
  if (typeof ticker.changePct !== "number" || Number.isNaN(ticker.changePct)) return null;
  const historyPrior = priorCloseFromHistory(ticker, now);
  const statedPrior = Number(ticker.previousCloseEur);
  if (historyPrior != null && Number.isFinite(statedPrior) && historyPrior !== 0) {
    if (Math.abs(historyPrior - statedPrior) / Math.abs(historyPrior) > 0.03) return null;
  }
  if (Number.isFinite(statedPrior) && ticker.priceEur != null) {
    const implied = impliedChangePct(ticker.priceEur, statedPrior);
    if (implied == null || Math.abs(implied - ticker.changePct) > 0.35) return null;
  } else if (historyPrior != null && ticker.priceEur != null) {
    const implied = impliedChangePct(ticker.priceEur, historyPrior);
    if (implied == null || Math.abs(implied - ticker.changePct) > 0.6) return null;
  }
  return ticker.changePct;
}

function alertSessionIndex(bars, alert) {
  const day = String(alert?.timestamp || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return -1;
  const exact = bars.findIndex((bar) => String(bar.t).slice(0, 10) === day);
  if (exact >= 0) return exact;
  let chosen = -1;
  for (let index = 0; index < bars.length; index += 1) {
    if (String(bars[index].t).slice(0, 10) <= day) chosen = index;
  }
  if (chosen < 0) return -1;
  if (Math.abs(Number(bars[chosen].eur) - Number(alert.priceEur)) > 0.5) return -1;
  return chosen;
}

/**
 * True when a stored percent is the old 5-day-window close, not that session.
 * A few points of gap are normal (intraday print versus the daily close).
 * The false TSLA print was the whole week, more than 8 points off the session.
 */
export function staleSessionAlert(alert, ticker) {
  if (!alert || alert.example === true || typeof alert.changePct !== "number" || alert.priceEur == null) return false;
  const bars = dailyBars(ticker);
  const index = alertSessionIndex(bars, alert);
  if (index < 1) return false;
  if (Math.abs(Number(bars[index].eur) - Number(alert.priceEur)) > 0.05) return false;
  const implied = impliedChangePct(alert.priceEur, bars[index - 1].eur);
  if (implied == null) return false;
  return Math.abs(implied - Number(alert.changePct)) > 8;
}

export function updateAlerts(previous, tickers, nowIso, berlinDay) {
  const now = nowIso ? new Date(nowIso) : new Date();
  const list = tickers || [];
  const bySymbol = new Map(list.filter((ticker) => ticker?.symbol).map((ticker) => [ticker.symbol, ticker]));
  const kept = (previous?.alerts || []).filter((alert) => {
    if (!alert || alert.example === true) return false;
    const ticker = bySymbol.get(alert.symbol);
    if (ticker && !ticker.stale && ticker.example !== true && staleSessionAlert(alert, ticker)) return false;
    if (alert.id !== `${alert.symbol}-${berlinDay}`) return true;
    if (!ticker || ticker.example === true || ticker.stale) return true;
    const change = trustedChange(ticker, now);
    if (change == null) return false;
    return Math.abs(change) >= 2;
  });
  for (const ticker of list) {
    const change = trustedChange(ticker, now);
    if (change == null || Math.abs(change) < 2) continue;
    const id = `${ticker.symbol}-${berlinDay}`;
    const existing = kept.find((alert) => alert.id === id);
    if (existing) {
      existing.changePct = roundTo(change, 2);
      existing.priceEur = roundTo(ticker.priceEur, 2);
      existing.direction = change >= 0 ? "up" : "down";
      existing.sources = ticker.sources || existing.sources || [];
      if (typeof existing.notified !== "boolean") existing.notified = false;
    } else {
      kept.push({
        id,
        symbol: ticker.symbol,
        name: ticker.name,
        changePct: roundTo(change, 2),
        priceEur: roundTo(ticker.priceEur, 2),
        thresholdPct: 2,
        direction: change >= 0 ? "up" : "down",
        timestamp: nowIso,
        notified: false,
        example: false,
        sources: ticker.sources || []
      });
    }
  }
  const cutoff = Date.now() - 14 * 86400000;
  return {
    example: false,
    thresholdPct: 2,
    notes: "Bewegung von mindestens 2 Prozent am Tag in Euro. notified setzt der Assistent auf true, wenn er Bescheid gegeben hat.",
    alerts: kept.filter((alert) => {
      const then = Date.parse(alert.timestamp || "");
      return Number.isNaN(then) || then >= cutoff;
    })
  };
}

/**
 * Group already-euro bars into N-hour candles.
 * Open is the first bar, close the last, high and low the extremes. Nothing is filled in.
 */
export function aggregateBars(bars, hours) {
  const size = hours * 3600 * 1000;
  const map = new Map();
  for (const bar of bars || []) {
    const close = Number(bar?.close ?? bar?.eur);
    const time = Date.parse(bar?.t);
    if (!Number.isFinite(close) || !Number.isFinite(time)) continue;
    const open = Number.isFinite(Number(bar.open)) ? Number(bar.open) : close;
    const high = Number.isFinite(Number(bar.high)) ? Number(bar.high) : Math.max(open, close);
    const low = Number.isFinite(Number(bar.low)) ? Number(bar.low) : Math.min(open, close);
    const key = Math.floor(time / size) * size;
    const slot = map.get(key);
    if (!slot) {
      map.set(key, {
        t: new Date(key).toISOString(),
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close
      });
    } else {
      slot.high = Math.max(slot.high, high, close);
      slot.low = Math.min(slot.low, low, close);
      slot.close = close;
    }
  }
  return [...map.values()].map((bar) => ({
    t: bar.t,
    eur: roundTo(bar.close, 2),
    open: roundTo(bar.open, 2),
    high: roundTo(Math.max(bar.high, bar.open, bar.close), 2),
    low: roundTo(Math.min(bar.low, bar.open, bar.close), 2)
  }));
}

export function meaningful(value) {
  return JSON.stringify(value, (key, item) => {
    if (key === "asOf" || key === "pricesUpdated" || key === "lastUpdated" || key === "fetchErrorAt") return undefined;
    return item;
  });
}

const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday]
  };
}

export function nyParts(date = new Date()) {
  return zonedParts(date, "America/New_York");
}

/** Last N New York dates present in the series. Weekends only count when a print exists. */
export function keepTradingDays(points, days = 3) {
  const list = (points || []).filter((point) => point && point.t);
  const count = Number(days);
  if (!Number.isFinite(count) || count < 1) return list;
  const keys = [];
  const seen = new Set();
  for (const point of list) {
    const time = Date.parse(point.t);
    if (!Number.isFinite(time)) continue;
    const key = nyParts(new Date(time)).date;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  if (keys.length <= count) return list;
  const keep = new Set(keys.slice(-count));
  return list.filter((point) => {
    const time = Date.parse(point.t);
    return Number.isFinite(time) && keep.has(nyParts(new Date(time)).date);
  });
}

/**
 * Close that the daily percent should use.
 * A 5-day chart's chartPreviousClose is the close before that window, not the last session.
 * With two or more daily bars, the previous close is the bar before the last one:
 * today's session uses yesterday, and a weekend or a not-yet-open session uses the
 * prior close of that finished session. One bar falls back to the 1-day chart previous close.
 */
export function previousSessionClose(chart) {
  const bars = (chart?.points || [])
    .filter((point) => point && point.t && Number.isFinite(Number(point.close)))
    .slice()
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (bars.length >= 2) return Number(bars[bars.length - 2].close);
  const chartPrev = Number(chart?.chartPreviousClose);
  if (Number.isFinite(chartPrev)) return chartPrev;
  const metaPrev = Number(chart?.metaPrevious);
  if (Number.isFinite(metaPrev)) return metaPrev;
  return null;
}

/**
 * Previous close for the daily percent on a multi-day chart.
 * A single bar is not used: its chartPreviousClose is the close before the range,
 * which turned the weekly move into a fake day.
 */
export function sessionBaseline(chart) {
  const bars = (chart?.points || []).filter((point) => point && point.t && Number.isFinite(Number(point.close)));
  if (bars.length < 2) return null;
  return previousSessionClose(chart);
}

/**
 * Previous close for a live print.
 * A daily bar that is still yesterday must not be treated as the bar before that:
 * the print is a new session, so yesterday itself is the baseline.
 */
export function baselineForLivePrint(chart, spotTime, now = new Date()) {
  const bars = (chart?.points || [])
    .filter((point) => point && point.t && Number.isFinite(Number(point.close)))
    .slice()
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (bars.length < 2) return null;
  const spot = spotTime ? new Date(spotTime) : (now instanceof Date ? now : new Date(now));
  const spotDay = berlinDayKey(spot);
  const lastDay = berlinDayKey(bars[bars.length - 1].t);
  if (spotDay && lastDay && spotDay > lastDay) return Number(bars[bars.length - 1].close);
  return sessionBaseline(chart);
}

/** True when the newest bar is on the same New York date as `now`. */
export function latestOnNewYorkDay(points, now = new Date()) {
  const when = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(when.getTime())) return false;
  let latest = null;
  for (const point of points || []) {
    const time = Date.parse(point?.t);
    if (!Number.isFinite(time)) continue;
    if (latest == null || time > latest) latest = time;
  }
  if (latest == null) return false;
  return nyParts(new Date(latest)).date === nyParts(when).date;
}

/** US cash session by the New York clock. Half-open: 04:00 pre, 09:30 regular, 16:00 post, 20:00 closed. */
export function usClockSession(epochMs) {
  const parts = nyParts(new Date(epochMs));
  if (parts.weekday == null || parts.weekday > 4) return null;
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "post";
  return null;
}

/**
 * True while US pre-market, regular, or after-hours can still print,
 * plus a short buffer so a late cron still catches the last after-hours trade.
 */
export function usSessionActive(date = new Date(), bufferMin = 30) {
  const parts = nyParts(date);
  if (parts.weekday == null || parts.weekday > 4) return false;
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 4 * 60 && minutes <= 20 * 60 + bufferMin;
}

export function normalizePeriods(meta) {
  const buckets = { pre: [], regular: [], post: [] };
  const push = (key, period) => {
    if (!period || period.start == null || period.end == null) return;
    const start = Number(period.start);
    const end = Number(period.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const list = buckets[key];
    if (list.some((item) => item.start === start && item.end === end)) return;
    list.push({ start, end });
  };
  const trading = meta?.tradingPeriods;
  if (Array.isArray(trading)) {
    for (const day of trading) {
      const list = Array.isArray(day) ? day : [day];
      for (const period of list) push("regular", period);
    }
  } else if (trading && typeof trading === "object") {
    for (const key of ["pre", "regular", "post"]) {
      for (const day of trading[key] || []) {
        const list = Array.isArray(day) ? day : [day];
        for (const period of list) push(key, period);
      }
    }
  }
  const current = meta?.currentTradingPeriod;
  if (current && typeof current === "object") {
    for (const key of ["pre", "regular", "post"]) push(key, current[key]);
  }
  return buckets;
}

export function sessionFor(epochSec, periods, { clock = false } = {}) {
  if (periods) {
    for (const key of ["pre", "regular", "post"]) {
      for (const period of periods[key] || []) {
        if (period && epochSec >= period.start && epochSec < period.end) return key;
      }
    }
  }
  if (clock) return usClockSession(epochSec * 1000);
  return null;
}

export function tagSessions(points, periods, options) {
  return (points || []).map((point) => {
    const epoch = Math.floor(Date.parse(point?.t) / 1000);
    const session = Number.isFinite(epoch) ? sessionFor(epoch, periods, options) : null;
    return session ? { ...point, session } : { ...point };
  });
}

function rangeOf(rows) {
  const highs = [];
  const lows = [];
  for (const row of rows) {
    const high = row.high ?? row.close;
    const low = row.low ?? row.close;
    if (high != null && !Number.isNaN(Number(high))) highs.push(Number(high));
    if (low != null && !Number.isNaN(Number(low))) lows.push(Number(low));
  }
  const last = rows[rows.length - 1];
  return {
    price: last.close ?? null,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    asOf: last.t
  };
}

/**
 * Overnight last from real pre/post prints. No official overnight high/low
 * exists on this source, so the range is the min/max of those candles.
 * During the regular US session this returns null: the regular price stands alone.
 */
export function extendedQuote(points, periods, nowMs, { clock = true } = {}) {
  const nowSec = Math.floor(nowMs / 1000);
  const tagged = tagSessions(points, periods, { clock }).filter((point) => point.session && point.close != null);
  const groups = {
    pre: tagged.filter((point) => point.session === "pre"),
    post: tagged.filter((point) => point.session === "post"),
    regular: tagged.filter((point) => point.session === "regular")
  };
  const nowPhase = sessionFor(nowSec, periods, { clock });
  if (nowPhase === "pre") {
    return groups.pre.length ? { phase: "vorboerse", ...rangeOf(groups.pre) } : null;
  }
  if (nowPhase === "post") {
    return groups.post.length ? { phase: "nachhandel", ...rangeOf(groups.post) } : null;
  }
  if (nowPhase === "regular") return null;
  if (groups.post.length) return { phase: "nachhandel", ...rangeOf(groups.post) };
  if (groups.pre.length && !groups.regular.length) return { phase: "vorboerse", ...rangeOf(groups.pre) };
  return null;
}

export function emptyOvernight() {
  return { phase: null, eur: null, high: null, low: null, asOf: null };
}

/** Keep the last overnight print when a later fetch has no new extended candles yet. */
export function resolveOvernight(computed, previous, { regularLive = false } = {}) {
  if (computed && computed.phase && computed.eur != null) {
    return {
      phase: computed.phase,
      eur: computed.eur,
      high: computed.high ?? null,
      low: computed.low ?? null,
      asOf: computed.asOf ?? null
    };
  }
  if (!regularLive && previous?.overnightEur != null && previous.overnightPhase) {
    return {
      phase: previous.overnightPhase,
      eur: previous.overnightEur,
      high: previous.overnightHighEur ?? null,
      low: previous.overnightLowEur ?? null,
      asOf: previous.overnightAsOf ?? null
    };
  }
  return emptyOvernight();
}

export function stitchIntraday(primary, extra) {
  const base = primary || [];
  if (!extra?.length) return base;
  if (!base.length) return extra;
  const last = Date.parse(base[base.length - 1].t);
  if (!Number.isFinite(last)) return base.concat(extra);
  return base.concat(extra.filter((point) => Date.parse(point.t) > last));
}

function pointPrice(point) {
  const price = Number(point?.close ?? point?.eur ?? point?.price);
  return Number.isFinite(price) ? price : null;
}

function sortByTime(points) {
  return (points || [])
    .filter((point) => point && point.t && Number.isFinite(Date.parse(point.t)))
    .slice()
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

function dedupeMinutes(points) {
  const map = new Map();
  for (const point of sortByTime(points)) map.set(point.t, point);
  return [...map.values()];
}

/** Earlier groups keep a shared minute. Later groups only fill minutes that are still empty. */
export function fillMinuteGaps(groups) {
  const map = new Map();
  for (const group of groups || []) {
    const points = Array.isArray(group) ? group : group?.points;
    for (const point of dedupeMinutes(points)) {
      if (!map.has(point.t)) map.set(point.t, point);
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/**
 * Frankfurt and Stuttgart from about 08:00, then Xetra for its own span, then the early venues again after Xetra's last print.
 * Without a Xetra series the venues are merged first, so a thin Frankfurt tape still counts with Stuttgart.
 */
export function mergeGermanMinutes(groups) {
  const list = (groups || []).filter((group) => group?.points?.length);
  const primary = list.find((group) => String(group.symbol || "").endsWith(".DE"));
  const early = list.filter((group) => group !== primary);
  const earlyPoints = fillMinuteGaps(early);
  if (!primary) return earlyPoints;
  const xetra = dedupeMinutes(primary.points);
  if (!xetra.length) return earlyPoints;
  const first = Date.parse(xetra[0].t);
  const last = Date.parse(xetra[xetra.length - 1].t);
  const before = earlyPoints.filter((point) => Date.parse(point.t) < first);
  const after = earlyPoints.filter((point) => Date.parse(point.t) > last);
  return [...before, ...xetra, ...after];
}

/** Newest print on a Berlin day. `sessions` limits US pre/regular when the points are tagged. */
export function freshestPrint(points, { day = null, sessions = null } = {}) {
  let best = null;
  for (const point of points || []) {
    const time = Date.parse(point?.t);
    if (!Number.isFinite(time)) continue;
    if (day && berlinDayKey(time) !== day) continue;
    if (sessions && !sessions.includes(point.session)) continue;
    const price = pointPrice(point);
    if (price == null) continue;
    if (!best || time > best.time) {
      const high = Number(point.high);
      const low = Number(point.low);
      best = {
        t: point.t,
        time,
        price,
        session: point.session || null,
        high: Number.isFinite(high) ? high : null,
        low: Number.isFinite(low) ? low : null
      };
    }
  }
  return best;
}

/** Latest German print today. A quote timestamp newer than the last minute wins. */
export function freshestGermanQuote(groups, day) {
  let best = null;
  for (const group of groups || []) {
    const minute = freshestPrint(group?.points, { day });
    let candidate = minute
      ? { symbol: group.symbol || null, price: minute.price, t: minute.t, time: minute.time, session: minute.session || "regular" }
      : null;
    const quote = group?.quote;
    const quotePrice = Number(quote?.price);
    const quoteTime = Date.parse(quote?.t);
    if (quote && quotePrice > 0 && Number.isFinite(quoteTime) && berlinDayKey(quoteTime) === day) {
      if (!candidate || quoteTime > candidate.time) {
        candidate = {
          symbol: group.symbol || null,
          price: quotePrice,
          t: new Date(quoteTime).toISOString(),
          time: quoteTime,
          session: "regular"
        };
      }
    }
    if (candidate && (!best || candidate.time > best.time)) best = candidate;
  }
  return best;
}

export function sessionSpan(points, { day = null, sessions = null } = {}) {
  let high = null;
  let low = null;
  for (const point of points || []) {
    const time = Date.parse(point?.t);
    if (!Number.isFinite(time)) continue;
    if (day && berlinDayKey(time) !== day) continue;
    if (sessions && !sessions.includes(point.session)) continue;
    const upper = Number(point.high ?? point.close ?? point.eur ?? point.price);
    const lower = Number(point.low ?? point.close ?? point.eur ?? point.price);
    if (Number.isFinite(upper)) high = high == null ? upper : Math.max(high, upper);
    if (Number.isFinite(lower)) low = low == null ? lower : Math.min(low, lower);
  }
  return { high, low };
}

/**
 * Tag price. A German print from today stays ahead of a later US pre-market print.
 * US pre or regular replaces yesterday's close only when no German venue has printed today.
 * A post-market print does not replace the regular close.
 */
export function displayedPrice({ german = null, us = null, fallback = null } = {}) {
  if (german && Number(german.price) > 0) {
    return {
      kind: "eur",
      symbol: german.symbol || null,
      price: Number(german.price),
      t: german.t || null,
      session: german.session || "regular"
    };
  }
  if (us && Number(us.price) > 0 && (us.session === "pre" || us.session === "regular")) {
    return {
      kind: "usd",
      symbol: us.symbol || null,
      price: Number(us.price),
      t: us.t || null,
      session: us.session
    };
  }
  if (fallback && Number(fallback.price) > 0) {
    return {
      kind: "close",
      symbol: fallback.symbol || null,
      price: Number(fallback.price),
      t: fallback.t || null,
      session: fallback.session || null
    };
  }
  return null;
}

/**
 * Euro venue wins once it has a real one-minute series.
 * A handful of prints stays on the Nasdaq path.
 */
export function chooseIntraday(euPoints, usdPoints, fallbackMethod, minEu = 12) {
  const eu = euPoints || [];
  const usd = usdPoints || [];
  if (eu.length >= minEu) {
    const points = stitchIntraday(eu, usd);
    return { points, method: points.length > eu.length ? "direct_eur_plus_us" : "direct_eur" };
  }
  if (usd.length) return { points: usd, method: "usd_div_eurusd" };
  return { points: [], method: fallbackMethod };
}

/** One trading day of minute bars. Drops an older session and a runaway series. */
export function keepRecentSession(points, { hours = 30, maxPoints = 1400 } = {}) {
  const list = (points || []).filter((point) => point && point.t);
  if (!list.length) return [];
  const last = Date.parse(list[list.length - 1].t);
  const cutoff = Number.isFinite(last) ? last - hours * 3600 * 1000 : -Infinity;
  const recent = list.filter((point) => {
    const time = Date.parse(point.t);
    return Number.isFinite(time) && time >= cutoff;
  });
  if (recent.length > maxPoints) return recent.slice(-maxPoints);
  return recent;
}

/** True once every regular window that has started is over. */
export function sessionEnded(periods, nowSec) {
  const regular = (periods?.regular || []).filter((period) => period && period.end > period.start);
  const started = regular.filter((period) => nowSec >= period.start);
  if (!started.length) return false;
  return started.every((period) => nowSec >= period.end);
}
