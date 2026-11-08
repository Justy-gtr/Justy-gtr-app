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
  if (symbol.endsWith(".MU")) return "München";
  return null;
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
    history: { intraday: [], "4H": [], "1M": [], "6M": [], "1Y": [], "5Y": [] },
    sparkline: [],
    sources: []
  };
}

export function updateAlerts(previous, tickers, nowIso, berlinDay) {
  const kept = (previous?.alerts || []).filter((alert) => alert && alert.example !== true);
  for (const ticker of tickers) {
    if (ticker.example === true || ticker.stale) continue;
    if (typeof ticker.changePct !== "number" || Math.abs(ticker.changePct) < 2) continue;
    const id = `${ticker.symbol}-${berlinDay}`;
    const existing = kept.find((alert) => alert.id === id);
    if (existing) {
      existing.changePct = roundTo(ticker.changePct, 2);
      existing.priceEur = roundTo(ticker.priceEur, 2);
      existing.direction = ticker.changePct >= 0 ? "up" : "down";
      existing.sources = ticker.sources || existing.sources || [];
      if (typeof existing.notified !== "boolean") existing.notified = false;
    } else {
      kept.push({
        id,
        symbol: ticker.symbol,
        name: ticker.name,
        changePct: roundTo(ticker.changePct, 2),
        priceEur: roundTo(ticker.priceEur, 2),
        thresholdPct: 2,
        direction: ticker.changePct >= 0 ? "up" : "down",
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
