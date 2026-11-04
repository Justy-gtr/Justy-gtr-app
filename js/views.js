import { sparkline } from "./chart.js";
import {
  esc,
  formatDay,
  formatEUR,
  formatNumber,
  formatPct,
  formatStamp,
  freshPrices,
  greeting,
  isStandalone,
  methodLabel,
  questionsOf,
  rangeChange,
  safeUrl,
  scoreboard,
  seriesFor,
  trackSummary,
  upcomingEvents,
  bigDrop
} from "./logic.js";

const STATUS = {
  offen: "Offen",
  gehalten: "Gehalten",
  verfehlt: "Verfehlt",
  verzoegert: "Verzögert",
  teilweise: "Teilweise"
};

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function arrow(value) {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "•";
}

function pill(on) {
  return on ? `<span class="pill">Beispiel</span>` : "";
}

function sourcesBlock(sources) {
  const list = (sources || []).map((source) => ({ title: source?.title, href: safeUrl(source?.url) })).filter((source) => source.href);
  if (!list.length) return "";
  return `<div class="sources"><p class="sources-label">Quellen</p><ul>${list.map((source) => `<li><a href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">${esc(source.title || "Quelle")}</a></li>`).join("")}</ul></div>`;
}

function prose(text) {
  return String(text || "").split(/\n+/).filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join("");
}

function companyBy(data, key) {
  return (data.companies?.companies || []).find((company) => company.id === key || company.symbol === key);
}

function tickerBy(data, symbol) {
  return (data.prices?.tickers || []).find((ticker) => ticker.symbol === symbol);
}

function audioBlock(url) {
  const href = safeUrl(url);
  if (!href) return "";
  return `<div class="audio"><p>Anhören</p><audio controls preload="none" src="${esc(href)}">Audio wird hier abgespielt.</audio></div>`;
}

function scoreMeter(score) {
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  return `<span class="meter" role="img" aria-label="Wert ${value} von 10"><span style="width:${value * 10}%"></span></span>`;
}

