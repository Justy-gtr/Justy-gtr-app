import { MIN_CASES } from "./analysis.js";
import { berlinClock } from "./seasonality.js";
import { esc, zonedWallTime } from "./logic.js";

/** 30-minute buckets from 07:00 through 23:00 Berlin. */
export const DAYPATH_STEP = 30;
export const DAYPATH_START = 7 * 60;
export const DAYPATH_END = 23 * 60;
/** Bump when the stored shape changes so the next Kurslauf writes dayPaths again. */
export const DAYPATH_SCHEMA = 1;
/** Same bar as the rest of the app: below this the line stays, with a note. */
export const PATH_FEW_DAYS = MIN_CASES;

const WEEKDAYS = [
  { index: 0, name: "Montag" },
  { index: 1, name: "Dienstag" },
  { index: 2, name: "Mittwoch" },
  { index: 3, name: "Donnerstag" },
  { index: 4, name: "Freitag" }
];

function clockLabel(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export const DAYPATH_SLOTS = [];
for (let minute = DAYPATH_START; minute <= DAYPATH_END; minute += DAYPATH_STEP) {
  DAYPATH_SLOTS.push(clockLabel(minute));
}

export const DAYPATH_AXIS = ["07:00", "15:30", "23:00"];

function round2(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100)) / 100;
}

