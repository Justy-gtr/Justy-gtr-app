import { courseDrivers, filterNews, glancePoints, headlineOf, NEWS_CHIPS, buildNews } from "./news.js";
import { esc, formatEUR, formatPct, formatStamp, safeUrl } from "./logic.js";

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function chipLabel(filter) {
  if (filter === "alle") return "Alle";
  return filter;
}

export function renderNews(data, ui, now = new Date()) {
  const filter = NEWS_CHIPS.includes(ui?.newsFilter) ? ui.newsFilter : "alle";
  const items = filterNews(buildNews(data), filter);
  const glance = glancePoints(data, now);
  const drivers = courseDrivers(data);
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
    <section class="card glance" aria-label="Heute auf einen Blick">
      <p class="kicker">Heute auf einen Blick</p>
      ${glance.length ? `<ol class="glance-list">${glance.map((point) => `<li>${esc(point)}</li>`).join("")}</ol>` : `<p class="muted">Noch nichts für heute.</p>`}
    </section>
    <section aria-label="Was bewegt den Kurs">
      <p class="kicker">Was bewegt den Kurs</p>
      <div class="stack">${drivers.map((ticker) => {
        const short = headlineOf(ticker.why, 90);
        const rest = short && short !== ticker.why ? ticker.why : "";
        return `<details class="card driver">
          <summary>
            <span class="row between">
              <strong>${esc(ticker.symbol)}</strong>
              <span class="driver-px">${esc(formatEUR(ticker.priceEur))} <span class="${tone(ticker.changePct)}">${esc(formatPct(ticker.changePct))}</span></span>
            </span>
            <span class="news-title">${esc(short || ticker.why)}</span>
          </summary>
          ${rest ? `<p>${esc(rest)}</p>` : ""}
        </details>`;
      }).join("") || `<p class="empty">Noch keine Einordnung hinterlegt.</p>`}</div>
    </section>
    <div class="chips" role="tablist" aria-label="Aktie">${NEWS_CHIPS.map((id) => `
      <button type="button" class="chip" data-action="news-filter" data-filter="${esc(id)}" aria-pressed="${filter === id}">${esc(chipLabel(id))}</button>`).join("")}</div>
    <div class="stack">${rows || `<p class="empty">In diesem Filter liegt nichts.</p>`}</div>
  `;
}
