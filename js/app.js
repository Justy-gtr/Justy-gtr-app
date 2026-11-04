import { drawCharts } from "./chart.js";
import { loadData } from "./data.js";
import { initEggs } from "./eggs.js";
import { appBase, loadStore, saveStore } from "./logic.js";
import { playLiftoff, tickCountdown } from "./motion.js";
import { initNav } from "./nav.js";
import { detailContent, glossaryList, renderShell } from "./views.js";

const ui = {
  page: "heute",
  calKind: "company",
  postFilter: "alle",
  chartSymbol: "SPCX",
  chartRange: "1M",
  langfrist: false,
  scenarioId: "starship_fail",
  revealed: {},
  glossaryQuery: "",
  eggCounters: false
};

let data = null;
let store = loadStore();
store.answers = store.answers || {};

const pager = document.getElementById("pager");
const nav = initNav(pager, {
  onPage(id) {
    ui.page = id;
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
  renderShell(context());
  restoreScroll(scrolls);
  requestAnimationFrame(() => {
    drawCharts(data, ui);
    tickCountdown();
    eggs.afterRender(data);
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
  const detail = detailContent(action, dataset, context());
  if (!detail) return;
  if (replace && nav.topKind() === detail.kind) nav.replace(detail.kind, detail.title, detail.html);
  else nav.open(detail.kind, detail.title, detail.html);
  requestAnimationFrame(() => drawCharts(data, ui));
}

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
  if (action === "langfrist") {
    ui.langfrist = !ui.langfrist;
    if (ui.langfrist && (ui.chartRange === "Tag" || ui.chartRange === "1M")) ui.chartRange = "1J";
    render();
    return;
  }
  if (action === "gegenteil") {
    const id = el.dataset.id;
    ui.revealed[id] = !ui.revealed[id];
    render();
    if (id.startsWith("co-") && nav.topKind() === "company") openDetail("open-company", { id: id.slice(3) }, true);
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
  });
  if ("serviceWorker" in navigator) {
    const base = appBase();
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }
}

boot();
