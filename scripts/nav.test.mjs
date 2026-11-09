import assert from "node:assert/strict";
import test from "node:test";
import { pagerIndex, pagerLeft } from "../js/nav.js";
import { detailContent } from "../js/views.js";

const PAGES = ["heute", "kalender", "posts", "schwarm", "charts", "analyse", "mehr"];

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
