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

export function drawLineChart(canvas, points, { color = "#e4b15a" } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 180;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const values = (points || []).map((point) => Number(point.eur)).filter((value) => !Number.isNaN(value));
  ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
  if (values.length < 2) {
    ctx.fillStyle = "#b7c0d0";
    ctx.fillText("Noch keine Reihe.", 12, height / 2);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 8;
  const padY = 16;
  const coords = values.map((value, index) => [
    padX + (index / (values.length - 1)) * (width - padX * 2),
    padY + (1 - (value - min) / span) * (height - padY * 2)
  ]);
  const gradient = ctx.createLinearGradient(0, padY, 0, height - padY);
  gradient.addColorStop(0, hexAlpha(color, 0.32));
  gradient.addColorStop(1, hexAlpha(color, 0));
  ctx.beginPath();
  coords.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineTo(coords.at(-1)[0], height - padY);
  ctx.lineTo(coords[0][0], height - padY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  coords.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  const last = coords.at(-1);
  ctx.beginPath();
  ctx.arc(last[0], last[1], 3.4, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f1ea";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

export function drawCharts(data, ui) {
  document.querySelectorAll("canvas[data-chart]").forEach((canvas) => {
    const kind = canvas.dataset.chart;
    if (kind === "price") {
      const ticker = (data.prices?.tickers || []).find((item) => item.symbol === (canvas.dataset.symbol || ui.chartSymbol));
      const { points } = seriesFor(ticker, ui.chartRange, ui.langfrist);
      const color = ui.langfrist ? "#e4b15a" : (ticker?.changePct < 0 ? "#ff8b98" : "#7ddec0");
      drawLineChart(canvas, points, { color });
    } else if (kind === "prod") {
      const series = (data.production?.series || []).find((item) => item.id === canvas.dataset.series);
      drawLineChart(canvas, (series?.points || []).map((point) => ({ t: point.date, eur: point.value })), { color: "#e4b15a" });
    } else if (kind === "hit") {
      const investor = (data.crowd?.investors || []).find((item) => item.id === canvas.dataset.investor);
      drawLineChart(canvas, (investor?.hitRateHistory || []).map((point) => ({ t: point.date, eur: point.hitRatePct })), { color: "#9fdfff" });
    }
  });
}
