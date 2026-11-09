import { renderAnalyse } from "./analyse-view.js";
import { drawCandles } from "./candle-chart.js";
import { drawDayPaths } from "./daypath.js";
import { drawCharts } from "./chart.js";
import { loadData } from "./data.js";
import { initEggs } from "./eggs.js";
import { initKnockout } from "./knockout-ui.js";
import { appBase, berlinClockText, CHART_RANGES, isInAppUrl, loadStore, markTabSeen, marketWatch, saveStore, unreadTabs, usSessionWord } from "./logic.js";
import { playLiftoff, tickCountdown } from "./motion.js";
import { initNav } from "./nav.js";
import { initPull } from "./pull.js";
import { detailContent, errorDetail, glossaryList, renderShell } from "./views.js";

const ui = {
  page: "heute",
  calKind: "company",
  postFilter: "alle",
  chartSymbol: "SPCX",
  chartRange: "1T",
  langfrist: false,
  analyseSymbol: "SPCX",
  analyseRange: "15 Min",
  analyseSeason: "all",
  live: false,
  scenarioId: "starship_fail",
  revealed: {},
  glossaryQuery: "",
  eggCounters: false
};

let data = null;
let store = loadStore();
store.answers = store.answers || {};

const LIVE_MS = 60_000;
let lastLiveAttempt = 0;
let liveInflight = false;

function paintLiveFlag() {
  document.querySelectorAll("[data-live-flag]").forEach((node) => {
    node.hidden = !ui.live;
  });
}

function priceStamp(prices) {
  return (prices?.tickers || []).map((ticker) => {
    const last = ticker.history?.intraday?.at?.(-1);
    return [
      ticker.symbol,
      ticker.priceEur,
      ticker.changePct,
      ticker.dayHighEur,
      ticker.dayLowEur,
      ticker.overnightPhase,
      ticker.overnightEur,
      ticker.overnightHighEur,
      ticker.overnightLowEur,
      ticker.history?.intraday?.length || 0,
      ticker.history?.["4H"]?.length || 0,
      last?.t || "",
      last?.eur ?? ""
    ].join(":");
  }).join("|");
}

