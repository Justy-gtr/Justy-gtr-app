import { MIN_CASES, N_LEGEND, analyzePoints, countRetests, splitPercent } from "./analysis.js";
import { candlesFor, rangeLabel } from "./candles.js";
import { formatEUR, guideStyle, maxPoints } from "./logic.js";

const DAY = 86400000;

const SPEC = {
  "5 Min": { window: 16, horizonMs: 30 * 60 * 1000, flatPct: 0.0004, after: "30 Minuten später", touchLook: 10, touchGap: 3, touchMargin: 0.002 },
  "15 Min": { window: 12, horizonMs: 60 * 60 * 1000, flatPct: 0.0006, after: "eine Stunde später", touchLook: 8, touchGap: 2, touchMargin: 0.0025 },
  "4 Std": { window: 24, horizonMs: DAY, flatPct: 0.001, after: "ein Tag später", touchLook: 10, touchGap: 3, touchMargin: 0.006 },
  "1T": { window: 6, horizonMs: DAY, flatPct: 0.0015, after: "ein Tag später", touchLook: 4, touchGap: 1, touchMargin: 0.008 },
  "3T": { window: 6, horizonMs: 3 * DAY, flatPct: 0.0015, after: "drei Tage später", touchLook: 4, touchGap: 1, touchMargin: 0.008 },
  "1W": { window: 7, horizonMs: 7 * DAY, flatPct: 0.0015, after: "eine Woche später", touchLook: 8, touchGap: 2, touchMargin: 0.01 },
  "1M": { window: 21, horizonMs: 7 * DAY, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "6M": { window: 21, horizonMs: 7 * DAY, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "1J": { window: 21, horizonMs: 7 * DAY, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.008 },
  "Max": { window: 21, horizonMs: 7 * DAY, flatPct: 0.0015, after: "eine Woche später", touchLook: 12, touchGap: 3, touchMargin: 0.01 }
};

const TITLES = {
  steigend: "Steigende Linie",
  fallend: "Fallende Linie",
  doppelboden: "Doppelter Boden",
  doppeltop: "Doppeltes Hoch",
  "ueber-deckel": "Über dem Widerstand",
  "unter-stuetze": "Unter der Stütze",
  band: "Zwischen Stütze und Widerstand",
  unklar: "Keine klare Form",
  "kopf-schulter": "Kopf-Schulter",
  "inverse-kopf-schulter": "Umgekehrte Kopf-Schulter",
  dreieck: "Dreieck",
  flagge: "Flagge",
  hammer: "Hammer",
  sternschnuppe: "Sternschnuppe",
  "umfassend-hoch": "Umfassende Aufwärtskerze",
  "umfassend-runter": "Umfassende Abwärtskerze"
};

/** Closes examined after a touch. The same distance counts as a bounce or a break. */
export const BOUNCE_LOOK = 6;

/** One line under the level rows. Direction is part of the sentence, not a footnote. */
export const BOUNCE_PLAIN = "Abgeprallt: Kurs dreht an der Linie um. Durchgebrochen: Kurs geht durch die Linie – an der Stütze nach unten, am Widerstand nach oben.";

/** Legend under the chart, after the ×. */
export const BREAK_LEGEND = "durchgebrochen (Stütze nach unten, Widerstand nach oben)";

/** Finished touches below this still show the counts, with a short note. */
export const BOUNCE_FEW = 5;

export { N_LEGEND };

function closes(candles) {
  return (candles || []).map((candle) => ({ t: candle.t, eur: candle.close }));
}

function swings(candles, radius, side) {
  const values = candles.map((candle) => (side === "high" ? candle.high : candle.low));
  const found = [];
  for (let index = radius; index < values.length - radius; index += 1) {
    const price = values[index];
    let extreme = true;
    for (let neighbor = index - radius; neighbor <= index + radius; neighbor += 1) {
      if (neighbor === index) continue;
      if (side === "high" ? values[neighbor] > price : values[neighbor] < price) {
        extreme = false;
        break;
      }
    }
    if (!extreme) continue;
    const left = values[index - 1];
    const right = values[index + 1];
    if (side === "high" && price >= left && price >= right && (price > left || price > right)) found.push(index);
    if (side === "low" && price <= left && price <= right && (price < left || price < right)) found.push(index);
  }
  return found;
}

function headAndShoulders(candles, inverse) {
  if (candles.length < 16) return null;
  const radius = candles.length < 30 ? 2 : 3;
  const peaks = swings(candles, radius, inverse ? "low" : "high").slice(-12);
  if (peaks.length < 3) return null;
  const priceOf = (index) => (inverse ? candles[index].low : candles[index].high);
  let best = null;
  for (let left = 0; left < peaks.length - 2; left += 1) {
    for (let head = left + 1; head < peaks.length - 1; head += 1) {
      for (let right = head + 1; right < peaks.length; right += 1) {
        const L = peaks[left];
        const H = peaks[head];
        const R = peaks[right];
        if (R < candles.length * 0.5 || candles.length - 1 - R < 1) continue;
        if (R - L < 8) continue;
        const lp = priceOf(L);
        const hp = priceOf(H);
        const rp = priceOf(R);
        const prominence = inverse ? Math.min(lp, rp) - hp : hp - Math.max(lp, rp);
        if (!(prominence > 0) || prominence < Math.abs(hp) * 0.012) continue;
        if (Math.abs(lp - rp) > prominence * 0.55) continue;
        const neck = troughBetween(candles, L, H, R, inverse);
        if (!neck) continue;
        const dropLeft = inverse ? neck.v1 - lp : lp - neck.v1;
        const dropRight = inverse ? neck.v2 - rp : rp - neck.v2;
        if (dropLeft < prominence * 0.25 || dropRight < prominence * 0.25) continue;
        const score = prominence / Math.abs(hp);
        if (!best || score > best.score) best = { L, H, R, ...neck, score };
      }
    }
  }
  if (!best) return null;
  const neck = round2((best.v1 + best.v2) / 2);
  return {
    id: inverse ? "inverse-kopf-schulter" : "kopf-schulter",
    lines: [
      { kind: "pattern", i0: best.L, i1: best.H, eur0: priceOf(best.L), eur1: priceOf(best.H) },
      { kind: "pattern", i0: best.H, i1: best.R, eur0: priceOf(best.H), eur1: priceOf(best.R) },
      { kind: "pattern", i0: best.n1, i1: best.n2, eur0: best.v1, eur1: best.v2 }
    ],
    levels: [{ kind: "pattern", title: "Nackenlinie", eur: neck, side: inverse ? "high" : "low" }],
    legend: "Nackenlinie"
  };
}

function troughBetween(candles, left, head, right, inverse) {
  const pick = (from, to) => {
    let index = -1;
    let value = inverse ? -Infinity : Infinity;
    for (let cursor = from + 1; cursor < to; cursor += 1) {
      const next = inverse ? candles[cursor].high : candles[cursor].low;
      if (inverse ? next > value : next < value) {
        value = next;
        index = cursor;
      }
    }
    return index < 0 ? null : { index, value };
  };
  const first = pick(left, head);
  const second = pick(head, right);
  if (!first || !second) return null;
  return { n1: first.index, n2: second.index, v1: first.value, v2: second.value };
}

function triangle(candles) {
  if (candles.length < 16) return null;
  const start = Math.floor(candles.length * 0.2);
  const highs = swings(candles, 2, "high").filter((index) => index >= start);
  const lows = swings(candles, 2, "low").filter((index) => index >= start);
  if (highs.length < 2 || lows.length < 2) return null;
  const h1 = highs[0];
  const h2 = highs.at(-1);
  const l1 = lows[0];
  const l2 = lows.at(-1);
  if (h2 - h1 < 6 || l2 - l1 < 6) return null;
  const highSlope = (candles[h2].high - candles[h1].high) / (h2 - h1);
  const lowSlope = (candles[l2].low - candles[l1].low) / (l2 - l1);
  const price = Math.abs(candles.at(-1).close) || 1;
  if (highSlope > price * 0.0008 || lowSlope < -price * 0.0008) return null;
  if (highSlope >= -price * 0.0003 && lowSlope <= price * 0.0003) return null;
  const top = (index) => lineAt(h1, candles[h1].high, h2, candles[h2].high, index);
  const bot = (index) => lineAt(l1, candles[l1].low, l2, candles[l2].low, index);
  const left = Math.min(h1, l1);
  const right = Math.max(h2, l2);
  const gapLeft = top(left) - bot(left);
  const gapRight = top(right) - bot(right);
  if (!(gapLeft > gapRight * 1.25) || gapRight <= 0 || gapLeft < price * 0.015) return null;
  let inside = 0;
  let total = 0;
  for (let index = left; index <= right; index += 1) {
    total += 1;
    if (candles[index].close <= top(index) * 1.005 && candles[index].close >= bot(index) * 0.995) inside += 1;
  }
  if (!total || inside / total < 0.8) return null;
  return {
    id: "dreieck",
    lines: [
      { kind: "pattern", i0: h1, i1: h2, eur0: candles[h1].high, eur1: candles[h2].high },
      { kind: "pattern", i0: l1, i1: l2, eur0: candles[l1].low, eur1: candles[l2].low }
    ],
    levels: [
      { kind: "pattern", title: "Obere Linie", eur: round2(candles[h2].high), side: "high" },
      { kind: "pattern", title: "Untere Linie", eur: round2(candles[l2].low), side: "low" }
    ],
    legend: "Dreieck"
  };
}

function lineAt(i0, p0, i1, p1, index) {
  if (i1 === i0) return p0;
  return p0 + ((p1 - p0) * (index - i0)) / (i1 - i0);
}

function flag(candles) {
  if (candles.length < 14) return null;
  const end = candles.length - 1;
  for (let poleLen = 12; poleLen >= 5; poleLen -= 1) {
    for (let flagLen = 4; flagLen <= 8; flagLen += 1) {
      const flagStart = end - flagLen + 1;
      const poleStart = flagStart - poleLen;
      if (poleStart < 1) continue;
      const poleMove = candles[flagStart].close - candles[poleStart].close;
      const poleAbs = Math.abs(poleMove);
      const price = Math.abs(candles[flagStart].close) || 1;
      if (poleAbs < price * 0.025) continue;
      let withTrend = 0;
      for (let index = poleStart + 1; index <= flagStart; index += 1) {
        const step = candles[index].close - candles[index - 1].close;
        if (poleMove > 0 ? step >= 0 : step <= 0) withTrend += 1;
      }
      if (withTrend / poleLen < 0.7) continue;
      let flagHigh = -Infinity;
      let flagLow = Infinity;
      for (let index = flagStart; index <= end; index += 1) {
        flagHigh = Math.max(flagHigh, candles[index].high);
        flagLow = Math.min(flagLow, candles[index].low);
      }
      const flagHeight = flagHigh - flagLow;
      if (!(flagHeight > 0) || flagHeight > poleAbs * 0.4) continue;
      const flagMove = candles[end].close - candles[flagStart].close;
      if (Math.abs(flagMove) > poleAbs * 0.35) continue;
      if (poleMove > 0 && flagMove > poleAbs * 0.08) continue;
      if (poleMove < 0 && flagMove < -poleAbs * 0.08) continue;
      return {
        id: "flagge",
        lines: [
          { kind: "pattern", i0: poleStart, i1: flagStart, eur0: candles[poleStart].close, eur1: candles[flagStart].close },
          { kind: "pattern", i0: flagStart, i1: end, eur0: flagHigh, eur1: flagHigh },
          { kind: "pattern", i0: flagStart, i1: end, eur0: flagLow, eur1: flagLow }
        ],
        levels: [
          { kind: "pattern", title: "Flagge oben", eur: round2(flagHigh), side: "high" },
          { kind: "pattern", title: "Flagge unten", eur: round2(flagLow), side: "low" }
        ],
        legend: "Flagge"
      };
    }
  }
  return null;
}

function namedCandle(candles) {
  if (candles.length < 6) return null;
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const span = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  if (!(span > 0)) return null;
  const upper = last.high - Math.max(last.open, last.close);
  const lower = Math.min(last.open, last.close) - last.low;
  const prior = candles.at(-6).close;
  const index = candles.length - 1;
  if (last.close < prior * 0.995 && body > 0 && lower >= body * 2 && upper <= body && lower >= span * 0.6) {
    return { id: "hammer", index };
  }
  if (last.close > prior * 1.005 && body > 0 && upper >= body * 2 && lower <= body && upper >= span * 0.6) {
    return { id: "sternschnuppe", index };
  }
  const prevBody = Math.abs(prev.close - prev.open);
  if (!(prevBody > 0) || !(body >= prevBody)) return null;
  if (prev.close < prev.open && last.close > last.open && last.open <= prev.close && last.close >= prev.open) {
    return { id: "umfassend-hoch", index };
  }
  if (prev.close > prev.open && last.close < last.open && last.open >= prev.close && last.close <= prev.open) {
    return { id: "umfassend-runter", index };
  }
  return null;
}

/** A classic shape only when the swings are actually in this stretch. */
export function detectShape(candles) {
  return headAndShoulders(candles, false)
    || headAndShoulders(candles, true)
    || triangle(candles)
    || flag(candles)
    || null;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function pack(counts) {
  const n = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const show = n >= MIN_CASES;
  return { n, show, pct: show ? splitPercent(counts) : null, ...counts };
}

function percent(packShare, key) {
  return packShare.pct?.[key] || 0;
}

function outcomeCopy(patternId, share, detail) {
  if (patternId === "unklar") return { sentence: "Keine klare Form. Deshalb keine Prozentzahl.", detail: "" };
  if (!share?.show) {
    return {
      sentence: `Nach diesem Muster zu wenig gleiche Stellen (n = ${share?.n || 0}). Keine Prozentzahl.`,
      detail: ""
    };
  }
  const flat = percent(share, "flat");
  const flatText = flat ? `, in ${flat} % unverändert` : "";
  return {
    sentence: `Nach diesem Muster ging es in ${percent(share, "up")} % der Fälle hoch, in ${percent(share, "down")} % runter${flatText} (n = ${share.n}).`,
    detail
  };
}

function levelSentence(share) {
  if (!share.show) return `Zu wenig ähnliche Berührungen (n = ${share.n}). Keine Prozentzahl.`;
  const lead = share.scope === "zone" ? "In dieser Preiszone" : "Bei ähnlichen Berührungen";
  return `${lead}: ${percent(share, "bounce")} % abgeprallt · ${percent(share, "broke")} % durchbrochen (n = ${share.n}).`;
}

function chooseTouch(stats) {
  const near = pack(stats.near);
  const all = pack(stats.all);
  if (near.show) return { ...near, scope: "zone" };
  if (all.show) return { ...all, scope: "similar" };
  const thin = near.n >= all.n ? near : all;
  return { ...thin, scope: near.n >= all.n ? "zone" : "similar" };
}

function indexAfter(candles, from, horizonMs) {
  const start = Date.parse(candles[from].t);
  if (!Number.isFinite(start)) return -1;
  const target = start + horizonMs;
  const latest = start + horizonMs * 2.5;
  for (let index = from + 1; index < candles.length; index += 1) {
    const time = Date.parse(candles[index].t);
    if (!Number.isFinite(time) || time < target) continue;
    return time > latest ? -1 : index;
  }
  return -1;
}

function moveDir(from, to, flatPct) {
  if (!from) return "flat";
  const change = (to - from) / from;
  if (Math.abs(change) < flatPct) return "flat";
  return change > 0 ? "up" : "down";
}

function countNamed(candles, id, spec) {
  const totals = { up: 0, down: 0, flat: 0 };
  let cursor = 5;
  while (cursor < candles.length - 1) {
    const found = namedCandle(candles.slice(Math.max(0, cursor - 5), cursor + 1));
    if (!found || found.id !== id) {
      cursor += 1;
      continue;
    }
    const future = indexAfter(candles, cursor, spec.horizonMs);
    if (future < 0) {
      cursor += 1;
      continue;
    }
    totals[moveDir(candles[cursor].close, candles[future].close, spec.flatPct)] += 1;
    cursor = Math.max(future, cursor + 3);
  }
  return totals;
}

function countClassic(candles, id, spec) {
  const totals = { up: 0, down: 0, flat: 0 };
  const window = Math.max(16, spec.window || 24);
  if (!candles || candles.length < window + 2) return totals;
  let cursor = window - 1;
  while (cursor < candles.length) {
    const found = detectShape(candles.slice(cursor - window + 1, cursor + 1));
    if (!found || found.id !== id) {
      cursor += 1;
      continue;
    }
    const future = indexAfter(candles, cursor, spec.horizonMs);
    if (future < 0) {
      cursor += 1;
      continue;
    }
    totals[moveDir(candles[cursor].close, candles[future].close, spec.flatPct)] += 1;
    cursor = future;
  }
  return totals;
}

function detailFor(range, spec) {
  const where = {
    "5 Min": "in dieser Minutenreihe",
    "15 Min": "in dieser Minutenreihe",
    "4 Std": "in der 4-Stunden-Reihe",
    "1T": "in dieser Minutenreihe",
    "3T": "in dieser Minutenreihe",
    "Max": "in der langen Reihe"
  }[range] || "in der Tagesreihe";
  const after = spec.after.charAt(0).toUpperCase() + spec.after.slice(1);
  return `${after}, ${where}.`;
}

function emptyResult(sentence, extra = {}) {
  return {
    title: "Keine klare Form",
    patternId: "unklar",
    lines: [],
    legend: [],
    outcome: { show: false, n: 0, sentence, detail: "" },
    levels: [],
    ...extra
  };
}

function withPrice(level) {
  if (level.eur == null) return level;
  return { ...level, kicker: `Wenn der Kurs ${formatEUR(level.eur)} erreicht` };
}

function averageTrueRange(candles) {
  if (!candles?.length) return 0;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < candles.length; index += 1) {
    const high = Number(candles[index].high);
    const low = Number(candles[index].low);
    const previous = index ? Number(candles[index - 1].close ?? candles[index - 1].eur) : high;
    if (![high, low, previous].every(Number.isFinite)) continue;
    sum += Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous));
    count += 1;
  }
  return count ? sum / count : 0;
}

