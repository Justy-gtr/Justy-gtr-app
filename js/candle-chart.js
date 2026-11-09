import { analyseChart, levelMarkLabel } from "./analyse.js";
import { candleColor, scrubLabel } from "./candles.js";
import { chartAxisLabels, guideLabelsToDraw, guideStyle } from "./logic.js";

const euroAxis = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatEuroAxis(value) {
  return `${euroAxis.format(value)} €`;
}

function layoutOf(width, height, candles, lines) {
  let min = Math.min(...candles.map((candle) => candle.low));
  let max = Math.max(...candles.map((candle) => candle.high));
  for (const line of lines || []) {
    if (line.eur0 != null) {
      min = Math.min(min, line.eur0);
      max = Math.max(max, line.eur0);
    }
    if (line.eur1 != null) {
      min = Math.min(min, line.eur1);
      max = Math.max(max, line.eur1);
    }
  }
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
  min -= pad;
  max += pad;
  const padL = 8;
  const padR = 62;
  const padT = 16;
  const padB = 28;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const first = new Date(candles[0].t).getTime();
  const last = new Date(candles.at(-1).t).getTime();
  return {
    min,
    max,
    padL,
    padR,
    padT,
    padB,
    plotW,
    plotH,
    count: candles.length,
    spanMs: Math.abs(last - first) || 0
  };
}

function yOf(layout, price) {
  const span = layout.max - layout.min || 1;
  return layout.padT + (1 - (price - layout.min) / span) * layout.plotH;
}

function xOf(layout, index) {
  const slot = layout.plotW / layout.count;
  const clamped = Math.max(0, Math.min(layout.count - 1, index));
  return layout.padL + (clamped + 0.5) * slot;
}

