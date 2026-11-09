import { berlinClock } from "./seasonality.js";
import { esc, zonedWallTime } from "./logic.js";

/** 30-minute buckets from 08:00 through 22:00 Berlin. */
export const DAYPATH_STEP = 30;
export const DAYPATH_START = 8 * 60;
export const DAYPATH_END = 22 * 60;

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

export const DAYPATH_AXIS = ["08:00", "15:30", "22:00"];

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
 * The baseline is the first print from 08:00 Berlin.
 * If that print is missing, the baseline is the US cash open.
 * A day with neither is left out.
 */
export function weekdayPaths(points) {
  const slotCount = DAYPATH_SLOTS.length;
  const samples = WEEKDAYS.map(() => Array.from({ length: slotCount }, () => []));
  const counted = [0, 0, 0, 0, 0];
  for (const [date, prints] of groupDays(points)) {
    const weekday = weekdayIndex(date);
    if (weekday < 0 || prints.length < 1) continue;
    const openMs = usCashOpen(date);
    const early = prints.filter((print) => openMs == null || print.t < openMs);
    const opened = prints.filter((print) => {
      if (openMs == null) return false;
      return print.t >= openMs && print.t <= openMs + 45 * 60 * 1000;
    });
    const base = early[0] || opened[0];
    if (!base) continue;
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

/**
 * German prints before the US open when they exist, then the US series
 * continued from the last German price so the two listings do not jump.
 */
export function weekdayPathsMerged(germanPoints, usPoints) {
  const german = groupDays(germanPoints);
  const us = groupDays(usPoints);
  const dates = new Set([...german.keys(), ...us.keys()]);
  const combined = [];
  for (const date of dates) {
    const openMs = usCashOpen(date);
    const de = german.get(date) || [];
    const america = us.get(date) || [];
    const deEarly = de.filter((print) => openMs == null || print.t < openMs);
    if (deEarly.length) {
      const last = de[de.length - 1];
      const later = america.filter((print) => print.t > last.t);
      const scale = later.length ? last.price / later[0].price : 1;
      const tail = later.slice(later.length ? 1 : 0).map((print) => ({
        t: new Date(print.t).toISOString(),
        eur: print.price * scale
      }));
      combined.push(
        ...de.map((print) => ({ t: new Date(print.t).toISOString(), eur: print.price })),
        ...tail
      );
    } else {
      combined.push(...america.map((print) => ({ t: new Date(print.t).toISOString(), eur: print.price })));
    }
  }
  return weekdayPaths(combined);
}

function packPaths(samples, counted) {
  const days = WEEKDAYS.map((weekday, weekdayIndex) => {
    const points = samples[weekdayIndex].map((values) => {
      if (!values.length) return { avg: null, spread: null, n: 0 };
      const avg = values.reduce((total, value) => total + value, 0) / values.length;
      return { avg: round2(avg), spread: round2(stdev(values, avg)), n: values.length };
    });
    let end = null;
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (points[index].avg != null) {
        end = points[index].avg;
        break;
      }
    }
    return { name: weekday.name, n: counted[weekdayIndex], end, points };
  });
  return { slots: DAYPATH_SLOTS, axis: DAYPATH_AXIS, days };
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
  if (!stored?.days || pathDays(stored) <= pathDays(local)) return local;
  return stored;
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
    const tone = day.end > 0 ? "up" : "down";
    const end = day.n ? formatPathPct(day.end) : "—";
    const count = `n = ${day.n || 0} ${day.n === 1 ? "Tag" : "Tage"}`;
    return `
      <div class="daypath">
        <div class="daypath-head">
          <strong>${esc(day.name || weekday.name)}</strong>
          <span class="path-end ${day.n ? tone : "flat"}">${esc(end)}</span>
          <span class="path-n">${esc(count)}</span>
        </div>
        <canvas class="chart daypath-chart" data-chart="daypath" data-weekday="${index}" aria-label="${esc(weekday.name)}, mittlerer Tagesverlauf"></canvas>
      </div>`;
  }).join("");
  return `
    <section class="daypaths" aria-label="Durchschnittlicher Tagesverlauf">
      <h3>Durchschnittlicher Tagesverlauf</h3>
      <p class="daypath-lead">Mittlerer Verlauf seit dem ersten Kurs ab 08:00 Uhr Berlin. Liegt da keiner, zählt die US-Eröffnung. Bis 22:00 Uhr.</p>
      ${rows}
    </section>`;
}

function paintDayPath(canvas, day, slots) {
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 72;
  const ctx = canvas.getContext("2d");
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
  const values = [];
  points.forEach((point) => {
    if (Number.isFinite(point?.avg)) values.push(point.avg);
    if (Number.isFinite(point?.spread)) {
      values.push(point.avg - point.spread, point.avg + point.spread);
    }
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
  const up = Number(day?.end) > 0;
  const color = up ? "#3ddc84" : "#ff5d6c";
  const band = points.map((point, index) => {
    if (!Number.isFinite(point?.avg) || !Number.isFinite(point?.spread)) return null;
    return { x: xOf(index), high: yOf(point.avg + point.spread), low: yOf(point.avg - point.spread) };
  }).filter(Boolean);
  if (band.length > 1) {
    ctx.beginPath();
    band.forEach((item, index) => (index ? ctx.lineTo(item.x, item.high) : ctx.moveTo(item.x, item.high)));
    for (let index = band.length - 1; index >= 0; index -= 1) ctx.lineTo(band[index].x, band[index].low);
    ctx.closePath();
    ctx.fillStyle = up ? "rgba(61,220,132,.16)" : "rgba(255,93,108,.16)";
    ctx.fill();
  }
  const line = points.map((point, index) => (Number.isFinite(point?.avg) ? { x: xOf(index), y: yOf(point.avg) } : null)).filter(Boolean);
  if (line.length > 1) {
    ctx.beginPath();
    line.forEach((item, index) => (index ? ctx.lineTo(item.x, item.y) : ctx.moveTo(item.x, item.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#8b93a6";
  ctx.textBaseline = "bottom";
  const labels = slots || DAYPATH_SLOTS;
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

export function drawDayPaths(data, ui) {
  if (typeof document === "undefined") return;
  const ticker = (data?.prices?.tickers || []).find((item) => item.symbol === ui?.analyseSymbol) || data?.prices?.tickers?.[0];
  const paths = dayPathsFor(ticker, data?.seasonality);
  document.querySelectorAll("canvas[data-chart='daypath']").forEach((canvas) => {
    const day = paths.days[Number(canvas.dataset.weekday)];
    paintDayPath(canvas, day, paths.slots);
  });
}
