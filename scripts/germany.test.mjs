import assert from "node:assert/strict";
import test from "node:test";
import {
  GERMANY_INTRO,
  MORNING_SESSIONS,
  germanyCopyOk,
  morningLabel,
  morningSwing,
  sortByMorning
} from "../js/germany.js";
import { renderDeutschland } from "../js/germany-view.js";

function bar(iso, open, high, low, close = high) {
  return { t: iso, open, high, low, close };
}

test("Morgen-Schwankung nimmt nur 9:00 bis 10:30 Berlin und mittelt die Tage", () => {
  const points = [
    bar("2026-11-10T07:45:00.000Z", 90, 91, 89, 90),
    bar("2026-11-10T08:00:00.000Z", 100, 102, 99, 101),
    bar("2026-11-10T08:15:00.000Z", 101, 104, 100, 103),
    bar("2026-11-10T09:15:00.000Z", 108, 110, 107, 109),
    bar("2026-11-10T09:30:00.000Z", 110, 112, 109, 111),
    bar("2026-11-11T08:00:00.000Z", 50, 55, 48, 54),
    bar("2026-11-11T08:15:00.000Z", 54, 56, 53, 55),
    bar("2026-11-14T08:00:00.000Z", 10, 80, 1, 40),
    bar("2026-07-15T07:00:00.000Z", 200, 210, 190, 205),
    bar("2026-07-15T05:45:00.000Z", 200, 400, 10, 200)
  ];
  const stat = morningSwing(points, new Date("2026-11-12T12:00:00.000Z"));
  assert.equal(stat.n, 3);
  assert.equal(stat.avgPct, 12.3);
  assert.equal(stat.maxPct, 16);
  assert.equal(stat.maxDay, "2026-11-11");
  assert.equal(morningLabel(stat), "Morgens Ø 12,3 % · max 16,0 %");
});

test("Der laufende Morgen zählt noch nicht, höchstens 21 Tage", () => {
  const points = [];
  let cursor = new Date(Date.UTC(2026, 0, 5, 8, 0));
  for (let index = 0; index < 25; index += 1) {
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor = new Date(cursor.getTime() + 86400000);
    const open = 100;
    const span = index === 0 ? 50 : 2;
    points.push(bar(cursor.toISOString(), open, open + span, open - 1, open));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  const now = new Date("2026-03-01T12:00:00.000Z");
  const stat = morningSwing(points, now);
  assert.equal(stat.n, MORNING_SESSIONS);
  assert.equal(stat.n, 21);
  assert.notEqual(stat.maxPct, 51);
  assert.ok(stat.avgPct < 5);
  const partial = morningSwing([
    bar("2026-11-10T08:00:00.000Z", 100, 101, 99, 100),
    bar("2026-11-10T08:15:00.000Z", 100, 130, 90, 120)
  ], new Date("2026-11-10T08:20:00.000Z"));
  assert.equal(partial.n, 0);
  assert.equal(morningLabel(partial), "Morgens noch offen");
});

test("Die Liste sortiert nach der mittleren Morgen-Schwankung", () => {
  const sorted = sortByMorning([
    { symbol: "A", name: "A", morning: { avgPct: 1.2 } },
    { symbol: "B", name: "B", morning: { avgPct: 4 } },
    { symbol: "C", name: "C", morning: { avgPct: null } },
    { symbol: "D", name: "D", morning: { avgPct: 4 } }
  ]);
  assert.deepEqual(sorted.map((item) => item.symbol), ["B", "D", "A", "C"]);
});

test("Die Deutschland-Seite bleibt beschreibend", () => {
  assert.equal(germanyCopyOk(GERMANY_INTRO), true);
  assert.equal(GERMANY_INTRO, "Aktien mit großem Auf und Ab zwischen 9:00 und 10:30 Uhr, bei Trade Republic mit Hebel handelbar.");
  const html = renderDeutschland({
    germany: {
      symbols: [
        {
          symbol: "S92.DE",
          name: "SMA Solar",
          priceEur: 49.4,
          changePct: 1.15,
          sparkline: [48, 49, 49.4],
          intraday: [
            { t: "2026-11-10T08:00:00.000Z", eur: 48 },
            { t: "2026-11-10T15:00:00.000Z", eur: 49.4 }
          ],
          morning: { avgPct: 3.5, maxPct: 7.6, maxDay: "2026-11-03", n: 21 },
          trKnockouts: { long: true, short: true },
          longExample: { isin: "DE000HM4FG81", issuer: "HSBC", url: "https://example.com/long" },
          shortExample: { isin: "DE000FG9MP33", issuer: "Société Générale", url: "https://example.com/short" }
        }
      ]
    }
  }, { deSymbol: "S92.DE" });
  assert.match(html, /SMA Solar/);
  assert.match(html, /Morgens Ø 3,5 % · max 7,6 %/);
  assert.match(html, /TR Knock-out Long\/Short/);
  assert.match(html, /DE000HM4FG81/);
  assert.match(html, /data-chart="de"/);
  assert.match(html, /Kopieren/);
  assert.equal(germanyCopyOk(html), true);
  assert.equal(html.includes("Anlageberatung"), false);
});
