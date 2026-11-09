import assert from "node:assert/strict";
import test from "node:test";
import { candlesFor, scrubLabel } from "../js/candles.js";
import { formatScrubWhen, scrubDelta, seriesFor, seriesIsSubDaily } from "../js/logic.js";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kauf|verkauf)\b/i;

test("Ziehen: Prozent gegen den ersten sichtbaren Punkt, deutsch mit Vorzeichen", () => {
  assert.deepEqual(scrubDelta(100, 101.23), { text: "+1,23 %", direction: "up" });
  assert.deepEqual(scrubDelta(100, 99.55), { text: "−0,45 %", direction: "down" });
  assert.equal(scrubDelta(100, 99.55).text.includes("−"), true);
  assert.equal(scrubDelta(100, 99.55).text.includes("-"), false);
  assert.deepEqual(scrubDelta(120.8, 120.8), { text: "0,00 %", direction: "flat" });
  assert.deepEqual(scrubDelta(100, 100.004), { text: "0,00 %", direction: "flat" });
  assert.deepEqual(scrubDelta(100, 100.02), { text: "+0,02 %", direction: "up" });
  assert.deepEqual(scrubDelta(100, 99.98), { text: "−0,02 %", direction: "down" });
  assert.equal(scrubDelta(0, 10), null);
  assert.equal(scrubDelta(null, 10), null);
  for (const sample of [scrubDelta(80, 95), scrubDelta(80, 70), scrubDelta(80, 80)]) {
    assert.equal(ADVICE.test(sample.text), false);
  }
});

function pointsAt(startIso, stepMin, count, eur = 100) {
  const start = Date.parse(startIso);
  return Array.from({ length: count }, (_, index) => ({
    t: new Date(start + index * stepMin * 60 * 1000).toISOString(),
    eur: eur + index,
    open: eur + index,
    high: eur + index + 1,
    low: eur + index - 1,
    close: eur + index
  }));
}

test("Ziehzeit: Intraday zeigt Berliner Uhrzeit samt Sommerzeit, der Tag nicht", () => {
  const winter = pointsAt("2026-01-15T14:30:00.000Z", 15, 8);
  const summer = pointsAt("2026-07-15T13:30:00.000Z", 15, 8);
  const spring = pointsAt("2026-03-29T01:15:00.000Z", 15, 4);
  assert.equal(seriesIsSubDaily(winter), true);
  assert.equal(seriesIsSubDaily(summer), true);
  assert.equal(formatScrubWhen(winter[1].t, winter), "Do 15.01. · 15:45");
  assert.equal(formatScrubWhen(summer[1].t, summer), "Mi 15.07. · 15:45");
  assert.equal(formatScrubWhen(spring[1].t, spring), "So 29.03. · 03:30");
  assert.equal(formatScrubWhen(winter[1].t, winter).includes("14:45"), false);
  assert.equal(formatScrubWhen(summer[1].t, summer).includes("13:45"), false);

  const friday = pointsAt("2026-11-06T14:30:00.000Z", 15, 20);
  const monday = pointsAt("2026-11-09T14:30:00.000Z", 15, 20);
  const wide = friday.concat(monday);
  assert.ok(Date.parse(wide.at(-1).t) - Date.parse(wide[0].t) > 36 * 60 * 60 * 1000);
  assert.equal(formatScrubWhen(monday[1].t, wide), "Mo 09.11. · 15:45");

  const daily = [
    { t: "2026-11-09T07:00:00.000Z", eur: 10 },
    { t: "2026-11-10T07:00:00.000Z", eur: 11 },
    { t: "2026-11-12T07:00:00.000Z", eur: 12 }
  ];
  assert.equal(seriesIsSubDaily(daily), false);
  const dateOnly = formatScrubWhen(daily[0].t, daily);
  assert.equal(dateOnly, "9. Nov. 2026");
  assert.equal(/\d{2}:\d{2}/.test(dateOnly), false);

  const bars = monday.map((point) => ({ ...point, close: point.eur }));
  const label = scrubLabel(bars[0], bars[0].close, bars);
  assert.match(label, /Mo 09\.11\. · 15:30–15:45/);
  assert.match(label, /0,00 %/);
  const moved = scrubLabel(bars[1], bars[0].close, bars);
  assert.match(moved, /Mo 09\.11\. · 15:45–16:00/);
  assert.match(moved, /\+/);
  assert.equal(ADVICE.test(label), false);
  assert.equal(ADVICE.test(moved), false);
});

test("1T nimmt die letzte Sitzung aus 5m und dem Minutenkurs", () => {
  const older = pointsAt("2026-11-06T14:30:00.000Z", 5, 12, 50);
  const live = pointsAt("2026-11-09T14:30:00.000Z", 1, 16, 200);
  const ticker = {
    history: {
      "1M": [
        { t: "2026-11-06T07:00:00.000Z", eur: 1 },
        { t: "2026-11-09T07:00:00.000Z", eur: 2 }
      ],
      "5m": [
        ...older,
        { t: "2026-11-09T14:30:00.000Z", eur: 9, open: 9, high: 9, low: 9 }
      ],
      intraday: live
    }
  };
  const { points } = seriesFor(ticker, "1T");
  assert.ok(points.length >= 2);
  assert.equal(points.some((point) => point.eur === 1 || point.eur === 2 || point.eur === 9), false);
  assert.equal(points.at(-1).eur, 215);
  assert.equal(points.every((point) => point.t.startsWith("2026-11-09")), true);
  assert.equal(formatScrubWhen(points[0].t, points), "Mo 09.11. · 15:34");

  const candles = candlesFor(ticker, "1T");
  assert.ok(candles.candles.length >= 2);
  assert.equal(candles.candles.at(-1).close, 215);
  assert.match(scrubLabel(candles.candles[0], candles.candles[0].close, candles.candles), /Mo 09\.11\. · 15:30–15:35/);

  const three = seriesFor(ticker, "3T");
  assert.ok(three.points.length > points.length);
  assert.equal(three.points.some((point) => point.eur === 50), true);
  assert.equal(seriesIsSubDaily(three.points), true);

  const dailyOnly = {
    history: {
      "1M": [
        { t: "2026-11-04", eur: 4 },
        { t: "2026-11-05", eur: 5 },
        { t: "2026-11-06", eur: 6 }
      ],
      intraday: [{ t: "2026-11-09T14:30:00.000Z", eur: 9 }]
    }
  };
  assert.equal(seriesFor(dailyOnly, "3T").points.length, 3);
  assert.equal(seriesFor(dailyOnly, "3T").points.at(-1).eur, 6);
  assert.equal(seriesFor(dailyOnly, "1T").points.length, 1);
  assert.equal(seriesFor(dailyOnly, "1T").points[0].eur, 6);
  assert.equal(/\d{2}:\d{2}/.test(formatScrubWhen(dailyOnly.history["1M"][2].t, seriesFor(dailyOnly, "3T").points)), false);
});