function closeOf(candle) {
  const close = Number(candle?.close ?? candle?.eur);
  return Number.isFinite(close) ? close : null;
}

function heldSide(side) {
  return side === "high" || side === "resistance" ? "high" : "low";
}

/**
 * One visit to the drawn level.
 * A candle touches when its range meets the band (about 0.3 % of the price,
 * widened by a quarter of the average true range, and never more than 0.8 %).
 * Candles that sit in the band one after another are a single touch.
 * The visit counts only when the previous close was on the held side.
 * Bounce and break use the same larger distance (twice the band). The first
 * such close, during the touch or within `look` candles after it, decides.
 * Anything else stays open and is not counted.
 */
export function countLevelBounces(candles, level, side, options = {}) {
  const series = candles || [];
  const price = Number(level);
  const look = options.look || BOUNCE_LOOK;
  const atr = averageTrueRange(series);
  const floor = Math.abs(price) * (options.tolPct ?? 0.003);
  const cap = Math.abs(price) * (options.tolCap ?? 0.008);
  const tolerance = Math.min(cap, Math.max(floor, atr * (options.atrFrac ?? 0.25)));
  const amount = tolerance * 2;
  const empty = { bounce: 0, broke: 0, open: 0, n: 0, tolerance, amount, look, touches: [] };
  if (!Number.isFinite(price) || !(tolerance > 0) || series.length < 2) return empty;
  const held = heldSide(side);
  let bounce = 0;
  let broke = 0;
  let open = 0;
  const touches = [];
  let index = 0;
  while (index < series.length) {
    if (!candleMeets(series[index], price, tolerance)) {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < series.length && candleMeets(series[end + 1], price, tolerance)) end += 1;
    const previous = index > 0 ? closeOf(series[index - 1]) : null;
    const fromHeld = previous != null && (held === "low" ? previous > price + tolerance : previous < price - tolerance);
    if (fromHeld) {
      const outcome = reactionOf(series, index, end, price, held, amount, look);
      touches.push({ index, outcome });
      if (outcome === "bounce") bounce += 1;
      else if (outcome === "broke") broke += 1;
      else open += 1;
    }
    index = end + 1;
  }
  return { bounce, broke, open, n: bounce + broke, tolerance, amount, look, touches };
}

