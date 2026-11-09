import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BOUNCE_FEW, BOUNCE_LOOK, BOUNCE_PLAIN, BREAK_LEGEND, N_LEGEND, analyseCandles, analyseChart, analyseText, countLevelBounces, describeLevelBounces, detectShape, levelMarkLabel, levelPriceTag, levelSideName, numberLevelMarks } from "../js/analyse.js";
import { guideLegend, musterCard, rangeBoard, renderAnalyse } from "../js/analyse-view.js";
import { MIN_CASES, analysisText, chartAnalysis } from "../js/analysis.js";
import { nameAnchorX, pickNameY, settlePriceTags, visibleGridLabels } from "../js/candle-chart.js";
import { ANALYSE_RANGES, bucketCandles, candleColor, candlesFor, formatMove, isUsefulFourHour, scrubLabel } from "../js/candles.js";
import { chartAxisLabels, formatEUR, guideLabelsToDraw, HOURLY_BAR_CAP, instrumentAxisLabels, instrumentSeries, scrubDelta, seriesFor, tradingSessionCount, VISIBLE_BARS } from "../js/logic.js";
import { renderChartsPage } from "../js/views.js";
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
  assert.deepEqual(ANALYSE_RANGES, ["5 Min", "15 Min", "4 Std", "1T", "1 Std", "1W", "1M", "6M", "1J", "Max"]);
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

