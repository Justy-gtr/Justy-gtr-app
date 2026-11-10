import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { FILES } from "../js/data.js";
import { renderAnalyse } from "../js/analyse-view.js";
import { renderChartsPage } from "../js/views.js";
import {
  EMPTY_PHRASE,
  MOOD_COLOR,
  STALE_MS,
  berlinHm,
  lampState,
  markMoodPulse,
  moodShift,
  renderMoodLamp
} from "../js/sentiment.js";

const BANNED = /kaufen|verkaufen|empfehlung|kaufsignal|anlageberatung/i;

function freshEntry(over = {}) {
  return {
    mood: "gut",
    score: 12,
    postsCount: 3,
    reason: "Viele Beiträge klingen freundlich.",
    sources: [{ title: "X-Suche", url: "https://x.com/search?q=SPCX" }],
    updatedAt: "2026-11-10T13:35:00.000Z",
    ...over
  };
}

test("Berliner Uhrzeit der Lampe, Winter und Sommer", () => {
  assert.equal(berlinHm("2026-11-10T13:35:00.000Z"), "14:35");
  assert.equal(berlinHm("2026-07-10T12:35:00.000Z"), "14:35");
  assert.equal(berlinHm("2026-11-09T23:00:00.000Z"), "00:00");
  assert.equal(berlinHm(""), "");
  assert.equal(berlinHm("kein-datum"), "");
});

test("Lampenzustand: Ton, grau, veraltet, fehlend", () => {
  const updated = new Date("2026-11-10T12:00:00.000Z");
  const entry = freshEntry({ updatedAt: updated.toISOString(), mood: "schlecht", score: -8, postsCount: 1, reason: "Eher kühl." });
  const fresh = lampState(entry, new Date(updated.getTime() + STALE_MS));
  assert.equal(fresh.stale, false);
  assert.equal(fresh.tone, "schlecht");
  assert.equal(fresh.color, MOOD_COLOR.schlecht);
  assert.equal(fresh.color, "#ef4444");
  assert.equal(fresh.label, "Stimmung · 13:00");
  const aged = lampState(entry, new Date(updated.getTime() + STALE_MS + 1));
  assert.equal(aged.stale, true);
  assert.equal(aged.tone, "leer");
  assert.equal(aged.color, "#6b7280");
  assert.equal(aged.label, "Stimmung · 13:00");
  assert.equal(aged.mood, "schlecht");

  const mixed = lampState(freshEntry({ mood: "gemischt", updatedAt: updated.toISOString() }), updated);
  assert.equal(mixed.tone, "gemischt");
  assert.equal(mixed.color, "#f59e0b");

  const green = lampState(freshEntry(), new Date("2026-11-10T13:50:00.000Z"));
  assert.equal(green.tone, "gut");
  assert.equal(green.color, "#22c55e");
  assert.equal(green.label, "Stimmung · 14:35");
  assert.equal(green.empty, false);

  const missing = lampState(null, updated);
  assert.equal(missing.empty, true);
  assert.equal(missing.tone, "leer");
  assert.equal(missing.label, `Stimmung · ${EMPTY_PHRASE}`);
  const blank = lampState({ mood: "", score: 0, postsCount: 0, reason: "", sources: [], updatedAt: "" }, updated);
  assert.equal(blank.empty, true);
  assert.equal(blank.stale, false);
  assert.equal(blank.label, `Stimmung · ${EMPTY_PHRASE}`);
  const noClock = lampState(freshEntry({ updatedAt: "" }), updated);
  assert.equal(noClock.stale, true);
  assert.equal(noClock.tone, "leer");
  assert.equal(noClock.label, `Stimmung · ${EMPTY_PHRASE}`);
});

