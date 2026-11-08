import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { N_LEGEND, analyseCandles, analyseChart, analyseText, detectShape } from "../js/analyse.js";
import { musterCard, rangeBoard, renderAnalyse } from "../js/analyse-view.js";
import { MIN_CASES } from "../js/analysis.js";
import { ANALYSE_RANGES, bucketCandles, candlesFor, formatMove, isUsefulFourHour, scrubLabel } from "../js/candles.js";
import { seriesFor } from "../js/logic.js";
import { aggregateBars } from "./market.mjs";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kauf|verkauf|long|short|empfehl\w*|signal|tipp)\b/i;
const DAY = 86400000;

function candle(index, close, extra = {}) {
  return {
    t: new Date(Date.parse("2026-01-01T00:00:00Z") + index * DAY).toISOString(),
    open: extra.open ?? close,
    high: extra.high ?? close,
    low: extra.low ?? close,
    close,
    eur: close
  };
}

function pathCandles(values) {
  return values.map((close, index) => candle(index, close, {
    open: index ? values[index - 1] : close,
    high: Math.max(close, index ? values[index - 1] : close) + (extraHigh(values, index)),
    low: Math.min(close, index ? values[index - 1] : close)
  }));
}

function extraHigh(values, index) {
  return 0;
}

test("Chartanalyse hat genau diese Spannen und keine 1 Min", () => {
  assert.deepEqual(ANALYSE_RANGES, ["5 Min", "15 Min", "4 Std", "1T", "3T", "1W", "1M", "6M", "1J", "Max"]);
  assert.equal(ANALYSE_RANGES.includes("1 Min"), false);
  assert.equal(ANALYSE_RANGES.includes("10 Min"), false);
});

test("15-Minuten-Kerzen nehmen nur Drucke aus dem Block", () => {
  const start = Date.parse("2026-11-06T14:00:00Z");
  const points = Array.from({ length: 15 }, (_, index) => ({
    t: new Date(start + index * 60000).toISOString(),
    eur: 100 + (index % 5),
    high: index === 3 ? 130 : undefined
  }));
  const bars = bucketCandles(points, 15);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].open, 100);
  assert.equal(bars[0].close, 104);
  assert.equal(bars[0].high, 130);
  assert.equal(bars[0].low, 100);
});

test("1T ist ein Tag, 3T sind drei Tageskurse, 4 Std wird nicht aus einer Sitzung gebaut", () => {
  const daily = Array.from({ length: 10 }, (_, index) => ({ t: `2026-10-${String(index + 1).padStart(2, "0")}`, eur: 10 + index }));
  const ticker = { history: { "1M": daily, intraday: daily.map((point) => ({ ...point, t: `${point.t}T14:00:00Z` })) } };
  assert.equal(candlesFor(ticker, "1T").candles.length, 1);
  assert.equal(candlesFor(ticker, "1T").candles[0].eur, 19);
  const three = candlesFor(ticker, "3T").candles;
  assert.deepEqual(three.map((candle) => candle.eur), [17, 18, 19]);
  const missing = candlesFor(ticker, "4 Std");
  assert.equal(missing.missing, true);
  assert.equal(missing.candles.length, 0);
  assert.equal(isUsefulFourHour([{ t: "2026-11-06T14:00:00Z", eur: 1 }, { t: "2026-11-06T18:00:00Z", eur: 2 }]), false);
});

test("4-Stunden-Kerzen bündeln Stunden, ohne Lücken zu füllen", () => {
  const hours = Array.from({ length: 8 }, (_, index) => ({
    t: new Date(Date.UTC(2026, 0, 5, index, 30)).toISOString(),
    open: 10 + index,
    high: 12 + index,
    low: 9 + index,
    close: 11 + index
  }));
  const bars = aggregateBars(hours, 4);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].open, 10);
  assert.equal(bars[0].eur, 14);
  assert.equal(bars[0].high, 15);
  assert.equal(bars[0].low, 9);
});

