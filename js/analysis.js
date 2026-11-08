import { bucketMinutes, maxPoints, seriesFor } from "./logic.js";

/** Enough separate cases before a percentage is shown. Below this, the number would look sharper than the history is. */
export const MIN_CASES = 8;

const TITLES = {
  steigend: "Steigende Linie",
  fallend: "Fallende Linie",
  doppelboden: "Doppelter Boden",
  doppeltop: "Doppeltes Hoch",
  "ueber-deckel": "Über dem Deckel",
  "unter-stuetze": "Unter der Stütze",
  band: "Zwischen Stütze und Deckel",
  unklar: "Keine klare Form"
};

const SPEC = {
  "1 Min": { swing: 8, window: 45, horizonMs: 15 * 60 * 1000, flatPct: 0.0004, after: "15 Minuten später", touchLook: 30, touchGap: 6, touchMargin: 0.0015 },
  "5 Min": { swing: 4, window: 12, horizonMs: 30 * 60 * 1000, flatPct: 0.0004, after: "30 Minuten später", touchLook: 12, touchGap: 3, touchMargin: 0.002 },
  "1W": { swing: 1, window: 7, horizonMs: 7 * 86400000, flatPct: 0.0015, after: "eine Woche später", touchLook: 8, touchGap: 2, touchMargin: 0.01 },
  "1M": { swing: 2, window: 21, horizonMs: 7 * 86400000, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "6M": { swing: 3, window: 21, horizonMs: 7 * 86400000, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "1J": { swing: 3, window: 21, horizonMs: 7 * 86400000, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "5J": { swing: 2, window: 10, horizonMs: 28 * 86400000, flatPct: 0.003, after: "vier Wochen später", touchLook: 8, touchGap: 2, touchMargin: 0.02 },
  "Max": { swing: 3, window: 21, horizonMs: 7 * 86400000, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.01 }
};

function usable(points) {
  return (points || []).filter((point) => {
    if (!point || point.eur == null || !point.t) return false;
    return Number.isFinite(Number(point.eur)) && Number.isFinite(Date.parse(point.t));
  });
}

/** Longest series of the same kind as the selected range. Minute charts only have the one session. */
export function historyPoints(ticker, range) {
  const history = ticker?.history || {};
  if (range === "1 Min" || range === "Tag") return usable(history.intraday);
  if (range === "5 Min") return bucketMinutes(usable(history.intraday), 5);
  if (range === "5J") return usable(history["5Y"]);
  if (range === "Max") return maxPoints(history);
  const year = usable(history["1Y"]);
  const half = usable(history["6M"]);
  return year.length >= half.length ? year : half;
}

function pricesOf(points) {
  return points.map((point) => Number(point.eur));
}

/** How far two prints can sit and still be the same level. Capped so a long trend does not glue unrelated prices. */
export function levelBand(values) {
  if (!values.length) return 0;
  const price = Math.abs(values.at(-1) || values[0] || 1);
  const span = Math.max(...values) - Math.min(...values);
  const fromSpan = span * 0.08;
  const floor = price * 0.003;
  const cap = price * 0.015;
  return Math.min(cap, Math.max(floor, fromSpan));
}

function swingRadius(length, spec) {
  if (Number.isFinite(spec.radius)) return spec.radius;
  if (length < 14) return 1;
  const scaled = Math.round(length * 0.012);
  return Math.min(10, Math.max(spec.swing || 2, scaled));
}

function touchGap(length, radius) {
  return Math.max(radius * 2, Math.round(length * 0.06));
}

function ols(values) {
  const count = values.length;
  if (count < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let index = 0; index < count; index += 1) {
    sumX += index;
    sumY += values[index];
    sumXY += index * values[index];
    sumXX += index * index;
  }
  const denom = count * sumXX - sumX * sumX;
  if (!denom) return null;
  const slope = (count * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / count;
  const mean = sumY / count;
  let total = 0;
  let residual = 0;
  for (let index = 0; index < count; index += 1) {
    const fitted = intercept + slope * index;
    total += (values[index] - mean) ** 2;
    residual += (values[index] - fitted) ** 2;
  }
  const r2 = total <= 1e-12 ? 1 : 1 - residual / total;
  return { slope, intercept, r2 };
}

function swingIndices(values, radius, side) {
  const found = [];
  for (let index = radius; index < values.length - radius; index += 1) {
    const price = values[index];
    let extreme = true;
    for (let neighbor = index - radius; neighbor <= index + radius; neighbor += 1) {
      if (neighbor === index) continue;
      if (side === "low" ? values[neighbor] < price : values[neighbor] > price) {
        extreme = false;
        break;
      }
    }
    if (!extreme) continue;
    const left = values[index - 1];
    const right = values[index + 1];
    if (side === "low" && price <= left && price <= right && (price < left || price < right)) found.push(index);
    if (side === "high" && price >= left && price >= right && (price > left || price > right)) found.push(index);
  }
  return found;
}

function clusterSwings(indices, values, tolerance, gap) {
  const items = indices
    .map((index) => ({ index, price: values[index] }))
    .sort((a, b) => a.price - b.price || a.index - b.index);
  const groups = [];
  for (const item of items) {
    const group = groups.at(-1);
    if (group && item.price - group.low <= tolerance) {
      group.items.push(item);
      group.low = Math.min(group.low, item.price);
      group.high = Math.max(group.high, item.price);
    } else {
      groups.push({ items: [item], low: item.price, high: item.price });
    }
  }
  const levels = [];
  for (const group of groups) {
    const sorted = [...group.items].sort((a, b) => a.index - b.index);
    const distinct = [];
    for (const item of sorted) {
      if (!distinct.length || item.index - distinct.at(-1).index >= gap) distinct.push(item);
    }
    if (distinct.length < 2) continue;
    const prices = distinct.map((item) => item.price).sort((a, b) => a - b);
    levels.push({
      level: prices[Math.floor((prices.length - 1) / 2)],
      touches: distinct.length,
      first: distinct[0].index,
      last: distinct.at(-1).index,
      indices: distinct.map((item) => item.index)
    });
  }
  return levels;
}

function pickLevel(levels, last, tolerance, side) {
  const candidates = levels.filter((level) => (
    side === "support" ? level.level <= last + tolerance * 0.35 : level.level >= last - tolerance * 0.35
  ));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (side === "support" ? b.level - a.level : a.level - b.level));
  return candidates[0];
}

function isDouble(cluster, values, span, side) {
  if (!cluster || cluster.touches < 2 || cluster.touches > 3) return false;
  const start = cluster.indices[0];
  const end = cluster.indices.at(-1);
  if (end - start < 3) return false;
  let extreme = values[start];
  for (let index = start; index <= end; index += 1) {
    extreme = side === "low" ? Math.max(extreme, values[index]) : Math.min(extreme, values[index]);
  }
  const away = side === "low" ? extreme - cluster.level : cluster.level - extreme;
  return away >= span * 0.22;
}

function brokeOut(values, cluster, tolerance, direction) {
  if (!cluster) return false;
  const last = values.at(-1);
  const beyond = direction === "up" ? last > cluster.level + tolerance : last < cluster.level - tolerance;
  if (!beyond || cluster.last > values.length * 0.85) return false;
  const early = values.slice(0, Math.floor(values.length * 0.7));
  return direction === "up"
    ? early.some((value) => value < cluster.level - tolerance * 0.25)
    : early.some((value) => value > cluster.level + tolerance * 0.25);
}

/**
 * Lines and pattern for one stretch of prices.
 * A line is kept only when the shape is visible: a trend needs a clear slope,
 * a level needs two separate touches.
 */
export function classifySeries(points, spec) {
  const values = pricesOf(points);
  const count = values.length;
  if (count < 6) return { id: "unklar", lines: [], support: null, resistance: null };
  const radius = swingRadius(count, spec);
  const tolerance = levelBand(values);
  const gap = touchGap(count, radius);
  const span = Math.max(...values) - Math.min(...values) || tolerance || 1;
  let support = pickLevel(clusterSwings(swingIndices(values, radius, "low"), values, tolerance, gap), values.at(-1), tolerance, "support");
  let resistance = pickLevel(clusterSwings(swingIndices(values, radius, "high"), values, tolerance, gap), values.at(-1), tolerance, "resistance");
  if (support && resistance && Math.abs(support.level - resistance.level) <= tolerance) {
    if (values.at(-1) >= resistance.level) resistance = null;
    else support = null;
  }
  const fit = ols(values);
  const move = fit ? Math.abs(fit.slope) * (count - 1) : 0;
  const trend = fit && fit.r2 >= 0.5 && move >= span * 0.35 ? (fit.slope > 0 ? "up" : "down") : null;
  const lines = [];
  if (trend) {
    lines.push({
      kind: "trend",
      dir: trend,
      i0: 0,
      i1: count - 1,
      eur0: fit.intercept,
      eur1: fit.intercept + fit.slope * (count - 1)
    });
  }
  if (support) {
    lines.push({ kind: "support", i0: 0, i1: count - 1, eur0: support.level, eur1: support.level, touches: support.touches });
  }
  if (resistance) {
    lines.push({ kind: "resistance", i0: 0, i1: count - 1, eur0: resistance.level, eur1: resistance.level, touches: resistance.touches });
  }
  let id = "unklar";
  if (brokeOut(values, resistance, tolerance, "up")) id = "ueber-deckel";
  else if (brokeOut(values, support, tolerance, "down")) id = "unter-stuetze";
  else if (trend === "up") id = "steigend";
  else if (trend === "down") id = "fallend";
  else if (isDouble(support, values, span, "low")) id = "doppelboden";
  else if (isDouble(resistance, values, span, "high")) id = "doppeltop";
  else if (support && resistance && resistance.level > support.level + tolerance) id = "band";
  return { id, lines, support, resistance };
}

function indexAfter(points, from, horizonMs) {
  const start = Date.parse(points[from].t);
  if (!Number.isFinite(start)) return -1;
  const target = start + horizonMs;
  const latest = start + horizonMs * 2.5;
  for (let index = from + 1; index < points.length; index += 1) {
    const time = Date.parse(points[index].t);
    if (!Number.isFinite(time) || time < target) continue;
    return time > latest ? -1 : index;
  }
  return -1;
}

function moveDir(from, to, flatPct) {
  const base = Number(from);
  if (!base) return "flat";
  const change = (Number(to) - base) / base;
  if (Math.abs(change) < flatPct) return "flat";
  return change > 0 ? "up" : "down";
}

function patternWindow(visibleLength, spec) {
  const wanted = spec.window || 21;
  if (visibleLength <= wanted + 6) return Math.max(6, visibleLength);
  return wanted;
}

/** Earlier stretches with the same pattern. Each case is the next close after the horizon, and cases do not share that window. */
export function countSimilar(points, patternId, window, spec) {
  const totals = { up: 0, down: 0, flat: 0 };
  if (!points || patternId === "unklar" || window < 6 || points.length < window + 2) return totals;
  let cursor = window - 1;
  while (cursor < points.length) {
    const slice = points.slice(cursor - window + 1, cursor + 1);
    if (classifySeries(slice, spec).id !== patternId) {
      cursor += 1;
      continue;
    }
    const future = indexAfter(points, cursor, spec.horizonMs);
    if (future < 0) {
      cursor += 1;
      continue;
    }
    totals[moveDir(points[cursor].eur, points[future].eur, spec.flatPct)] += 1;
    cursor = future;
  }
  return totals;
}

function firstMove(values, times, index, margin, horizonMs) {
  const start = times[index];
  if (!Number.isFinite(start) || !(margin > 0)) return null;
  const target = start + horizonMs;
  const latest = start + horizonMs * 2.5;
  for (let cursor = index + 1; cursor < values.length; cursor += 1) {
    const time = times[cursor];
    if (!Number.isFinite(time) || time > latest) return null;
    const delta = values[cursor] - values[index];
    if (delta >= margin) return "up";
    if (delta <= -margin) return "down";
    if (time >= target) return null;
  }
  return null;
}

function asTouch(side, outcome) {
  if (side === "low") return outcome === "up" ? "bounce" : "broke";
  return outcome === "down" ? "bounce" : "broke";
}

/**
 * Later visits to a recent low or high. The print that made the extreme is not a case.
 * Up and down need the same distance, so a tiny tick off the level is not counted as a bounce.
 */
export function countRetests(points, side, spec, nearPrice = null) {
  const values = pricesOf(points);
  const times = points.map((point) => Date.parse(point.t));
  const all = { bounce: 0, broke: 0 };
  const near = { bounce: 0, broke: 0 };
  const look = spec.touchLook || 12;
  const gap = spec.touchGap || 3;
  const marginPct = spec.touchMargin || 0.008;
  if (values.length < look + 4) return { all, near };
  const zoneTol = nearPrice == null ? null : Math.abs(nearPrice) * 0.012;
  let blockedUntil = 0;
  for (let index = look; index < values.length - 2; index += 1) {
    if (index < blockedUntil) continue;
    const window = values.slice(index - look, index - gap);
    if (window.length < 4) continue;
    const extreme = side === "low" ? Math.min(...window) : Math.max(...window);
    const span = Math.max(...window) - Math.min(...window);
    const tolerance = Math.max(Math.abs(extreme) * 0.0035, Math.min(Math.abs(extreme) * 0.01, span * 0.1 || 0));
    const price = values[index];
    const inZone = Math.abs(price - extreme) <= tolerance;
    const fromSafe = side === "low" ? values[index - 1] > extreme + tolerance : values[index - 1] < extreme - tolerance;
    if (!inZone || !fromSafe) continue;
    const margin = Math.max(Math.abs(price) * marginPct, tolerance);
    const outcome = firstMove(values, times, index, margin, spec.horizonMs);
    blockedUntil = index + Math.max(3, Math.round(gap / 2));
    if (!outcome) continue;
    const bucket = asTouch(side, outcome);
    all[bucket] += 1;
    if (zoneTol != null && Math.abs(extreme - nearPrice) <= zoneTol) near[bucket] += 1;
  }
  if (nearPrice != null) {
    const zone = countZoneTouches(points, nearPrice, side, spec);
    if (zone.bounce + zone.broke > near.bounce + near.broke) return { all, near: zone };
  }
  return { all, near };
}

/** Visits to one drawn price, approached from the held side. */
function countZoneTouches(points, level, side, spec) {
  const values = pricesOf(points);
  const times = points.map((point) => Date.parse(point.t));
  const totals = { bounce: 0, broke: 0 };
  const tolerance = Math.abs(level) * 0.012;
  const margin = Math.max(Math.abs(level) * (spec.touchMargin || 0.008), tolerance);
  const gap = spec.touchGap || 3;
  let blockedUntil = 0;
  for (let index = 1; index < values.length - 2; index += 1) {
    if (index < blockedUntil) continue;
    const price = values[index];
    const previous = values[index - 1];
    if (Math.abs(price - level) > tolerance) continue;
    const fromSafe = side === "low" ? previous > level + tolerance : previous < level - tolerance;
    if (!fromSafe) continue;
    const outcome = firstMove(values, times, index, margin, spec.horizonMs);
    blockedUntil = index + Math.max(3, gap);
    if (!outcome) continue;
    totals[asTouch(side, outcome)] += 1;
  }
  return totals;
}

/** Pullbacks to a rising or falling line. Points that already sit on the fitted line are not counted. */
export function countLineTouches(points, direction, spec) {
  const totals = { bounce: 0, broke: 0 };
  const values = pricesOf(points);
  const times = points.map((point) => Date.parse(point.t));
  const window = Math.max(6, spec.window || 21);
  if (values.length < window + 4) return totals;
  const look = Math.max(3, Math.round(window / 5));
  let nextFrom = window;
  for (let index = window; index < values.length - 1; index += 1) {
    if (index < nextFrom) continue;
    const slice = values.slice(index - window, index);
    const fit = ols(slice);
    if (!fit) continue;
    const span = Math.max(...slice) - Math.min(...slice) || 1;
    const move = Math.abs(fit.slope) * (slice.length - 1);
    if (fit.r2 < 0.5 || move < span * 0.35) continue;
    if (direction === "up" && fit.slope <= 0) continue;
    if (direction === "down" && fit.slope >= 0) continue;
    const projected = fit.intercept + fit.slope * slice.length;
    const previousLine = fit.intercept + fit.slope * (slice.length - 1);
    const tolerance = levelBand(slice);
    if (Math.abs(values[index] - projected) > tolerance) continue;
    if (direction === "up" && values[index - 1] < previousLine - tolerance) continue;
    if (direction === "down" && values[index - 1] > previousLine + tolerance) continue;
    const prior = slice.slice(-look);
    const away = direction === "up"
      ? Math.max(...prior) > projected + tolerance
      : Math.min(...prior) < projected - tolerance;
    if (!away) continue;
    const margin = Math.max(Math.abs(values[index]) * (spec.touchMargin || 0.008), tolerance);
    const outcome = firstMove(values, times, index, margin, spec.horizonMs);
    if (!outcome) continue;
    totals[asTouch(direction === "up" ? "low" : "high", outcome)] += 1;
    nextFrom = index + look;
  }
  return totals;
}

export function splitPercent(counts) {
  const entries = Object.entries(counts).filter((entry) => entry[1] > 0);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  if (!total) return {};
  const rows = entries.map(([key, count]) => {
    const exact = (count / total) * 100;
    return { key, count, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = 100 - rows.reduce((sum, row) => sum + row.floor, 0);
  rows.sort((a, b) => b.rest - a.rest || b.count - a.count);
  for (const row of rows) {
    if (left <= 0) break;
    row.floor += 1;
    left -= 1;
  }
  return Object.fromEntries(rows.map((row) => [row.key, row.floor]));
}

function packShare(counts) {
  const n = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const show = n >= MIN_CASES;
  return { ...counts, n, show, pct: show ? splitPercent(counts) : null };
}

function percent(pack, key) {
  return pack.pct?.[key] ?? 0;
}

function outcomeCopy(patternId, pack, detail) {
  if (patternId === "unklar") return { sentence: "Keine klare Form. Deshalb keine Prozentzahl.", detail: "" };
  if (!pack?.show) {
    return {
      sentence: `Nach diesem Muster zu wenig gleiche Stellen (n = ${pack?.n || 0}). Keine Prozentzahl.`,
      detail: ""
    };
  }
  const flat = percent(pack, "flat");
  const flatText = flat ? `, in ${flat} % unverändert` : "";
  return {
    sentence: `Nach diesem Muster ging es in ${percent(pack, "up")} % der Fälle hoch, in ${percent(pack, "down")} % runter${flatText} (n = ${pack.n}).`,
    detail
  };
}

function levelCopy(pack, scope) {
  if (!pack.show) return "Zu wenig ähnliche Berührungen (n = " + pack.n + "). Keine Prozentzahl.";
  const lead = scope === "zone" ? "In dieser Preiszone" : "Bei ähnlichen Berührungen";
  return `${lead}: ${percent(pack, "bounce")} % abgeprallt · ${percent(pack, "broke")} % durchbrochen (n = ${pack.n}).`;
}

function chooseTouch(stats) {
  const near = packShare(stats.near);
  const all = packShare(stats.all);
  if (near.show) return { ...near, scope: "zone" };
  if (all.show) return { ...all, scope: "similar" };
  const thin = near.n >= all.n ? near : all;
  return { ...thin, scope: near.n >= all.n ? "zone" : "similar" };
}

function detailFor(range, usedWindow, visibleLength, spec) {
  let where = "in der Tagesreihe";
  const shorter = usedWindow + 2 < visibleLength;
  if (range === "1 Min" || range === "5 Min") where = shorter ? "ähnliche Stücke in dieser Minutenreihe" : "in dieser Minutenreihe";
  else if (range === "1W") where = "ähnliche Wochen in der Tagesreihe";
  else if (range === "1M") where = "ähnliche Monate in der Tagesreihe";
  else if (range === "5J") where = shorter ? "ähnliche Stücke in der Wochenreihe" : "in der Wochenreihe";
  else if (range === "Max") where = "ähnliche Stücke in der langen Reihe";
  else if (shorter) where = "ähnliche Abschnitte in der Tagesreihe";
  const after = spec.after.charAt(0).toUpperCase() + spec.after.slice(1);
  return `${after}, ${where}.`;
}

function emptyAnalysis(sentence) {
  return {
    title: "Keine klare Form",
    patternId: "unklar",
    lines: [],
    legend: [],
    outcome: { show: false, n: 0, sentence, detail: "" },
    levels: []
  };
}

export function analyzePoints(visible, history, spec, range) {
  const points = usable(visible);
  if (points.length < 6) return emptyAnalysis("Zu wenig Punkte für eine Linie. Keine Prozentzahl.");
  const found = classifySeries(points, spec);
  const past = usable(history);
  const source = past.length >= points.length ? past : points;
  const window = patternWindow(points.length, spec);
  const share = found.id === "unklar" ? null : packShare(countSimilar(source, found.id, window, spec));
  const detail = detailFor(range, window, points.length, spec);
  const outcome = outcomeCopy(found.id, share, detail);
  const levels = [];
  const trend = found.lines.find((line) => line.kind === "trend");
  const support = found.lines.find((line) => line.kind === "support");
  const resistance = found.lines.find((line) => line.kind === "resistance");
  if (support) {
    const touch = chooseTouch(countRetests(source, "low", spec, support.eur0));
    levels.push({
      kind: "support",
      title: "Nächste Stütze",
      kicker: "Wenn der Kurs sie erreicht",
      eur: support.eur0,
      ...touch,
      sentence: levelCopy(touch, touch.scope)
    });
  }
  if (resistance) {
    const touch = chooseTouch(countRetests(source, "high", spec, resistance.eur0));
    levels.push({
      kind: "resistance",
      title: "Nächster Deckel",
      kicker: "Wenn der Kurs ihn erreicht",
      eur: resistance.eur0,
      ...touch,
      sentence: levelCopy(touch, touch.scope)
    });
  }
  if (trend) {
    const touch = { ...packShare(countLineTouches(source, trend.dir, spec)), scope: "similar" };
    levels.push({
      kind: "trend",
      title: "An der Linie",
      kicker: "Wenn der Kurs die Linie erreicht",
      eur: null,
      ...touch,
      sentence: levelCopy(touch, "similar")
    });
  }
  const legend = [];
  if (trend) legend.push({ kind: "trend", label: "Linie" });
  if (support) legend.push({ kind: "support", label: "Stütze" });
  if (resistance) legend.push({ kind: "resistance", label: "Deckel" });
  return {
    title: TITLES[found.id] || TITLES.unklar,
    patternId: found.id,
    lines: found.lines,
    legend,
    outcome: { ...outcome, show: Boolean(share?.show), n: share?.n || 0, up: share?.up || 0, down: share?.down || 0, flat: share?.flat || 0, pct: share?.pct || null },
    levels
  };
}

export function chartAnalysis(ticker, range) {
  const { points, range: shown } = seriesFor(ticker, range);
  const spec = SPEC[shown] || SPEC["1M"];
  return analyzePoints(points, historyPoints(ticker, shown), spec, shown);
}

export function analysisText(result) {
  if (!result) return "";
  return [
    result.title,
    result.outcome?.sentence,
    result.outcome?.detail,
    ...(result.levels || []).flatMap((level) => [level.title, level.kicker, level.sentence]),
    ...(result.legend || []).map((item) => item.label)
  ].filter(Boolean).join("\n");
}