function candleMeets(candle, level, tolerance) {
  const high = Number(candle?.high ?? candle?.close ?? candle?.eur);
  const low = Number(candle?.low ?? candle?.close ?? candle?.eur);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return false;
  return low <= level + tolerance && high >= level - tolerance;
}

function reactionOf(series, start, end, level, side, amount, look) {
  const last = Math.min(series.length - 1, end + look);
  for (let cursor = start; cursor <= last; cursor += 1) {
    const close = closeOf(series[cursor]);
    if (close == null) continue;
    if (side === "low") {
      if (close >= level + amount) return "bounce";
      if (close <= level - amount) return "broke";
    } else if (close <= level - amount) return "bounce";
    else if (close >= level + amount) return "broke";
  }
  return "open";
}

function seriesName(range) {
  return {
    "5 Min": "5-Minuten-Reihe",
    "15 Min": "15-Minuten-Reihe",
    "4 Std": "4-Stunden-Reihe",
    "1T": "Tagesreihe",
    "3T": "Reihe der drei Handelstage",
    "1W": "Wochenreihe",
    "1M": "Monatsreihe",
    "6M": "Reihe der sechs Monate",
    "1J": "Jahresreihe",
    "Max": "lange Reihe"
  }[range] || "geladene Reihe";
}

/** Plain description of one level's finished touches. Counts stay visible below five cases. */
export function describeLevelBounces(stats, side, range) {
  const heldHigh = heldSide(side) === "high";
  const n = stats?.n || 0;
  const bounce = stats?.bounce || 0;
  const broke = stats?.broke || 0;
  const look = stats?.look || BOUNCE_LOOK;
  const few = n < BOUNCE_FEW ? " Wenige Fälle." : "";
  const back = heldHigh ? "deutlich unter der Linie" : "deutlich über der Linie";
  const through = heldHigh ? "deutlich über ihr" : "deutlich unter ihr";
  const detail = `Berührung: der Kurs kommt der Linie bis auf etwa 0,3 % nahe, bei großen Kerzen etwas mehr. Kerzen direkt nacheinander zählen als eine. Abgeprallt: innerhalb von ${look} Kerzen nach der Berührung liegt der Schluss wieder ${back}. Durchgebrochen: der Schluss liegt ${through}. Beides zählt gleich weit. ${seriesName(range)}.`;
  if (!n) return { sentence: `Keine abgeschlossene Berührung (n = 0).${few}`, detail };
  const lead = heldHigh ? "Abgeprallt nach unten" : "Abgeprallt";
  const brokeWord = heldHigh ? "durchgebrochen nach oben" : "durchgebrochen nach unten";
  const cases = n === 1 ? "1 Fall" : `${n} Fällen`;
  return {
    sentence: `${lead} in ${bounce} von ${cases} · ${brokeWord} ${broke} (n = ${n}).${few}`,
    detail
  };
}