test("Finger-Text nutzt deutsches Plus und Minus", () => {
  assert.equal(formatMove(1.23), "+1,23 %");
  assert.equal(formatMove(-0.45), "−0,45 %");
  const label = scrubLabel(candle(1, 101.23, { open: 100, high: 102, low: 99 }), 100, 60 * 60 * 1000);
  assert.match(label, /\+1,23 %/);
  assert.match(label, /E /);
  assert.match(label, /H /);
  assert.equal(ADVICE.test(label), false);
});

test("Eine klare Kopf-Schulter bekommt Linien und erfindet kein Prozent aus zu wenig Fällen", () => {
  const values = [
    100, 104, 110, 118, 124, 120, 112, 106, 100, 104,
    112, 122, 132, 140, 134, 124, 112, 104, 100, 106,
    112, 118, 122, 118, 112, 106, 100, 96, 94, 92
  ];
  const candles = pathCandles(values);
  const shape = detectShape(candles);
  assert.equal(shape?.id, "kopf-schulter");
  assert.ok(shape.lines.length >= 2);
  const result = analyseCandles(candles, candles, "1M");
  assert.equal(result.patternId, "kopf-schulter");
  assert.equal(result.outcome.show, false);
  assert.match(result.outcome.sentence, /Keine Prozentzahl/);
  assert.equal(ADVICE.test(analyseText(result)), false);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(analyseText(result)), false);
});

test("Eine gerade Linie bleibt eine Linie und kein Dreieck", () => {
  const candles = pathCandles(Array.from({ length: 24 }, (_, index) => 100 + index));
  assert.equal(detectShape(candles), null);
  const result = analyseCandles(candles, candles, "1M");
  assert.equal(result.patternId, "steigend");
  assert.equal(result.lines.some((line) => line.kind === "trend"), true);
  assert.equal(result.lines.some((line) => line.kind === "pattern"), false);
});

test("Ohne Form keine Linie und keine Prozentzahl", () => {
  const candles = pathCandles(Array.from({ length: 18 }, () => 100));
  const result = analyseCandles(candles, candles, "6M");
  assert.equal(result.patternId, "unklar");
  assert.equal(result.lines.length, 0);
  assert.equal(result.outcome.show, false);
  assert.equal(/%/.test(result.outcome.sentence), false);
});

test("n erklärt die eigene Aktie, auch unter sieben Fällen", () => {
  assert.equal(MIN_CASES, 7);
  const candles = pathCandles(Array.from({ length: 12 }, (_, index) => 80 + index));
  const result = analyseCandles(candles, candles, "1M");
  const html = musterCard(result);
  assert.match(result.outcome.sentence, /n =/);
  assert.match(html, new RegExp(N_LEGEND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /dieser Aktie/);
  assert.match(html, /nicht den ganzen Markt/);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(html), false);
  const quiet = analyseCandles(pathCandles([1, 2, 3]), pathCandles([1, 2, 3]), "3T");
  assert.equal(musterCard(quiet).includes(N_LEGEND), false);
});

test("Prozent einer Aktie mischt keine andere Reihe", () => {
  const own = pathCandles(Array.from({ length: 80 }, (_, index) => 40 + index));
  const other = pathCandles(Array.from({ length: 80 }, (_, index) => 200 - index));
  const result = analyseCandles(own.slice(-16), own, "1J");
  assert.equal(result.outcome.down || 0, 0);
  assert.equal(result.outcome.show, true);
  assert.ok(result.outcome.n >= MIN_CASES);
  assert.notEqual(result.outcome.sentence, analyseCandles(other.slice(-16), other, "1J").outcome.sentence);
});

