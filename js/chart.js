import { chartAnalysis } from "./analysis.js";
import { scrubDelta, seriesFor } from "./logic.js";

function hexAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function sparkPoints(values) {
  return (values || []).map((value) => {
    if (typeof value === "number" && !Number.isNaN(value)) return { eur: value, session: null };
    if (value && typeof value.eur === "number" && !Number.isNaN(value.eur)) {
      return { eur: value.eur, session: value.session || null };
    }
    return null;
  }).filter(Boolean);
}

function isExtendedSession(session) {
  return session === "pre" || session === "post";
}

export function sparkline(values, color) {
  const nums = sparkPoints(values);
  if (nums.length < 2) return "";
  const width = 96;
  const height = 36;
  const min = Math.min(...nums.map((point) => point.eur));
  const max = Math.max(...nums.map((point) => point.eur));
  const span = max - min || 1;
  const coords = nums.map((point, index) => {
    const x = (index / (nums.length - 1)) * width;
    const y = height - ((point.eur - min) / span) * (height - 6) - 3;
    return { x, y, session: point.session };
  });
  const d = coords.map((coord, index) => `${index ? "L" : "M"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
  const stroke = color || (nums.at(-1).eur >= nums[0].eur ? "#7ddec0" : "#ff8b98");
  let extended = "";
  let open = false;
  const parts = [];
  for (let index = 1; index < coords.length; index += 1) {
    const hot = isExtendedSession(coords[index - 1].session) || isExtendedSession(coords[index].session);
    if (!hot) {
      open = false;
      continue;
    }
    const from = coords[index - 1];
    const to = coords[index];
    parts.push(`${open ? "L" : "M"}${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`);
    open = true;
  }
  if (parts.length) {
    extended = `<path d="${parts.join(" ")}" fill="none" stroke="#e4b15a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${extended}</svg>`;
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
  paintGuides(ctx, layout, state.lines);
  strokeWhere(ctx, coords, (left, right) => isExtendedPoint(left) || isExtendedPoint(right), "#e4b15a");
  const focus = hover || coords.at(-1);
  const extendedEnd = !hover && isExtendedPoint(focus.point);
  ctx.beginPath();
  ctx.arc(focus.x, focus.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = extendedEnd ? "#e4b15a" : "#f4f1ea";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = extendedEnd ? "#e4b15a" : color;
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

function guideY(layout, price) {
  const span = layout.max - layout.min || 1;
  const y = layout.padT + (1 - (price - layout.min) / span) * layout.plotH;
  return Math.min(layout.padT + layout.plotH, Math.max(layout.padT, y));
}

function paintGuides(ctx, layout, lines) {
  if (!lines?.length || !layout?.coords?.length) return;
  const { coords } = layout;
  const right = coords.at(-1).x;
  for (const line of lines) {
    const y0 = guideY(layout, line.eur0);
    const y1 = guideY(layout, line.eur1);
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.lineCap = "butt";
    if (line.kind === "trend") {
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "#e4b15a";
      ctx.moveTo(coords[0].x, y0);
      ctx.lineTo(right, y1);
    } else {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = line.kind === "support" ? "#3ddea0" : "#ff5d6c";
      ctx.moveTo(layout.padL, y0);
      ctx.lineTo(right, y0);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function isExtendedPoint(point) {
  return point?.session === "pre" || point?.session === "post";
}

function strokeWhere(ctx, coords, accept, color) {
  ctx.beginPath();
  let open = false;
  for (let index = 1; index < coords.length; index += 1) {
    if (!accept(coords[index - 1].point, coords[index].point)) {
      open = false;
      continue;
    }
    if (!open) {
      ctx.moveTo(coords[index - 1].x, coords[index - 1].y);
      open = true;
    }
    ctx.lineTo(coords[index].x, coords[index].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.stroke();
}

function sessionScrub(point) {
  if (point?.session === "pre") return "Vorbörse";
  if (point?.session === "post") return "Nachhandel";
  return "";
}

function showScrub(canvas, coord, layout) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub || !coord) return;
  const phase = sessionScrub(coord.point);
  const when = formatScrubWhen(coord.point.t, layout?.spanMs || 0);
  const price = formatEuroAxis(Number(coord.point.eur));
  const change = scrubDelta(layout?.coords?.[0]?.point?.eur, coord.point.eur);
  scrub.hidden = false;
  scrub.replaceChildren(document.createTextNode(`${when} · ${price}`));
  if (change) {
    scrub.append(document.createTextNode(" · "));
    const pct = document.createElement("span");
    if (change.direction !== "flat") pct.className = change.direction;
    pct.textContent = change.text;
    scrub.append(pct);
  }
  if (phase) scrub.append(document.createTextNode(` · ${phase}`));
}

function hideScrub(canvas) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub) return;
  scrub.hidden = true;
  scrub.textContent = "";
}

function clearChartSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return;
  selection.removeAllRanges();
}

function bindScrub(canvas) {
  if (canvas.dataset.scrubBound) return;
  canvas.dataset.scrubBound = "1";
  const wrap = canvas.closest(".chart-wrap") || canvas;
  wrap.addEventListener("selectstart", (event) => event.preventDefault());
  let active = false;
  const place = (clientX) => {
    clearChartSelection();
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
    showScrub(canvas, nearest, state.layout);
  };
  const end = () => {
    if (!active) return;
    active = false;
    clearChartSelection();
    const state = canvas._chartState;
    if (state) paintChart(canvas, state, null);
    hideScrub(canvas);
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
  /* iOS legt sonst beim Ziehen eine blaue Auswahl über die Zeichenfläche. */
  canvas.addEventListener("touchstart", (event) => {
    if (event.cancelable) event.preventDefault();
    const touch = touchPoint(event);
    if (!touch) return;
    active = true;
    place(touch.clientX);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    if (event.cancelable) event.preventDefault();
    clearChartSelection();
    if (!active) return;
    const touch = touchPoint(event);
    if (touch) place(touch.clientX);
  }, { passive: false });
  canvas.addEventListener("touchend", (event) => {
    if (event.touches.length === 0) end();
  });
  canvas.addEventListener("touchcancel", end);
}

export function drawLineChart(canvas, points, { color = "#e4b15a", axes = false, scrub = false, lines = [] } = {}) {
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
  const state = { color, width, height, layout, axes, lines: lines || [] };
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
      const { points } = seriesFor(ticker, ui.chartRange);
      const first = Number(points[0]?.eur);
      const last = Number(points.at(-1)?.eur);
      const falling = points.length > 1 && last < first;
      const color = falling ? "#ff5d6c" : "#3ddea0";
      const lines = chartAnalysis(ticker, ui.chartRange).lines;
      drawLineChart(canvas, points, { color, axes: true, scrub: true, lines });
    } else if (kind === "prod") {
      const series = (data.production?.series || []).find((item) => item.id === canvas.dataset.series);
      drawLineChart(canvas, (series?.points || []).map((point) => ({ t: point.date, eur: point.value })), { color: "#e4b15a" });
    } else if (kind === "hit") {
      const investor = (data.crowd?.investors || []).find((item) => item.id === canvas.dataset.investor);
      drawLineChart(canvas, (investor?.hitRateHistory || []).map((point) => ({ t: point.date, eur: point.hitRatePct })), { color: "#9fdfff" });
    }
  });
}
