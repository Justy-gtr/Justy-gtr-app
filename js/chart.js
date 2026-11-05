import { seriesFor } from "./logic.js";

function hexAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function sparkline(values, color) {
  const nums = (values || []).filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (nums.length < 2) return "";
  const width = 96;
  const height = 36;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const d = nums.map((value, index) => {
    const x = (index / (nums.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const stroke = color || (nums.at(-1) >= nums[0] ? "#7ddec0" : "#ff8b98");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const euroAxis = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatEuroAxis(value) {
  return `${euroAxis.format(value)} €`;
}

function formatAxisDate(iso, spanMs) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
  const zone = "Europe/Berlin";
  if (spanMs < 36 * 3600 * 1000) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(date);
  }
  if (spanMs < 400 * 86400000) {
    return new Intl.DateTimeFormat("de-DE", { timeZone: zone, day: "numeric", month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("de-DE", { timeZone: zone, month: "short", year: "2-digit" }).format(date);
}

function formatScrubWhen(iso, spanMs) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 16);
  const zone = "Europe/Berlin";
  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  if (spanMs < 36 * 3600 * 1000) {
    const time = new Intl.DateTimeFormat("de-DE", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(date);
    return `${day}, ${time}`;
  }
  return day;
}

function chartLayout(width, height, points, axes) {
  const padL = 8;
  const padR = axes ? 78 : 8;
  const padT = 16;
  const padB = axes ? 28 : 16;
  const values = points.map((point) => Number(point.eur));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const coords = points.map((point, index) => ({
    x: padL + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW),
    y: padT + (1 - (Number(point.eur) - min) / span) * plotH,
    point
  }));
  const first = new Date(points[0].t).getTime();
  const last = new Date(points.at(-1).t).getTime();
  return { padL, padR, padT, padB, min, max, plotW, plotH, coords, spanMs: Math.abs(last - first) || 0 };
}

function paintChart(canvas, state, hover) {
  const { color, width, height, layout, axes } = state;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const { coords, min, max, padT, padB, padL } = layout;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9aa3b5";
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 1;
  if (axes) {
    const ticks = 4;
    for (let index = 0; index < ticks; index += 1) {
      const value = max - ((max - min) * index) / (ticks - 1);
      const y = padT + ((height - padT - padB) * index) / (ticks - 1);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(width - layout.padR + 4, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatEuroAxis(value), width - 4, y);
    }
    const marks = [0, 0.33, 0.66, 1].map((ratio) => coords[Math.round(ratio * (coords.length - 1))]);
    marks.forEach((mark, index) => {
      ctx.textBaseline = "bottom";
      if (index === 0) ctx.textAlign = "left";
      else if (index === marks.length - 1) ctx.textAlign = "right";
      else ctx.textAlign = "center";
      const x = index === marks.length - 1 ? Math.min(mark.x, width - layout.padR) : mark.x;
      ctx.fillText(formatAxisDate(mark.point.t, layout.spanMs), x, height - 4);
    });
  }
  const gradient = ctx.createLinearGradient(0, padT, 0, height - padB);
  gradient.addColorStop(0, hexAlpha(color, 0.28));
  gradient.addColorStop(1, hexAlpha(color, 0));
  ctx.beginPath();
  coords.forEach((coord, index) => (index ? ctx.lineTo(coord.x, coord.y) : ctx.moveTo(coord.x, coord.y)));
  ctx.lineTo(coords.at(-1).x, height - padB);
  ctx.lineTo(coords[0].x, height - padB);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  coords.forEach((coord, index) => (index ? ctx.lineTo(coord.x, coord.y) : ctx.moveTo(coord.x, coord.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.stroke();
  const focus = hover || coords.at(-1);
  ctx.beginPath();
  ctx.arc(focus.x, focus.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f1ea";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (hover) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(244,241,234,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hover.x, padT);
    ctx.lineTo(hover.x, height - padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function showScrub(canvas, coord, spanMs) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub || !coord) return;
  scrub.hidden = false;
  scrub.textContent = `${formatScrubWhen(coord.point.t, spanMs)} · ${formatEuroAxis(Number(coord.point.eur))}`;
}

function hideScrub(canvas) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub) return;
  scrub.hidden = true;
  scrub.textContent = "";
}

function bindScrub(canvas) {
  if (canvas.dataset.scrubBound) return;
  canvas.dataset.scrubBound = "1";
  let active = false;
  const place = (clientX) => {
    const state = canvas._chartState;
    if (!state?.layout?.coords?.length) return;
    const x = clientX - canvas.getBoundingClientRect().left;
    let nearest = state.layout.coords[0];
    let best = Infinity;
    for (const coord of state.layout.coords) {
      const distance = Math.abs(coord.x - x);
      if (distance < best) {
        best = distance;
        nearest = coord;
      }
    }
    paintChart(canvas, state, nearest);
    showScrub(canvas, nearest, state.layout.spanMs);
  };
  canvas.addEventListener("pointerdown", (event) => {
    active = true;
    canvas.setPointerCapture?.(event.pointerId);
    place(event.clientX);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!active) return;
    place(event.clientX);
  });
  const end = () => {
    if (!active) return;
    active = false;
    const state = canvas._chartState;
    if (state) paintChart(canvas, state, null);
    hideScrub(canvas);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

export function drawLineChart(canvas, points, { color = "#e4b15a", axes = false, scrub = false } = {}) {
  if (!canvas) return;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 180;
  const ctx = canvas.getContext("2d");
  const usable = (points || []).filter((point) => point && point.eur != null && !Number.isNaN(Number(point.eur)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
  if (usable.length < 2) {
    ctx.fillStyle = "#b7c0d0";
    ctx.fillText("Noch keine Reihe.", 12, height / 2);
    canvas._chartState = null;
    return;
  }
  const layout = chartLayout(width, height, usable, axes);
  const state = { color, width, height, layout, axes };
  canvas._chartState = state;
  paintChart(canvas, state, null);
  if (scrub) bindScrub(canvas);
  else hideScrub(canvas);
}

export function drawCharts(data, ui) {
  document.querySelectorAll("canvas[data-chart]").forEach((canvas) => {
    const kind = canvas.dataset.chart;
    if (kind === "price") {
      const ticker = (data.prices?.tickers || []).find((item) => item.symbol === (canvas.dataset.symbol || ui.chartSymbol));
      const { points } = seriesFor(ticker, ui.chartRange, ui.langfrist);
      const first = Number(points[0]?.eur);
      const last = Number(points.at(-1)?.eur);
      const falling = points.length > 1 && last < first;
      const color = ui.langfrist ? "#e4b15a" : (falling ? "#ff5d6c" : "#3ddea0");
      drawLineChart(canvas, points, { color, axes: true, scrub: true });
    } else if (kind === "prod") {
      const series = (data.production?.series || []).find((item) => item.id === canvas.dataset.series);
      drawLineChart(canvas, (series?.points || []).map((point) => ({ t: point.date, eur: point.value })), { color: "#e4b15a" });
    } else if (kind === "hit") {
      const investor = (data.crowd?.investors || []).find((item) => item.id === canvas.dataset.investor);
      drawLineChart(canvas, (investor?.hitRateHistory || []).map((point) => ({ t: point.date, eur: point.hitRatePct })), { color: "#9fdfff" });
    }
  });
}
