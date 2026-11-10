import { analyseChart, levelPriceTag, levelSideName } from "./analyse.js";
import { candleColor, scrubLabel } from "./candles.js";
import { chartAxisLabels, guideLabelsToDraw, guideStyle } from "./logic.js";

const euroAxis = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatEuroAxis(value) {
  return `${euroAxis.format(value)} €`;
}

/** Empty strip between the newest candle and the price gutter. */
export const GUTTER_GAP = 10;
/** Inset of a price tag from the canvas edge. */
export const GUTTER_EDGE = 6;
/** Horizontal padding inside a price pill, added to the measured text. */
export const TAG_HPAD = 10;

/** Width of the price gutter so the widest tag fits without entering the plot. */
export function gutterWidth(textWidths, { extra = TAG_HPAD + GUTTER_EDGE, min = 78 } = {}) {
  const widest = (textWidths || []).reduce((max, value) => Math.max(max, Number(value) || 0), 0);
  return Math.ceil(Math.max(min, widest + extra));
}

/** Left edge of the price gutter. Candles stay to the left of this. */
export function gutterStart(layout) {
  return (layout?.padL || 0) + (layout?.plotW || 0);
}

/**
 * Pill rectangle inside the gutter. `gutterRight` is the right inset of the canvas.
 * The box never starts left of the gutter.
 */
export function tagBox(gutterLeft, gutterRight, textWidth, pillPad = TAG_HPAD) {
  const span = Math.max(0, gutterRight - gutterLeft);
  const width = Math.min(Math.ceil(Number(textWidth) || 0) + pillPad, span);
  const left = Math.max(gutterLeft, gutterRight - width);
  return { left, right: left + width, width };
}

export function candleBodyWidth(slot) {
  return Math.max(slot < 4.8 ? 2 : 3, Math.min(14, slot * 0.72));
}

/** Center of a candle. The scale stops `gap` px before the gutter. */
export function candleX(layout, index) {
  const count = Math.max(1, layout?.count || 1);
  const inner = Math.max(1, (layout?.plotW || 1) - (layout?.gap || 0));
  const slot = inner / count;
  const clamped = Math.max(0, Math.min(count - 1, index));
  return (layout?.padL || 0) + (clamped + 0.5) * slot;
}

function layoutOf(width, height, candles, lines, padR = 78) {
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
  const right = Math.max(78, padR);
  const padT = 16;
  const padB = 28;
  const plotW = Math.max(1, width - padL - right);
  const plotH = Math.max(1, height - padT - padB);
  const first = new Date(candles[0].t).getTime();
  const last = new Date(candles.at(-1).t).getTime();
  return {
    min,
    max,
    padL,
    padR: right,
    padT,
    padB,
    plotW,
    plotH,
    gap: GUTTER_GAP,
    count: candles.length,
    spanMs: Math.abs(last - first) || 0
  };
}

function yOf(layout, price) {
  const span = layout.max - layout.min || 1;
  return layout.padT + (1 - (price - layout.min) / span) * layout.plotH;
}

function xOf(layout, index) {
  return candleX(layout, index);
}

/** Left end of a line name. A trend that starts late still stays off the newest candles. */
export function nameAnchorX(layout, index = 0) {
  const count = Math.max(1, layout?.count || 1);
  const plotW = layout?.plotW || 1;
  const padL = layout?.padL || 0;
  const slot = plotW / count;
  const x = padL + (Math.max(0, index) + 0.5) * slot;
  const limit = padL + plotW * 0.4;
  return Math.min(Math.max(padL + 4, x), limit);
}

/**
 * Name sits just off the line, in the clearer gap.
 * `obstacles` are y positions already taken (other names, nearby wicks).
 */
export function pickNameY(anchorY, obstacles, bounds = {}) {
  const minY = Number.isFinite(bounds.min) ? bounds.min : anchorY - 48;
  const maxY = Number.isFinite(bounds.max) ? bounds.max : anchorY + 48;
  const gap = Number.isFinite(bounds.gap) ? bounds.gap : 12;
  const taken = (obstacles || []).map((item) => (typeof item === "number" ? item : Number(item?.y))).filter((y) => Number.isFinite(y));
  const blocked = (y) => y < minY || y > maxY || taken.some((other) => Math.abs(other - y) < gap);
  for (const delta of [-11, 11, -20, 20, -4, 4, 0]) {
    const y = anchorY + delta;
    if (!blocked(y)) return y;
  }
  const span = Math.max(1, maxY - minY);
  for (let step = 1; step <= span; step += 1) {
    if (!blocked(anchorY - step)) return Math.max(minY, Math.min(maxY, anchorY - step));
    if (!blocked(anchorY + step)) return Math.max(minY, Math.min(maxY, anchorY + step));
  }
  return Math.max(minY, Math.min(maxY, anchorY));
}

