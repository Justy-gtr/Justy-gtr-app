import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  MIN_CASES,
  analysisText,
  analyzePoints,
  chartAnalysis,
  classifySeries,
  countRetests,
  countSimilar,
  splitPercent
} from "../js/analysis.js";
import { seriesFor } from "../js/logic.js";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kauf|verkauf|long|short|empfehl\w*|signal|tipp)\b/i;

const DAY = 86400000;

function bars(values, start = Date.parse("2026-01-01T00:00:00Z")) {
  return values.map((eur, index) => ({
    t: new Date(start + index * DAY).toISOString(),
    eur
  }));
}

test("Prozentwerte summieren sich auf 100", () => {
  assert.deepEqual(splitPercent({ up: 2, down: 1 }), { up: 67, down: 33 });
  const even = splitPercent({ bounce: 4, broke: 4 });
  assert.equal(even.bounce + even.broke, 100);
});

test("Eine gerade steigende Reihe bekommt eine Linie und kein Prozent aus zu wenig Fällen", () => {
  const points = bars(Array.from({ length: 12 }, (_, index) => 100 + index));
  const found = classifySeries(points, { swing: 2, window: 12, radius: 1 });
  assert.equal(found.id, "steigend");
  assert.equal(found.lines.some((line) => line.kind === "trend" && line.dir === "up"), true);
  assert.equal(found.lines.some((line) => line.kind === "support"), false);
  const thin = analyzePoints(points, points, { swing: 2, window: 12, horizonMs: 7 * DAY, flatPct: 0.001, after: "eine Woche später", touchLook: 8, touchGap: 2, touchMargin: 0.01 }, "1M");
  assert.equal(thin.outcome.show, false);
  assert.match(thin.outcome.sentence, /Keine Prozentzahl/);
  assert.equal(ADVICE.test(analysisText(thin)), false);
});

test("Zwei getrennte Tiefs werden eine Stütze", () => {
  const points = bars([20, 10, 18, 17, 16, 10.2, 19, 21]);
  const found = classifySeries(points, { swing: 1, radius: 1, window: 8 });
  const support = found.lines.find((line) => line.kind === "support");
  assert.ok(support);
  assert.ok(support.eur0 >= 10 && support.eur0 <= 10.2);
});

test("Nach einer steigenden Reihe wird nur gezählt, was danach auch passiert ist", () => {
  const points = bars(Array.from({ length: 80 }, (_, index) => 50 + index));
  const spec = { swing: 2, window: 10, horizonMs: 7 * DAY, flatPct: 0.001, after: "eine Woche später" };
  const totals = countSimilar(points, "steigend", 10, spec);
  assert.ok(totals.up >= MIN_CASES);
  assert.equal(totals.down, 0);
  assert.equal(totals.flat, 0);
  const shown = analyzePoints(points.slice(-10), points, spec, "6M");
  assert.equal(shown.patternId, "steigend");
  assert.equal(shown.outcome.show, true);
  assert.equal((shown.outcome.pct.up || 0) + (shown.outcome.pct.down || 0) + (shown.outcome.pct.flat || 0), 100);
  assert.match(shown.outcome.sentence, /hoch/);
  assert.match(shown.outcome.sentence, /runter/);
  assert.match(shown.outcome.sentence, /n =/);
});

test("Stütz-Berührungen: gleiche Strecke für Abpraller und Bruch", () => {
  const spec = { touchLook: 8, touchGap: 2, touchMargin: 0.01, horizonMs: 7 * DAY, swing: 1 };
  const episode = (down) => [
    ...Array(20).fill(130),
    110, 110, 100, 110, 110, 110, 110, 110, 100, down ? 90 : 120, 130, 130
  ];
  const values = [];
  for (let index = 0; index < 8; index += 1) values.push(...episode(false));
  for (let index = 0; index < 4; index += 1) values.push(...episode(true));
  const totals = countRetests(bars(values), "low", spec, null);
  assert.equal(totals.all.bounce, 8);
  assert.equal(totals.all.broke, 4);
});

test("Echte Reihen erfinden keine Prozentzahl und keinen Rat", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const ranges = ["1 Min", "5 Min", "1W", "1M", "6M", "1J", "5J", "Max"];
  for (const ticker of prices.tickers) {
    for (const range of ranges) {
      const result = chartAnalysis(ticker, range);
      const text = analysisText(result);
      assert.equal(ADVICE.test(text), false, `${ticker.symbol} ${range}`);
      assert.equal(/\b(kaufen|verkaufen)\b/i.test(text), false);
      if (result.outcome.show) {
        assert.ok(result.outcome.n >= MIN_CASES);
        const pct = result.outcome.pct;
        assert.equal((pct.up || 0) + (pct.down || 0) + (pct.flat || 0), 100);
        assert.match(result.outcome.sentence, /n =/);
      } else {
        assert.match(result.outcome.sentence, /keine Prozentzahl/i);
        assert.equal(/%/.test(result.outcome.sentence), false);
      }
      for (const level of result.levels) {
        assert.ok(["support", "resistance", "trend"].includes(level.kind));
        if (level.show) {
          assert.ok(level.n >= MIN_CASES);
          assert.equal((level.pct.bounce || 0) + (level.pct.broke || 0), 100);
        } else {
          assert.match(level.sentence, /keine Prozentzahl/i);
          assert.equal(/%/.test(level.sentence), false);
        }
      }
      const { points } = seriesFor(ticker, range);
      if (points.length >= 2) {
        const low = Math.min(...points.map((point) => point.eur));
        const high = Math.max(...points.map((point) => point.eur));
        for (const line of result.lines) {
          if (line.kind === "trend") continue;
          assert.ok(line.eur0 >= low - 0.01 && line.eur0 <= high + 0.01);
        }
      }
    }
  }
});