function priceOf(point) {
  const value = Number(point?.eur ?? point?.close);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function berlinParts(instant) {
  const clock = berlinClock(instant);
  if (!clock) return null;
  const minutes = clock.hour * 60 + clock.minute;
  return { date: clock.date, minutes };
}

/** 09:30 New York on the Berlin calendar date of that morning. */
export function usCashOpen(berlinDate) {
  const instant = zonedWallTime(berlinDate, "09:30", "America/New_York");
  return instant ? instant.getTime() : null;
}

function slotIndex(minutes) {
  if (minutes < DAYPATH_START || minutes > DAYPATH_END) return -1;
  return Math.floor((minutes - DAYPATH_START) / DAYPATH_STEP);
}

function weekdayIndex(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return -1;
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  if (weekday === 0 || weekday === 6) return -1;
  return weekday - 1;
}

function stdev(values, mean) {
  if (values.length < 2) return null;
  const sum = values.reduce((total, value) => total + (value - mean) ** 2, 0);
  return Math.sqrt(sum / (values.length - 1));
}

function groupDays(points) {
  const days = new Map();
  for (const point of points || []) {
    const price = priceOf(point);
    const parts = point?.t ? berlinParts(point.t) : null;
    if (!parts || price == null) continue;
    if (slotIndex(parts.minutes) < 0) continue;
    const list = days.get(parts.date) || [];
    list.push({ t: Date.parse(point.t), minutes: parts.minutes, price });
    days.set(parts.date, list);
  }
  for (const list of days.values()) list.sort((a, b) => a.t - b.t);
  return days;
}

/**
 * One weekday path from prints already in one currency.
 * The baseline is the first print from 07:00 Berlin onward, Frankfurt or pre-market when it is there.
 * Buckets without a print stay empty. Nothing is carried forward to 23:00.
 */
export function weekdayPaths(points) {
  const slotCount = DAYPATH_SLOTS.length;
  const samples = WEEKDAYS.map(() => Array.from({ length: slotCount }, () => []));
  const counted = [0, 0, 0, 0, 0];
  for (const [date, prints] of groupDays(points)) {
    const weekday = weekdayIndex(date);
    if (weekday < 0 || prints.length < 1) continue;
    const base = prints[0];
    counted[weekday] += 1;
    const buckets = Array.from({ length: slotCount }, () => null);
    for (const print of prints) {
      const index = slotIndex(print.minutes);
      if (index >= 0) buckets[index] = print.price;
    }
    buckets.forEach((price, index) => {
      if (price == null) return;
      samples[weekday][index].push(((price - base.price) / base.price) * 100);
    });
  }
  return packPaths(samples, counted);
}

/** Frankfurt (or any earlier series) first, then the US series in percent so currencies do not jump. */
export function weekdayPathsMerged(germanPoints, usPoints) {
  return mergeIntradayPaths([
    { id: "de", label: "Frankfurt", points: germanPoints || [] },
    { id: "us", label: "US", points: usPoints || [] }
  ]);
}

function quartile(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const weight = pos - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function summarize(values) {
  if (!values.length) {
    return { avg: null, spread: null, min: null, max: null, q1: null, q3: null, n: 0 };
  }
  const avg = values.reduce((total, value) => total + value, 0) / values.length;
  const sorted = values.slice().sort((a, b) => a - b);
  const quartiles = values.length >= 4;
  return {
    avg: round2(avg),
    spread: round2(stdev(values, avg)),
    min: round2(sorted[0]),
    max: round2(sorted[sorted.length - 1]),
    q1: quartiles ? round2(quartile(sorted, 0.25)) : null,
    q3: quartiles ? round2(quartile(sorted, 0.75)) : null,
    n: values.length
  };
}

function packPaths(samples, counted) {
  const days = WEEKDAYS.map((weekday, weekdayIndex) => {
    const points = samples[weekdayIndex].map((values) => summarize(values));
    let end = null;
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (points[index].avg != null) {
        end = points[index].avg;
        break;
      }
    }
    return { name: weekday.name, n: counted[weekdayIndex], end, points };
  });
  return { schema: DAYPATH_SCHEMA, slots: DAYPATH_SLOTS, axis: DAYPATH_AXIS, days };
}

function emptyCoverage() {
  return DAYPATH_SLOTS.map((slot) => ({ slot, n: 0, where: "leer", sources: {} }));
}

function coverageWhere(entries) {
  if (!entries.length) return "leer";
  if (entries.length === 1) return entries[0][0];
  const [top, second] = entries;
  if (top[1] >= second[1] * 2) return top[0];
  return entries.map(([label]) => label).join(" und ");
}

/**
 * Several listings, percent only, so euro and dollar do not jump.
 * The first series wins a bucket both traded. A later series fills a gap
 * once it has its own previous print. The first print of a new series is
 * only the new baseline and stays an empty gap.
 */
export function mergeIntradayPaths(seriesList) {
  const active = (seriesList || []).filter((series) => Array.isArray(series?.points) && series.points.length);
  const paths = weekdayPaths([]);
  if (!active.length) {
    paths.coverage = emptyCoverage();
    return paths;
  }
  const grouped = active.map((series) => ({
    label: series.label || series.id || "Kurs",
    days: groupDays(series.points)
  }));
  const dates = new Set(grouped.flatMap((series) => [...series.days.keys()]));
  const combined = [];
  const hits = DAYPATH_SLOTS.map(() => ({}));
  for (const date of dates) {
    const slotPrices = grouped.map((series) => {
      const bySlot = new Map();
      for (const print of series.days.get(date) || []) {
        const index = slotIndex(print.minutes);
        if (index < 0) continue;
        const prev = bySlot.get(index);
        if (!prev || print.t >= prev.t) bySlot.set(index, print);
      }
      return { label: series.label, bySlot, last: null };
    });
    let synthetic = null;
    for (let index = 0; index < DAYPATH_SLOTS.length; index += 1) {
      const chosen = slotPrices.find((series) => series.bySlot.has(index)) || null;
      if (chosen) {
        const print = chosen.bySlot.get(index);
        if (synthetic == null) {
          synthetic = 100;
          combined.push({ t: new Date(print.t).toISOString(), eur: synthetic });
          hits[index][chosen.label] = (hits[index][chosen.label] || 0) + 1;
        } else if (chosen.last > 0) {
          synthetic *= print.price / chosen.last;
          combined.push({ t: new Date(print.t).toISOString(), eur: synthetic });
          hits[index][chosen.label] = (hits[index][chosen.label] || 0) + 1;
        }
      }
      for (const series of slotPrices) {
        const print = series.bySlot.get(index);
        if (print) series.last = print.price;
      }
    }
  }
  const merged = weekdayPaths(combined);
  merged.coverage = DAYPATH_SLOTS.map((slot, index) => {
    const entries = Object.entries(hits[index]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
    const n = entries.reduce((total, [, count]) => total + count, 0);
    return { slot, n, where: coverageWhere(entries), sources: Object.fromEntries(entries) };
  });
  return merged;
}

export function collectPriceBars(ticker) {
  const rows = [];
  for (const key of ["1H", "5m", "intraday"]) {
    for (const point of ticker?.history?.[key] || []) {
      const eur = priceOf(point);
      if (!point?.t || eur == null) continue;
      rows.push({ t: point.t, eur });
    }
  }
  rows.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return rows;
}

function pathDays(paths) {
  return (paths?.days || []).reduce((total, day) => total + (Number(day?.n) || 0), 0);
}

/** Stored long path wins only when it rests on more days than the bars in the app. */
export function dayPathsFor(ticker, seasonality) {
  const local = weekdayPaths(collectPriceBars(ticker));
  const stored = seasonality?.symbols?.[ticker?.symbol]?.dayPaths;
  if (!stored?.days || stored.schema !== DAYPATH_SCHEMA) return local;
  if (pathDays(stored) <= pathDays(local)) return local;
  return stored;
}

/** Band drawn and read out: quartiles when there are enough days, else the min/max. */
export function pathBand(point) {
  if (!point || !Number.isFinite(point.avg)) return null;
  if (Number.isFinite(point.q1) && Number.isFinite(point.q3)) {
    return { lo: point.q1, hi: point.q3, kind: "quartil" };
  }
  if ((point.n || 0) >= 2 && Number.isFinite(point.min) && Number.isFinite(point.max)) {
    return { lo: point.min, hi: point.max, kind: "spanne" };
  }
  if (Number.isFinite(point.spread)) {
    return {
      lo: round2(point.avg - point.spread),
      hi: round2(point.avg + point.spread),
      kind: "spanne"
    };
  }
  return null;
}

export function dayPathReadout(slot, point) {
  const clock = `${slot} Uhr`;
  if (!point || !Number.isFinite(point.avg)) return `${clock} · —`;
  const days = point.n === 1 ? "n = 1 Tag" : `n = ${point.n || 0} Tage`;
  const line = `${clock} · ${formatPathPct(point.avg)} · ${days}`;
  const band = pathBand(point);
  if (!band) return line;
  const name = band.kind === "quartil" ? "Quartil" : "Spanne";
  return `${line}\n${name} ${formatPathPct(band.lo)} bis ${formatPathPct(band.hi)}`;
}

export function formatPathPct(value) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(number));
  if (number > 0) return `+${body} %`;
  if (number < 0) return `−${body} %`;
  return `${body} %`;
}