/** Price pills keep their line height unless two would sit on top of each other. */
export function settlePriceTags(tags, bounds = {}) {
  const list = tags || [];
  if (!list.length) return [];
  const home = list.reduce((sum, tag) => sum + Number(tag.y || 0), 0) / list.length;
  return guideLabelsToDraw(list, home, 18, {
    min: Number.isFinite(bounds.min) ? bounds.min : -100000,
    max: Number.isFinite(bounds.max) ? bounds.max : 100000
  });
}

/** A grid price that would collide with a pill is left off the axis. The grid line stays. */
export function visibleGridLabels(labels, tags, gap = 14) {
  return (labels || []).filter((label) => (tags || []).every((tag) => Math.abs(label.y - tag.y) >= gap));
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function priceGutter(ctx, candles, lines) {
  ctx.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
  const texts = [];
  const last = candles.at(-1);
  if (last && Number.isFinite(Number(last.close))) texts.push(formatEuroAxis(last.close));
  let low = Math.min(...candles.map((candle) => candle.low));
  let high = Math.max(...candles.map((candle) => candle.high));
  for (const line of lines || []) {
    if (line?.eur0 != null) {
      low = Math.min(low, line.eur0);
      high = Math.max(high, line.eur0);
    }
    if (line?.kind !== "support" && line?.kind !== "resistance") continue;
    const price = levelPriceTag(line.eur ?? line.eur0);
    if (price) texts.push(price);
  }
  texts.push(formatEuroAxis(low), formatEuroAxis(high));
  return gutterWidth(texts.filter(Boolean).map((text) => ctx.measureText(text).width));
}

function paintCandles(canvas, state, hover) {
  const { width, height, candles, lines } = state;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const layout = layoutOf(width, height, candles, lines, priceGutter(ctx, candles, lines));
  state.layout = layout;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9aa3b5";
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 1;
  const ticks = 4;
  const gridLabels = [];
  for (let index = 0; index < ticks; index += 1) {
    const value = layout.max - ((layout.max - layout.min) * index) / (ticks - 1);
    const y = layout.padT + (layout.plotH * index) / (ticks - 1);
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(layout.padL, y);
    ctx.lineTo(gutterStart(layout) - layout.gap, y);
    ctx.stroke();
    ctx.setLineDash([]);
    gridLabels.push({ y, text: formatEuroAxis(value) });
  }
  const marks = chartAxisLabels(candles);
  marks.forEach((mark, index) => {
    const x = xOf(layout, mark.index);
    ctx.textBaseline = "bottom";
    if (index === 0) ctx.textAlign = "left";
    else if (index === marks.length - 1) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    const labelX = index === marks.length - 1 ? Math.min(x, gutterStart(layout) - layout.gap) : x;
    ctx.fillText(mark.text, labelX, height - 4);
  });
  const slot = (layout.plotW - layout.gap) / candles.length;
  const bodyW = candleBodyWidth(slot);
  const candleLimit = gutterStart(layout) - layout.gap;
  candles.forEach((candle, index) => {
    const x = Math.min(xOf(layout, index), candleLimit - bodyW / 2);
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
    const bodyLeft = Math.min(x - bodyW / 2, candleLimit - 1);
    const bodyRight = Math.min(x + bodyW / 2, candleLimit);
    ctx.fillRect(bodyLeft, top, Math.max(1, bodyRight - bodyLeft), body);
  });
  const captions = paintLines(ctx, layout, lines, candles, gridLabels, width);
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

function paintPriceTag(ctx, gutterLeft, gutterRight, y, text, color) {
  ctx.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
  const box = tagBox(gutterLeft, gutterRight, ctx.measureText(text).width);
  const height = 16;
  const top = y - height / 2;
  roundRect(ctx, box.left, top, box.width, height, 5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#141820";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, box.left + box.width / 2, y + 0.5);
  return { left: box.left, right: box.right, top, bottom: top + height, y };
}

function paintLineName(ctx, x, y, text, color) {
  ctx.font = "600 10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(7, 8, 13, 0.88)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  return { left: x, right: x + width, top: y - 7, bottom: y + 7, y };
}

function nearbyWicks(layout, candles, x, width) {
  const ys = [];
  for (let index = 0; index < candles.length; index += 1) {
    const candleX = xOf(layout, index);
    if (candleX < x - 4 || candleX > x + width + 8) continue;
    ys.push(yOf(layout, candles[index].high), yOf(layout, candles[index].low));
  }
  return ys;
}

function paintLines(ctx, layout, lines, candles, gridLabels, width) {
  const pendingTags = [];
  const pendingNames = [];
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
    if (line.kind === "support" || line.kind === "resistance") {
      ctx.moveTo(layout.padL, y0);
      ctx.lineTo(gutterStart(layout) - layout.gap, y0);
    } else {
      ctx.moveTo(xOf(layout, line.i0 || 0), y0);
      ctx.lineTo(xOf(layout, line.i1 ?? layout.count - 1), y1);
    }
    ctx.stroke();
    if (line.kind === "pattern") continue;
    const name = levelSideName(line.kind, line);
    if (name) {
      const anchorX = line.kind === "trend" ? nameAnchorX(layout, line.i0 || 0) : layout.padL + 4;
      pendingNames.push({
        y: line.kind === "trend" ? y0 : y0,
        anchorY: y0,
        x: anchorX,
        text: name,
        color: style.color,
        kind: line.kind
      });
    }
    if (line.kind === "support" || line.kind === "resistance") {
      const price = levelPriceTag(line.eur ?? line.eur0);
      if (price) pendingTags.push({ y: y0, text: price, color: style.color, kind: line.kind });
    }
  }
  const lastCandle = candles?.at?.(-1);
  if (lastCandle && Number.isFinite(Number(lastCandle.close))) {
    pendingTags.push({
      y: yOf(layout, lastCandle.close),
      text: formatEuroAxis(lastCandle.close),
      color: candleColor(lastCandle),
      kind: "last"
    });
  }
  ctx.setLineDash([]);

  const bounds = { min: layout.padT + 9, max: layout.padT + layout.plotH - 9 };
  const tags = settlePriceTags(pendingTags, bounds);
  const gutterLeft = gutterStart(layout);
  const gutterRight = width - GUTTER_EDGE;
  const drawnTags = [];
  for (const tag of tags) {
    drawnTags.push(paintPriceTag(ctx, gutterLeft, gutterRight, tag.y, tag.text, tag.color));
  }

  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9aa3b5";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const label of visibleGridLabels(gridLabels, tags, 14)) {
    const labelWidth = ctx.measureText(label.text).width;
    const box = tagBox(gutterLeft, gutterRight, labelWidth, 0);
    ctx.fillText(label.text, box.right, label.y);
  }

  ctx.font = "600 10px -apple-system, BlinkMacSystemFont, sans-serif";
  const captions = [];
  const taken = [];
  const ordered = [...pendingNames].sort((a, b) => a.anchorY - b.anchorY);
  for (const name of ordered) {
    const textWidth = ctx.measureText(name.text).width;
    const wicks = nearbyWicks(layout, candles, name.x, textWidth);
    const y = pickNameY(name.anchorY, taken.concat(wicks), { ...bounds, gap: 12 });
    const box = paintLineName(ctx, name.x, y, name.text, name.color);
    captions.push({ ...box, kind: name.kind });
    taken.push(y);
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
    const caption = (captions || [])
      .filter((item) => item.kind === line.kind)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
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

function scrubLine(canvas) {
  const wrap = canvas.closest?.(".chart-wrap");
  const line = wrap?.querySelector?.(".scrub");
  if (line) return line;
  return canvas.parentElement?.querySelector?.(".scrub") || null;
}

function showScrub(canvas, candle, firstClose, candles) {
  const scrub = scrubLine(canvas);
  if (!scrub) return;
  scrub.hidden = false;
  scrub.textContent = scrubLabel(candle, firstClose, candles);
}

function hideScrub(canvas) {
  const scrub = scrubLine(canvas);
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
    const lines = result.lines || [];
    const state = { width, height, candles, lines, layout: null };
    canvas._candleState = state;
    paintCandles(canvas, state, null);
    bindScrub(canvas);
  });
}