test("Puls nur wenn der Ton sich geändert hat", () => {
  assert.equal(moodShift("gemischt", "gut"), true);
  assert.equal(moodShift("gut", "gut"), false);
  assert.equal(moodShift("", "gut"), false);
  assert.equal(moodShift("gut", ""), false);
  assert.equal(moodShift("kauf", "gut"), false);
  const changed = lampState(freshEntry({ previousMood: "gemischt" }), new Date("2026-11-10T13:50:00.000Z"));
  assert.equal(changed.changed, true);
  const same = lampState(freshEntry({ previousMood: "gut" }), new Date("2026-11-10T13:50:00.000Z"));
  assert.equal(same.changed, false);
  const staleChange = lampState(
    freshEntry({ previousMood: "schlecht" }),
    new Date(Date.parse("2026-11-10T13:35:00.000Z") + STALE_MS + 5)
  );
  assert.equal(staleChange.changed, false);
});

test("Lampe merkt sich den letzten frischen Ton und pulsiert einmal", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value)
  };
  function lamp(mood, stale = false) {
    const classes = new Set(stale ? ["is-stale"] : []);
    return {
      dataset: { symbol: "SPCX", mood, stale: stale ? "1" : "0", changed: "0" },
      classList: {
        toggle(name, on) {
          if (on) classes.add(name);
          else classes.delete(name);
        },
        has: (name) => classes.has(name)
      }
    };
  }
  const first = lamp("gut");
  markMoodPulse({ querySelectorAll: () => [first] }, storage);
  assert.equal(first.classList.has("is-changed"), false);
  const again = lamp("gut");
  markMoodPulse({ querySelectorAll: () => [again] }, storage);
  assert.equal(again.classList.has("is-changed"), false);
  const next = lamp("schlecht");
  markMoodPulse({ querySelectorAll: () => [next] }, storage);
  assert.equal(next.classList.has("is-changed"), true);
  const after = lamp("schlecht");
  markMoodPulse({ querySelectorAll: () => [after] }, storage);
  assert.equal(after.classList.has("is-changed"), false);
  const old = lamp("gut", true);
  markMoodPulse({ querySelectorAll: () => [old] }, storage);
  assert.equal(old.classList.has("is-changed"), false);
});