export function renderDayPaths(paths) {
  const days = paths?.days || [];
  const rows = WEEKDAYS.map((weekday, index) => {
    const day = days[index] || { name: weekday.name, n: 0, end: null, points: [] };
    const tone = day.end > 0 ? "up" : day.end < 0 ? "down" : "flat";
    const end = day.n ? formatPathPct(day.end) : "—";
    const count = `n = ${day.n || 0} ${day.n === 1 ? "Tag" : "Tage"}`;
    const few = (day.n || 0) < PATH_FEW_DAYS ? ", wenige Tage" : "";
    return `
      <div class="daypath">
        <div class="daypath-head">
          <strong>${esc(day.name || weekday.name)}</strong>
          <span class="path-end ${day.n ? tone : "flat"}">${esc(end)}</span>
          <span class="path-n">${esc(count)}${esc(few)}</span>
        </div>
        <p class="scrub daypath-scrub"></p>
        <canvas class="chart daypath-chart" data-chart="daypath" data-weekday="${index}" aria-label="${esc(weekday.name)}, mittlerer Tagesverlauf. Ziehen zeigt Uhrzeit, mittleren Verlauf und die Zahl der Tage."></canvas>
      </div>`;
  }).join("");
  return `
    <section class="daypaths" aria-label="Durchschnittlicher Tagesverlauf">
      <h3>Durchschnittlicher Tagesverlauf</h3>
      <p class="daypath-lead">Mittlerer Verlauf seit dem ersten Kurs ab 07:00 Uhr Berlin. Bis 23:00 Uhr. Stunden ohne Kurs bleiben leer. Unter ${PATH_FEW_DAYS} Tagen steht „wenige Tage“ an der Linie.</p>
      ${rows}
    </section>`;
}