test("1T ist ein Tag, 1 Std nimmt Stunden und nicht drei Tageskurse, 4 Std wird nicht aus einer Sitzung gebaut", () => {
  const daily = Array.from({ length: 10 }, (_, index) => ({ t: `2026-10-${String(index + 1).padStart(2, "0")}`, eur: 10 + index }));
  const ticker = { history: { "1M": daily, intraday: daily.map((point) => ({ ...point, t: `${point.t}T14:00:00Z` })) } };
  assert.equal(candlesFor(ticker, "1T").candles.length, 1);
  assert.equal(candlesFor(ticker, "1T").candles[0].eur, 19);
  const hours = candlesFor(ticker, "1 Std").candles;
  assert.equal(hours.at(-1).eur, 19);
  assert.ok(hours.length > 3);
  assert.ok(hours.length <= 10);
  assert.notDeepEqual(hours.map((candle) => candle.eur), [17, 18, 19]);
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
  const quiet = analyseCandles(pathCandles([1, 2, 3]), pathCandles([1, 2, 3]), "1 Std");
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
  const day = seriesFor(ticker, "1T");
  assert.equal(day.points.at(-1).eur, 129);
  assert.ok(day.points.length > 1);
  assert.equal(day.points.every((point) => point.t.startsWith("2026-11-06")), true);
  const hourLine = seriesFor(ticker, "1 Std");
  assert.equal(hourLine.range, "1 Std");
  assert.equal(hourLine.points.at(-1).eur, 129);
  assert.equal(hourLine.points.every((point) => point.t.startsWith("2026-11-06")), true);
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

function sessionBars(day, price) {
  const start = Date.parse(`${day}T14:30:00.000Z`);
  return Array.from({ length: 78 }, (_, index) => {
    const t = new Date(start + index * 5 * 60 * 1000).toISOString();
    return { t, eur: price, open: price, high: price + 0.4, low: price - 0.4 };
  });
}

test("Kurzer Montagmorgen behält 15-Minuten-Kerzen aus der 5-Minuten-Historie", () => {
  const start = Date.parse("2026-11-09T09:00:00.000Z");
  const intraday = Array.from({ length: 40 }, (_, index) => ({
    t: new Date(start + index * 60 * 1000).toISOString(),
    eur: 110 + index,
    session: "pre"
  }));
  const thursday = sessionBars("2026-11-05", 80);
  thursday[0] = { t: thursday[0].t, eur: 11, open: 10, high: 12, low: 9 };
  thursday[1] = { t: thursday[1].t, eur: 14, open: 11, high: 15, low: 10 };
  thursday[2] = { t: thursday[2].t, eur: 15, open: 14, high: 16, low: 13 };
  const stale = Array.from({ length: 8 }, (_, index) => {
    const t = new Date(start + index * 5 * 60 * 1000).toISOString();
    return { t, eur: 999, open: 999, high: 999, low: 999 };
  });
  const history = {
    intraday,
    "5m": [
      ...sessionBars("2026-11-04", 50),
      ...thursday,
      ...sessionBars("2026-11-06", 100),
      ...stale
    ]
  };
  const ticker = { symbol: "TSLA", name: "Tesla", priceEur: 149, history };

  const quarter = candlesFor(ticker, "15 Min");
  assert.ok(quarter.candles.length >= 20, `nur ${quarter.candles.length} Kerzen`);
  assert.ok(quarter.candles.length <= VISIBLE_BARS);
  assert.equal(quarter.candles.length, seriesFor(ticker, "15 Min").points.length);
  assert.equal(quarter.candles[0].t.slice(0, 10), "2026-11-06");
  const thursdayBar = quarter.history.find((candle) => candle.t.startsWith("2026-11-05"));
  assert.equal(thursdayBar.open, 10);
  assert.equal(thursdayBar.high, 16);
  assert.equal(thursdayBar.low, 9);
  assert.equal(thursdayBar.close, 15);
  assert.ok(quarter.history.length > quarter.candles.length);
  assert.equal(quarter.history[0].t.slice(0, 10), "2026-11-04");
  assert.equal(quarter.candles.some((candle) => candle.high === 999 || candle.close === 999), false);
  assert.equal(quarter.candles.at(-1).close, 149);
  const span = Date.parse(quarter.candles.at(-1).t) - Date.parse(quarter.candles[0].t);
  assert.ok(span > 24 * 60 * 60 * 1000);
  const label = scrubLabel(quarter.candles.at(-1), quarter.candles[0].close, quarter.candles);
  assert.match(label, /\d{2}:\d{2}/);
  assert.match(label, new RegExp(scrubDelta(quarter.candles[0].close, quarter.candles.at(-1).close).text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(label.includes(scrubDelta(50, 149).text), false);

  const five = candlesFor(ticker, "5 Min");
  assert.ok(five.candles.length >= 2);
  assert.ok(five.candles.length <= VISIBLE_BARS);
  assert.equal(five.candles.length, seriesFor(ticker, "5 Min").points.length);
  assert.equal(five.candles.every((candle) => candle.t.startsWith("2026-11-09")), true);
  assert.equal(five.candles[0].close, 114);
  assert.equal(seriesFor(ticker, "5 Min").points[0].eur, 114);
  assert.ok(five.history.length > five.candles.length);

  const result = analyseChart(ticker, "15 Min");
  assert.equal(result.candles.length, quarter.candles.length);
  assert.equal(result.outcome.sentence.includes("Zu wenig Punkte für eine Linie"), false);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(analyseText(result)), false);
  if (result.outcome.show) {
    assert.ok(result.outcome.n >= MIN_CASES);
    const pct = result.outcome.pct || {};
    assert.equal((pct.up || 0) + (pct.down || 0) + (pct.flat || 0), 100);
  }
  const line = chartAnalysis(ticker, "5 Min");
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(analysisText(line)), false);
  if (line.outcome.show) assert.ok(line.outcome.n >= MIN_CASES);

  const html = renderAnalyse({ prices: { tickers: [ticker] } }, { analyseSymbol: "TSLA", analyseRange: "15 Min" });
  assert.match(html, /<p class="scrub"><\/p>/);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(html), false);

  const bare = { history: { intraday } };
  assert.equal(candlesFor(bare, "15 Min").candles.length, 3);
  assert.equal(seriesFor(bare, "5 Min").points.length, 8);
  assert.equal(candlesFor({ history: { intraday, "5m": [] } }, "15 Min").candles.length, 3);
  assert.equal(candlesFor({ history: { intraday, "5m": [intraday[0]] } }, "15 Min").candles.length, 3);
});

test("5 Min bleibt die letzte Sitzung und höchstens sechs Stunden, Kerzen bleiben grün oder rot", () => {
  const start = Date.parse("2026-11-06T08:00:00.000Z");
  const bars = Array.from({ length: 168 }, (_, index) => ({
    t: new Date(start + index * 5 * 60 * 1000).toISOString(),
    eur: 20 + index,
    open: 20 + index,
    high: 21 + index,
    low: 19 + index,
    session: index > 140 ? "pre" : "regular"
  }));
  const ticker = { history: { "5m": bars, intraday: [] } };
  const five = candlesFor(ticker, "5 Min");
  const span = Date.parse(five.candles.at(-1).t) - Date.parse(five.candles[0].t);
  assert.ok(span <= 6 * 60 * 60 * 1000 + 5 * 60 * 1000);
  assert.ok(five.candles.length <= VISIBLE_BARS);
  assert.equal(five.candles.at(-1).t, bars.at(-1).t);
  assert.ok(five.history.length > five.candles.length);
  assert.equal(candleColor({ open: 10, close: 12, session: "pre" }), "#3ddea0");
  assert.equal(candleColor({ open: 12, close: 9, session: "post" }), "#ff5d6c");
  assert.equal(candleColor({ open: 10, close: 12, session: "pre" }).includes("e4b15a"), false);
});

function flat(index, close) {
  return {
    t: new Date(Date.parse("2026-01-05T14:30:00Z") + index * 5 * 60 * 1000).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    eur: close
  };
}

function wick(index, low, high, close) {
  return { ...flat(index, close), low, high, open: close };
}

test("Berührungen einer Linie: Nachbarn sind ein Fall, Abpraller und Bruch brauchen denselben Abstand", () => {
  assert.equal(BOUNCE_LOOK, 6);
  assert.equal(BOUNCE_FEW, 5);
  const level = 100;
  let cursor = 0;
  const series = [];
  const push = (candle) => {
    series.push({ ...candle, t: flat(cursor, candle.close).t });
    cursor += 1;
  };
  for (let index = 0; index < 40; index += 1) push(flat(0, 103));
  push(wick(0, 100, 100.2, 100.1));
  push(wick(0, 99.95, 100.15, 100.05));
  push(wick(0, 100, 100.12, 100.08));
  push(flat(0, 101.2));
  push(flat(0, 103));
  push(wick(0, 100, 100.2, 100.1));
  push(flat(0, 99));
  push(flat(0, 103));
  push(flat(0, 99));
  push(wick(0, 99.9, 100.2, 100.1));
  push(flat(0, 101.2));
  push(flat(0, 103));
  push(wick(0, 100, 100.2, 100.1));
  for (let index = 0; index < BOUNCE_LOOK; index += 1) push(flat(0, 100.45));
  push(flat(0, 99));
  push(flat(0, 103));
  push(wick(0, 99.5, 101.2, 101.2));

  const stats = countLevelBounces(series, level, "low");
  assert.ok(Math.abs(stats.tolerance - level * 0.003) < 1e-6, `Toleranz ${stats.tolerance}`);
  assert.ok(Math.abs(stats.amount - stats.tolerance * 2) < 1e-9);
  assert.equal(stats.bounce, 2);
  assert.equal(stats.broke, 1);
  assert.equal(stats.open, 1);
  assert.equal(stats.n, 3);
  assert.deepEqual(stats.touches, [
    { index: 40, outcome: "bounce" },
    { index: 45, outcome: "broke" },
    { index: 52, outcome: "open" },
    { index: 61, outcome: "bounce" }
  ]);
  assert.equal(stats.touches.filter((touch) => touch.outcome === "bounce").length, stats.bounce);
  assert.equal(stats.touches.filter((touch) => touch.outcome === "broke").length, stats.broke);
  assert.equal(stats.touches.filter((touch) => touch.outcome === "open").length, stats.open);
  assert.equal(levelMarkLabel("resistance", { bounce: 3, n: 3 }), "Widerstand 3/3");
  assert.equal(levelMarkLabel("support", { bounce: 1, broke: 1, n: 2 }), "Unterstützung 1/2");
  assert.equal(levelMarkLabel("support", { bounce: 0, n: 0 }), "Unterstützung");
  assert.equal(levelMarkLabel("trend", { bounce: 4, n: 4 }), "");
  const marks = JSON.parse(fs.readFileSync("scripts/fixtures/level-marks.json", "utf8"));
  assert.equal(levelMarkLabel("resistance", marks.resistance), `Widerstand ${formatEUR(marks.resistance.eur)} · ${marks.resistance.bounce}/${marks.resistance.n}`);
  assert.equal(levelMarkLabel("support", marks.support), `Unterstützung ${formatEUR(marks.support.eur)} · ${marks.support.bounce}/${marks.support.n}`);
  assert.equal(levelMarkLabel("resistance", marks.numbered[0]), `Widerstand 1 ${formatEUR(marks.numbered[0].eur)} · ${marks.numbered[0].bounce}/${marks.numbered[0].n}`);
  assert.equal(levelMarkLabel("resistance", marks.numbered[1]), `Widerstand 2 ${formatEUR(marks.numbered[1].eur)} · ${marks.numbered[1].bounce}/${marks.numbered[1].n}`);

  const onTime = [flat(0, 103), wick(1, 100, 100.2, 100.1)];
  for (let index = 0; index < BOUNCE_LOOK - 1; index += 1) onTime.push(flat(index + 2, 100.45));
  onTime.push(flat(BOUNCE_LOOK + 1, 99));
  const brokeLate = countLevelBounces(onTime, level, "low");
  assert.equal(brokeLate.broke, 1);
  assert.equal(brokeLate.n, 1);

  const quiet = Array.from({ length: 12 }, (_, index) => flat(index, 50));
  const tight = countLevelBounces(quiet, 50, "low");
  assert.ok(Math.abs(tight.tolerance - 50 * 0.003) < 1e-9);
  const wild = Array.from({ length: 30 }, (_, index) => wick(index, 10, 200, index % 2 ? 180 : 20));
  const wide = countLevelBounces(wild, 100, "support");
  assert.ok(Math.abs(wide.tolerance - 100 * 0.008) < 1e-9);

  const many = { bounce: 7, broke: 3, open: 1, n: 10, look: BOUNCE_LOOK };
  const supportCopy = describeLevelBounces(many, "low", "5 Min");
  assert.equal(supportCopy.sentence, "Abgeprallt in 7 von 10 Fällen · durchgebrochen nach unten 3 (n = 10).");
  assert.equal(supportCopy.sentence.includes("Wenige Fälle"), false);
  assert.match(supportCopy.detail, /0,3 %/);
  assert.match(supportCopy.detail, /nacheinander/);
  assert.match(supportCopy.detail, /6 Kerzen/);
  assert.match(supportCopy.detail, /5-Minuten-Reihe/);
  assert.match(supportCopy.detail, /deutlich über der Linie/);
  assert.match(supportCopy.detail, /gleich weit/);
  const resistCopy = describeLevelBounces({ bounce: 4, broke: 5, n: 9, look: 6 }, "high", "1M");
  assert.equal(resistCopy.sentence, "Abgeprallt nach unten in 4 von 9 Fällen · durchgebrochen nach oben 5 (n = 9).");
  assert.match(resistCopy.detail, /deutlich unter der Linie/);
  assert.match(resistCopy.detail, /Monatsreihe/);
  const few = describeLevelBounces({ bounce: 2, broke: 1, n: 3, look: 6 }, "low", "15 Min");
  assert.match(few.sentence, /Abgeprallt in 2 von 3 Fällen · durchgebrochen nach unten 1 \(n = 3\)\./);
  assert.match(few.sentence, /Wenige Fälle/);
  const one = describeLevelBounces({ bounce: 1, broke: 0, n: 1, look: 6 }, "high", "5 Min");
  assert.equal(one.sentence, "Abgeprallt nach unten in 1 von 1 Fall · durchgebrochen nach oben 0 (n = 1). Wenige Fälle.");
  const none = describeLevelBounces({ bounce: 0, broke: 0, n: 0, look: 6 }, "high", "4 Std");
  assert.match(none.sentence, /n = 0/);
  assert.match(none.sentence, /Wenige Fälle/);
  const text = `${supportCopy.sentence} ${supportCopy.detail} ${resistCopy.sentence} ${resistCopy.detail} ${few.sentence} ${one.sentence}`;
  assert.equal(ADVICE.test(text), false);
  assert.equal(/\b(kaufen|verkaufen|empfehl\w*)\b/i.test(text), false);
  assert.equal(text.includes("Keine Anlageberatung"), false);
});

test("Die Musterkarte zeigt die Abpraller direkt an der Stütze", () => {
  const analysis = {
    title: "Steigende Linie",
    patternId: "steigend",
    outcome: { show: false, n: 2, sentence: "Nach diesem Muster zu wenig gleiche Stellen (n = 2). Keine Prozentzahl.", detail: "" },
    levels: [{
      kind: "support",
      title: "Nächste Stütze",
      eur: 125.62,
      kicker: "Wenn der Kurs 125,62 € erreicht",
      sentence: "Zu wenig ähnliche Berührungen (n = 2). Keine Prozentzahl.",
      bounceSentence: "Abgeprallt in 2 von 2 Fällen · durchgebrochen nach unten 0 (n = 2). Wenige Fälle.",
      bounceDetail: "Berührung: der Kurs kommt der Linie bis auf etwa 0,3 % nahe. 5-Minuten-Reihe."
    }, {
      kind: "resistance",
      title: "Nächster Widerstand",
      eur: 126.95,
      sentence: "Zu wenig ähnliche Berührungen (n = 1). Keine Prozentzahl.",
      bounceSentence: "Abgeprallt nach unten in 1 von 1 Fall · durchgebrochen nach oben 0 (n = 1). Wenige Fälle.",
      bounceDetail: "Berührung: der Kurs kommt der Linie bis auf etwa 0,3 % nahe. 5-Minuten-Reihe."
    }]
  };
  const html = musterCard(analysis);
  assert.match(html, /Nächste Stütze/);
  assert.match(html, /Nächster Widerstand/);
  assert.match(html, /swatch support/);
  assert.match(html, /swatch resist/);
  assert.equal(html.includes("Deckel"), false);
  assert.match(html, /Abgeprallt in 2 von 2 Fällen · durchgebrochen nach unten 0 \(n = 2\)\. Wenige Fälle\./);
  assert.match(html, /Abgeprallt nach unten in 1 von 1 Fall · durchgebrochen nach oben 0/);
  assert.match(html, /Abgeprallt: Kurs dreht an der Linie um\. Durchgebrochen: Kurs geht durch die Linie – an der Stütze nach unten, am Widerstand nach oben\./);
  assert.equal(html.includes(BOUNCE_PLAIN), true);
  assert.match(html, /bounce-note/);
  assert.equal(/\b(kaufen|verkaufen|empfehl\w*)\b/i.test(html), false);
  assert.equal(html.includes("Keine Anlageberatung"), false);
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const page = renderAnalyse({ prices }, { analyseSymbol: "SPCX", analyseRange: "5 Min" });
  assert.match(page, /<p class="scrub"><\/p>/);
  assert.equal(/\b(kaufen|verkaufen|empfehl\w*)\b/i.test(page), false);
  assert.equal(page.includes("Keine Anlageberatung"), false);
  const result = analyseChart(prices.tickers.find((item) => item.symbol === "SPCX"), "5 Min");
  for (const level of result.levels || []) {
    if (level.kind !== "support" && level.kind !== "resistance") continue;
    assert.match(level.bounceSentence, /n =/);
    assert.equal(level.bounce.n, level.bounce.bounce + level.bounce.broke);
    if (level.bounce.n < BOUNCE_FEW) assert.match(level.bounceSentence, /Wenige Fälle/);
    else assert.equal(level.bounceSentence.includes("Wenige Fälle"), false);
  }
  assert.equal(ADVICE.test(analyseText(result)), false);
  assert.equal(page.includes("Deckel"), false);
  assert.equal(page.includes("Keine Anlageberatung"), false);
  const hasLevel = (result.levels || []).some((level) => level.kind === "support" || level.kind === "resistance");
  if (hasLevel) {
    assert.match(page, /▲ abgeprallt/);
    assert.match(page, /× durchgebrochen \(Stütze nach unten, Widerstand nach oben\)/);
    assert.match(page, /an der Stütze nach unten, am Widerstand nach oben/);
    for (const level of result.levels) {
      if (!level.bounceSentence || !level.bounce?.n) continue;
      if (level.kind === "support") assert.match(level.bounceSentence, /durchgebrochen nach unten/);
      if (level.kind === "resistance") assert.match(level.bounceSentence, /durchgebrochen nach oben/);
    }
  }
});

test("Markierungen auf der Kerze sind genau die gezählten Berührungen", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const bare = guideLegend([{ kind: "trend" }, { kind: "support" }, { kind: "resistance" }]);
  assert.match(bare, /Unterstützung/);
  assert.match(bare, /Widerstand/);
  assert.equal(bare.includes("abgeprallt"), false);
  const marked = guideLegend([{ kind: "support", touches: [{ index: 2, outcome: "bounce" }] }]);
  assert.match(marked, /▲ abgeprallt/);
  assert.match(marked, new RegExp(`× ${BREAK_LEGEND.replace(/[()]/g, "\\$&")}`));
  for (const ticker of prices.tickers) {
    for (const range of ANALYSE_RANGES) {
      const result = analyseChart(ticker, range);
      const text = analyseText(result);
      assert.equal(text.includes("Deckel"), false, `${ticker.symbol} ${range}`);
      assert.equal(ADVICE.test(text), false, `${ticker.symbol} ${range}`);
      assert.equal(text.includes("Keine Anlageberatung"), false);
      const legend = guideLegend(result.lines);
      const hasMarks = (result.lines || []).some((line) => Array.isArray(line.touches));
      if (hasMarks) {
        assert.match(legend, /▲ abgeprallt/);
        assert.match(legend, /× durchgebrochen/);
      } else {
        assert.equal(legend.includes("abgeprallt"), false, `${ticker.symbol} ${range}`);
      }
      for (const level of result.levels || []) {
        if (level.kind !== "support" && level.kind !== "resistance") continue;
        assert.equal(String(level.title).includes("Deckel"), false);
        if (level.kind === "resistance") {
          if ((level.levelTotal || 1) > 1) assert.equal(level.title, `Widerstand ${level.levelIndex}`);
          else assert.equal(level.title, "Nächster Widerstand");
        }
        const line = (result.lines || []).find((item) => item.kind === level.kind && (item.eur ?? item.eur0) === level.eur)
          || (result.lines || []).find((item) => item.kind === level.kind);
        assert.ok(line, `${ticker.symbol} ${range} ${level.kind}`);
        const side = level.kind === "resistance" ? "high" : "low";
        const again = countLevelBounces(result.candles, level.eur, side);
        assert.deepEqual(line.touches, again.touches, `${ticker.symbol} ${range} ${level.kind}`);
        assert.equal(level.bounce.bounce, again.bounce);
        assert.equal(level.bounce.broke, again.broke);
        assert.equal(level.bounce.open, again.open);
        assert.equal(level.bounce.n, again.n);
        assert.equal(line.bounce, again.bounce);
        assert.equal(line.n, again.n);
        assert.equal(line.touches.filter((touch) => touch.outcome === "bounce").length, level.bounce.bounce);
        assert.equal(line.touches.filter((touch) => touch.outcome === "broke").length, level.bounce.broke);
        assert.equal(line.touches.filter((touch) => touch.outcome === "open").length, level.bounce.open);
        const name = level.kind === "resistance" ? "Widerstand" : "Unterstützung";
        const numbered = (line.levelTotal || 1) > 1 ? `${name} ${line.levelIndex}` : name;
        const caption = levelMarkLabel(level.kind, line);
        if (again.n > 0) assert.equal(caption, `${numbered} ${formatEUR(level.eur)} · ${again.bounce}/${again.n}`);
        else if (level.eur != null) assert.equal(caption, `${numbered} ${formatEUR(level.eur)}`);
        assert.equal(levelPriceTag(line.eur ?? line.eur0), formatEUR(level.eur));
        const sideName = levelSideName(level.kind, line);
        assert.equal(sideName.includes("€"), false);
        assert.equal(sideName.includes(formatEUR(level.eur)), false);
        if (again.n > 0) assert.match(sideName, new RegExp(`${numbered.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · ${again.bounce}/${again.n}`));
        for (const touch of line.touches) {
          assert.ok(touch.index >= 0 && touch.index < result.candles.length, `${ticker.symbol} ${range} ${touch.index}`);
          assert.ok(["bounce", "broke", "open"].includes(touch.outcome));
        }
      }
    }
  }
});