test("Kartenblatt nennt Satz, Zahl, Beiträge und Quelle, ohne Rat", () => {
  const now = new Date("2026-11-10T13:50:00.000Z");
  const html = renderMoodLamp({ symbols: { SPCX: freshEntry() } }, "SPCX", now, "charts");
  assert.match(html, /is-gut/);
  assert.match(html, /#22c55e/);
  assert.match(html, /Stimmung · 14:35/);
  assert.match(html, /Viele Beiträge klingen freundlich/);
  assert.match(html, /3 Beiträge/);
  assert.match(html, /Wert 12/);
  assert.match(html, /Ton gut/);
  assert.match(html, /href="https:\/\/x.com\/search\?q=SPCX"/);
  assert.match(html, /mood-sheet-charts-SPCX/);
  assert.match(html, /hidden/);
  assert.equal(BANNED.test(html), false);
  const one = renderMoodLamp({ symbols: { TSLA: freshEntry({ postsCount: 1, mood: "schlecht", score: -4 }) } }, "TSLA", now, "analyse");
  assert.match(one, /1 Beitrag/);
  assert.match(one, /is-schlecht/);
  assert.match(one, /#ef4444/);
  const empty = renderMoodLamp({
    symbols: { RKLB: { mood: "", score: 0, postsCount: 0, reason: "", sources: [], updatedAt: "" } }
  }, "RKLB", now, "charts");
  assert.match(empty, /noch keine Daten/);
  assert.match(empty, /Noch keine Daten/);
  assert.match(empty, /is-leer/);
  assert.equal(empty.includes("is-gut"), false);
  assert.equal(BANNED.test(empty), false);
  const missing = renderMoodLamp({ symbols: { SPCX: freshEntry() } }, "MRVL", now, "analyse");
  assert.match(missing, /is-leer/);
  assert.match(missing, /is-empty/);
  assert.match(missing, /#6b7280/);
  assert.match(missing, /noch keine Daten/);
  assert.equal(missing.includes("is-gut"), false);
  assert.equal(BANNED.test(missing), false);
  assert.equal(renderMoodLamp(null, "MRVL", now, "analyse").includes("is-leer"), true);
  const file = JSON.parse(fs.readFileSync("data/sentiment.json", "utf8"));
  assert.equal(file.symbols.MRVL, undefined);
  const hostile = renderMoodLamp({
    symbols: {
      SPCX: freshEntry({ sources: [{ title: "böse", url: "javascript:alert(1)" }] })
    }
  }, "SPCX", now, "charts");
  assert.equal(hostile.includes("javascript:"), false);
});

test("Charts und Analyse setzen die Lampe links über die Fläche, die Lesezeile bleibt darüber", () => {
  const now = new Date("2026-11-10T13:50:00.000Z");
  const sentiment = {
    symbols: {
      SPCX: freshEntry(),
      TSLA: freshEntry({ mood: "gemischt", reason: "Gemischt.", updatedAt: "2026-07-10T12:35:00.000Z" })
    }
  };
  const prices = {
    tickers: [
      { symbol: "SPCX", name: "SpaceX", priceEur: 10, history: { intraday: [], "1M": [] } },
      { symbol: "TSLA", name: "Tesla", priceEur: 20, history: { intraday: [], "1M": [] } }
    ]
  };
  const charts = renderChartsPage({ prices, sentiment }, { chartSymbol: "SPCX", chartRange: "1T", langfrist: false, live: false });
  assert.match(charts, /<p class="scrub"><\/p>\s*<div class="chart-stage">\s*<div class="mood-lamp is-gut/);
  assert.match(charts, /Stimmung · 14:35/);
  assert.match(charts, /data-symbol="SPCX"/);
  assert.match(charts, /mood-sheet-analyse-SPCX/);
  assert.match(charts, /data-view="chart"/);
  assert.equal(charts.includes("Langfrist"), false);
  assert.equal(BANNED.test(charts), false);
  const analyse = renderAnalyse({ prices, sentiment }, { analyseSymbol: "TSLA", analyseRange: "15 Min", live: false });
  assert.match(analyse, /<p class="scrub"><\/p>\s*<div class="chart-stage">\s*<div class="mood-lamp is-/);
  assert.match(analyse, /mood-sheet-analyse-TSLA/);
  assert.match(analyse, /Stimmung · 14:35/);
  assert.equal(BANNED.test(analyse), false);
  const css = fs.readFileSync("css/app.css", "utf8");
  assert.match(css, /\.mood-lamp\s*\{[^}]*top:\s*4px/);
  assert.match(css, /\.mood-lamp\s*\{[^}]*left:\s*6px/);
  assert.match(css, /min\(200px,\s*56%\)/);
  assert.match(css, /#22c55e/);
  assert.match(css, /#ef4444/);
  assert.match(css, /#f59e0b/);
  assert.match(css, /prefers-reduced-motion:\s*no-preference[\s\S]*mood-pulse/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none !important/);
  const sw = fs.readFileSync("sw.js", "utf8");
  assert.match(sw, /jgtr-v37/);
  assert.match(sw, /data\/sentiment\.json/);
  assert.match(sw, /js\/sentiment\.js/);
  assert.match(sw, /pathname\.includes\("\/data\/"\)/);
  assert.match(sw, /networkFirst\(request\)/);
  assert.ok(FILES.includes("sentiment"));
  const dataJs = fs.readFileSync("js/data.js", "utf8");
  assert.match(dataJs, /cache:\s*"no-cache"/);
  const app = fs.readFileSync("js/app.js", "utf8");
  assert.match(app, /async function refresh[\s\S]*loadData\(/);
  assert.equal(BANNED.test(fs.readFileSync("js/sentiment.js", "utf8")), false);
  assert.equal(now.toISOString().startsWith("2026-11-10"), true);
});