/**
 * Caption beside a drawn horizontal line.
 * One line: "Widerstand 126,95 € · 3/3".
 * Several of the same kind: "Widerstand 1 126,95 € · 3/3".
 */
export function levelMarkLabel(kind, stats) {
  const name = guideStyle(kind)?.label || "";
  if (kind !== "support" && kind !== "resistance") return "";
  const total = Number(stats?.levelTotal) || 1;
  const index = Number(stats?.levelIndex) || 0;
  const title = total > 1 && index > 0 ? `${name} ${index}` : name;
  const raw = stats?.eur ?? stats?.eur0;
  const price = raw == null || !Number.isFinite(Number(raw)) ? "" : formatEUR(raw);
  const n = Number(stats?.n) || 0;
  const bounce = Number(stats?.bounce) || 0;
  if (!price && n <= 0) return title;
  if (!price) return `${title} ${bounce}/${n}`;
  if (n <= 0) return `${title} ${price}`;
  return `${title} ${price} · ${bounce}/${n}`;
}

/**
 * Number support and resistance the same way on the chart and in the card.
 * The card order is 1, 2, … and the line with the same price gets that number.
 */
export function numberLevelMarks(lines, levels) {
  const kinds = ["support", "resistance"];
  const levelCount = { support: 0, resistance: 0 };
  const lineCount = { support: 0, resistance: 0 };
  for (const level of levels || []) {
    if (levelCount[level?.kind] != null) levelCount[level.kind] += 1;
  }
  for (const line of lines || []) {
    if (lineCount[line?.kind] != null) lineCount[line.kind] += 1;
  }
  const totalOf = (kind) => Math.max(levelCount[kind] || 0, lineCount[kind] || 0);
  const seen = { support: 0, resistance: 0 };
  const nextLevels = (levels || []).map((level) => {
    if (!kinds.includes(level?.kind)) return level;
    seen[level.kind] += 1;
    const levelIndex = seen[level.kind];
    const levelTotal = totalOf(level.kind);
    const base = { ...level, levelIndex, levelTotal };
    if (levelTotal < 2) return base;
    const name = guideStyle(level.kind)?.label || level.title;
    return { ...base, title: `${name} ${levelIndex}` };
  });
  const pools = {
    support: nextLevels.filter((level) => level.kind === "support"),
    resistance: nextLevels.filter((level) => level.kind === "resistance")
  };
  const used = new Set();
  const taken = { support: new Set(), resistance: new Set() };
  const claim = (kind, preferred) => {
    const total = totalOf(kind);
    if (preferred > 0 && preferred <= total && !taken[kind].has(preferred)) {
      taken[kind].add(preferred);
      return preferred;
    }
    for (let index = 1; index <= Math.max(total, 1); index += 1) {
      if (!taken[kind].has(index)) {
        taken[kind].add(index);
        return index;
      }
    }
    return preferred || 1;
  };
  const nextLines = (lines || []).map((line) => {
    if (!kinds.includes(line?.kind)) return line;
    const pool = pools[line.kind];
    let match = null;
    let best = Infinity;
    for (const level of pool) {
      if (used.has(level)) continue;
      const lineEur = Number(line.eur ?? line.eur0);
      const levelEur = Number(level.eur);
      const diff = Number.isFinite(lineEur) && Number.isFinite(levelEur) ? Math.abs(lineEur - levelEur) : 0;
      if (diff < best) {
        best = diff;
        match = level;
      }
    }
    if (match) used.add(match);
    const levelTotal = totalOf(line.kind);
    const levelIndex = claim(line.kind, match?.levelIndex || 0);
    return {
      ...line,
      eur: match?.eur ?? line.eur ?? line.eur0,
      levelIndex,
      levelTotal
    };
  });
  return { lines: nextLines, levels: nextLevels };
}

