import { N_LEGEND, analyseChart, analyseText } from "./analyse.js";
import { ANALYSE_RANGES, rangeAria, rangeLabel } from "./candles.js";
import { analysisShowsN } from "./analysis.js";
import { esc, formatEUR, formatPct, guideStyle, methodLabel, rangeChange } from "./logic.js";
import { renderSeasonalityCard } from "./seasonality.js";

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function musterCard(analysis) {
  const outcome = analysis?.outcome || {};
  const up = outcome.pct?.up ?? 0;
  const down = outcome.pct?.down ?? 0;
  const figures = outcome.show ? `<div class="versus"><div><span class="big up">${up} %</span><span class="muted">danach hoch</span></div><div><span class="big down">${down} %</span><span class="muted">danach runter</span></div></div>` : "";
  const levels = (analysis?.levels || []).map((level) => `
    <div class="level-block">
      <p class="level-head"><strong><i class="swatch ${level.kind === "resistance" ? "resist" : level.kind}" aria-hidden="true"></i>${esc(level.title)}</strong>${level.eur == null ? "" : `<span class="level-price">${esc(formatEUR(level.eur))}</span>`}</p>
      ${level.kicker ? `<p class="level-kicker">${esc(level.kicker)}</p>` : ""}
      <p class="level-stat">${esc(level.sentence)}</p>
    </div>`).join("");
  const legend = (analysis?.legend || []).map((item) => `<span><i class="swatch ${item.kind === "resistance" ? "resist" : item.kind}" aria-hidden="true"></i>${esc(item.label)}</span>`).join("");
  const counted = analysisShowsN(analysis) || /n\s*=/.test(analyseText(analysis));
  return `
    <article class="card analysis" aria-label="Kursbild">
      <p class="kicker">Muster</p>
      <h3>${esc(analysis?.title || "Keine klare Form")}</h3>
      ${figures}
      <p class="analysis-note">${esc(outcome.sentence || "")}</p>
      ${outcome.detail ? `<p class="analysis-note">${esc(outcome.detail)}</p>` : ""}
      ${levels}
      ${legend ? `<p class="chart-legend">${legend}</p>` : ""}
      ${counted ? `<p class="analysis-note n-legend">${esc(N_LEGEND)}</p>` : ""}
    </article>`;
}

export function guideLegend(lines) {
  const order = ["trend", "support", "resistance", "pattern"];
  const seen = new Set();
  for (const line of lines || []) {
    if (line?.kind && line.kind !== "mark" && guideStyle(line.kind)) seen.add(line.kind);
  }
  const kinds = order.filter((kind) => seen.has(kind));
  if (!kinds.length) return "";
  return `<p class="chart-legend guide-legend">${kinds.map((kind) => {
    const style = guideStyle(kind);
    const cls = kind === "resistance" ? "resist" : kind;
    return `<span><i class="swatch ${cls}" aria-hidden="true"></i>${esc(style.label)}</span>`;
  }).join("")}</p>`;
}

export function rangeBoard(active, action) {
  const rows = [ANALYSE_RANGES.slice(0, 5), ANALYSE_RANGES.slice(5)];
  return `<div class="range-board" role="group" aria-label="Zeitraum">${rows.map((row) => `
    <div class="range-grid">${row.map((item) => `
      <button type="button" data-action="${esc(action)}" data-range="${esc(item)}" aria-pressed="${item === active ? "true" : "false"}" aria-label="${esc(rangeAria(item))}">${esc(item)}</button>`).join("")}</div>`).join("")}</div>`;
}

export function renderAnalyse(data, ui) {
  const ticker = (data?.prices?.tickers || []).find((item) => item.symbol === ui?.analyseSymbol) || data?.prices?.tickers?.[0];
  const range = ANALYSE_RANGES.includes(ui?.analyseRange) ? ui.analyseRange : "15 Min";
  const result = analyseChart(ticker, range);
  const change = rangeChange(result.candles || []);
  return `
    <header class="page-head">
      <p class="eyebrow">Chartanalyse</p>
      <h2>${esc(ticker?.name || "Kurs")}</h2>
      <p class="price-value">${esc(formatEUR(ticker?.priceEur))} <span class="${tone(change)}">${esc(formatPct(change))}</span></p>
      <p class="muted chart-note"><span class="live-flag" data-live-flag ${ui?.live ? "" : "hidden"}><span class="live-dot" aria-hidden="true"></span>Live</span><span>${esc(methodLabel(ticker || {}))} · ${esc(rangeLabel(range))}</span></p>
    </header>
    <div class="chips">${(data?.prices?.tickers || []).map((item) => `
      <button type="button" class="chip" data-action="analyse-symbol" data-symbol="${esc(item.symbol)}" aria-pressed="${item.symbol === ticker?.symbol}">${esc(item.symbol)}</button>`).join("")}</div>
    ${rangeBoard(range, "analyse-range")}
    <p class="muted analyse-hint">4 Std für die Richtung, 15 Min für den Zeitpunkt.</p>
    <div class="card chart-wrap candle-wrap">
      <p class="scrub"></p>
      <canvas class="chart chart-price chart-candles" data-chart="candles" data-symbol="${esc(ticker?.symbol || "")}" aria-label="Kerzenchart in Euro. Ziehen zeigt Kurs, Zeit und Veränderung."></canvas>
      ${guideLegend(result.lines)}
    </div>
    ${musterCard(result)}
    ${renderSeasonalityCard(data?.seasonality, ticker, ui?.analyseSeason)}
    <button type="button" class="text-btn" data-action="explain" data-symbol="${esc(ticker?.symbol || "")}">Warum diese Bewegung?</button>
  `;
}
