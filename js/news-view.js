import { AGENDA_SYMBOLS, eventsWithin, filterNews, hourShareStyle, hourWeek, NEWS_CHIPS, nextUpcoming, sentimentLight, swarmList, buildNews } from "./news.js";
import { calendarSentence, calendarWhen, esc, formatStamp, safeUrl } from "./logic.js";
import { formatSignedPct } from "./seasonality.js";

function berlinHourLabel(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  let hour = parts.find((part) => part.type === "hour")?.value || "";
  if (hour === "24") hour = "00";
  return `${hour} Uhr`;
}

function swarmBlock(data, ui) {
  const side = ui?.swarmSide === "ger" ? "ger" : "us";
  const rows = swarmList(data, side).map((row) => {
    const symbol = String(row.symbol || "").replace(/\.DE$/, "");
    return `<p class="swarm-row"><strong>${esc(symbol)}</strong><span>${esc(row.name)}</span><span class="muted">${esc(row.note)}</span></p>`;
  }).join("");
  return `
    <section class="card swarm-compact" id="swarm-compact" aria-label="Schwarm">
      <div class="row between">
        <p class="kicker">Schwarm</p>
        <div class="segment swarm-side" role="group" aria-label="US oder GER">
          <button type="button" data-action="swarm-side" data-side="us" aria-pressed="${side === "us"}">US</button>
          <span class="swarm-bar" aria-hidden="true">|</span>
          <button type="button" data-action="swarm-side" data-side="ger" aria-pressed="${side === "ger"}">GER</button>
        </div>
      </div>
      ${rows || `<p class="muted">Keine Namen in dieser Liste.</p>`}
    </section>`;
}

function chipLabel(filter) {
  if (filter === "alle") return "Alle";
  return filter;
}

function hourRows(data, now, filter) {
  const symbols = AGENDA_SYMBOLS.includes(filter) ? [filter] : AGENDA_SYMBOLS;
  const bySymbol = new Map((data?.prices?.tickers || []).map((ticker) => [ticker.symbol, ticker]));
  return symbols.map((symbol) => {
    const ticker = bySymbol.get(symbol);
    if (!ticker) return "";
    const light = sentimentLight(data, symbol);
    const pip = `<span class="mood-pip" style="background:${light.color};box-shadow:0 0 8px ${light.color}" role="img" aria-label="Stimmung ${esc(light.word)}"></span>`;
    const stats = hourWeek(ticker, now);
    if (stats.share == null) {
      return `<p class="hour-row">${pip}<strong>${esc(symbol)}</strong><span class="muted">noch zu wenig Daten</span></p>`;
    }
    const up = stats.avgUp == null ? "–" : formatSignedPct(stats.avgUp);
    const down = stats.avgDown == null ? "–" : formatSignedPct(stats.avgDown);
    return `<p class="hour-row">
      ${pip}
      <strong>${esc(symbol)}</strong>
      <span class="hour-share" style="${hourShareStyle(stats.share)}">${stats.share} %</span>
      <span class="up">${esc(up)}</span>
      <span class="down">${esc(down)}</span>
      <span class="muted">${stats.up} von ${stats.n} hoch</span>
    </p>`;
  }).join("");
}

function eventLines(events) {
  return events.map((event) => {
    const who = (event.tickers || []).slice(0, 2).join(", ");
    return `<article class="card next-card">
      <p class="next-when">${esc(calendarWhen(event))}${who ? ` · ${esc(who)}` : ""}</p>
      <p class="next-line">${esc(calendarSentence(event))}</p>
    </article>`;
  }).join("");
}

export function renderNews(data, ui, now = new Date()) {
  const filter = NEWS_CHIPS.includes(ui?.newsFilter) ? ui.newsFilter : "alle";
  const items = filterNews(buildNews(data), filter);
  const soon = eventsWithin(data, now, 3);
  const later = soon.length ? [] : nextUpcoming(data, now, 4);
  const hour = berlinHourLabel(now);
  const rows = items.map((item) => {
    const href = safeUrl(item.href);
    const body = item.body && item.body !== item.headline ? item.body : "";
    const when = item.at ? formatStamp(new Date(item.at).toISOString()) : "ohne Zeit";
    return `<details class="card news-item">
      <summary>
        <span class="news-top">
          <span class="news-flag is-${item.importance === "wichtig" ? "wichtig" : "normal"}">${item.importance === "wichtig" ? "wichtig" : "normal"}</span>
          <span class="muted">${esc(when)}</span>
        </span>
        <strong class="news-title">${esc(item.headline)}</strong>
        <span class="muted news-source">${esc(item.source || "Quelle")}</span>
      </summary>
      <div class="news-body">
        ${body ? `<p>${esc(body)}</p>` : ""}
        ${href ? `<a class="text-btn" href="${esc(href)}" target="_blank" data-external="true">${esc(item.source || "Quelle")}</a>` : ""}
      </div>
    </details>`;
  }).join("");
  return `
    <header class="page-head">
      <p class="eyebrow">News</p>
      <h2>Meldungen</h2>
    </header>
    <section class="card" aria-label="Letzte Woche zur aktuellen Stunde">
      <p class="kicker">Letzte Woche, ${esc(hour)}</p>
      ${hourRows(data, now, filter) || `<p class="muted">Für diese Stunde liegen noch keine Kurse.</p>`}
    </section>
    <section aria-label="Die nächsten drei Stunden">
      <p class="kicker">Die nächsten drei Stunden</p>
      <div class="stack">${soon.length
        ? eventLines(soon)
        : `<p class="muted">In den nächsten drei Stunden liegt nichts.</p>${later.length ? `<p class="kicker">Danach</p>${eventLines(later)}` : ""}`}</div>
    </section>
    ${swarmBlock(data, ui)}
    <div class="chips" role="tablist" aria-label="Aktie">${NEWS_CHIPS.map((id) => `
      <button type="button" class="chip" data-action="news-filter" data-filter="${esc(id)}" aria-pressed="${filter === id}">${esc(chipLabel(id))}</button>`).join("")}</div>
    <div class="stack">${rows || `<p class="empty">In diesem Filter liegt nichts.</p>`}</div>
  `;
}