function paintDayPath(canvas, day, slots, hoverIndex = null) {
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const padL = 2;
  const padR = 2;
  const padT = 6;
  const padB = 16;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const points = day?.points || [];
  const labels = slots || DAYPATH_SLOTS;
  canvas._dayPath = { day, slots: labels, padL, plotW };
  const values = [];
  points.forEach((point) => {
    if (Number.isFinite(point?.avg)) values.push(point.avg);
    const band = pathBand(point);
    if (band) values.push(band.lo, band.hi);
  });
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (!Number.isFinite(min)) min = -0.2;
  if (!Number.isFinite(max)) max = 0.2;
  const pad = (max - min) * 0.12 || 0.15;
  min -= pad;
  max += pad;
  const yOf = (value) => padT + (1 - (value - min) / (max - min || 1)) * plotH;
  const xOf = (index) => {
    const last = Math.max(1, (slots || DAYPATH_SLOTS).length - 1);
    return padL + (index / last) * plotW;
  };
  const zero = yOf(0);
  ctx.strokeStyle = "rgba(255,255,255,.38)";
  ctx.lineWidth = 1;
  ctx.setLineDash([1.5, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, zero);
  ctx.lineTo(padL + plotW, zero);
  ctx.stroke();
  ctx.setLineDash([]);
  const hasLine = points.some((point) => Number.isFinite(point?.avg));
  const up = Number(day?.end) > 0;
  const color = !hasLine ? "#8b93a6" : up ? "#3ddc84" : "#ff5d6c";
  const runs = [];
  let run = [];
  points.forEach((point, index) => {
    if (!Number.isFinite(point?.avg)) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    const band = pathBand(point);
    run.push({
      x: xOf(index),
      y: yOf(point.avg),
      high: band ? yOf(band.hi) : null,
      low: band ? yOf(band.lo) : null
    });
  });
  if (run.length) runs.push(run);
  ctx.fillStyle = up ? "rgba(61,220,132,.16)" : "rgba(255,93,108,.16)";
  for (const segment of runs) {
    const band = segment.filter((item) => item.high != null && item.low != null);
    if (band.length < 2) continue;
    ctx.beginPath();
    band.forEach((item, index) => (index ? ctx.lineTo(item.x, item.high) : ctx.moveTo(item.x, item.high)));
    for (let index = band.length - 1; index >= 0; index -= 1) ctx.lineTo(band[index].x, band[index].low);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.fillStyle = color;
  for (const segment of runs) {
    if (segment.length === 1) {
      ctx.beginPath();
      ctx.arc(segment[0].x, segment[0].y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    segment.forEach((item, index) => (index ? ctx.lineTo(item.x, item.y) : ctx.moveTo(item.x, item.y)));
    ctx.stroke();
  }
  if (hoverIndex != null && hoverIndex >= 0 && hoverIndex < labels.length) {
    const x = xOf(hoverIndex);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(244,241,234,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, height - padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#8b93a6";
  ctx.textBaseline = "bottom";
  DAYPATH_AXIS.forEach((label, axisIndex) => {
    const index = labels.indexOf(label);
    if (index < 0) return;
    const x = xOf(index);
    if (axisIndex === 0) ctx.textAlign = "left";
    else if (axisIndex === DAYPATH_AXIS.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    ctx.fillText(label, x, height - 1);
  });
}

function clearSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return;
  selection.removeAllRanges();
}

function slotAt(canvas, clientX) {
  const state = canvas._dayPath;
  if (!state?.slots?.length) return -1;
  const layoutWidth = canvas.clientWidth || 320;
  const plotW = Math.max(1, layoutWidth - 4);
  const x = clientX - canvas.getBoundingClientRect().left;
  const last = Math.max(1, state.slots.length - 1);
  const index = Math.round(((x - 2) / plotW) * last);
  return Math.min(last, Math.max(0, index));
}

function showDayScrub(canvas, index) {
  const scrub = canvas.parentElement?.querySelector(".daypath-scrub");
  const state = canvas._dayPath;
  if (!scrub || !state || index < 0) return;
  scrub.hidden = false;
  scrub.textContent = dayPathReadout(state.slots[index], state.day?.points?.[index]);
}

function hideDayScrub(canvas) {
  const scrub = canvas.parentElement?.querySelector(".daypath-scrub");
  if (!scrub) return;
  scrub.hidden = false;
  scrub.textContent = "";
}

function bindDayScrub(canvas) {
  if (canvas.dataset.scrubBound) return;
  canvas.dataset.scrubBound = "1";
  const wrap = canvas.closest(".daypath") || canvas;
  wrap.addEventListener("selectstart", (event) => event.preventDefault());
  let active = false;
  const place = (clientX) => {
    clearSelection();
    const state = canvas._dayPath;
    if (!state) return;
    const index = slotAt(canvas, clientX);
    paintDayPath(canvas, state.day, state.slots, index);
    showDayScrub(canvas, index);
  };
  const end = () => {
    if (!active) return;
    active = false;
    clearSelection();
    const state = canvas._dayPath;
    if (state) paintDayPath(canvas, state.day, state.slots, null);
    hideDayScrub(canvas);
  };
  const touchPoint = (event) => event.touches[0] || event.changedTouches[0];
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    active = true;
    canvas.setPointerCapture?.(event.pointerId);
    place(event.clientX);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !active) return;
    place(event.clientX);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") return;
    end();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") return;
    end();
  });
  canvas.addEventListener("touchstart", (event) => {
    if (event.cancelable) event.preventDefault();
    const touch = touchPoint(event);
    if (!touch) return;
    active = true;
    place(touch.clientX);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    if (event.cancelable) event.preventDefault();
    clearSelection();
    if (!active) return;
    const touch = touchPoint(event);
    if (touch) place(touch.clientX);
  }, { passive: false });
  canvas.addEventListener("touchend", (event) => {
    if (event.touches.length === 0) end();
  });
  canvas.addEventListener("touchcancel", end);
}

export function drawDayPaths(data, ui) {
  if (typeof document === "undefined") return;
  const ticker = (data?.prices?.tickers || []).find((item) => item.symbol === ui?.analyseSymbol) || data?.prices?.tickers?.[0];
  const paths = dayPathsFor(ticker, data?.seasonality);
  document.querySelectorAll("canvas[data-chart='daypath']").forEach((canvas) => {
    const day = paths.days[Number(canvas.dataset.weekday)] || { name: "", n: 0, end: null, points: [] };
    paintDayPath(canvas, day, paths.slots, null);
    bindDayScrub(canvas);
  });
}