function annotateBounce(level, candles, range) {
  if (!level || (level.kind !== "support" && level.kind !== "resistance") || level.eur == null) return level;
  const side = level.kind === "resistance" ? "high" : "low";
  const stats = countLevelBounces(candles, level.eur, side);
  const copy = describeLevelBounces(stats, side, range);
  return { ...level, bounce: stats, bounceSentence: copy.sentence, bounceDetail: copy.detail };
}

function withBounces(levels, candles, range) {
  return (levels || []).map((level) => annotateBounce(level, candles, range));
}

function pairLevels(lines, levels) {
  return numberLevelMarks(stampTouches(lines, levels), levels);
}

/** Same touch list as the sentence, indexed into the candles on the chart. */
function stampTouches(lines, levels) {
  const used = new Set();
  return (lines || []).map((line) => {
    if (line.kind !== "support" && line.kind !== "resistance") return line;
    let level = null;
    let best = Infinity;
    for (const item of levels || []) {
      if (used.has(item) || item.kind !== line.kind) continue;
      const lineEur = Number(line.eur ?? line.eur0);
      const levelEur = Number(item.eur);
      const diff = Number.isFinite(lineEur) && Number.isFinite(levelEur) ? Math.abs(lineEur - levelEur) : 0;
      if (diff < best) {
        best = diff;
        level = item;
      }
    }
    if (level) used.add(level);
    const stats = level?.bounce;
    return {
      ...line,
      touches: stats?.touches || [],
      bounce: stats?.bounce || 0,
      n: stats?.n || 0,
      eur: level?.eur ?? line.eur ?? line.eur0
    };
  });
}

