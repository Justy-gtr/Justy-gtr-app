import { chartAnalysis } from "./analysis.js";
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
  sparkSample,
  buildFeed,
  buildMarketTimeline,
  formatEventClock,
  sessionBlurb,
  headlineEvent,
  isStandalone,
  opinionWord,
  vsSwarmVerdict,
  methodLabel,
  OVERNIGHT_LABEL,
  rangeChange,
  safeUrl,
  scoreboard,
  seriesFor,
  trackSummary,
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

function sourcesBlock(sources, { labeled = true } = {}) {
  const list = (sources || []).map((source) => ({ title: source?.title, href: safeUrl(source?.url) })).filter((source) => source.href);
  if (!list.length) return "";
  return `<div class="sources">${labeled ? `<p class="sources-label">Quellen</p>` : ""}<ul>${list.map((source) => `<li><a href="${esc(source.href)}" target="_blank" data-external="true">${esc(source.title || "Quelle")}</a></li>`).join("")}</ul></div>`;
}

function externalAnchor(href, label) {
  const safe = safeUrl(href);
  if (!safe) return "";
  return `<a class="text-btn" href="${esc(safe)}" target="_blank" data-external="true">${esc(label)}</a>`;
}

function pageError(error) {
  return `<article class="card error-card"><h2>Diese Seite lässt sich gerade nicht zeigen.</h2><p>Unten bleiben die anderen Bereiche erreichbar.</p><p class="muted">${esc(error?.message || "")}</p></article>`;
}