function paintCandles(canvas, state, hover) {
  const { width, height, candles, lines, layout } = state;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9aa3b5";
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 1;
  const ticks = 4;
  for (let index = 0; index < ticks; index += 1) {
    const value = layout.max - ((layout.max - layout.min) * index) / (ticks - 1);
    const y = layout.padT + (layout.plotH * index) / (ticks - 1);
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(layout.padL, y);
    ctx.lineTo(width - layout.padR + 4, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatEuroAxis(value), width - 4, y);
  }
  const marks = chartAxisLabels(candles);
  marks.forEach((mark, index) => {
    const x = xOf(layout, mark.index);
    ctx.textBaseline = "bottom";
    if (index === 0) ctx.textAlign = "left";
    else if (index === marks.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    const labelX = index === marks.length - 1 ? Math.min(x, width - layout.padR) : x;
    ctx.fillText(mark.text, labelX, height - 4);
  });
  const slot = layout.plotW / candles.length;
  const bodyW = Math.max(3, Math.min(14, slot * 0.72));
  candles.forEach((candle, index) => {
    const x = xOf(layout, index);
    const color = candleColor(candle);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = hover === index ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(layout, candle.high));
    ctx.lineTo(x, yOf(layout, candle.low));
    ctx.stroke();
    const top = yOf(layout, Math.max(candle.open, candle.close));
    const bottom = yOf(layout, Math.min(candle.open, candle.close));
    const body = Math.max(1, bottom - top);
    ctx.fillRect(x - bodyW / 2, top, bodyW, body);
  });
  const captions = paintLines(ctx, layout, lines, candles);
  paintTouchMarks(ctx, layout, lines, captions);
  const marked = (lines || []).find((line) => line.kind === "mark");
  if (marked) {
    const candle = candles[marked.index];
    if (candle) {
      const x = xOf(layout, marked.index);
      ctx.strokeStyle = "rgba(232, 234, 240, 0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bodyW / 2 - 2, yOf(layout, candle.high) - 3, bodyW + 4, yOf(layout, candle.low) - yOf(layout, candle.high) + 6);
    }
  }
  if (hover != null && candles[hover]) {
    const x = xOf(layout, hover);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(244,241,234,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, layout.padT);
    ctx.lineTo(x, height - layout.padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function paintLines(ctx, layout, lines, candles) {
  const pending = [];
  const last = candles?.at?.(-1);
  const priceY = yOf(layout, last?.close ?? last?.eur ?? layout.min);
  ctx.lineCap = "butt";
  ctx.lineWidth = 1;
  for (const line of lines || []) {
    if (line.kind === "mark" || line.eur0 == null) continue;
    const style = guideStyle(line.kind);
    if (!style) continue;
    const y0 = yOf(layout, line.eur0);
    const y1 = yOf(layout, line.eur1 ?? line.eur0);
    ctx.beginPath();
    ctx.setLineDash(style.dash);
    ctx.strokeStyle = style.color;
    let endY = y0;
    if (line.kind === "support" || line.kind === "resistance") {
      ctx.moveTo(layout.padL, y0);
      ctx.lineTo(layout.padL + layout.plotW, y0);
    } else {
      endY = y1;
      ctx.moveTo(xOf(layout, line.i0 || 0), y0);
      ctx.lineTo(xOf(layout, line.i1 ?? layout.count - 1), y1);
    }
    ctx.stroke();
    if (line.kind !== "pattern") {
      const counted = line.kind === "support" || line.kind === "resistance" ? levelMarkLabel(line.kind, line) : style.label;
      pending.push({ y: endY, text: counted, fallback: style.label, color: style.color, kind: line.kind });
    }
  }
  ctx.setLineDash([]);
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const captions = [];
  const right = layout.padL + layout.plotW - 2;
  for (const label of guideLabelsToDraw(pending, priceY)) {
    const y = Math.max(layout.padT + 7, Math.min(label.y, layout.padT + layout.plotH - 7));
    const full = label.text;
    const text = ctx.measureText(full).width <= layout.plotW * 0.55 ? full : (label.fallback || full);
    const width = ctx.measureText(text).width;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(7, 8, 13, 0.88)";
    ctx.strokeText(text, right, y);
    ctx.fillStyle = label.color;
    ctx.fillText(text, right, y);
    captions.push({ kind: label.kind, left: right - width - 2, right: right + 2, top: y - 7, bottom: y + 7 });
  }
  return captions;
}

function paintTouchMarks(ctx, layout, lines, captions) {
  ctx.setLineDash([]);
  for (const line of lines || []) {
    if (line.kind !== "support" && line.kind !== "resistance") continue;
    if (line.eur0 == null) continue;
    const style = guideStyle(line.kind);
    if (!style) continue;
    const y = yOf(layout, line.eur0);
    const caption = (captions || []).find((item) => item.kind === line.kind);
    for (const touch of line.touches || []) {
      if (!Number.isFinite(touch?.index) || touch.index < 0 || touch.index >= layout.count) continue;
      const x = xOf(layout, touch.index);
      const covered = caption && x >= caption.left - 6 && x <= caption.right + 4 && y >= caption.top - 4 && y <= caption.bottom + 4;
      const shift = covered ? (line.kind === "resistance" ? 11 : -11) : 0;
      paintTouchMark(ctx, x, y + shift, line.kind, touch.outcome, style.color);
    }
  }
}

function paintTouchMark(ctx, x, y, kind, outcome, color) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (outcome === "open") {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (outcome === "bounce") {
    const height = 5;
    const width = 5;
    ctx.beginPath();
    if (kind === "resistance") {
      ctx.moveTo(x, y + height);
      ctx.lineTo(x + width / 2, y);
      ctx.lineTo(x - width / 2, y);
    } else {
      ctx.moveTo(x, y - height);
      ctx.lineTo(x + width / 2, y);
      ctx.lineTo(x - width / 2, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(7, 8, 13, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }
  if (outcome === "broke") {
    const size = 3;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "rgba(7, 8, 13, 0.9)";
    ctx.stroke();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}

function showScrub(canvas, candle, firstClose, candles) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub) return;
  scrub.hidden = false;
  scrub.textContent = scrubLabel(candle, firstClose, candles);
}

function hideScrub(canvas) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub) return;
  scrub.hidden = false;
  scrub.textContent = "";
}

function clearSelection() {
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
    clearSelection();
    const state = canvas._candleState;
    if (!state?.candles?.length) return;
    const x = clientX - canvas.getBoundingClientRect().left;
    let nearest = 0;
    let best = Infinity;
    state.candles.forEach((_, index) => {
      const distance = Math.abs(xOf(state.layout, index) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    paintCandles(canvas, state, nearest);
    showScrub(canvas, state.candles[nearest], state.candles[0].close, state.candles);
  };
  const end = () => {
    if (!active) return;
    active = false;
    clearSelection();
    const state = canvas._candleState;
    if (state) paintCandles(canvas, state, null);
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

function paintMessage(canvas, text) {
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 260;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#b7c0d0";
  ctx.fillText(text, 12, height / 2);
  canvas._candleState = null;
}

export function drawCandles(data, ui) {
  document.querySelectorAll("canvas[data-chart='candles']").forEach((canvas) => {
    const ticker = (data?.prices?.tickers || []).find((item) => item.symbol === (canvas.dataset.symbol || ui.analyseSymbol));
    const result = analyseChart(ticker, ui.analyseRange || "15 Min");
    if (result.missing) {
      paintMessage(canvas, "Keine 4-Stunden-Reihe.");
      hideScrub(canvas);
      return;
    }
    const candles = result.candles || [];
    if (candles.length < 1) {
      paintMessage(canvas, "Noch keine Kerzen.");
      hideScrub(canvas);
      return;
    }
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 260;
    const state = { width, height, candles, lines: result.lines || [], layout: layoutOf(width, height, candles, result.lines) };
    canvas._candleState = state;
    paintCandles(canvas, state, null);
    bindScrub(canvas);
  });
}
