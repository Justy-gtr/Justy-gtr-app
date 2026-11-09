import assert from "node:assert/strict";
import test from "node:test";
import { sessionPhrase } from "../js/logic.js";
import {
  eventMoves,
  isTradingDay,
  nearCopy,
  pickNearTerm,
  tradingWindow,
  windowNote
} from "./near-term.mjs";

const ADVICE = /\b(kaufen|verkaufen)\b|empfehlung|wird steigen|anlageberatung/i;

test("Handelstage überspringen Wochenende und Thanksgiving", () => {
  assert.equal(isTradingDay("2026-11-09"), true);
  assert.equal(isTradingDay("2026-11-14"), false);
  assert.equal(isTradingDay("2026-11-26"), false);
  assert.deepEqual(tradingWindow("2026-11-09", 3), [
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"
  ]);
  assert.deepEqual(tradingWindow("2026-11-09", 5).at(-1), "2026-11-16");
  assert.deepEqual(tradingWindow("2026-11-26", 3), ["2026-11-27", "2026-11-30", "2026-12-01"]);
});

test("Vorbörse zählt denselben Tag, Nachbörse den nächsten", () => {
  const bars = [
    { date: "2026-01-05", close: 100 },
    { date: "2026-01-06", close: 110 },
    { date: "2026-01-07", close: 90 }
  ];
  const before = eventMoves(bars, [{ date: "2026-01-06", session: "bmo" }]);
  assert.equal(before.moves[0].base, "2026-01-05");
  assert.equal(before.moves[0].reaction, "2026-01-06");
  assert.equal(before.moves[0].pct, 10);
  const after = eventMoves(bars, [{ date: "2026-01-06", session: "amc" }]);
  assert.equal(after.moves[0].reaction, "2026-01-07");
  assert.equal(after.moves[0].pct, -18.18);
});

test("Berliner Uhr hängt an der New-York-Zeit, auch in der Sommerzeit-Lücke", () => {
  assert.equal(sessionPhrase("2026-11-10", "amc").clock, "nach 22:00 Uhr Berlin");
  assert.equal(sessionPhrase("2026-11-10", "bmo").clock, "vor 15:30 Uhr Berlin");
  assert.equal(sessionPhrase("2026-03-20", "amc").clock, "nach 21:00 Uhr Berlin");
  assert.equal(sessionPhrase("2026-11-10", "na"), null);
});

test("Zu wenig Termine in drei Tagen öffnet das Fenster auf fünf", () => {
  const symbols = [
    { symbol: "AAA", name: "Alpha" },
    { symbol: "BBB", name: "Beta" }
  ];
  const rowsByDate = {
    "2026-11-16": [
      { symbol: "AAA", time: "time-after-hours" },
      { symbol: "BBB", time: "time-pre-market" }
    ]
  };
  const picked = pickNearTerm({
    today: "2026-11-09",
    berlinToday: "2026-11-09",
    rowsByDate,
    symbols,
    pastBySymbol: {},
    barsBySymbol: {}
  });
  assert.equal(picked.expanded, true);
  assert.equal(picked.window, 5);
  assert.match(picked.note, /zu wenig/);
  assert.match(picked.note, /5 Handelstage/);
  assert.equal(picked.candidates.length, 2);
  assert.equal(ADVICE.test(JSON.stringify(picked.candidates)), false);
});

test("Nähe und große Folgetage bestimmen die drei, Prozent erst ab sieben", () => {
  const bars = [];
  let price = 100;
  for (let day = 1; day <= 40; day += 1) {
    const date = `2026-01-${String(day).padStart(2, "0")}`;
    bars.push({ date, close: price });
    price = day % 2 ? price * 1.06 : price * 0.94;
  }
  const dates = bars.map((bar) => bar.date).slice(0, 16);
  const symbols = [
    { symbol: "SOON", name: "Soon" },
    { symbol: "LOUD", name: "Loud" },
    { symbol: "LATE", name: "Late" }
  ];
  const rowsByDate = {
    "2026-11-09": [{ symbol: "SOON", time: "time-after-hours" }],
    "2026-11-10": [{ symbol: "LOUD", time: "time-after-hours" }],
    "2026-11-12": [{ symbol: "LATE", time: "time-pre-market" }]
  };
  const picked = pickNearTerm({
    today: "2026-11-09",
    berlinToday: "2026-11-09",
    rowsByDate,
    symbols,
    pastBySymbol: { SOON: dates.slice(0, 2), LOUD: dates, LATE: dates },
    barsBySymbol: { SOON: bars, LOUD: bars, LATE: bars }
  });
  assert.equal(picked.expanded, false);
  assert.match(windowNote(picked), /3 Handelstage/);
  assert.equal(picked.candidates[0].symbol, "LOUD");
  assert.equal(picked.candidates[0].history.catalyst.showPct, true);
  const quiet = nearCopy({ daysAway: 0, includesToday: true, session: "amc", history: { n: 4, up: 3, down: 1, showPct: false } });
  assert.equal(/%/.test(quiet.for.join(" ")), false);
  assert.match(quiet.for.join(" "), /n = 4/);
  assert.equal(ADVICE.test(JSON.stringify(picked.candidates)), false);
});