test("Nummern und Striche kommen aus der Fixture, nicht aus dem Tageskurs", () => {
  const marks = JSON.parse(fs.readFileSync("scripts/fixtures/level-marks.json", "utf8"));
  const paired = numberLevelMarks(marks.lines, marks.levels);
  const upper = paired.levels.find((level) => level.eur === 130.1);
  const lower = paired.levels.find((level) => level.eur === 126.95);
  const support = paired.levels.find((level) => level.kind === "support");
  assert.equal(lower.title, "Widerstand 1");
  assert.equal(upper.title, "Widerstand 2");
  assert.equal(support.title, "Nächste Stütze");
  const upperLine = paired.lines.find((line) => line.eur0 === 130.1);
  const lowerLine = paired.lines.find((line) => line.eur0 === 126.95);
  assert.equal(levelMarkLabel("resistance", upperLine), `Widerstand 2 ${formatEUR(130.1)}`);
  assert.equal(levelMarkLabel("resistance", lowerLine), `Widerstand 1 ${formatEUR(126.95)}`);
  assert.equal(upper.levelIndex, upperLine.levelIndex);
  assert.equal(lower.levelIndex, lowerLine.levelIndex);
  const css = fs.readFileSync("css/analyse.css", "utf8");
  assert.match(css, /#b4b6f2 0 4px, transparent 4px 7px/);
  assert.match(css, /#5dbebf 0 3px, transparent 3px 6px/);
  assert.match(css, /#e7a29a 0 3px, transparent 3px 6px/);
  assert.match(css, /\.guide-legend \.swatch\.trend/);
  assert.equal(css.includes("kaufen"), false);
  const sw = fs.readFileSync("sw.js", "utf8");
  assert.match(sw, /jgtr-v34/);
  assert.equal(sw.includes("jgtr-v33"), false);
});

test("Achse nennt die Uhrzeit und das Datum nur am Tageswechsel", () => {
  const friday = Array.from({ length: 16 }, (_, index) => ({
    t: new Date(Date.parse("2026-11-06T15:00:00.000Z") + index * 15 * 60 * 1000).toISOString(),
    eur: index
  }));
  const monday = Array.from({ length: 16 }, (_, index) => ({
    t: new Date(Date.parse("2026-11-09T14:30:00.000Z") + index * 15 * 60 * 1000).toISOString(),
    eur: 50 + index
  }));
  const wide = chartAxisLabels(friday.concat(monday));
  const texts = wide.map((label) => label.text);
  assert.equal(new Set(texts).size, texts.length);
  assert.ok(texts.some((text) => /^\d{2}:\d{2}$/.test(text)));
  assert.ok(texts.some((text) => text === "Fr 6.11." || text === "Mo 9.11."));
  const one = chartAxisLabels(monday);
  assert.equal(one[0].text, "Mo 9.11.");
  assert.ok(one.slice(1).every((label) => /^\d{2}:\d{2}$/.test(label.text)));
  assert.equal(one.some((label) => label.text === "Mo 9.11." && one.filter((item) => item.text === "Mo 9.11.").length > 1), false);
  const daily = Array.from({ length: 12 }, (_, index) => ({ t: `2026-10-${String(index + 1).padStart(2, "0")}`, eur: index }));
  const days = chartAxisLabels(daily);
  assert.ok(days.every((label) => !/\d{2}:\d{2}/.test(label.text)));
  assert.equal(new Set(days.map((label) => label.text)).size, days.length);
  const kept = guideLabelsToDraw([
    { y: 10, text: "Unterstützung" },
    { y: 16, text: "Widerstand" },
    { y: 48, text: "Trend" }
  ], 12);
  assert.deepEqual(kept.map((label) => label.text), ["Unterstützung", "Widerstand", "Trend"]);
  assert.equal(kept[0].y, 10);
  assert.ok(Math.abs(kept[1].y - kept[0].y) >= 14);
  assert.equal(kept[2].y, 48);
  const nudged = guideLabelsToDraw([
    { y: 40, text: "Unterstützung" },
    { y: 46, text: "Widerstand" }
  ], 40, 14, { min: 8, max: 90, avoid: [40, 70], avoidGap: 12 });
  assert.ok(Math.abs(nudged[0].y - 40) >= 12);
  assert.ok(Math.abs(nudged[1].y - nudged[0].y) >= 14);
  assert.ok(nudged.every((label) => label.y >= 8 && label.y <= 90));
  assert.ok(nudged.every((label) => Math.abs(label.y - 70) >= 12));
});

function hourBar(day, hour, eur, session) {
  return {
    t: `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`,
    eur,
    open: eur - 0.3,
    high: eur + 0.5,
    low: eur - 0.5,
    session
  };
}

function hourSessions() {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
  const hours = [9, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const bars = [];
  days.forEach((day, dayIndex) => {
    hours.forEach((hour, hourIndex) => {
      const session = hour < 13 ? "pre" : hour >= 21 ? "post" : "regular";
      bars.push(hourBar(day, hour, 100 + dayIndex + hourIndex * 0.05, session));
    });
  });
  return bars;
}

test("1 Std zeigt Stundenkerzen über mehrere Handelstage, mit Vor- und Nachbörse", () => {
  const bars = hourSessions();
  const ticker = { symbol: "SPCX", name: "SpaceX", priceEur: 110, history: { "1H": bars, intraday: [], "5m": [], "1M": [], "4H": [] } };
  const packed = candlesFor(ticker, "1 Std");
  assert.equal(packed.range, "1 Std");
  assert.equal(packed.missing, false);
  assert.ok(packed.candles.length >= 40, `nur ${packed.candles.length}`);
  assert.ok(packed.candles.length <= HOURLY_BAR_CAP);
  const sessions = tradingSessionCount(packed.candles);
  assert.ok(sessions >= 5 && sessions <= 10, `Sitzungen ${sessions}`);
  assert.equal(packed.candles.some((candle) => candle.session === "pre"), true);
  assert.equal(packed.candles.some((candle) => candle.session === "post"), true);
  assert.equal(packed.history.length, bars.length);
  let hourGaps = 0;
  for (let index = 1; index < packed.candles.length; index += 1) {
    if (Date.parse(packed.candles[index].t) - Date.parse(packed.candles[index - 1].t) === 60 * 60 * 1000) hourGaps += 1;
  }
  assert.ok(hourGaps >= 20);
  const result = analyseChart(ticker, "1 Std");
  assert.equal(result.candles.length, packed.candles.length);
  assert.equal(result.missing, false);
  const text = analyseText(result);
  assert.equal(ADVICE.test(text), false);
  assert.equal(text.includes("Keine Anlageberatung"), false);
  const stats = countLevelBounces(result.candles, result.candles[0].low, "low");
  const copy = describeLevelBounces(stats, "low", "1 Std");
  assert.equal(typeof copy.sentence, "string");
  assert.match(copy.detail, /Stundenreihe/);
  assert.equal(ADVICE.test(`${copy.sentence} ${copy.detail}`), false);
  for (const level of result.levels || []) {
    if (level.kind !== "support" && level.kind !== "resistance") continue;
    assert.equal(levelPriceTag(level.eur), formatEUR(level.eur));
    assert.equal(typeof level.bounce?.n, "number");
  }
});

test("1W und 1M haben mehr lesbare Kerzen als die Tagesreihe", () => {
  const bars = hourSessions();
  const four = [];
  for (let day = 0; day < 24; day += 1) {
    for (const hour of [13, 17, 21]) {
      const eur = 80 + day * 0.4;
      four.push({
        t: new Date(Date.UTC(2026, 9, 8 + day, hour)).toISOString(),
        eur,
        open: eur - 0.4,
        high: eur + 0.6,
        low: eur - 0.6
      });
    }
  }
  const daily = Array.from({ length: 22 }, (_, index) => ({
    t: new Date(Date.UTC(2026, 9, 8 + index, 14)).toISOString(),
    eur: 70 + index,
    open: 70 + index,
    high: 71 + index,
    low: 69 + index
  }));
  const ticker = { history: { "1H": bars, "4H": four, "1M": daily, intraday: [], "5m": [] } };
  const week = candlesFor(ticker, "1W");
  assert.ok(week.candles.length > 7, `Woche ${week.candles.length}`);
  assert.ok(week.candles.length <= HOURLY_BAR_CAP);
  assert.equal(tradingSessionCount(week.candles), 5);
  const month = candlesFor(ticker, "1M");
  assert.ok(month.candles.length > daily.length, `Monat ${month.candles.length} gegen ${daily.length}`);
  assert.ok(month.candles.length <= HOURLY_BAR_CAP);
  assert.ok(month.history.length >= month.candles.length);
  for (const range of ["1W", "1M"]) {
    const text = analyseText(analyseChart(ticker, range));
    assert.equal(ADVICE.test(text), false, range);
    assert.equal(text.includes("Keine Anlageberatung"), false);
  }
});

test("Linienname links, Preisplakette rechts, Karte zeigt denselben Euro", () => {
  assert.equal(levelSideName("resistance", { bounce: 1, n: 1, levelTotal: 1, levelIndex: 1 }), "Widerstand · 1/1");
  assert.equal(levelSideName("support", { bounce: 0, n: 0, levelTotal: 1 }), "Unterstützung");
  assert.equal(levelSideName("resistance", { bounce: 3, n: 4, levelTotal: 2, levelIndex: 2 }), "Widerstand 2 · 3/4");
  assert.equal(levelSideName("trend", { bounce: 4, n: 4 }), "Trend");
  assert.equal(levelPriceTag(126.94), formatEUR(126.94));
  assert.equal(levelSideName("resistance", { bounce: 1, n: 1, eur: 126.94 }).includes("€"), false);
  assert.equal(pickNameY(100, [], { min: 0, max: 200 }), 89);
  assert.equal(pickNameY(100, [89], { min: 0, max: 200 }), 111);
  const settled = settlePriceTags([{ y: 100, text: "a" }, { y: 104, text: "b" }], { min: 0, max: 300 });
  assert.ok(Math.abs(settled[0].y - settled[1].y) >= 18);
  const kept = visibleGridLabels([{ y: 10 }, { y: 100 }, { y: 180 }], settled, 14);
  assert.equal(kept.some((label) => Math.abs(label.y - settled[0].y) < 14), false);
  assert.equal(kept.some((label) => label.y === 10), true);
  const layout = { padL: 8, plotW: 300, count: 40 };
  assert.ok(nameAnchorX(layout, 0) < 40);
  assert.ok(nameAnchorX(layout, 39) <= 8 + 300 * 0.4);
  const analysis = {
    title: "Zwischen Stütze und Widerstand",
    levels: [{ kind: "resistance", title: "Nächster Widerstand", eur: 126.94, sentence: "Zu wenig ähnliche Berührungen (n = 1). Keine Prozentzahl." }]
  };
  const html = musterCard(analysis);
  assert.match(html, new RegExp(formatEUR(126.94).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(levelPriceTag(126.94), formatEUR(126.94));
  assert.equal(html.includes("Keine Anlageberatung"), false);
});

test("Charts-Seite ist die Kurslinie mit 1T bis Max", () => {
  const intraday = Array.from({ length: 20 }, (_, index) => ({
    t: new Date(Date.parse("2026-11-09T14:30:00.000Z") + index * 60 * 1000).toISOString(),
    eur: 120 + index * 0.1
  }));
  const year = Array.from({ length: 8 }, (_, index) => ({ t: `2026-0${index + 1}-02`, eur: 90 + index }));
  const data = {
    prices: {
      tickers: [{
        symbol: "SPCX",
        name: "SpaceX",
        priceEur: 125.9,
        eurMethod: "usd_div_eurusd",
        history: { intraday, "1H": hourSessions(), "1M": year, "1Y": year, "6M": year, "4H": [], "5m": intraday }
      }]
    }
  };
  const html = renderChartsPage(data, { chartSymbol: "SPCX", chartRange: "1W", langfrist: false, live: false });
  assert.match(html, /SpaceX/);
  assert.match(html, /125,90/);
  assert.match(html, /▲|▼/);
  const ranges = [...html.matchAll(/data-range="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ranges, ["1T", "1W", "1M", "1J", "Max"]);
  assert.match(html, /data-range="1W"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-range="1W"/);
  assert.match(html, /<p class="scrub"><\/p>/);
  assert.match(html, /instrument-logo/);
  assert.equal(html.includes("Handeln"), false);
  assert.equal(html.includes("Sparplan"), false);
  assert.equal(html.includes("5 Min"), false);
  assert.equal(html.includes("data-range=\"1 Std\""), false);
  assert.equal(ADVICE.test(html), false);
  assert.equal(/\bEmpfehlung\b/.test(html), false);
  assert.equal(html.includes("Keine Anlageberatung"), false);
  const week = instrumentSeries(data.prices.tickers[0], "1W");
  assert.ok(week.points.length > 7);
  const day = instrumentAxisLabels(intraday);
  assert.ok(day.every((label) => /^\d{2}:\d{2}$/.test(label.text)));
  const labels = instrumentAxisLabels(week.points);
  assert.ok(labels.length >= 2);
  assert.ok(labels.every((label) => !/^\d{2}:\d{2}$/.test(label.text)));
  for (let index = 1; index < labels.length; index += 1) {
    assert.ok(labels[index].index - labels[index - 1].index >= 2);
  }
});