function levelsFrom(shape, history, spec) {
  return (shape.levels || []).map((level) => {
    const touch = chooseTouch(countRetests(closes(history), level.side, spec, level.eur));
    return withPrice({
      ...level,
      ...touch,
      sentence: levelSentence(touch)
    });
  });
}

function historyCandles(ticker, range, visible) {
  if (range === "5 Min" || range === "15 Min" || range === "4 Std") return visible;
  const source = range === "Max"
    ? maxPoints(ticker?.history)
    : longerDaily(ticker);
  const candles = (source || []).map((point) => ({
    t: point.t,
    open: Number(point.open ?? point.eur),
    high: Number(point.high ?? point.eur),
    low: Number(point.low ?? point.eur),
    close: Number(point.eur),
    eur: Number(point.eur)
  })).filter((candle) => candle.t && Number.isFinite(candle.close));
  return candles.length >= visible.length ? candles : visible;
}

function longerDaily(ticker) {
  const year = ticker?.history?.["1Y"] || [];
  const half = ticker?.history?.["6M"] || [];
  return year.length >= half.length ? year : half;
}

export function analyseCandles(visible, history, range) {
  const candles = visible || [];
  const past = history?.length ? history : candles;
  const spec = SPEC[range] || SPEC["1M"];
  if (candles.length < 6) {
    return emptyResult("Zu wenig Punkte für eine Linie. Keine Prozentzahl.");
  }
  const shape = detectShape(candles);
  if (shape) {
    const share = pack(countClassic(history?.length ? history : candles, shape.id, spec));
    const outcome = outcomeCopy(shape.id, share, detailFor(range, spec));
    const mark = namedCandle(candles);
    const legend = [{ kind: "pattern", label: shape.legend || TITLES[shape.id] }];
    const levels = withBounces(levelsFrom(shape, past, spec), candles, range);
    const paired = pairLevels(shape.lines, levels);
    return {
      title: TITLES[shape.id] || TITLES.unklar,
      patternId: shape.id,
      lines: paired.lines,
      legend,
      outcome: { ...outcome, show: share.show, n: share.n, pct: share.pct },
      levels: paired.levels,
      mark: !mark || mark.id === shape.id ? null : mark.id
    };
  }
  const base = analyzePoints(closes(candles), closes(past), spec, range);
  const candle = base.patternId === "unklar" && !base.lines.length ? namedCandle(candles) : null;
  if (!candle) {
    const levels = withBounces((base.levels || []).map(withPrice), candles, range);
    const paired = pairLevels(base.lines || [], levels);
    return {
      ...base,
      title: TITLES[base.patternId] || base.title,
      lines: paired.lines,
      levels: paired.levels
    };
  }
    const share = pack(countNamed(past, candle.id, spec));
  const outcome = outcomeCopy(candle.id, share, detailFor(range, spec));
  return {
    title: TITLES[candle.id],
    patternId: candle.id,
    lines: [{ kind: "mark", index: candle.index }],
    legend: [{ kind: "mark", label: TITLES[candle.id] }],
    outcome: { ...outcome, show: share.show, n: share.n, pct: share.pct },
    levels: []
  };
}

export function analyseChart(ticker, range) {
  const picked = candlesFor(ticker, range);
  if (picked.missing) {
    return emptyResult("Keine 4-Stunden-Reihe. Deshalb keine Prozentzahl.", {
      missing: true,
      range: picked.range,
      label: rangeLabel(picked.range)
    });
  }
  const history = picked.history || historyCandles(ticker, picked.range, picked.candles);
  return {
    ...analyseCandles(picked.candles, history, picked.range),
    missing: false,
    range: picked.range,
    label: rangeLabel(picked.range),
    candles: picked.candles
  };
}

export function analyseText(result) {
  if (!result) return "";
  return [
    result.title,
    result.outcome?.sentence,
    result.outcome?.detail,
    ...(result.levels || []).flatMap((level) => [level.title, level.kicker, level.sentence, level.bounceSentence, level.bounceDetail]),
    ...(result.legend || []).map((item) => item.label),
    result.outcome && /n\s*=/.test(`${result.outcome.sentence} ${(result.levels || []).map((level) => level.sentence).join(" ")}`) ? N_LEGEND : ""
  ].filter(Boolean).join("\n");
}