function prob(value) {
  const number = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="prob-row"><div class="prob" role="img" aria-label="Wahrscheinlichkeit ${number} Prozent"><span style="width:${number}%"></span></div><span class="prob-label">${number} %</span></div>`;
}

function gauge(title, block) {
  const score = Math.max(-1, Math.min(1, Number(block?.score) || 0));
  const angle = score * 78;
  return `<article class="card gauge-card">
    <p class="kicker">${esc(title)}</p>
    <svg class="gauge" viewBox="0 0 160 96" aria-hidden="true">
      <path d="M16 84 A64 64 0 0 1 144 84" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10" stroke-linecap="round"/>
      <path d="M16 84 A64 64 0 0 1 144 84" fill="none" stroke="#e4b15a" stroke-width="10" stroke-linecap="round" stroke-dasharray="201" stroke-dashoffset="${(100 - ((score + 1) / 2) * 100).toFixed(1)}"/>
      <line x1="80" y1="84" x2="80" y2="34" stroke="#f4f1ea" stroke-width="2.5" stroke-linecap="round" transform="rotate(${angle.toFixed(1)} 80 84)"/>
      <circle cx="80" cy="84" r="4" fill="#e4b15a"/>
    </svg>
    <h3>${esc(block?.label || "offen")}</h3>
    <p>${esc(block?.summary || "")}</p>
    ${pill(block?.example)}
  </article>`;
}

export function renderShell(ctx) {
  const { data, ui, store } = ctx;
  document.getElementById("page-heute").innerHTML = renderHeute(data, ui, store);
  document.getElementById("page-kalender").innerHTML = renderKalender(data, ui);
  document.getElementById("page-posts").innerHTML = renderPosts(data, ui);
  document.getElementById("page-schwarm").innerHTML = renderSchwarm(data);
  document.getElementById("page-charts").innerHTML = renderChartsPage(data, ui);
  document.getElementById("page-mehr").innerHTML = renderMehr(data);
  const mode = document.getElementById("mode-pill");
  if (mode) mode.hidden = data.meta?.dataMode === "live";
  const stand = document.getElementById("stand");
  if (stand) {
    stand.textContent = data.meta?.pricesUpdated
      ? `Kurse ${formatStamp(data.meta.pricesUpdated)}`
      : "Beispieldaten";
  }
}

function renderHeute(data, ui, store) {
  const tickers = data.prices?.tickers || [];
  const calm = bigDrop(data);
  const events = upcomingEvents(data.calendar?.events || []);
  const launch = data.production?.nextLaunch;
  const question = data.daily_question?.current;
  const answer = question ? store.answers?.[question.id] : null;
  const board = scoreboard(data.daily_question, store);
  const live = freshPrices(data.meta);
  const alerts = (data.alerts?.alerts || []).slice(0, 2);
  const install = !store.installHidden && !isStandalone();
  return `
    <header class="page-head">
      <p class="eyebrow">Heute</p>
      <h1>${esc(greeting())}, Justy</h1>
      <p class="lede">${esc(data.briefing?.summary || "Dein Cockpit für SpaceX, Tesla und das, was die Kurse bewegt.")}</p>
    </header>
    ${data.meta?.dataMode !== "live" ? `<p class="banner">Beispieldaten. Die Karten sind gefüllt, die echten Notizen kommen später.</p>` : ""}
    ${install ? `<div class="card install"><p>In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.</p><button type="button" data-action="dismiss-install">Verstanden</button></div>` : ""}
    ${calm.active ? `<button type="button" class="banner banner-calm" data-action="open-calm">Ruhe-Modus. ${esc(calm.tickers.map((ticker) => ticker.symbol).join(", ") || "Ein Kurs")} gibt deutlich nach. Historische Erholungen ansehen.</button>` : ""}
    <section class="stack" aria-label="Kurse">
      ${tickers.map((ticker) => priceCard(ticker, live)).join("")}
    </section>
    ${alerts.length ? `<section><div class="row between"><h2>Bewegung ab 2 %</h2></div>${alerts.map((alert) => `
      <button type="button" class="card linkish" data-action="open-alerts">
        <span class="row between"><strong>${esc(alert.symbol)}</strong>${pill(alert.example)}<span class="${tone(alert.changePct)}">${arrow(alert.changePct)} ${esc(formatPct(alert.changePct))}</span></span>
        <span class="muted">${esc(formatStamp(alert.timestamp))}${alert.notified ? " · gemeldet" : ""}</span>
      </button>`).join("")}</section>` : ""}
    <section>
      <div class="row between"><h2>Karls 5 Favoriten</h2><span class="muted">${esc(data.favorites?.asOf || "")}</span></div>
      ${(data.favorites?.favorites || []).map((favorite) => `
        <article class="card fav">
          <div class="row between">
            <div><p class="kicker">${esc(favorite.symbol || "Thema")} · ${esc(String(favorite.rank || ""))}</p><h3>${esc(favorite.name)}</h3></div>
            ${pill(favorite.example)}
          </div>
          <div class="row score-row">${scoreMeter(favorite.score)}<strong>${esc(String(favorite.score))}/10</strong></div>
          <p>${esc(favorite.reason)}</p>
          <button type="button" class="text-btn" data-action="gegenteil" data-id="${esc(favorite.id)}" aria-expanded="${ui.revealed[favorite.id] ? "true" : "false"}">Gegenteil</button>
          ${ui.revealed[favorite.id] ? `<p class="counter">${esc(favorite.counterArgument || "Dazu liegt noch kein Gegenargument vor.")}</p>` : ""}
        </article>`).join("")}
    </section>
    <section>
      <div class="row between"><h2>Nächste Termine</h2><button type="button" class="text-btn" data-action="page" data-page="kalender">Kalender</button></div>
      ${events.map((event) => eventRow(event)).join("") || `<p class="empty">Keine Termine.</p>`}
    </section>
    <section>${launchCard(launch)}</section>
    <section>
      <h2>Kosmos</h2>
      <div class="chips">${(data.companies?.companies || []).map((company) => `
        <button type="button" class="chip" data-action="open-company" data-id="${esc(company.id)}">${esc(company.name)}</button>`).join("")}</div>
    </section>
    <section class="split">
      <button type="button" class="card linkish" data-action="open-briefing"><p class="kicker">Morgen</p><h3>Briefing</h3><p>${esc(data.briefing?.greeting || "")}</p></button>
      <button type="button" class="card linkish" data-action="open-question"><p class="kicker">Tagesfrage</p><h3>${esc(question?.question || "Noch keine Frage")}</h3><p class="muted">Justy ${board.justy} · Karl ${board.karl}</p>${answer ? `<p>Deine Antwort: ${esc(answer.answer)}</p>` : ""}</button>
    </section>
  `;
}

function priceCard(ticker, live) {
  const fresh = live && ticker.example !== true;
  return `<article class="card price-card${ticker.example ? "" : " is-live-card"}" data-symbol-card="${esc(ticker.symbol)}">
    <div class="row between">
      <div>
        <p class="kicker">${esc(ticker.role || ticker.venue || "")} ${fresh ? `<span class="live-dot" title="Frische Kurse"></span>` : ""}</p>
        <h3>${esc(ticker.symbol)}</h3>
        <p class="muted">${esc(ticker.name)}</p>
      </div>
      ${sparkline(ticker.sparkline)}
    </div>
    <button type="button" class="price-hit" data-action="open-company" data-symbol="${esc(ticker.symbol)}">
      <span class="price-value">${esc(formatEUR(ticker.priceEur))}</span>
      <span class="price-change ${tone(ticker.changePct)}">${arrow(ticker.changePct)} ${esc(formatPct(ticker.changePct))}</span>
    </button>
    <div class="row between">
      <span class="muted">${esc(methodLabel(ticker))}${ticker.stale ? " · verzögert" : ""}</span>
      <span class="row gap">${pill(ticker.example)}<button type="button" class="text-btn" data-action="explain" data-symbol="${esc(ticker.symbol)}">Warum?</button></span>
    </div>
  </article>`;
}

function eventRow(event) {
  return `<button type="button" class="card linkish event-row" data-action="open-event" data-id="${esc(event.id)}">
    <span class="row between"><strong>${esc(event.title)}</strong>${pill(event.example)}</span>
    <span class="muted">${esc(formatDay(event.date))}${event.time ? ` · ${esc(event.time)}` : ""} · ${esc(event.kind === "external" ? "Extern" : "Unternehmen")}</span>
    ${prob(event.probabilityPct)}
  </button>`;
}

function launchCard(launch) {
  if (!launch) return "";
  const href = safeUrl(launch.livestreamUrl);
  return `<article class="card countdown" id="launch-card">
    <div class="row between">
      <div>
        <p class="kicker">Starship</p>
        <h2>${esc(launch.name || "Nächster Start")}</h2>
        <p class="muted">${esc(launch.status || "")} ${pill(launch.example)}</p>
      </div>
      <button type="button" class="rocket-btn" data-action="liftoff" aria-label="Startanimation abspielen">
        <span class="rocket" id="rocket">${rocketSvg()}</span>
      </button>
    </div>
    <p class="count-num" id="count-num" data-target="${esc(launch.target || "")}">—</p>
    ${href ? `<a class="text-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Livestream</a>` : ""}
    <p class="muted">Tippen auf die Rakete spielt den Start. Bei null startet sie von selbst.</p>
  </article>`;
}

function rocketSvg() {
  return `<svg viewBox="0 0 64 96" aria-hidden="true">
    <path d="M32 4c10 12 16 28 16 46 0 10-4 18-8 24H24c-4-6-8-14-8-24C16 32 22 16 32 4z" fill="#f4f1ea"/>
    <path d="M24 74h16l6 14H18z" fill="#e4b15a"/>
    <circle cx="32" cy="40" r="6" fill="#10131c"/>
    <path d="M18 58c-8 4-12 12-12 20 6-4 10-8 12-14zM46 58c8 4 12 12 12 20-6-4-10-8-12-14z" fill="#9fdfff"/>
  </svg>`;
}

function renderKalender(data, ui) {
  const events = (data.calendar?.events || [])
    .filter((event) => event.kind === (ui.calKind === "external" ? "external" : "company"))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return `
    <header class="page-head">
      <p class="eyebrow">Kalender</p>
      <h2>Was den Kurs bewegen kann</h2>
    </header>
    <div class="segment" role="tablist" aria-label="Art der Termine">
      <button type="button" role="tab" data-action="cal-kind" data-kind="company" aria-selected="${ui.calKind !== "external"}">Unternehmen</button>
      <button type="button" role="tab" data-action="cal-kind" data-kind="external" aria-selected="${ui.calKind === "external"}">Extern</button>
    </div>
    <div class="stack">${events.map((event) => eventRow(event)).join("") || `<p class="empty">In dieser Ansicht liegt nichts.</p>`}</div>
  `;
}

function renderPosts(data, ui) {
  const filters = ["alle", "SPCX", "TSLA", "andere"];
  const posts = (data.posts?.posts || []).filter((post) => {
    if (ui.postFilter === "alle") return true;
    if (ui.postFilter === "andere") return !(post.tickers || []).some((symbol) => symbol === "SPCX" || symbol === "TSLA");
    return (post.tickers || []).includes(ui.postFilter);
  });
  return `
    <header class="page-head">
      <p class="eyebrow">Posts</p>
      <h2>Musk und die Häuser</h2>
      <p class="lede">Deutsche Kurzfassungen. Das Original bleibt verlinkt.</p>
    </header>
    <div class="gauge-grid">
      ${gauge("SpaceX", data.posts?.sentiment?.SPCX)}
      ${gauge("Tesla", data.posts?.sentiment?.TSLA)}
    </div>
    <div class="chips" role="tablist">${filters.map((filter) => `
      <button type="button" class="chip" data-action="post-filter" data-filter="${filter}" aria-pressed="${ui.postFilter === filter}">${esc(filter === "alle" ? "Alle" : filter === "andere" ? "Kosmos" : filter)}</button>`).join("")}</div>
    <div class="stack">${posts.map((post) => `
      <button type="button" class="card linkish" data-action="open-post" data-id="${esc(post.id)}">
        <span class="row between"><strong>${esc(post.displayName || post.account)}</strong>${pill(post.example)}</span>
        <span class="muted">${esc(post.account)} · ${esc(formatStamp(post.postedAt))}</span>
        <span>${esc(post.summaryDe)}</span>
      </button>`).join("") || `<p class="empty">Keine Posts in diesem Filter.</p>`}</div>
  `;
}

function renderSchwarm(data) {
  const comparison = data.crowd?.comparison || {};
  const investors = data.crowd?.investors || [];
  return `
    <header class="page-head">
      <p class="eyebrow">Schwarmwissen</p>
      <h2>Was andere gerade nennen</h2>
      <p class="lede">Erwähnungen, Richtung, Trefferquote. Alles nur so gut wie die Quellen.</p>
    </header>
    <article class="card compare">
      <p class="kicker">Schwarm gegen Karl</p>
      <div class="versus">
        <div><span class="big">${esc(formatNumber(comparison.swarmHitRatePct, 0))} %</span><span class="muted">Schwarm</span></div>
        <div><span class="big gold">${esc(formatNumber(comparison.karlHitRatePct, 0))} %</span><span class="muted">Karl</span></div>
      </div>
      <p>${esc(comparison.summary || "")}</p>
      ${sourcesBlock(comparison.sources)}
    </article>
    <div class="stack">${investors.map((investor) => `
      <button type="button" class="card linkish" data-action="open-investor" data-id="${esc(investor.id)}">
        <span class="row between"><strong>${esc(investor.name)}</strong>${pill(investor.example)}</span>
        <span class="muted">${esc(investor.handle)} · Treffer ${esc(formatNumber(investor.hitRatePct, 0))} %</span>
        <span class="mention-row">${(investor.tickers || []).map((ticker) => `<em>${esc(ticker.symbol)} ${esc(String(ticker.mentions))}× ${esc(ticker.stance)}</em>`).join("")}</span>
        <canvas class="chart mini" data-chart="hit" data-investor="${esc(investor.id)}"></canvas>
      </button>`).join("")}</div>
  `;
}

function renderChartsPage(data, ui) {
  const ticker = tickerBy(data, ui.chartSymbol) || data.prices?.tickers?.[0];
  const { points, range } = seriesFor(ticker, ui.chartRange, ui.langfrist);
  const change = rangeChange(points);
  const ranges = ui.langfrist ? ["6M", "1J", "5J"] : ["Tag", "1M", "6M", "1J", "5J"];
  return `
    <header class="page-head">
      <p class="eyebrow">Charts</p>
      <h2>${esc(ticker?.name || "Kurs")}</h2>
      <p class="price-value">${esc(formatEUR(ticker?.priceEur))} <span class="${tone(change)}">${esc(formatPct(change))}</span></p>
      <p class="muted">Spanne ${esc(range)} · ${esc(methodLabel(ticker || {}))}</p>
    </header>
    <div class="chips">${(data.prices?.tickers || []).map((item) => `
      <button type="button" class="chip" data-action="chart-symbol" data-symbol="${esc(item.symbol)}" aria-pressed="${item.symbol === ticker?.symbol}">${esc(item.symbol)}</button>`).join("")}</div>
    <div class="chips">${ranges.map((item) => `
      <button type="button" class="chip" data-action="chart-range" data-range="${item}" aria-pressed="${item === range}">${esc(item === "Tag" ? "Tag" : item)}</button>`).join("")}</div>
    <button type="button" class="switch" data-action="langfrist" role="switch" aria-checked="${ui.langfrist ? "true" : "false"}">
      <span>Langfrist-Brille</span><span class="knob"></span>
    </button>
    <div class="card chart-wrap"><canvas class="chart" data-chart="price" data-symbol="${esc(ticker?.symbol || "")}"></canvas></div>
    ${ui.langfrist ? `<article class="card"><p class="kicker">Langfrist</p><p>${esc(ticker?.longTermOutlook || "Noch kein Langfrist-Text.")}</p>${ticker?.narrativeExample ? pill(true) : ""}</article>` : ""}
    <button type="button" class="text-btn" data-action="explain" data-symbol="${esc(ticker?.symbol || "")}">Warum diese Bewegung?</button>
  `;
}

function renderMehr() {
  const items = [
    ["open-insiders", "Insider-Käufe", "Wer kauft eigene Aktien"],
    ["open-track", "Treffer-Check", "Karls alte Favoriten"],
    ["open-promises", "Versprechen", "Gesagt, Ziel, Verzug"],
    ["open-scenario", "Was-wäre-wenn", "Historische Reaktionen"],
    ["open-calm", "Ruhe-Modus", "Nach großen Rücksetzern"],
    ["open-production", "Produktion", "Starts, Anschlüsse, Autos"],
    ["open-principles", "Erste Prinzipien", "Was physikalisch zählt"],
    ["open-glossary", "Glossar", "KGV, Kursziel und mehr"],
    ["open-question", "Tagesfrage", "Justy gegen Karl"],
    ["open-briefing", "Morgen-Briefing", "Der Tag in kurz"],
    ["open-weekly", "Wochenrückblick", "Die letzten sieben Tage"],
    ["open-alerts", "Meldungen", "Bewegung ab zwei Prozent"]
  ];
  return `
    <header class="page-head">
      <p class="eyebrow">Mehr</p>
      <h2>Werkzeuge</h2>
    </header>
    <div class="menu">${items.map(([action, title, text]) => `
      <button type="button" class="card linkish" data-action="${action}"><strong>${esc(title)}</strong><span>${esc(text)}</span></button>`).join("")}</div>
    <p class="disclaimer dock-note">Keine Anlageberatung. Nur Recherche und Bildung für Justy.</p>
  `;
}

export function detailContent(action, dataset, ctx) {
  const { data, ui, store } = ctx;
  if (action === "open-company") return companyDetail(data, dataset.symbol || dataset.id, ui);
  if (action === "explain") return explainDetail(data, dataset.symbol);
  if (action === "open-event") return eventDetail(data, dataset.id);
  if (action === "open-post") return postDetail(data, dataset.id);
  if (action === "open-investor") return investorDetail(data, dataset.id);
  if (action === "open-insiders") return insidersDetail(data);
  if (action === "open-track") return trackDetail(data);
  if (action === "open-promises") return promisesDetail(data);
  if (action === "open-scenario") return scenarioDetail(data, ui);
  if (action === "open-calm") return calmDetail(data);
  if (action === "open-production") return productionDetail(data);
  if (action === "open-principles") return principlesDetail(data);
  if (action === "open-glossary") return glossaryDetail(data, ui);
  if (action === "open-question") return questionDetail(data, store);
  if (action === "open-briefing") return briefingDetail(data.briefing, "Morgen-Briefing");
  if (action === "open-weekly") return weeklyDetail(data.weekly);
  if (action === "open-alerts") return alertsDetail(data);
  return null;
}

function companyDetail(data, key, ui) {
  const company = companyBy(data, key);
  if (!company) return { kind: "company", title: "Unternehmen", html: `<p class="empty">Nicht gefunden.</p>` };
  const ticker = company.symbol ? tickerBy(data, company.symbol) : null;
  const promises = (data.promises?.promises || []).filter((item) => item.company === company?.name);
  return {
    kind: "company",
    title: company?.name || "Unternehmen",
    html: `
      <p class="kicker">${esc(company?.role || "")} ${company?.listed ? "· börsennotiert" : "· nicht gelistet"}</p>
      ${ticker ? `<p class="price-value">${esc(formatEUR(ticker.priceEur))} <span class="${tone(ticker.changePct)}">${esc(formatPct(ticker.changePct))}</span></p><p class="muted">${esc(methodLabel(ticker))}</p>` : ""}
      <p>${esc(company?.tagline || "")}</p>
      ${pill(company?.example)}
      <div class="chips">${(company?.priceDrivers || []).map((driver) => `<span class="chip quiet">${esc(driver)}</span>`).join("")}</div>
      <h3>Erste Prinzipien</h3>
      ${(company?.firstPrinciples || []).map((item) => `<article class="card"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join("")}
      <button type="button" class="text-btn" data-action="gegenteil" data-id="co-${esc(company?.id || "")}" aria-expanded="${ui?.revealed?.[`co-${company?.id}`] ? "true" : "false"}">Gegenteil</button>
      ${ui?.revealed?.[`co-${company?.id}`] ? `<p class="counter">${esc(company?.counterArgument || ticker?.counterArgument || "Noch kein Gegenargument.")}</p>` : ""}
      ${ticker ? `<p><button type="button" class="text-btn" data-action="explain" data-symbol="${esc(ticker.symbol)}">Warum die Bewegung?</button></p>` : ""}
      ${promises.length ? `<h3>Versprechen</h3>${promises.map((item) => `<p>${esc(item.promise)} <span class="status st-${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span></p>`).join("")}` : ""}
      ${sourcesBlock(company?.sources)}
    `
  };
}

function explainDetail(data, symbol) {
  const ticker = tickerBy(data, symbol);
  return {
    kind: "explain",
    title: ticker ? `Warum ${ticker.symbol}?` : "Einordnung",
    html: `
      <p class="kicker">Kurz, keine Anlageberatung</p>
      ${ticker ? `<p class="price-value">${esc(formatEUR(ticker.priceEur))} <span class="${tone(ticker.changePct)}">${esc(formatPct(ticker.changePct))}</span></p>` : ""}
      <div class="prose">${prose(ticker?.why || "Noch keine kurze Einordnung hinterlegt.")}</div>
      ${ticker?.narrativeExample || ticker?.example ? pill(true) : ""}
      ${sourcesBlock([...(ticker?.whySources || []), ...(ticker?.sources || [])])}
    `
  };
}

function eventDetail(data, id) {
  const event = (data.calendar?.events || []).find((item) => item.id === id);
  if (!event) return { kind: "event", title: "Termin", html: `<p class="empty">Termin nicht gefunden.</p>` };
  return {
    kind: "event",
    title: event.title,
    html: `
      <p class="muted">${esc(formatDay(event.date))}${event.time ? ` · ${esc(event.time)} ${esc(event.timezone || "")}` : ""}</p>
      <p class="kicker">${esc(event.kind === "external" ? "Extern" : "Unternehmen")} · ${esc(event.category || "")} · Wirkung ${esc(event.impact || "")}</p>
      ${pill(event.example)}
      <h3>Wahrscheinlichkeit</h3>
      ${prob(event.probabilityPct)}
      <div class="prose">${prose(event.reasoning)}</div>
      <div class="chips">${(event.tickers || []).map((symbol) => `<span class="chip quiet">${esc(symbol)}</span>`).join("")}</div>
      ${sourcesBlock(event.sources)}
    `
  };
}

function postDetail(data, id) {
  const post = (data.posts?.posts || []).find((item) => item.id === id);
  if (!post) return { kind: "post", title: "Post", html: `<p class="empty">Post nicht gefunden.</p>` };
  const href = safeUrl(post.url);
  return {
    kind: "post",
    title: post.displayName || post.account,
    html: `
      <p class="muted">${esc(post.account)} · ${esc(formatStamp(post.postedAt))} · ${esc(post.sentiment || "")}</p>
      ${pill(post.example)}
      <div class="prose">${prose(post.summaryDe)}</div>
      ${post.originalText ? `<p class="muted">${esc(post.originalText)}</p>` : ""}
      ${href ? `<a class="text-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Original öffnen</a>` : ""}
      ${sourcesBlock(post.sources)}
    `
  };
}

function investorDetail(data, id) {
  const investor = (data.crowd?.investors || []).find((item) => item.id === id);
  if (!investor) return { kind: "investor", title: "Investor", html: `<p class="empty">Nicht gefunden.</p>` };
  const max = Math.max(1, ...(investor.tickers || []).map((ticker) => ticker.mentions || 0));
  return {
    kind: "investor",
    title: investor.name,
    html: `
      <p class="muted">${esc(investor.handle)} · Trefferquote ${esc(formatNumber(investor.hitRatePct, 0))} %</p>
      ${pill(investor.example)}
      <p>${esc(investor.note || "")}</p>
      <canvas class="chart" data-chart="hit" data-investor="${esc(investor.id)}"></canvas>
      <h3>Erwähnungen</h3>
      ${(investor.tickers || []).map((ticker) => `
        <div class="mention"><span>${esc(ticker.symbol)} · ${esc(ticker.stance)}</span><div class="prob"><span style="width:${Math.round((ticker.mentions / max) * 100)}%"></span></div><b>${esc(String(ticker.mentions))}</b></div>`).join("")}
      ${sourcesBlock(investor.sources)}
    `
  };
}

function insidersDetail(data) {
  const trades = [...(data.insiders?.trades || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    kind: "insiders",
    title: "Insider-Käufe",
    html: trades.map((trade) => `
      <article class="card ${trade.side === "kauf" ? "buy" : ""}">
        <div class="row between"><strong>${esc(trade.person)}</strong>${pill(trade.example)}</div>
        <p>${esc(trade.role || "")} · ${esc(trade.symbol)} · ${esc(trade.side === "kauf" ? "Kauf" : "Verkauf")}</p>
        <p class="muted">${esc(formatDay(trade.date))} · ${esc(formatNumber(trade.shares))} Stück${trade.priceUsd != null ? ` · ${esc(formatNumber(trade.priceUsd, 2))} USD` : ""}</p>
        ${sourcesBlock(trade.sources)}
      </article>`).join("") || `<p class="empty">Keine Meldungen.</p>`
  };
}

function trackDetail(data) {
  const picks = data.track_record?.picks || [];
  const summary = trackSummary(picks);
  return {
    kind: "track",
    title: "Treffer-Check",
    html: `
      <article class="card compare">
        <p class="kicker">Karl, bisher</p>
        <p class="big">${summary.hitRatePct == null ? "—" : `${summary.hitRatePct} %`}</p>
        <p class="muted">${summary.hits} Treffer · ${summary.misses} daneben · ${summary.open} offen</p>
      </article>
      ${picks.map((pick) => `
        <article class="card">
          <div class="row between"><strong>${esc(pick.name || pick.symbol)}</strong><span class="status st-${esc(pick.result)}">${esc(pick.result)}</span></div>
          <p class="muted">${esc(formatDay(pick.pickedOn))} bis ${esc(formatDay(pick.horizonEnd))} · Wert ${esc(String(pick.score ?? ""))}</p>
          <p>${esc(pick.thesis || "")}</p>
          <p class="muted">${esc(pick.outcomeNote || "")}</p>
          ${pill(pick.example)}
          ${sourcesBlock(pick.sources)}
        </article>`).join("")}
    `
  };
}

function promisesDetail(data) {
  return {
    kind: "promises",
    title: "Musk-Versprechen",
    html: (data.promises?.promises || []).map((item) => `
      <article class="card">
        <div class="row between"><span class="status st-${esc(item.status)}">${esc(STATUS[item.status] || item.status)}</span>${pill(item.example)}</div>
        <h3>${esc(item.promise)}</h3>
        <p class="muted">${esc(item.who)} · ${esc(item.company)}</p>
        <p>Gesagt ${esc(formatDay(item.promisedOn))} · Ziel ${esc(formatDay(item.targetDate))}</p>
        ${item.delay ? `<p>${esc(item.delay)}</p>` : ""}
        ${sourcesBlock(item.sources)}
      </article>`).join("")
  };
}

function scenarioDetail(data, ui) {
  const scenarios = data.scenarios?.scenarios || [];
  const current = scenarios.find((item) => item.id === ui.scenarioId) || scenarios[0];
  return {
    kind: "scenario",
    title: "Was wäre wenn",
    html: `
      <p class="lede">Wähle eine Art von Ereignis. Die Reaktionen sind die hinterlegten Fälle, kein Ausblick.</p>
      <div class="chips">${scenarios.map((item) => `
        <button type="button" class="chip" data-action="scenario" data-id="${esc(item.id)}" aria-pressed="${item.id === current?.id}">${esc(item.title)}</button>`).join("")}</div>
      ${current ? `
        <article class="card">
          <p class="kicker">Mittlere Bewegung im Datensatz</p>
          <p class="big ${tone(current.medianMovePct)}">${esc(formatPct(current.medianMovePct))}</p>
          <p>${esc(current.summary || "")}</p>
          ${pill(current.example)}
          ${(current.reactions || []).map((reaction) => `
            <div class="row between"><span>${esc(reaction.date)} · ${esc(reaction.symbol)}</span><strong class="${tone(reaction.movePct)}">${esc(formatPct(reaction.movePct))}</strong></div>
            <p class="muted">${esc(reaction.note || "")}</p>`).join("")}
          ${sourcesBlock(current.sources)}
        </article>` : `<p class="empty">Keine Szenarien.</p>`}
      <p class="disclaimer">Keine Anlageberatung. Vergangene Fälle müssen sich nicht wiederholen.</p>
    `
  };
}

function calmDetail(data) {
  const calm = bigDrop(data);
  const recoveries = data.scenarios?.recoveries || [];
  return {
    kind: "calm",
    title: "Ruhe-Modus",
    html: `
      <div class="breath" aria-hidden="true"></div>
      <p class="lede">${calm.active ? "Gerade gibt ein Kurs deutlich nach. Das ist unangenehm und schon oft vorgekommen." : "Wenn ein Kurs am Tag zwei Prozent oder mehr verliert, erscheint dieser Hinweis auf der Startseite."}</p>
      <p>Hier liegen Erholungen nach ähnlich tiefen Rücksetzern. Erinnerung, keine Vorhersage.</p>
      ${recoveries.map((item) => `
        <article class="card">
          <div class="row between"><strong>${esc(item.symbol)}</strong>${pill(item.example)}</div>
          <p class="big down">${esc(formatPct(item.dropPct))}</p>
          <p class="muted">${esc(item.period || "")}${item.monthsToRecover != null ? ` · etwa ${esc(String(item.monthsToRecover))} Monate bis zum alten Stand` : ""}</p>
          <p>${esc(item.recoveryNote || "")}</p>
          ${sourcesBlock(item.sources)}
        </article>`).join("")}
      <p class="disclaimer">Keine Anlageberatung.</p>
    `
  };
}

function productionDetail(data) {
  return {
    kind: "production",
    title: "Produktion",
    html: (data.production?.series || []).map((series) => `
      <article class="card">
        <div class="row between"><h3>${esc(series.label)}</h3>${pill(series.example)}</div>
        <p class="muted">${esc(series.company || "")} · ${esc(series.unit || "")}</p>
        <canvas class="chart" data-chart="prod" data-series="${esc(series.id)}"></canvas>
        <p class="muted">Zuletzt ${esc(formatNumber(series.points?.at(-1)?.value, 1))} ${esc(series.unit || "")}</p>
        ${sourcesBlock(series.sources)}
      </article>`).join("")
  };
}

function principlesDetail(data) {
  return {
    kind: "principles",
    title: "Erste Prinzipien",
    html: `<p class="lede">Was das Geschäft physikalisch trägt. Tippen öffnet das Unternehmen.</p>
      ${(data.companies?.companies || []).map((company) => `
        <button type="button" class="card linkish" data-action="open-company" data-id="${esc(company.id)}">
          <strong>${esc(company.name)}</strong>
          <span>${esc((company.firstPrinciples || []).map((item) => item.title).join(" · "))}</span>
        </button>`).join("")}`
  };
}

export function glossaryList(data, query) {
  const needle = query.trim().toLowerCase();
  const terms = (data.glossary?.terms || []).filter((term) => {
    if (!needle) return true;
    return `${term.term} ${term.short} ${term.explanation}`.toLowerCase().includes(needle);
  });
  if (!terms.length) return `<p class="empty">Nichts dazu im Glossar.</p>`;
  return terms.map((term) => `
    <article class="card term">
      <h3>${esc(term.term)}</h3>
      <p class="muted">${esc(term.short || "")}</p>
      <p>${esc(term.explanation)}</p>
      ${sourcesBlock(term.sources)}
    </article>`).join("");
}

function glossaryDetail(data, ui) {
  return {
    kind: "glossary",
    title: "Glossar",
    html: `
      <label class="search"><span class="sr-only">Begriff suchen</span>
        <input id="glossary-q" type="search" enterkeyhint="search" placeholder="KGV, Kursziel …" value="${esc(ui.glossaryQuery)}">
      </label>
      <div id="glossary-list">${glossaryList(data, ui.glossaryQuery)}</div>
    `
  };
}

function questionDetail(data, store) {
  const file = data.daily_question || {};
  const board = scoreboard(file, store);
  const current = file.current;
  const mine = current ? store.answers?.[current.id] : null;
  return {
    kind: "question",
    title: "Tagesfrage",
    html: `
      <article class="card compare">
        <p class="kicker">Spielstand</p>
        <div class="versus">
          <div><span class="big">Justy ${board.justy}</span><span class="muted">deine Treffer</span></div>
          <div><span class="big gold">Karl ${board.karl}</span><span class="muted">seine Treffer</span></div>
        </div>
        <p class="muted">${board.decided} gewertete Fragen, nur wenn beide geantwortet haben und das Ergebnis da ist.</p>
      </article>
      ${current ? questionCard(current, mine, true) : ""}
      <h3>Vergangen</h3>
      ${(file.history || []).map((item) => questionCard(item, store.answers?.[item.id], false)).join("")}
    `
  };
}

function questionCard(question, mine, open) {
  return `<article class="card">
    <p class="muted">${esc(formatDay(question.date))} ${pill(question.example)}</p>
    <h3>${esc(question.question)}</h3>
    ${open && !question.outcome ? `<div class="yesno">
      <button type="button" data-action="answer" data-qid="${esc(question.id)}" data-value="ja" aria-pressed="${mine?.answer === "ja"}">Ja</button>
      <button type="button" data-action="answer" data-qid="${esc(question.id)}" data-value="nein" aria-pressed="${mine?.answer === "nein"}">Nein</button>
    </div>` : ""}
    ${mine ? `<p>Du: ${esc(mine.answer)}</p>` : ""}
    ${mine || question.outcome ? `<p>Karl: ${esc(question.karlAnswer || "—")}. ${esc(question.karlReason || "")}</p>` : `<p class="muted">Karl zeigt seine Antwort, nachdem du tippst.</p>`}
    ${question.outcome ? `<p>Ergebnis: ${esc(question.outcome)}</p>` : `<p class="muted">Noch offen.</p>`}
    ${sourcesBlock(question.sources)}
  </article>`;
}

function briefingDetail(briefing, title) {
  if (!briefing) return { kind: "briefing", title, html: `<p class="empty">Noch kein Briefing.</p>` };
  return {
    kind: "briefing",
    title,
    html: `
      <p class="muted">${esc(formatDay(briefing.date))} ${pill(briefing.example)}</p>
      <p class="lede">${esc(briefing.greeting || "")}</p>
      <div class="prose">${prose(briefing.summary)}</div>
      <ul>${(briefing.bullets || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      ${audioBlock(briefing.audioUrl)}
      ${sourcesBlock(briefing.sources)}
    `
  };
}

function weeklyDetail(weekly) {
  if (!weekly) return { kind: "weekly", title: "Wochenrückblick", html: `<p class="empty">Noch kein Rückblick.</p>` };
  return {
    kind: "weekly",
    title: weekly.title || "Wochenrückblick",
    html: `
      <p class="muted">Woche vom ${esc(formatDay(weekly.weekOf))} ${pill(weekly.example)}</p>
      <div class="prose">${prose(weekly.summary)}</div>
      ${(weekly.highlights || []).map((item) => `<article class="card"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join("")}
      ${sourcesBlock(weekly.sources)}
    `
  };
}

function alertsDetail(data) {
  const alerts = data.alerts?.alerts || [];
  return {
    kind: "alerts",
    title: "Meldungen",
    html: `
      <p class="lede">Erscheint, wenn ein Euro-Kurs am Tag mindestens ${esc(String(data.alerts?.thresholdPct || 2))} Prozent läuft. Der Assistent setzt „gemeldet“, wenn er Bescheid gegeben hat.</p>
      ${alerts.map((alert) => `
        <article class="card">
          <div class="row between"><strong>${esc(alert.symbol)}</strong><span class="${tone(alert.changePct)}">${esc(formatPct(alert.changePct))}</span></div>
          <p class="muted">${esc(formatStamp(alert.timestamp))} · ${esc(formatEUR(alert.priceEur))} · ${alert.notified ? "gemeldet" : "offen"}</p>
          ${pill(alert.example)}
          ${sourcesBlock(alert.sources)}
        </article>`).join("") || `<p class="empty">Heute keine Meldung über der Schwelle.</p>`}
    `
  };
}
