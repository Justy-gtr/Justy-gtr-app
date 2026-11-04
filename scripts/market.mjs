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
    history: { intraday: [], "1M": [], "6M": [], "1Y": [], "5Y": [] },
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

export function meaningful(value) {
  return JSON.stringify(value, (key, item) => {
    if (key === "asOf" || key === "pricesUpdated" || key === "lastUpdated" || key === "fetchErrorAt") return undefined;
    return item;
  });
}
