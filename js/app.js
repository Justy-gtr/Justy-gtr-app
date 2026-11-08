import { drawCharts } from "./chart.js";
import { loadData } from "./data.js";
import { initEggs } from "./eggs.js";
import { appBase, isInAppUrl, loadStore, marketWatch, saveStore } from "./logic.js";
import { playLiftoff, tickCountdown } from "./motion.js";
import { initNav } from "./nav.js";
import { detailContent, errorDetail, glossaryList, renderShell } from "./views.js";

const ui = {
  page: "heute",
  calKind: "company",
  postFilter: "alle",
  chartSymbol: "SPCX",
  chartRange: "1 Min",
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
      last?.t || "",
      last?.eur ?? ""
    ].join(":");
  }).join("|");
}

async function pullPrices() {
  if (!data || liveInflight) return;
  if (document.visibilityState === "hidden") return;
  if (ui.page !== "charts" && ui.page !== "heute") return;
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

const pager = document.getElementById("pager");
const nav = initNav(pager, {
  onPage(id) {
    ui.page = id;
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
  try {
    renderShell(context());
  } catch (error) {
    const home = document.getElementById("page-heute");
    if (home) home.innerHTML = `<article class="card error-card"><h2>Startseite gerade nicht da.</h2><p class="muted">${error.message}</p></article>`;
  }
  restoreScroll(scrolls);
  requestAnimationFrame(() => {
    try { drawCharts(data, ui); } catch { /* Chart bleibt leer, die Seite nicht. */ }
    tickCountdown();
    try { eggs.afterRender(data); } catch { /* Überraschung ist Beiwerk. */ }
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
    ui.chartRange = el.dataset.range;
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

async function refresh(manual) {
  try {
    data = await loadData();
    render();
    if (manual) toast("Aktualisiert");
  } catch {
    if (manual) toast("Keine Verbindung. Gespeicherte Daten bleiben.");
  }
}

function tickClock() {
  const clock = document.getElementById("clock");
  if (!clock) return;
  clock.textContent = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  clock.dateTime = new Date().toISOString();
}

async function boot() {
  tickClock();
  window.setInterval(tickClock, 15000);
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
    if (document.visibilityState === "hidden") hiddenAt.t = Date.now();
    if (document.visibilityState === "visible" && hiddenAt.t && Date.now() - hiddenAt.t > 120000) refresh(false);
    if (document.visibilityState === "visible") pullPrices();
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
