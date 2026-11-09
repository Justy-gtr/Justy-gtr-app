import { chartAxisLabels, formatScrubWhen, guideLabelsToDraw, guideStyle, instrumentAxisLabels, instrumentSeries, scrubDelta, seriesFor } from "./logic.js";

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

function chartLayout(width, height, points, axes) {
  const padL = 8;
  const padR = axes ? 62 : 8;
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

function paintInstrument(canvas, state, hover) {
  const { color, width, height, layout } = state;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const { coords, min, max, padT, padB, padL, plotW, plotH } = layout;
  const baseline = coords[0].y;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 1;
  ctx.setLineDash([1.5, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, baseline);
  ctx.lineTo(padL + plotW, baseline);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  coords.forEach((coord, index) => (index ? ctx.lineTo(coord.x, coord.y) : ctx.moveTo(coord.x, coord.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#8b93a6";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 4;
  for (let index = 0; index < ticks; index += 1) {
    const value = max - ((max - min) * index) / (ticks - 1);
    const y = padT + (plotH * index) / (ticks - 1);
    ctx.fillText(formatEuroAxis(value), width - 2, y);
  }
  const marks = instrumentAxisLabels(coords.map((coord) => coord.point));
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#8b93a6";
  marks.forEach((mark, index) => {
    const coord = coords[mark.index];
    if (!coord) return;
    if (index === 0) ctx.textAlign = "left";
    else if (index === marks.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    const x = index === marks.length - 1 ? Math.min(coord.x, padL + plotW) : Math.max(coord.x, padL);
    ctx.fillText(mark.text, x, height - 2);
  });

  const focus = hover || coords.at(-1);
  ctx.beginPath();
  ctx.arc(focus.x, focus.y, hover ? 4 : 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (hover) {
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(244,241,234,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hover.x, padT);
    ctx.lineTo(hover.x, height - padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
    const marks = chartAxisLabels(coords.map((coord) => coord.point));
    marks.forEach((mark, index) => {
      const coord = coords[mark.index];
      ctx.textBaseline = "bottom";
      if (index === 0) ctx.textAlign = "left";
      else if (index === marks.length - 1) ctx.textAlign = "right";
      else ctx.textAlign = "center";
      const x = index === marks.length - 1 ? Math.min(coord.x, width - layout.padR) : coord.x;
      ctx.fillText(mark.text, x, height - 4);
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

function guideY(layout, price) {
  const span = layout.max - layout.min || 1;
  const y = layout.padT + (1 - (price - layout.min) / span) * layout.plotH;
  return Math.min(layout.padT + layout.plotH, Math.max(layout.padT, y));
}

function paintGuides(ctx, layout, lines) {
  if (!lines?.length || !layout?.coords?.length) return;
  const { coords } = layout;
  const plotRight = layout.padL + layout.plotW;
  const pending = [];
  const priceY = coords.at(-1).y;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  for (const line of lines) {
    if (line.eur0 == null) continue;
    const style = guideStyle(line.kind);
    if (!style) continue;
    const y0 = guideY(layout, line.eur0);
    const y1 = guideY(layout, line.eur1 ?? line.eur0);
    ctx.beginPath();
    ctx.setLineDash(style.dash);
    ctx.strokeStyle = style.color;
    let endY = y0;
    if (line.kind === "trend" || line.kind === "pattern") {
      endY = y1;
      ctx.moveTo(coords[0].x, y0);
      ctx.lineTo(coords.at(-1).x, y1);
    } else {
      ctx.moveTo(layout.padL, y0);
      ctx.lineTo(plotRight, y0);
    }
    ctx.stroke();
    if (line.kind !== "pattern") pending.push({ y: endY, text: style.label, color: style.color });
  }
  ctx.setLineDash([]);
  const width = layout.padL + layout.plotW + layout.padR;
  const hasAxis = layout.padR > 20;
  let right = plotRight - 2;
  if (hasAxis) {
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    let axisWidth = 0;
    const ticks = 4;
    for (let index = 0; index < ticks; index += 1) {
      const value = layout.max - ((layout.max - layout.min) * index) / (ticks - 1);
      axisWidth = Math.max(axisWidth, ctx.measureText(formatEuroAxis(value)).width);
    }
    right = Math.min(plotRight - 4, width - 4 - axisWidth - 6);
  }
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const placed = guideLabelsToDraw(pending, priceY, 16, {
    min: layout.padT + 7,
    max: layout.padT + layout.plotH - 7
  });
  for (const label of placed) {
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, right, label.y);
  }
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
  const points = (layout?.coords || []).map((item) => item.point);
  const when = formatScrubWhen(coord.point.t, points);
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
  scrub.hidden = false;
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
    if (state.instrument) paintInstrument(canvas, state, nearest);
    else paintChart(canvas, state, nearest);
    showScrub(canvas, nearest, state.layout);
  };
  const end = () => {
    if (!active) return;
    active = false;
    clearChartSelection();
    const state = canvas._chartState;
    if (state) {
      if (state.instrument) paintInstrument(canvas, state, null);
      else paintChart(canvas, state, null);
    }
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

export function drawLineChart(canvas, points, { color = "#e4b15a", axes = false, scrub = false, lines = [], instrument = false } = {}) {
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
    const note = usable.length === 1 ? `Ein Punkt · ${formatEuroAxis(Number(usable[0].eur))}` : "Noch keine Reihe.";
    ctx.fillText(note, 12, height / 2);
    canvas._chartState = null;
    return;
  }
  const layout = chartLayout(width, height, usable, axes || instrument);
  const state = { color, width, height, layout, axes: axes || instrument, lines: instrument ? [] : (lines || []), instrument };
  canvas._chartState = state;
  if (instrument) paintInstrument(canvas, state, null);
  else paintChart(canvas, state, null);
  if (scrub) bindScrub(canvas);
  else hideScrub(canvas);
}

export function drawCharts(data, ui) {
  document.querySelectorAll("canvas[data-chart]").forEach((canvas) => {
    const kind = canvas.dataset.chart;
    if (kind === "price") {
      const ticker = (data.prices?.tickers || []).find((item) => item.symbol === (canvas.dataset.symbol || ui.chartSymbol));
      const picked = ui.langfrist
        ? seriesFor(ticker, ui.chartRange, true)
        : instrumentSeries(ticker, ui.chartRange);
      const points = picked.points || [];
      const first = Number(points[0]?.eur);
      const last = Number(points.at(-1)?.eur);
      const falling = points.length > 1 && last < first;
      const color = falling ? "#ff5d6c" : "#3ddc84";
      drawLineChart(canvas, points, { color, axes: true, scrub: true, instrument: true });
    } else if (kind === "prod") {
      const series = (data.production?.series || []).find((item) => item.id === canvas.dataset.series);
      drawLineChart(canvas, (series?.points || []).map((point) => ({ t: point.date, eur: point.value })), { color: "#e4b15a" });
    } else if (kind === "hit") {
      const investor = (data.crowd?.investors || []).find((item) => item.id === canvas.dataset.investor);
      drawLineChart(canvas, (investor?.hitRateHistory || []).map((point) => ({ t: point.date, eur: point.hitRatePct })), { color: "#9fdfff" });
    }
  });
}
