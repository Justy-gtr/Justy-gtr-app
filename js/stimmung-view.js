import { analyseViewOf, renderAnalyse } from "./analyse-view.js";
import { renderDeutschland } from "./germany-view.js";
import { esc } from "./logic.js";
import { renderMoodLamp } from "./sentiment.js";
import { marketMood, moodPosition, moodReliability } from "./stimmung.js";
import { renderChartsPage, renderMehr, renderSchwarm } from "./views.js";

const LAMP_SYMBOLS = ["SPCX", "TSLA", "RKLB", "MRVL"];

function moodWord(entry, symbol) {
  if (entry?.mood === "gut" || entry?.mood === "schlecht" || entry?.mood === "gemischt") return entry.mood;
  return symbol ? "offen" : "offen";
}

function gauge(entry, label) {
  const position = moodPosition(entry);
  const mark = position == null ? "" : `<span class="mood-mark" style="left:${((position + 1) / 2 * 100).toFixed(1)}%"></span>`;
  return `<div class="mood-gauge" role="img" aria-label="${esc(label)}">
    <div class="mood-rail">${mark}</div>
    <div class="value-labels"><span>schlecht</span><span>gemischt</span><span>gut</span></div>
  </div>`;
}

function barometers(data) {
  const now = new Date();
  const cards = LAMP_SYMBOLS.map((symbol) => {
    const entry = data?.sentiment?.symbols?.[symbol];
    const word = moodWord(entry, symbol);
    return `<article class="card mood-card">
      ${renderMoodLamp(data?.sentiment, symbol, now, `bar-${symbol}`)}
      <h3>${esc(symbol)}</h3>
      <p class="mood-big">${esc(word)}</p>
      ${gauge(entry, `${symbol} ${word}`)}
      ${entry?.reason ? `<p>${esc(entry.reason)}</p>` : `<p class="muted">noch keine Daten</p>`}
    </article>`;
  }).join("");
  const market = marketMood(data?.sentiment);
  return `<div class="stack">${cards}
    <article class="card mood-card">
      <h3>Markt</h3>
      <p class="mood-big">${esc(market.label)}</p>
      ${gauge(market.mood ? { mood: market.mood, score: market.mood === "gut" ? 70 : market.mood === "schlecht" ? -70 : 0 } : null, `Markt ${market.label}`)}
      <p class="muted">Zusammenzug der vorhandenen Lampen.</p>
    </article>
  </div>`;
}

function reliability(data) {
  const record = moodReliability(data?.sentiment);
  const extra = record.enough
    ? ""
    : `<p class="muted">Die Lampe hat noch keine gespeicherte Reihe, die mit der nächsten Kursbewegung verglichen wurde.</p>`;
  return `<article class="card" aria-label="Treffer der Lampe">
    <p class="kicker">Treffer der Lampe</p>
    <p class="mood-big">${esc(record.text)}</p>
    ${extra}
  </article>`;
}

export function renderStimmung(data, ui) {
  const chart = analyseViewOf(ui?.analyseView) === "chart"
    ? renderChartsPage(data, ui)
    : renderAnalyse(data, ui);
  const launch = data?.production?.nextLaunch;
  const launchLine = launch?.name ? `${launch.name}${launch.status ? `, ${launch.status}` : ""}` : "Die Reihen liegen unter dem Knopf.";
  const week = data?.weekly?.lede || data?.weekly?.title || "Die letzte Woche liegt unter dem Knopf.";
  return `
    <header class="page-head">
      <p class="eyebrow">Stimmung</p>
      <h2>Barometer</h2>
    </header>
    ${barometers(data)}
    ${reliability(data)}
    <details class="fold">
      <summary>Kursbild</summary>
      <div class="fold-body">${chart}</div>
    </details>
    <details class="fold">
      <summary>Schwarm</summary>
      <div class="fold-body">${renderSchwarm(data)}</div>
    </details>
    <details class="fold">
      <summary>Deutschland</summary>
      <div class="fold-body">${renderDeutschland(data, ui)}</div>
    </details>
    <details class="fold">
      <summary>Produktion</summary>
      <div class="fold-body">
        <p>${esc(launchLine)}</p>
        <button type="button" class="text-btn" data-action="open-production">Produktion öffnen</button>
      </div>
    </details>
    <details class="fold">
      <summary>Wochenrückblick</summary>
      <div class="fold-body">
        <p>${esc(week)}</p>
        <button type="button" class="text-btn" data-action="open-weekly">Wochenrückblick öffnen</button>
      </div>
    </details>
    <details class="fold">
      <summary>Werkzeuge</summary>
      <div class="fold-body">${renderMehr()}</div>
    </details>
  `;
}