async function pullPrices() {
  if (!data || liveInflight) return;
  if (document.visibilityState === "hidden") return;
  if (ui.page !== "charts" && ui.page !== "heute" && ui.page !== "analyse") return;
  if (!marketWatch()) {
    if (ui.live) {
      ui.live = false;
      paintLiveFlag();
    }
    return;
  }
  if (Date.now() - lastLiveAttempt < LIVE_MS - 1000) return;
  lastLiveAttempt = Date.now();
  liveInflight = true;
  try {
    const response = await fetch(`${appBase()}/data/prices.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    if (response.headers.get("X-JGTR-Cache") === "hit") {
      ui.live = false;
      paintLiveFlag();
      return;
    }
    const next = await response.json();
    if (!next || !Array.isArray(next.tickers)) throw new Error("leer");
    const changed = priceStamp(next) !== priceStamp(data.prices);
    data.prices = next;
    if (data.meta && next.asOf) data.meta.pricesUpdated = next.asOf;
    const then = Date.parse(next.asOf || "");
    ui.live = next.example !== true && Number.isFinite(then) && Date.now() - then < 15 * 60 * 1000;
    if (changed) render();
    else paintLiveFlag();
  } catch {
    ui.live = false;
    paintLiveFlag();
  } finally {
    liveInflight = false;
  }
}

const knockout = initKnockout({ getData: () => data });
const pager = document.getElementById("pager");
function paintDots() {
  const unread = data ? unreadTabs(data, store) : {};
  document.querySelectorAll(".tab").forEach((button) => {
    const on = (unread[button.dataset.page] || []).length > 0;
    const dot = button.querySelector(".tab-dot");
    if (dot) dot.hidden = !on;
    button.classList.toggle("has-dot", on);
  });
}

function notePage(id) {
  if (!data || !id) return;
  if (markTabSeen(store, data, id)) saveStore(store);
  paintDots();
}

let settleTimer = 0;
function settlePage(id) {
  window.clearTimeout(settleTimer);
  // A swipe slides across the tabs in between. Only the one it stops on is opened.
  settleTimer = window.setTimeout(() => {
    if (ui.page === id) notePage(id);
  }, 180);
}

const nav = initNav(pager, {
  onPage(id) {
    ui.page = id;
    settlePage(id);
    pullPrices();
  }
});
const eggs = initEggs(toast);

function context() {
  return { data, ui, store };
}

function captureScroll() {
  const map = {};
  document.querySelectorAll(".page").forEach((page) => {
    map[page.id] = page.scrollTop;
  });
  return map;
}

function restoreScroll(map) {
  document.querySelectorAll(".page").forEach((page) => {
    if (map[page.id] != null) page.scrollTop = map[page.id];
  });
}

function render() {
  const scrolls = captureScroll();
  document.body.dataset.page = ui.page || "";
  try {
    renderShell(context());
  } catch (error) {
    const home = document.getElementById("page-heute");
    if (home) home.innerHTML = `<article class="card error-card"><h2>Startseite gerade nicht da.</h2><p class="muted">${error.message}</p></article>`;
  }
  try {
    const analyse = document.getElementById("page-analyse");
    if (analyse) analyse.innerHTML = renderAnalyse(data, ui);
  } catch (error) {
    const analyse = document.getElementById("page-analyse");
    if (analyse) analyse.innerHTML = `<article class="card error-card"><h2>Chartanalyse gerade nicht da.</h2><p class="muted">${error.message}</p></article>`;
  }
  restoreScroll(scrolls);
  nav.align();
  notePage(ui.page);
  paintClock();
  requestAnimationFrame(() => {
    try { drawCharts(data, ui); } catch { /* Chart bleibt leer, die Seite nicht. */ }
    try { drawCandles(data, ui); } catch { /* Kerzen bleiben leer, die Seite nicht. */ }
    try { drawDayPaths(data, ui); } catch { /* Tagesverlauf bleibt leer, die Seite nicht. */ }
    tickCountdown();
    try { eggs.afterRender(data); } catch { /* Überraschung ist Beiwerk. */ }
    try { knockout.sync(); } catch { /* Rechner bleibt zu, die Seite nicht. */ }
  });
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => el.classList.remove("show"), 3400);
}

function openDetail(action, dataset, replace = false) {
  let detail;
  try {
    detail = detailContent(action, dataset, context());
  } catch (error) {
    detail = errorDetail(error);
  }
  if (!detail) detail = errorDetail(new Error("Diese Ansicht gibt es nicht."));
  if (!detail.html || !String(detail.html).trim()) {
    detail = { ...detail, html: `<p class="empty">Hier liegt gerade nichts.</p>` };
  }
  try {
    if (replace && nav.topKind() === detail.kind) nav.replace(detail.kind, detail.title || "Ansicht", detail.html);
    else nav.open(detail.kind || "detail", detail.title || "Ansicht", detail.html);
  } catch {
    nav.closeAll();
    toast("Die Ansicht ließ sich nicht öffnen.");
    return;
  }
  requestAnimationFrame(() => {
    try { drawCharts(data, ui); } catch { /* Ein Chart darf die Ansicht nicht leer lassen. */ }
  });
}

function openExternal(href) {
  const opened = window.open(href, "_blank");
  if (opened) {
    try { opened.opener = null; } catch { /* iOS lässt das oft nicht zu. */ }
    return;
  }
  const sheet = document.getElementById("link-sheet");
  const label = document.getElementById("link-sheet-url");
  if (label) label.textContent = href;
  if (sheet) {
    sheet.hidden = false;
    sheet.dataset.href = href;
  }
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a[href]");
  if (!anchor) return;
  let url;
  try {
    url = new URL(anchor.href, location.href);
  } catch {
    event.preventDefault();
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    event.preventDefault();
    return;
  }
  if (isInAppUrl(url, location.origin, appBase())) return;
  event.preventDefault();
  event.stopPropagation();
  openExternal(url.href);
}, true);

document.body.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  if (event.target.closest("a")) return;
  const { action } = el.dataset;
  if (action === "page") {
    nav.closeAll();
    nav.go(el.dataset.page);
    return;
  }
  if (action === "dismiss-install") {
    store.installHidden = true;
    saveStore(store);
    render();
    return;
  }
  if (action === "cal-kind") {
    ui.calKind = el.dataset.kind === "external" ? "external" : "company";
    render();
    return;
  }
  if (action === "post-filter") {
    ui.postFilter = el.dataset.filter || "alle";
    render();
    return;
  }
  if (action === "chart-symbol") {
    ui.chartSymbol = el.dataset.symbol;
    render();
    return;
  }
  if (action === "chart-range") {
    const next = el.dataset.range;
    if (!CHART_RANGES.includes(next)) return;
    const short = ["1T", "1W", "1M"];
    ui.chartRange = ui.langfrist && short.includes(next) ? "1J" : next;
    render();
    return;
  }
  if (action === "langfrist") {
    ui.langfrist = !ui.langfrist;
    if (ui.langfrist && ["1T", "1W", "1M"].includes(ui.chartRange)) ui.chartRange = "1J";
    render();
    return;
  }
  if (action === "analyse-symbol") {
    ui.analyseSymbol = el.dataset.symbol;
    render();
    return;
  }
  if (action === "analyse-range") {
    ui.analyseRange = el.dataset.range;
    render();
    return;
  }
  if (action === "analyse-season") {
    ui.analyseSeason = el.dataset.season === "year" ? "year" : "all";
    render();
    return;
  }
  if (action === "gegenteil") {
    const id = el.dataset.id;
    ui.revealed[id] = !ui.revealed[id];
    render();
    if (id.startsWith("co-") && nav.topKind() === "company") openDetail("open-company", { id: id.slice(3) }, true);
    if (nav.topKind() === "favorite") openDetail("open-favorite", { id }, true);
    const favoriteCount = Object.entries(ui.revealed).filter(([key, on]) => on && key.startsWith("fav-")).length;
    if (favoriteCount >= 5 && !ui.eggCounters) {
      ui.eggCounters = true;
      toast("Fünf Gegenteile an einem Abend. So bleibt das Cockpit ehrlich.");
    }
    return;
  }
  if (action === "scenario") {
    ui.scenarioId = el.dataset.id;
    openDetail("open-scenario", {}, true);
    return;
  }
  if (action === "answer") {
    store.answers[el.dataset.qid] = { answer: el.dataset.value, at: new Date().toISOString() };
    saveStore(store);
    render();
    if (nav.topKind() === "question") openDetail("open-question", {}, true);
    return;
  }
  if (action === "liftoff") {
    playLiftoff();
    return;
  }
  if (action === "refresh") {
    refresh(true);
    return;
  }
  if (action === "open-ko") {
    knockout.open();
    return;
  }
  if (action === "close") {
    nav.close();
    return;
  }
  if (action === "dismiss-link") {
    const sheet = document.getElementById("link-sheet");
    if (sheet) sheet.hidden = true;
    return;
  }
  if (action === "open-link-again") {
    const href = document.getElementById("link-sheet")?.dataset.href;
    if (href) window.open(href, "_blank");
    return;
  }
  openDetail(action, el.dataset);
});

document.body.addEventListener("input", (event) => {
  if (event.target.id !== "glossary-q") return;
  ui.glossaryQuery = event.target.value;
  const list = document.getElementById("glossary-list");
  if (list) list.innerHTML = glossaryList(data, ui.glossaryQuery);
});

initPull({
  getScroller(target) {
    if (!(target instanceof Element)) return null;
    if (knockout.isOpen()) return null;
    const link = document.getElementById("link-sheet");
    if (link && !link.hidden && target.closest("#link-sheet")) return null;
    if (target.closest("canvas, .chart-wrap, .dock, input, textarea, select, a")) return null;
    const detail = document.querySelector("#detail-root .detail.top:not(.closing)");
    if (detail) return detail.contains(target) ? detail : null;
    return target.closest(".page");
  },
  refresh: () => refresh(true),
  roots: [pager, document.getElementById("detail-root")]
});

async function refresh(manual) {
  try {
    data = await loadData();
    render();
    if (manual) toast("Aktualisiert");
  } catch {
    if (manual) toast("Keine Verbindung. Gespeicherte Daten bleiben.");
  }
}

let clockTimer = 0;

function paintClock(date = new Date()) {
  const text = berlinClockText(date);
  const iso = date.toISOString();
  const clock = document.getElementById("clock");
  const minutes = text.slice(0, 5);
  if (clock && clock.textContent !== minutes) {
    clock.textContent = minutes;
    clock.dateTime = iso;
  }
  const home = document.getElementById("home-clock");
  if (home && home.textContent !== text) {
    home.textContent = text;
    home.dateTime = iso;
  }
  const session = document.getElementById("home-session");
  if (session) {
    const label = `US ${usSessionWord(date)}`;
    if (session.textContent !== label) session.textContent = label;
  }
}

function armClock() {
  window.clearTimeout(clockTimer);
  if (document.hidden) return;
  paintClock();
  clockTimer = window.setTimeout(armClock, 1000 - (Date.now() % 1000));
}

async function boot() {
  armClock();
  window.setInterval(tickCountdown, 1000);
  try {
    data = await loadData();
  } catch (error) {
    document.getElementById("page-heute").innerHTML = `<p class="empty">Die Daten sind gerade nicht da. ${error.message}</p>`;
    return;
  }
  render();
  requestAnimationFrame(() => document.body.classList.add("booted"));
  const hiddenAt = { t: 0 };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt.t = Date.now();
      window.clearTimeout(clockTimer);
      return;
    }
    armClock();
    if (hiddenAt.t && Date.now() - hiddenAt.t > 120000) refresh(false);
    pullPrices();
  });
  pullPrices();
  window.setInterval(pullPrices, 15000);
  if ("serviceWorker" in navigator) {
    let reloaded = false;
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    }
    const base = appBase();
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }
}

boot();