export function errorDetail(error) {
  return {
    kind: "error",
    title: "Etwas ist schiefgegangen",
    html: `<article class="card error-card"><p>Diese Ansicht konnte nicht geladen werden. Schließen bringt dich zurück.</p><p class="muted">${esc(error?.message || "")}</p></article>`
  };
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
  const pages = [
    ["page-heute", () => renderHeute(data, ui, store)],
    ["page-kalender", () => renderKalender(data, ui)],
    ["page-posts", () => renderPosts(data, ui)],
    ["page-schwarm", () => renderSchwarm(data)],
    ["page-charts", () => renderChartsPage(data, ui)],
    ["page-mehr", () => renderMehr(data)]
  ];
  for (const [id, build] of pages) {
    const node = document.getElementById(id);
    if (!node) continue;
    try {
      node.innerHTML = build();
    } catch (error) {
      node.innerHTML = pageError(error);
    }
  }
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
  const next = headlineEvent(data.calendar?.events || []);
  const favorites = [...(data.favorites?.favorites || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const launch = data.production?.nextLaunch;
  const question = data.daily_question?.current;
  const live = freshPrices(data.meta);
  const alerts = data.alerts?.alerts || [];
  const install = !store.installHidden && !isStandalone();
  const today = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const dropped = calm.tickers.map((ticker) => ticker.symbol).join(", ");
  return `
    <header class="page-head home-head">
      <p class="eyebrow">Heute</p>
      <h1>${esc(greeting())}, Justy</h1>
      <p class="dateline">${esc(today)}</p>
    </header>
    ${install ? `<p class="install-line"><span>In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.</span><button type="button" data-action="dismiss-install">OK</button></p>` : ""}
    ${calm.active ? `<button type="button" class="banner banner-calm" data-action="open-calm">Ruhe-Modus · ${esc(dropped || "Ein Kurs")}</button>` : ""}
    ${feedBlock(data)}
    ${marketBlock(data)}
    ${topFive(favorites, ui)}
    <section class="card quote-card is-tight" aria-label="Kurse in Euro">
      <div class="row between quote-head"><span class="kicker">Kurse in Euro</span><span class="muted">Xetra, sonst umgerechnet</span></div>
      ${tickers.map((ticker) => quoteRow(ticker, live, true)).join("") || `<p class="empty">Keine Kurse.</p>`}
    </section>
    ${next ? `<button type="button" class="card next-card" data-action="open-event" data-id="${esc(next.id)}">
      <span class="kicker">Als Nächstes</span>
      <span class="next-title">${esc(next.title)}</span>
      <span class="muted">${esc(formatEventClock(next))} · ${esc(String(next.probabilityPct ?? "—"))} %</span>
    </button>` : ""}
    ${launch ? `<details class="fold"><summary><span>Starship</span><span class="count-num summary-count" id="count-num" data-target="${esc(launch.target || "")}">—</span></summary><div class="fold-body">${launchBody(launch)}</div></details>` : ""}
    ${alerts.length ? `<details class="fold"><summary>Bewegungen ab 2 % <span class="muted">${alerts.length}</span></summary><div class="fold-body">${alerts.slice(0, 6).map((alert) => `
      <button type="button" class="mini-note" data-action="open-alerts">
        <span class="row between"><strong>${esc(alert.symbol)}</strong><span>${esc(formatEUR(alert.priceEur))} <span class="${tone(alert.changePct)}">${esc(formatPct(alert.changePct))}</span></span></span>
        <span class="muted">${esc(formatStamp(alert.timestamp))}${alert.notified ? " · gemeldet" : ""}</span>
      </button>`).join("")}</div></details>` : ""}
    <details class="fold"><summary>Kosmos</summary><div class="fold-body chips">${(data.companies?.companies || []).map((company) => `
      <button type="button" class="chip" data-action="open-company" data-id="${esc(company.id)}">${esc(company.name)}</button>`).join("")}</div></details>
    <div class="jump-list">
      <button type="button" data-action="open-briefing"><span>Morgen-Briefing</span><span aria-hidden="true">›</span></button>
      <button type="button" data-action="open-question"><span>${esc(question?.question || "Tagesfrage")}</span><span aria-hidden="true">›</span></button>
      <button type="button" data-action="page" data-page="kalender"><span>Ganzer Kalender</span><span aria-hidden="true">›</span></button>
    </div>
  `;
}

function feedBlock(data) {
  const items = buildFeed(data);
  if (!items.length) return "";
  return `<section class="card feed" aria-label="Neues">
    <p class="kicker">Neues</p>
    ${items.map((item) => `<button type="button" class="feed-row" data-action="${esc(item.action)}" ${item.target ? `data-id="${esc(item.target)}"` : ""}>
      <span class="feed-kind">${esc(item.label)}</span>
      <span class="feed-title">${esc(item.title)}</span>
      <span class="feed-time">${esc(item.timeLabel)}</span>
    </button>`).join("")}
  </section>`;
}

function marketBlock(data) {
  const items = buildMarketTimeline(data);
  if (!items.length) return "";
  return `<section class="card market-day" aria-label="Markt heute">
    <p class="kicker">Markt heute</p>
    ${items.map((item) => {
      const state = item.status === "offen" ? "is-open" : item.status === "bald" ? "is-soon" : "";
      return `<button type="button" class="market-row" data-action="${esc(item.action)}" ${item.target ? `data-id="${esc(item.target)}"` : ""}>
        <span class="market-time">${esc(item.timeLabel)}</span>
        <span class="market-kind">${esc(item.label)}</span>
        <span class="market-title">${esc(item.title)}</span>
        <span class="market-state ${state}">${item.status ? esc(item.status) : ""}</span>
      </button>`;
    }).join("")}
  </section>`;
}

function rangeText(high, low) {
  const bits = [];
  if (high != null) bits.push(`Hoch ${formatEUR(high)}`);
  if (low != null) bits.push(`Tief ${formatEUR(low)}`);
  return bits.join(" · ");
}

function priceFacts(ticker) {
  if (!ticker) return "";
  const day = rangeText(ticker.dayHighEur, ticker.dayLowEur);
  const phase = OVERNIGHT_LABEL[ticker.overnightPhase];
  const extPrice = Boolean(phase) && ticker.overnightEur != null;
  const extRange = rangeText(ticker.overnightHighEur, ticker.overnightLowEur);
  if (!day && !extPrice) return "";
  return `<div class="q-facts">
    ${day ? `<p class="day-range">${esc(day)}</p>` : ""}
    ${extPrice ? `<p class="q-ext"><span class="q-ext-name">${esc(phase)}</span> <strong>${esc(formatEUR(ticker.overnightEur))}</strong>${extRange ? ` <span class="ext-range">${esc(extRange)}</span>` : ""}</p>` : ""}
  </div>`;
}

function quoteRow(ticker, live, tight = false) {
  const fresh = live && ticker.example !== true;
  const sparkSource = ticker.history?.intraday?.length ? sparkSample(ticker.history.intraday) : ticker.sparkline;
  return `<div class="quote${tight ? " is-tight" : ""}" data-symbol-card="${esc(ticker.symbol)}">
    <button type="button" class="quote-hit" data-action="open-company" data-symbol="${esc(ticker.symbol)}" aria-label="${esc(ticker.name || ticker.symbol)} öffnen"></button>
    <span class="q-name">
      <strong>${esc(ticker.symbol)}${fresh ? `<span class="live-dot" title="Frische Kurse"></span>` : ""}</strong>
      <span class="q-sub"><span>${esc(ticker.name || "")}</span><button type="button" class="why-link" data-action="explain" data-symbol="${esc(ticker.symbol)}">Warum?</button></span>
    </span>
    ${tight ? "" : sparkline(sparkSource)}
    <span class="q-px">
      <strong>${esc(formatEUR(ticker.priceEur))}</strong>
      <span class="${tone(ticker.changePct)}">${arrow(ticker.changePct)} ${esc(formatPct(ticker.changePct))}</span>
    </span>
    ${priceFacts(ticker)}
  </div>`;
}

function opinionTone(value) {
  const word = String(value || "");
  if (word === "kauf") return "up";
  if (word === "vorsichtig" || word === "verkauf") return "warn";
  return "flat";
}

function opinionIcon(tone) {
  if (tone === "up") {
    return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 2.2 12.8 9H9.4v4.6H6.6V9H3.2z"/></svg>`;
  }
  if (tone === "warn") {
    return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1.6 15 14.4H1L8 1.6zm0 4.4.05 4.2h-.1L8 6zm0 6.1a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z"/></svg>`;
  }
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2.8 7.2h10.4v1.6H2.8z"/></svg>`;
}

function stanceLabel(value) {
  return opinionWord(value);
}

function opinionChip(who, stance) {
  const tone = opinionTone(stance);
  return `<span class="opin opin-${tone}"><span class="opin-icon">${opinionIcon(tone)}</span><span class="opin-text">${esc(who)} ${esc(opinionWord(stance))}</span></span>`;
}

const SCHWARM_LEGEND = "Schwarm = Meinung auf X, keine Käufe. Das Urteil gilt gegen den Schwarm, nicht als Tipp.";

function karlScoreChip(item, verdict) {
  const tone = verdict.kind === "warm" ? "up" : "warn";
  const score = item.score ?? item.karlScore;
  const text = score == null ? verdict.label : `${score}/10`;
  return `<span class="opin opin-${tone}"><span class="opin-text">Karl ${esc(String(text))}</span></span>`;
}

function comparisonCopy(item) {
  const verdict = vsSwarmVerdict(item);
  const take = item.karlTake || item.note || item.reason || "";
  const counter = item.karlCounter || "";
  return { verdict, take, counter };
}

function takeBlock(item, verdict) {
  const { take, counter } = comparisonCopy(item);
  return `${take ? `<p class="karl-take">${esc(take)}</p>` : ""}
    ${counter ? `<p class="karl-counter"><span>Dagegen</span> ${esc(counter)}</p>` : ""}
    <div class="opinion-chips">
      ${opinionChip("Schwarm", item.swarmStance)}
      ${karlScoreChip(item, verdict)}
    </div>`;
}

function opinionCard(item) {
  const verdict = vsSwarmVerdict(item);
  return `<article class="opinion-card is-${verdict.kind}">
    <div class="opinion-top">
      <div class="opinion-who">
        <strong>${esc(item.symbol || "")}</strong>
        <span>${esc(item.name || "")}</span>
      </div>
      <div class="opinion-end">
        <span class="opinion-price">${item.priceEur == null ? "" : esc(formatEUR(item.priceEur))}</span>
        <span class="verdict is-${verdict.kind}">${esc(verdict.label)}</span>
      </div>
    </div>
    ${takeBlock(item, verdict)}
  </article>`;
}

function stanceGroup(title, items) {
  if (!items.length) return "";
  return `<section class="stance-group" aria-label="${esc(title)}">
    <div class="stance-head"><h3>${esc(title)}</h3><span class="summary-count">${items.length}</span></div>
    <div class="opinion-list">${items.map((item) => opinionCard(item)).join("")}</div>
  </section>`;
}

function say(who, stance) {
  const tone = opinionTone(stance);
  return `<span class="say"><span class="say-who">${esc(who)}</span> <span class="say-word is-${tone}">${esc(opinionWord(stance))}</span></span>`;
}

function sayKarl(item) {
  const verdict = vsSwarmVerdict(item);
  const tone = verdict.kind === "warm" ? "up" : "warn";
  const word = verdict.key === "zuversichtlicher" ? "zuversichtlicher" : "skeptischer";
  return `<span class="say"><span class="say-who">Karl</span> <span class="say-word is-${tone}">${esc(word)}</span></span>`;
}

function topFive(favorites) {
  if (!favorites.length) return "";
  return `<section class="card quote-card top5-compact" aria-label="Karls Top 10">
    <div class="row between quote-head">
      <span class="kicker">Karls Top 10</span>
      <button type="button" class="text-btn" data-action="page" data-page="schwarm">Vergleich</button>
    </div>
    <p class="legend">Schwarm = Meinung auf X, keine Käufe.</p>
    ${favorites.map((favorite) => {
      return `<button type="button" class="top-line" data-action="open-favorite" data-id="${esc(favorite.id)}">
        <span class="top-main">
          <strong>${esc(favorite.symbol)}</strong>
          <span class="top-name">${esc(favorite.name || "")}</span>
          <span class="top-px">${favorite.priceEur == null ? "" : esc(formatEUR(favorite.priceEur))}</span>
        </span>
        <span class="top-says">${say("Schwarm", favorite.swarmStance)}${sayKarl(favorite)}</span>
      </button>`;
    }).join("")}
  </section>`;
}

function sessionDetail(id) {
  const title = id === "nyse" ? "NYSE / Nasdaq" : id === "tokyo" ? "Tokio" : id === "xetra" ? "Xetra" : "Börse";
  return { kind: "session", title, html: `<p>${esc(sessionBlurb(id))}</p>` };
}

function eventRow(event) {
  return `<button type="button" class="card linkish event-row" data-action="open-event" data-id="${esc(event.id)}">
    <span class="row between"><strong>${esc(event.title)}</strong>${pill(event.example)}</span>
    <span class="muted">${esc(formatEventClock(event))} · ${esc(event.kind === "external" ? "Extern" : "Unternehmen")}</span>
    ${prob(event.probabilityPct)}
  </button>`;
}

function launchBody(launch) {
  return `<div class="launch-body" id="launch-card">
    <div class="row between">
      <div>
        <h3>${esc(launch.name || "Nächster Start")}</h3>
        <p class="muted">${esc(launch.status || "")}</p>
      </div>
      <button type="button" class="rocket-btn" data-action="liftoff" aria-label="Startanimation abspielen">
        <span class="rocket" id="rocket">${rocketSvg()}</span>
      </button>
    </div>
    ${launch.note ? `<p>${esc(launch.note)}</p>` : ""}
    ${externalAnchor(launch.livestreamUrl, "Livestream")}
    <p class="muted">Tippen auf die Rakete spielt den Start.</p>
  </div>`;
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
  const picks = [...(data.favorites?.favorites || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const cards = picks.length ? picks : (comparison.picks || []);
  const warm = cards.filter((item) => vsSwarmVerdict(item).key === "zuversichtlicher");
  const cool = cards.filter((item) => vsSwarmVerdict(item).key !== "zuversichtlicher");
  return `
    <header class="page-head">
      <p class="eyebrow">Karls Top 10</p>
      <h2>Schwarm gegen Karl</h2>
      <p class="karl-lead">${esc(comparison.summary || "Karl sagt, wo er dem Schwarm mehr traut und wo weniger.")}</p>
    </header>
    <p class="legend">${esc(SCHWARM_LEGEND)}</p>
    ${stanceGroup("Zuversichtlicher als der Schwarm", warm)}
    ${stanceGroup("Skeptischer als der Schwarm", cool)}
    <details class="fold">
      <summary>Treffer</summary>
      <div class="fold-body">
        ${comparison.swarmHitRatePct == null ? `<p class="muted">Trefferquoten stehen noch aus. Es wird keine Quote erfunden.</p>` : `<div class="versus"><div><span class="big">${esc(formatNumber(comparison.swarmHitRatePct, 0))} %</span><span class="muted">Schwarm</span></div><div><span class="big gold">${esc(formatNumber(comparison.karlHitRatePct, 0))} %</span><span class="muted">Karl</span></div></div>`}
      </div>
    </details>
    <details class="fold">
      <summary>Quellen</summary>
      <div class="fold-body">${sourcesBlock(comparison.sources, { labeled: false }) || `<p class="empty">Keine Quellen hinterlegt.</p>`}</div>
    </details>
    <div class="stack">${investors.map((investor) => `
      <button type="button" class="card linkish" data-action="open-investor" data-id="${esc(investor.id)}">
        <span class="row between"><strong>${esc(investor.name)}</strong>${pill(investor.example)}</span>
        <span class="muted">${esc(investor.handle)} · ${investor.hitRatePct == null ? "Treffer noch offen" : `Treffer ${esc(formatNumber(investor.hitRatePct, 0))} %`}</span>
        <span class="mention-row">${(investor.tickers || []).map((ticker) => `<em>${esc(ticker.symbol)} ${ticker.mentions == null ? "" : `${esc(String(ticker.mentions))}× `}${esc(stanceLabel(ticker.stance))}</em>`).join("")}</span>
        <canvas class="chart mini" data-chart="hit" data-investor="${esc(investor.id)}"></canvas>
      </button>`).join("")}</div>
  `;
}

function renderChartsPage(data, ui) {
  const ticker = tickerBy(data, ui.chartSymbol) || data.prices?.tickers?.[0];
  const { points, range } = seriesFor(ticker, ui.chartRange);
  const change = rangeChange(points);
  const ranges = ["1 Min", "5 Min", "1W", "1M", "6M", "1J", "5J", "Max"];
  const analysis = chartAnalysis(ticker, range);
  return `
    <header class="page-head">
      <p class="eyebrow">Kurs in Euro</p>
      <h2>${esc(ticker?.name || "Kurs")}</h2>
      <p class="price-value">${esc(formatEUR(ticker?.priceEur))} <span class="${tone(change)}">${esc(formatPct(change))}</span></p>
      ${priceFacts(ticker)}
      <p class="muted chart-note"><span class="live-flag" data-live-flag ${ui.live ? "" : "hidden"}><span class="live-dot" aria-hidden="true"></span>Live</span><span>${esc(methodLabel(ticker || {}))} · Spanne ${esc(range)}</span></p>
    </header>
    <div class="chips">${(data.prices?.tickers || []).map((item) => `
      <button type="button" class="chip" data-action="chart-symbol" data-symbol="${esc(item.symbol)}" aria-pressed="${item.symbol === ticker?.symbol}">${esc(item.symbol)}</button>`).join("")}</div>
    <div class="chips">${ranges.map((item) => `
      <button type="button" class="chip" data-action="chart-range" data-range="${item}" aria-pressed="${item === range}">${esc(item)}</button>`).join("")}</div>
    <div class="card chart-wrap">
      <p class="scrub" hidden></p>
      <canvas class="chart chart-price" data-chart="price" data-symbol="${esc(ticker?.symbol || "")}" aria-label="Kurschart in Euro. Ziehen zeigt Kurs und Zeitpunkt."></canvas>
    </div>
    ${analysisCard(analysis)}
    <button type="button" class="text-btn" data-action="explain" data-symbol="${esc(ticker?.symbol || "")}">Warum diese Bewegung?</button>
  `;
}

function analysisCard(analysis) {
  const outcome = analysis?.outcome || {};
  const up = outcome.pct?.up ?? 0;
  const down = outcome.pct?.down ?? 0;
  const figures = outcome.show ? `<div class="versus"><div><span class="big up">${up} %</span><span class="muted">danach hoch</span></div><div><span class="big down">${down} %</span><span class="muted">danach runter</span></div></div>` : "";
  const levels = (analysis?.levels || []).map((level) => `
    <div class="level-block">
      <p class="level-head"><strong><i class="swatch ${level.kind === "resistance" ? "resist" : level.kind}" aria-hidden="true"></i>${esc(level.title)}</strong>${level.eur == null ? "" : `<span class="level-price">${esc(formatEUR(level.eur))}</span>`}</p>
      ${level.show ? `<p class="level-kicker">${esc(level.kicker)}</p>` : ""}
      <p class="level-stat">${esc(level.sentence)}</p>
    </div>`).join("");
  const legend = (analysis?.legend || []).map((item) => `<span><i class="swatch ${item.kind === "resistance" ? "resist" : item.kind}" aria-hidden="true"></i>${esc(item.label)}</span>`).join("");
  return `
    <article class="card analysis" aria-label="Kursbild">
      <p class="kicker">Muster</p>
      <h3>${esc(analysis?.title || "Keine klare Form")}</h3>
      ${figures}
      <p class="analysis-note">${esc(outcome.sentence || "")}</p>
      ${outcome.detail ? `<p class="analysis-note">${esc(outcome.detail)}</p>` : ""}
      ${levels}
      ${legend ? `<p class="chart-legend">${legend}</p>` : ""}
    </article>`;
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
  if (action === "open-favorite") return favoriteDetail(data, dataset.id, ui);
  if (action === "explain") return explainDetail(data, dataset.symbol);
  if (action === "open-event") return eventDetail(data, dataset.id);
  if (action === "open-session") return sessionDetail(dataset.id);
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

function favoriteDetail(data, id, ui) {
  const favorite = (data.favorites?.favorites || []).find((item) => item.id === id);
  if (!favorite) return { kind: "favorite", title: "Favorit", html: `<p class="empty">Nicht gefunden.</p>` };
  return {
    kind: "favorite",
    title: favorite.name || favorite.symbol,
    html: `
      <p class="kicker">${esc(favorite.symbol)} · ${esc(String(favorite.score))}/10 · ${favorite.priceEur == null ? "" : esc(formatEUR(favorite.priceEur))}</p>
      <span class="verdict is-${vsSwarmVerdict(favorite).kind}">${esc(vsSwarmVerdict(favorite).label)}</span>
      ${takeBlock(favorite, vsSwarmVerdict(favorite))}
      ${favorite.reason && favorite.reason !== favorite.karlTake ? `<p>${esc(favorite.reason)}</p>` : ""}
      ${favorite.counterArgument && favorite.counterArgument !== favorite.karlCounter ? `<button type="button" class="text-btn" data-action="gegenteil" data-id="${esc(favorite.id)}" aria-expanded="${ui?.revealed?.[favorite.id] ? "true" : "false"}">Gegenteil</button>
      ${ui?.revealed?.[favorite.id] ? `<p class="counter">${esc(favorite.counterArgument)}</p>` : ""}` : ""}
      ${sourcesBlock(favorite.sources)}
    `
  };
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
      ${ticker ? `<p class="price-value">${esc(formatEUR(ticker.priceEur))} <span class="${tone(ticker.changePct)}">${esc(formatPct(ticker.changePct))}</span></p>${priceFacts(ticker)}<p class="muted">${esc(methodLabel(ticker))}</p>` : ""}
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
      <p class="muted">${esc(formatEventClock(event))}</p>
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
  return {
    kind: "post",
    title: post.displayName || post.account,
    html: `
      <p class="muted">${esc(post.account)} · ${esc(formatStamp(post.postedAt))} · ${esc(post.sentiment || "")}</p>
      ${pill(post.example)}
      <div class="prose">${prose(post.summaryDe)}</div>
      ${post.originalText ? `<p class="muted">${esc(post.originalText)}</p>` : ""}
      ${externalAnchor(post.url, "Original öffnen")}
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
      <p class="muted">${esc(investor.handle)} · ${investor.hitRatePct == null ? "Trefferquote noch offen" : `Trefferquote ${esc(formatNumber(investor.hitRatePct, 0))} %`}</p>
      ${pill(investor.example)}
      <p>${esc(investor.note || "")}</p>
      <canvas class="chart" data-chart="hit" data-investor="${esc(investor.id)}"></canvas>
      <h3>Erwähnungen</h3>
      ${(investor.tickers || []).map((ticker) => `
        <div class="mention"><span>${esc(ticker.symbol)} · ${esc(stanceLabel(ticker.stance))}</span>${ticker.mentions == null ? "" : `<div class="prob"><span style="width:${Math.round((ticker.mentions / max) * 100)}%"></span></div><b>${esc(String(ticker.mentions))}</b>`}</div>`).join("")}
      ${sourcesBlock(investor.sources)}
    `
  };
}

function insiderEuro(trade, data) {
  if (trade.priceEur != null) return formatEUR(trade.priceEur);
  const rate = data?.prices?.fx?.rate || data?.meta?.fx?.rate;
  if (trade.priceUsd == null || !rate) return "";
  return formatEUR(Number(trade.priceUsd) / Number(rate));
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
        <p class="muted">${esc(formatDay(trade.date))} · ${esc(formatNumber(trade.shares))} Stück${insiderEuro(trade, data) ? ` · ${esc(insiderEuro(trade, data))}` : ""}</p>
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
          <p class="price-value">${esc(formatEUR(pick.entryPriceEur))}</p>
          <p class="muted">Einstieg in Euro · ${esc(formatDay(pick.pickedOn))} bis ${esc(formatDay(pick.horizonEnd))} · Wert ${esc(String(pick.score ?? ""))}</p>
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
