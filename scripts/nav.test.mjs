import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyseViewOf, renderAnalyse } from "../js/analyse-view.js";
import { pagerIndex, pagerLeft } from "../js/nav.js";
import { detailContent, renderChartsPage } from "../js/views.js";

const PAGES = ["heute", "kalender", "posts", "schwarm", "deutschland", "analyse", "mehr"];

test("Jeder Tab trifft seine eigene Seite, nicht die Mitte", () => {
  for (const width of [390, 430]) {
    PAGES.forEach((id, index) => {
      assert.equal(pagerLeft(index, width), index * width);
      assert.equal(pagerIndex(index * width, width, PAGES.length), index);
      assert.equal(PAGES[pagerIndex(index * width, width)], id);
    });
    assert.notEqual(pagerIndex(0, width), PAGES.indexOf("schwarm"));
    assert.notEqual(pagerIndex(6 * width, width), PAGES.indexOf("schwarm"));
  }
  assert.equal(pagerIndex(390 * 3 + 40, 390), 3);
  assert.equal(pagerIndex(390 * 3 + 200, 390), 4);
  for (const count of [6, 7]) {
    for (let index = 0; index < count; index += 1) {
      assert.equal(pagerLeft(index, 390), index * 390);
      assert.equal(pagerIndex(index * 390, 390, count), index);
    }
  }
});

test("Sieben Tabs, Deutschland sitzt vor Analyse, Heute öffnet Analyse", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const nav = fs.readFileSync("js/nav.js", "utf8");
  const app = fs.readFileSync("js/app.js", "utf8");
  const views = fs.readFileSync("js/views.js", "utf8");
  assert.equal(html.includes('data-page="charts"'), false);
  assert.equal(html.includes("page-charts"), false);
  assert.equal((html.match(/class="tab"/g) || []).length, 7);
  assert.match(html, /data-page="schwarm"[\s\S]*data-page="deutschland"[\s\S]*data-page="analyse"/);
  assert.match(html, />Deutschland</);
  assert.equal(nav.includes('"charts"'), false);
  assert.match(views, /data-action="open-analyse"/);
  assert.match(app, /action === "open-analyse"[\s\S]{0,240}go\("analyse"\)/);
  assert.match(app, /store\.analyseView = ui\.analyseView/);
  assert.equal(analyseViewOf("chart"), "chart");
  assert.equal(analyseViewOf("kerzen"), "kerzen");
  assert.equal(analyseViewOf("charts"), "kerzen");
  assert.equal(analyseViewOf(undefined), "kerzen");
  const prices = { tickers: [{ symbol: "TSLA", name: "Tesla", priceEur: 10, history: { intraday: [], "1M": [] } }] };
  const candles = renderAnalyse({ prices }, { analyseSymbol: "TSLA", analyseRange: "15 Min" });
  const line = renderChartsPage({ prices }, { chartSymbol: "TSLA", chartRange: "1T" });
  assert.match(candles, /data-view="kerzen"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-view="kerzen"/);
  assert.match(line, /data-view="chart"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-view="chart"/);
  assert.match(candles, /mood-lamp/);
  assert.match(line, /mood-lamp/);
  assert.match(line, /Warum diese Bewegung/);
  assert.equal(candles.includes("Langfrist"), false);
  assert.equal(line.includes("Langfrist"), false);
  const css = fs.readFileSync("css/app.css", "utf8");
  assert.match(css, /grid-auto-flow:\s*column/);
  assert.match(css, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
  assert.equal(css.includes("repeat(7"), false);
  assert.equal(fs.readFileSync("css/analyse.css", "utf8").includes("repeat(7"), false);
});

test("Meldungen zeigen die neueste zuerst und lassen die Datei in Ruhe", () => {
  const alerts = [
    { symbol: "TSLA", changePct: 1, priceEur: 10, timestamp: "2026-11-08T10:00:00Z", notified: false, sources: [] },
    { symbol: "RKLB", changePct: 2, priceEur: 20, timestamp: "2026-11-09T10:00:00Z", notified: false, sources: [] },
    { symbol: "AAA", changePct: 3, priceEur: 30, timestamp: "2026-11-09T10:00:00Z", notified: true, sources: [] }
  ];
  const data = { alerts: { thresholdPct: 2, alerts } };
  const html = detailContent("open-alerts", {}, { data, ui: {}, store: {} }).html;
  const rklb = html.indexOf(">RKLB<");
  const aaa = html.indexOf(">AAA<");
  const tsla = html.indexOf(">TSLA<");
  assert.ok(rklb >= 0 && aaa > rklb && tsla > aaa);
  assert.deepEqual(alerts.map((alert) => alert.symbol), ["TSLA", "RKLB", "AAA"]);
  assert.equal(data.alerts.alerts, alerts);
});
