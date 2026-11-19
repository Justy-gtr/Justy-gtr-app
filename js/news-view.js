import { AGENDA_SYMBOLS, eventsWithin, filterNews, freshNews, hourHeader, hourSentence, hourShareStyle, hourSlot, NEWS_CHIPS, nextUpcoming, sentimentLight, swarmPotential, buildNews } from "./news.js";
import { calendarSentence, calendarWhen, esc, formatEUR, formatStamp, safeUrl } from "./logic.js";

function swarmBlock(data, ui) {
  const side = ui?.swarmSide === "ger" ? "ger" : "us";
  const rows = swarmPotential(data, side).map((row) => {
    const symbol = String(row.symbol || "").replace(/\.DE$/, "");
    const lamp = row.lamp || { color: "#f59e0b", word: "gemischt", source: "offen" };
    const pip = `<span class="mood-pip" style="background:${lamp.color};box-shadow:0 0 8px ${lamp.color}" role="img" aria-label="Stimmung ${esc(lamp.word)}, ${esc(lamp.source || lamp.word)}"></span>`;
    return `<p class="swarm-row" style="background:${row.tone}22">${pip}<strong>${esc(symbol)}</strong><span>${esc(row.name)}</span><span>${esc(row.lean || "ruhig")}</span><span class="muted">${esc(row.note)}</span></p>`;
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
    const line = hourSentence(symbol, now, data?.hours, bySymbol.get(symbol));
    if (!line) return "";
    const light = sentimentLight(data, symbol);
    const pip = `<span class="mood-pip" style="background:${light.color};box-shadow:0 0 8px ${light.color}" role="img" aria-label="Stimmung ${esc(light.word)}"></span>`;
    const row = `<p class="hour-row">${pip}<strong>${esc(symbol)}</strong><span class="hour-share" style="${hourShareStyle(line.share)}">${esc(line.text)}</span></p>`;
    return symbol === "RKLB" ? row + rocketLabNewsLine(data) : row;
  }).join("");
}

function berlinClockLabel(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function flagEmoji(country) {
  const code = String(country || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function sourceLine(sources) {
  const source = (sources || []).find((item) => item && (item.title || item.url));
  if (!source) return "";
  const title = source.title || "Quelle";
  const href = safeUrl(source.url);
  const label = `Quelle · ${title}`;
  if (!href) return `<p class="moon-src">${esc(label)}</p>`;
  return `<p class="moon-src"><a href="${esc(href)}" target="_blank" data-external="true">${esc(label)}</a></p>`;
}

function moonItems(file, key) {
  const list = file?.[key];
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && item.name && item.ticker);
}

function moonCandidate(item, { expanded }) {
  const where = [flagEmoji(item.country), item.exchange].filter(Boolean).join(" ");
  const price = item.priceEur == null ? "" : formatEUR(item.priceEur);
  const head = `<span class="moon-one"><strong>${esc(item.name)}</strong><em>${esc(item.ticker)}</em><span class="where">${esc(where)}</span><b>${esc(price)}</b></span>`;
  if (!expanded) {
    const hint = item.hint ? `<span class="moon-hint">${esc(item.hint)}</span>` : "";
    return head + hint;
  }
  const bullets = (item.bullets || []).slice(0, 3).map((line) => `<li>${esc(line)}</li>`).join("");
  return `<article class="moon-cand">${head}<ul class="moon-why">${bullets}</ul>${sourceLine(item.sources)}</article>`;
}

function moonSide(side, items, ui) {
  if (!items.length) return "";
  const open = ui?.moonOpen?.[side] === true;
  const label = side === "short" ? "Short" : "Long";
  const note = side === "short"
    ? "könnten heute 7,5 % oder mehr fallen"
    : "könnten heute 10 % oder mehr steigen";
  const body = open
    ? items.slice(0, 3).map((item) => moonCandidate(item, { expanded: true })).join("")
    : moonCandidate(items[0], { expanded: false });
  return `<div class="moon-side is-${side}${open ? " is-open" : ""}">
    <button type="button" class="moon-hit" data-action="moon-toggle" data-side="${side}" aria-expanded="${open ? "true" : "false"}">
      <span class="moon-side-k"><strong>${label} <i class="chev" aria-hidden="true"></i></strong><span>${note}</span></span>
      ${open ? "" : body}
    </button>
    ${open ? body : ""}
  </div>`;
}

function moonshotsCard(data, ui) {
  const file = data?.moonshots;
  const long = moonItems(file, "long");
  const short = moonItems(file, "short");
  if (!long.length && !short.length) return "";
  const stand = berlinClockLabel(file?.updatedAt);
  const next = berlinClockLabel(file?.nextRun);
  const when = [stand ? `Stand ${stand}` : "", next ? `nächster ${next}` : ""].filter(Boolean).join(" · ");
  return `<section class="card moon-board" aria-label="Moonshots">
    <p class="kicker">Moonshots</p>
    ${when ? `<p class="moon-stand">${esc(when)}</p>` : ""}
    ${moonSide("long", long, ui)}
    ${moonSide("short", short, ui)}
  </section>`;
}

function rocketLabNewsLine(data) {
  const news = data?.moonshots?.rocketLabNews;
  const text = String(news?.text || "").trim();
  if (!text) return "";
  const stand = berlinClockLabel(news.updatedAt);
  const source = (news.sources || []).find((item) => item && safeUrl(item.url));
  const href = source ? safeUrl(source.url) : "";
  const link = href ? ` · <a href="${esc(href)}" target="_blank" data-external="true">${esc(source.title || "Quelle")}</a>` : "";
  return `<p class="rklb-daily"><b>ROCKET LAB NEWS</b> · einmal täglich${stand ? ` · Stand ${esc(stand)}` : ""} · ${esc(text)}${link}</p>`;
}

function eventLines(events) {
  return events.map((event) => {
    const who = (event.tickers || []).slice(0, 2).join(", ");
    return `<button type="button" class="card next-card" data-action="open-event" data-id="${esc(event.id)}">
      <p class="next-when">${esc(calendarWhen(event))}${who ? ` · ${esc(who)}` : ""}</p>
      <p class="next-line">${esc(calendarSentence(event))}</p>
    </button>`;
  }).join("");
}

export function renderNews(data, ui, now = new Date()) {
  const filter = NEWS_CHIPS.includes(ui?.newsFilter) ? ui.newsFilter : "alle";
  const items = freshNews(filterNews(buildNews(data), filter), now);
  const soon = eventsWithin(data, now, 3);
  const later = soon.length ? [] : nextUpcoming(data, now, 4);
  const shownIds = new Set([...soon, ...later].map((event) => event.id));
  const newsNext = items.length ? [] : nextUpcoming(data, now, 3).filter((event) => !shownIds.has(event.id));
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
    ${moonshotsCard(data, ui)}
    <section class="card" aria-label="Aktuelle Stunde nach Wochentag">
      <p class="kicker">${esc(hourHeader(hourSlot(now)))}</p>
      ${hourRows(data, now, filter)}
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
    <div class="stack">${rows || `<p class="muted">In den letzten zwei Stunden liegt nichts.</p>${newsNext.length ? eventLines(newsNext) : ""}`}</div>
  `;
}