test("Linie und Kerzen nutzen dieselbe Spannenleiste", () => {
  const start = Date.parse("2026-11-06T14:00:00Z");
  const intraday = Array.from({ length: 30 }, (_, index) => ({
    t: new Date(start + index * 60000).toISOString(),
    eur: 100 + index
  }));
  const daily = Array.from({ length: 10 }, (_, index) => ({
    t: `2026-10-${String(index + 1).padStart(2, "0")}`,
    eur: 10 + index
  }));
  const ticker = { history: { intraday, "1M": daily, "1Y": daily, "4H": [] } };
  assert.equal(seriesFor(ticker, "15 Min").points.length, 2);
  assert.equal(seriesFor(ticker, "1T").points.at(-1).eur, 19);
  assert.equal(seriesFor(ticker, "3T").points.length, 3);
  assert.equal(seriesFor(ticker, "4 Std").points.length, 0);
  const long = {
    history: {
      "4H": [
        { t: "2026-10-01T08:00:00Z", eur: 10 },
        { t: "2026-10-03T12:00:00Z", eur: 12 }
      ],
      "1Y": daily
    }
  };
  assert.equal(seriesFor(long, "4 Std").points.length, 2);
  assert.equal(seriesFor(long, "15 Min", true).range, "1J");
  assert.equal(seriesFor(long, "4 Std", true).range, "1J");
  assert.equal(seriesFor(long, "1T", true).range, "1J");
  const board = rangeBoard("15 Min", "chart-range");
  const ranges = [...board.matchAll(/data-range="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ranges, ANALYSE_RANGES);
  assert.equal(board.includes("1 Min"), false);
  assert.match(board, /data-action="chart-range"/);
});

test("Die Lesezeile bleibt im Layout, auch leer", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const html = renderAnalyse({ prices }, { analyseSymbol: "TSLA", analyseRange: "15 Min" });
  assert.match(html, /<p class="scrub"><\/p>/);
  assert.equal(html.includes('class="scrub" hidden'), false);
  const chart = fs.readFileSync("js/chart.js", "utf8");
  const candles = fs.readFileSync("js/candle-chart.js", "utf8");
  const view = fs.readFileSync("js/views.js", "utf8");
  assert.equal(chart.includes("scrub.hidden = true"), false);
  assert.equal(candles.includes("scrub.hidden = true"), false);
  assert.equal(view.includes('class="scrub" hidden'), false);
  assert.match(fs.readFileSync("css/app.css", "utf8"), /\.scrub \{[\s\S]*height: 1\.4em/);
});

test("Die Seite bietet die Spannen in zwei Reihen und keinen Rat", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const html = renderAnalyse({ prices }, { analyseSymbol: "TSLA", analyseRange: "15 Min", live: false });
  const ranges = [...html.matchAll(/data-range="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ranges, ANALYSE_RANGES);
  assert.equal(html.includes("data-range=\"1 Min\""), false);
  assert.equal(html.includes("Langfrist"), false);
  assert.match(html, /Muster/);
  assert.match(html, /4 Std für die Richtung/);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(html), false);
  assert.equal((html.match(/range-grid/g) || []).length, 2);
});

test("Echte Reihen bleiben bei der eigenen Historie und erfinden kein Prozent", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  for (const ticker of prices.tickers) {
    for (const range of ANALYSE_RANGES) {
      const result = analyseChart(ticker, range);
      const text = analyseText(result);
      assert.equal(ADVICE.test(text), false, `${ticker.symbol} ${range}`);
      assert.equal(/\b(kaufen|verkaufen)\b/i.test(text), false);
      if (range === "4 Std" && result.missing) {
        assert.equal(result.lines.length, 0);
        assert.match(result.outcome.sentence, /4-Stunden/);
        continue;
      }
      if (result.outcome.show) {
        assert.ok(result.outcome.n >= MIN_CASES);
        const pct = result.outcome.pct || {};
        assert.equal((pct.up || 0) + (pct.down || 0) + (pct.flat || 0), 100);
      } else if (/n\s*=/.test(result.outcome.sentence)) {
        assert.ok((result.outcome.n || 0) < MIN_CASES);
        assert.equal(/%/.test(result.outcome.sentence), false);
      }
      const candles = result.candles || candlesFor(ticker, range).candles;
      if (candles.length) {
        const low = Math.min(...candles.map((item) => item.low));
        const high = Math.max(...candles.map((item) => item.high));
        for (const line of result.lines || []) {
          if (line.kind === "trend" || line.kind === "mark" || line.eur0 == null) continue;
          assert.ok(line.eur0 >= low - 0.05 && line.eur0 <= high + 0.05, `${ticker.symbol} ${range} ${line.kind}`);
        }
      }
    }
  }
});
