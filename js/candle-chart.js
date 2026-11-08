import { analyseChart } from "./analyse.js";
import { scrubLabel } from "./candles.js";

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
  const padR = 78;
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
  const marks = [0, 0.33, 0.66, 1].map((ratio) => Math.round(ratio * (candles.length - 1)));
  marks.forEach((index, mark) => {
    const candle = candles[index];
    const x = xOf(layout, index);
    ctx.textBaseline = "bottom";
    if (mark === 0) ctx.textAlign = "left";
    else if (mark === marks.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    const labelX = mark === marks.length - 1 ? Math.min(x, width - layout.padR) : x;
    ctx.fillText(formatAxisDate(candle.t, layout.spanMs), labelX, height - 4);
  });
  const slot = layout.plotW / candles.length;
  const bodyW = Math.max(1.5, Math.min(14, slot * 0.62));
  candles.forEach((candle, index) => {
    const x = xOf(layout, index);
    const up = candle.close >= candle.open;
    const extended = candle.session === "pre" || candle.session === "post";
    const color = extended ? "#e4b15a" : (up ? "#3ddea0" : "#ff5d6c");
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
  paintLines(ctx, layout, lines);
  const marked = (lines || []).find((line) => line.kind === "mark");
  if (marked) {
    const candle = candles[marked.index];
    if (candle) {
      const x = xOf(layout, marked.index);
      ctx.strokeStyle = "#9fdfff";
      ctx.lineWidth = 1.5;
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

function paintLines(ctx, layout, lines) {
  ctx.lineWidth = 1.5;
  ctx.lineCap = "butt";
  for (const line of lines || []) {
    if (line.kind === "mark" || line.eur0 == null) continue;
    const y0 = yOf(layout, line.eur0);
    const y1 = yOf(layout, line.eur1 ?? line.eur0);
    ctx.beginPath();
    if (line.kind === "support" || line.kind === "resistance") {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = line.kind === "support" ? "#3ddea0" : "#ff5d6c";
      ctx.moveTo(layout.padL, y0);
      ctx.lineTo(layout.padL + layout.plotW, y0);
    } else if (line.kind === "trend") {
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "#e4b15a";
      ctx.moveTo(xOf(layout, line.i0 || 0), y0);
      ctx.lineTo(xOf(layout, line.i1 ?? layout.count - 1), y1);
    } else {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#9fdfff";
      ctx.moveTo(xOf(layout, line.i0 || 0), y0);
      ctx.lineTo(xOf(layout, line.i1 ?? layout.count - 1), y1);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function showScrub(canvas, candle, firstClose, spanMs) {
  const scrub = canvas.parentElement?.querySelector(".scrub");
  if (!scrub) return;
  scrub.hidden = false;
  scrub.textContent = scrubLabel(candle, firstClose, spanMs);
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
    showScrub(canvas, state.candles[nearest], state.candles[0].close, state.layout.spanMs);
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
