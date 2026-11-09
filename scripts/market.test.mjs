import assert from "node:assert/strict";
import test from "node:test";
import { berlinParts, shouldRun } from "./schedule.mjs";
import {
  extendedQuote,
  fxFor,
  mergeTicker,
  meaningful,
  resolveOvernight,
  sessionEnded,
  chooseIntraday,
  keepRecentSession,
  keepTradingDays,
  previousSessionClose,
  sessionBaseline,
  staleSessionAlert,
  stitchIntraday,
  trustedChange,
  updateAlerts,
  usClockSession,
  usSessionActive,
  usdToEur
} from "./market.mjs";
import { bigDrop, bucketMinutes, buildFeed, buildMarketTimeline, compactStances, formatEventClock, formatFeedTime, headlineEvent, isInAppUrl, karlVoiceIssues, marketWatch, maxPoints, opinionWord, scoreboard, seriesFor, sparkSample, trackSummary, verdictForStances, vsSwarmVerdict, zonedWallTime } from "../js/logic.js";
import fs from "node:fs";

test("Dollar wird durch EURUSD geteilt, nicht multipliziert", () => {
  assert.equal(usdToEur(112.32, 1.1232), 100);
  assert.equal(usdToEur(null, 1.1), null);
});

test("Wechselkurs nimmt den letzten Tag bis zum Kursdatum", () => {
  const series = [
    { t: "2026-11-02T00:00:00.000Z", close: 1.1 },
    { t: "2026-11-04T00:00:00.000Z", close: 1.2 }
  ];
  assert.equal(fxFor(series, "2026-11-03T20:00:00.000Z", 9), 1.1);
  assert.equal(fxFor(series, "2026-11-04T20:00:00.000Z", 9), 1.2);
  assert.equal(fxFor([], "2026-11-04", 1.5), 1.5);
});

test("Recherchetexte überleben ein Kurs-Update, Beispielpreise nicht", () => {
  const prev = {
    symbol: "SPCX",
    example: true,
    why: "Beispieltext",
    whySources: [{ title: "A", url: "https://example.com/a" }],
    recordHighEur: 999,
    priceEur: 1
  };
  const fresh = {
    symbol: "SPCX",
    priceEur: 120,
    recordHighEur: 120,
    why: "frisch",
    changePct: 1
  };
  const merged = mergeTicker(prev, fresh);
  assert.equal(merged.why, "Beispieltext");
  assert.equal(merged.example, false);
  assert.equal(merged.narrativeExample, true);
  assert.equal(merged.recordHighEur, 120);
  assert.equal(merged.priceEur, 120);
});

test("Ein gesetztes narrativeExample false bleibt false", () => {
  const merged = mergeTicker(
    { example: false, narrativeExample: false, why: "echt", recordHighEur: 10 },
    { priceEur: 12, recordHighEur: 12, why: "workflow" }
  );
  assert.equal(merged.narrativeExample, false);
  assert.equal(merged.why, "echt");
  assert.equal(merged.recordHighEur, 12);
});

test("Vortag ist der Schluss vor der letzten Sitzung, nicht der 5-Tage-Anfang", () => {
  const monday = {
    price: 320.9,
    chartPreviousClose: 367,
    points: [
      { t: "2026-11-03T08:00:00.000Z", close: 355.85 },
      { t: "2026-11-04T08:00:00.000Z", close: 342.15 },
      { t: "2026-11-05T08:00:00.000Z", close: 312.2 },
      { t: "2026-11-06T08:00:00.000Z", close: 323.7 },
      { t: "2026-11-09T08:00:00.000Z", close: 320.9 }
    ]
  };
  assert.equal(previousSessionClose(monday), 323.7);
  assert.notEqual(previousSessionClose(monday), monday.chartPreviousClose);
  const mondayPct = ((monday.price - 323.7) / 323.7) * 100;
  assert.ok(mondayPct < -0.5 && mondayPct > -1.5);

  const beforeOpen = {
    price: 134.27,
    chartPreviousClose: 134.72,
    points: [
      { t: "2026-11-02T14:30:00.000Z", close: 136.37 },
      { t: "2026-11-03T14:30:00.000Z", close: 141.31 },
      { t: "2026-11-04T14:30:00.000Z", close: 135.92 },
      { t: "2026-11-05T14:30:00.000Z", close: 123.62 },
      { t: "2026-11-06T14:30:00.000Z", close: 134.27 }
    ]
  };
  assert.equal(previousSessionClose(beforeOpen), 123.62);
  const fridayPct = ((beforeOpen.price - 123.62) / 123.62) * 100;
  assert.ok(fridayPct > 8 && fridayPct < 9);
  const rate = 1.119;
  const priceEur = usdToEur(beforeOpen.price, rate);
  const prevEur = usdToEur(previousSessionClose(beforeOpen), rate);
  assert.ok(Math.abs(((priceEur - prevEur) / prevEur) * 100 - fridayPct) < 1e-9);

  assert.equal(previousSessionClose({
    chartPreviousClose: 323.7,
    metaPrevious: 367,
    points: [{ t: "2026-11-09T08:00:00.000Z", close: 320.9 }]
  }), 323.7);
});

test("Ein Tagesalarm unter zwei Prozent wird zurückgenommen", () => {
  const prior = updateAlerts({ alerts: [] }, [
    { symbol: "TSLA", name: "Tesla", example: false, changePct: -12.6, priceEur: 320.7, sources: [] }
  ], "2026-11-09T08:00:00.000Z", "2026-11-09");
  const older = {
    ...prior.alerts[0],
    id: "TSLA-2026-11-06",
    timestamp: "2026-11-06T21:00:00.000Z",
    changePct: -9.8
  };
  const next = updateAlerts({ alerts: [...prior.alerts, older] }, [
    { symbol: "TSLA", name: "Tesla", example: false, changePct: -0.87, priceEur: 320.9, sources: [] }
  ], "2026-11-09T11:00:00.000Z", "2026-11-09");
  assert.equal(next.alerts.some((alert) => alert.id === "TSLA-2026-11-09"), false);
  assert.equal(next.alerts.some((alert) => alert.id === "TSLA-2026-11-06"), true);
});

test("Ein einzelner 5-Tage-Balken ist kein Vortag", () => {
  assert.equal(sessionBaseline({
    chartPreviousClose: 358.85,
    metaPrevious: 367,
    points: [{ t: "2026-11-06T08:00:00.000Z", close: 323.7 }]
  }), null);
  assert.equal(sessionBaseline({
    points: [
      { t: "2026-11-05T08:00:00.000Z", close: 312.2 },
      { t: "2026-11-06T08:00:00.000Z", close: 323.7 }
    ]
  }), 312.2);
});

test("Der Wochenwert −9,8 % wird nicht erneut als Tagesalarm geschrieben", () => {
  const ticker = {
    symbol: "TSLA",
    name: "Tesla",
    example: false,
    stale: false,
    priceEur: 323.7,
    previousCloseEur: 358.85,
    changePct: -9.8,
    sources: [],
    history: {
      "1M": [
        { t: "2026-11-05T07:00:00.000Z", eur: 312.2 },
        { t: "2026-11-06T07:00:00.000Z", eur: 323.7 }
      ]
    }
  };
  assert.equal(trustedChange(ticker, new Date("2026-11-08T04:41:33.807Z")), null);
  const created = updateAlerts({ alerts: [] }, [ticker], "2026-11-08T04:41:33.807Z", "2026-11-08");
  assert.equal(created.alerts.length, 0);
  const stale = {
    id: "TSLA-2026-11-08",
    symbol: "TSLA",
    name: "Tesla",
    changePct: -9.8,
    priceEur: 323.7,
    timestamp: "2026-11-08T04:41:33.807Z",
    example: false,
    direction: "down"
  };
  assert.equal(staleSessionAlert(stale, ticker), true);
  const kept = updateAlerts({ alerts: [stale] }, [ticker], "2026-11-09T12:00:00.000Z", "2026-11-09");
  assert.equal(kept.alerts.some((alert) => alert.changePct === -9.8), false);
  const coherent = {
    ...ticker,
    priceEur: 342.15,
    previousCloseEur: 355.85,
    changePct: -3.85,
    history: {
      "1M": [
        { t: "2026-11-03T07:00:00.000Z", eur: 355.85 },
        { t: "2026-11-04T07:00:00.000Z", eur: 342.15 }
      ]
    }
  };
  const real = updateAlerts({ alerts: [] }, [coherent], "2026-11-04T21:25:22.584Z", "2026-11-04");
  assert.equal(real.alerts.length, 1);
  assert.equal(real.alerts[0].changePct, -3.85);
  const near = {
    symbol: "SPCX",
    example: false,
    priceEur: 121.28,
    previousCloseEur: 126.26,
    changePct: -4.18,
    history: {
      "1M": [
        { t: "2026-11-03T07:00:00.000Z", eur: 126.26 },
        { t: "2026-11-04T07:00:00.000Z", eur: 121.28 }
      ]
    }
  };
  assert.equal(staleSessionAlert({
    symbol: "SPCX",
    changePct: -6.41,
    priceEur: 120.98,
    timestamp: "2026-11-04T21:25:22.584Z",
    example: false
  }, near), false);
});

test("Alerts behalten notified und feuern ab zwei Prozent", () => {
  const first = updateAlerts({ alerts: [] }, [
    { symbol: "TSLA", name: "Tesla", example: false, stale: false, changePct: -2.4, priceEur: 300, sources: [] }
  ], "2026-11-04T15:00:00.000Z", "2026-11-04");
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].notified, false);
  assert.equal(first.alerts[0].direction, "down");
  first.alerts[0].notified = true;
  const second = updateAlerts(first, [
    { symbol: "TSLA", name: "Tesla", example: false, stale: false, changePct: -3, priceEur: 290, sources: [] },
    { symbol: "RKLB", name: "Rocket Lab", example: false, stale: false, changePct: 0.4, priceEur: 40, sources: [] }
  ], "2026-11-04T16:00:00.000Z", "2026-11-04");
  assert.equal(second.alerts.length, 1);
  assert.equal(second.alerts[0].notified, true);
  assert.equal(second.alerts[0].changePct, -3);
  assert.equal(second.alerts[0].timestamp, "2026-11-04T15:00:00.000Z");
});

test("Zeitstempel allein gelten nicht als Änderung", () => {
  const left = { asOf: "a", tickers: [{ priceEur: 1 }] };
  const right = { asOf: "b", tickers: [{ priceEur: 1 }] };
  assert.equal(meaningful(left), meaningful(right));
  right.tickers[0].priceEur = 2;
  assert.notEqual(meaningful(left), meaningful(right));
});

test("Berlin-Fenster: Werktag durchgehend, Wochenende mit Toleranz, Sommer- und Winterzeit", () => {
  assert.equal(shouldRun({ weekday: 3, hour: 5, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 5, minute: 20 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 7, minute: 41 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 15, minute: 15 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 15 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 4, minute: 59 }), false);
  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 16 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 9, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 9, minute: 45 }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 9, minute: 46 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 8, minute: 59 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 14, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 14, minute: 45 }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 14, minute: 46 }), false);
  assert.equal(shouldRun({ weekday: 6, hour: 20, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 6, hour: 20, minute: 45 }), true);
  assert.equal(shouldRun({ weekday: 6, hour: 20, minute: 46 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 6, minute: 30 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 16, minute: 0 }), false);
  assert.equal(shouldRun({ weekday: 6, hour: 18, minute: 0 }), false);
  assert.equal(shouldRun({ weekday: 0, hour: 4, minute: 0 }), false);
  assert.equal(shouldRun({ weekday: 0, hour: 4, minute: 0 }, { force: true }), true);

  const winter = berlinParts(new Date("2026-01-15T04:00:00.000Z"));
  assert.equal(winter.hour, 5);
  assert.equal(winter.minute, 0);
  assert.equal(shouldRun(winter), true);

  const summer = berlinParts(new Date("2026-07-15T03:00:00.000Z"));
  assert.equal(summer.hour, 5);
  assert.equal(summer.minute, 0);
  assert.equal(shouldRun(summer), true);

  const summerSession = berlinParts(new Date("2026-07-15T13:30:00.000Z"));
  assert.equal(summerSession.hour, 15);
  assert.equal(summerSession.minute, 30);
  assert.equal(shouldRun(summerSession), true);

  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 16 }), false);
  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 16 }, { usOpen: true }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 1, minute: 10 }, { usOpen: true }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 9, minute: 10 }, { usOpen: true }), true);
  assert.equal(shouldRun({ weekday: 6, hour: 3, minute: 0 }), false);
});

test("US-Fenster: Vorbörse bis Nachhandel, nicht die leere Nacht", () => {
  assert.equal(usSessionActive(new Date("2026-11-06T00:30:00Z")), true);
  assert.equal(usSessionActive(new Date("2026-11-06T04:23:00Z")), false);
  assert.equal(usSessionActive(new Date("2026-11-06T10:00:00Z")), true);
  assert.equal(usSessionActive(new Date("2026-11-07T01:30:00Z")), true);
  assert.equal(usSessionActive(new Date("2026-11-07T01:31:00Z")), false);
  assert.equal(usSessionActive(new Date("2026-07-15T23:30:00Z")), true);
  assert.equal(usSessionActive(new Date("2026-07-16T00:45:00Z")), false);
  assert.equal(usSessionActive(new Date("2026-11-08T15:00:00Z")), false);
  assert.equal(usClockSession(Date.parse("2026-11-05T21:30:00.000Z")), "post");
  assert.equal(usClockSession(Date.parse("2026-11-05T14:30:00.000Z")), "regular");
  assert.equal(usClockSession(Date.parse("2026-11-05T10:00:00.000Z")), "pre");
  assert.equal(usClockSession(Date.parse("2026-11-06T02:00:00.000Z")), null);
});

test("Nachthandel aus echten Kerzen, nicht aus dem regulären Tag", () => {
  const periods = {
    pre: [{ start: 1000, end: 2000 }],
    regular: [{ start: 2000, end: 3000 }],
    post: [{ start: 3000, end: 4000 }]
  };
  const points = [
    { t: new Date(1500 * 1000).toISOString(), close: 10, high: 11, low: 9 },
    { t: new Date(2500 * 1000).toISOString(), close: 12, high: 13, low: 11 },
    { t: new Date(3500 * 1000).toISOString(), close: 14, high: 16, low: 13 },
    { t: new Date(3800 * 1000).toISOString(), close: 15, high: 15.5, low: 14.5 }
  ];
  const closed = extendedQuote(points, periods, 4500 * 1000, { clock: false });
  assert.equal(closed.phase, "nachhandel");
  assert.equal(closed.price, 15);
  assert.equal(closed.high, 16);
  assert.equal(closed.low, 13);
  assert.equal(extendedQuote(points, periods, 2500 * 1000, { clock: false }), null);
  const pre = extendedQuote(points, periods, 1600 * 1000, { clock: false });
  assert.equal(pre.phase, "vorboerse");
  assert.equal(pre.price, 10);
  assert.equal(pre.high, 11);
  assert.equal(pre.low, 9);
  assert.equal(extendedQuote(points, periods, 3200 * 1000, { clock: false }).phase, "nachhandel");
});

test("Tagesverlauf hängt nur Punkte nach dem Euro-Schluss an", () => {
  const primary = [
    { t: "2026-11-05T16:25:00.000Z", eur: 300, session: "regular" },
    { t: "2026-11-05T16:30:00.000Z", eur: 301, session: "regular" }
  ];
  const extra = [
    { t: "2026-11-05T16:30:00.000Z", eur: 299, session: "regular" },
    { t: "2026-11-05T18:00:00.000Z", eur: 310, session: "regular" },
    { t: "2026-11-05T21:05:00.000Z", eur: 312, session: "post" }
  ];
  const stitched = stitchIntraday(primary, extra);
  assert.equal(stitched.length, 4);
  assert.equal(stitched[2].eur, 310);
  assert.equal(stitched[3].session, "post");
  assert.equal(sessionEnded({ regular: [{ start: 100, end: 200 }] }, 250), true);
  assert.equal(sessionEnded({ regular: [{ start: 100, end: 200 }] }, 150), false);
});

test("Letzter Nachthandel bleibt, solange die reguläre US-Sitzung nicht läuft", () => {
  const previous = {
    overnightPhase: "nachhandel",
    overnightEur: 112.4,
    overnightHighEur: 113.1,
    overnightLowEur: 110.2,
    overnightAsOf: "2026-11-06T00:59:00.000Z"
  };
  const kept = resolveOvernight(null, previous, { regularLive: false });
  assert.equal(kept.phase, "nachhandel");
  assert.equal(kept.eur, 112.4);
  assert.equal(kept.high, 113.1);
  const cleared = resolveOvernight(null, previous, { regularLive: true });
  assert.equal(cleared.eur, null);
  assert.equal(cleared.phase, null);
  const fresh = resolveOvernight({
    phase: "vorboerse",
    eur: 114,
    high: 115,
    low: 113,
    asOf: "2026-11-06T10:00:00.000Z"
  }, previous, { regularLive: false });
  assert.equal(fresh.phase, "vorboerse");
  assert.equal(fresh.eur, 114);
});

test("1W nimmt die letzten sieben Tage, der Tag bleibt der Tag", () => {
  const month = Array.from({ length: 12 }, (_, index) => ({
    t: `2026-10-${String(index + 1).padStart(2, "0")}`,
    eur: 10 + index
  }));
  const ticker = { history: { "1M": month, intraday: [{ t: "2026-11-04T10:00:00Z", eur: 1 }] } };
  const week = seriesFor(ticker, "1W");
  assert.equal(week.range, "1W");
  assert.equal(week.points.length, 7);
  assert.equal(week.points.at(-1).eur, 21);
  assert.equal(week.points[0].eur, 15);
  assert.equal(seriesFor(ticker, "5 Min", false).range, "5 Min");
});

test("Langfrist-Brille glättet und springt von kurzen Spannen auf 1J", () => {
  const ticker = {
    history: {
      intraday: [{ t: "2026-11-04T10:00:00Z", eur: 1 }, { t: "2026-11-04T11:00:00Z", eur: 3 }],
      "1M": [{ t: "2026-11-01", eur: 10 }, { t: "2026-11-02", eur: 12 }],
      "1Y": [
        { t: "2026-01-02", eur: 10 },
        { t: "2026-01-03", eur: 14 },
        { t: "2026-01-09", eur: 12 },
        { t: "2026-01-10", eur: 16 }
      ]
    }
  };
  const smoothed = seriesFor(ticker, "Tag", true);
  assert.equal(smoothed.range, "1J");
  assert.ok(smoothed.points.length >= 2);
  assert.ok(smoothed.points.every((point) => point.eur >= 10 && point.eur <= 16));
  assert.equal(seriesFor(ticker, "5 Min", true).range, "1J");
  assert.equal(seriesFor(ticker, "1W", true).range, "1J");
  assert.equal(seriesFor(ticker, "1M", true).range, "1J");
  assert.equal(seriesFor(ticker, "6M", true).range, "6M");
});

test("Ruhe-Modus ignoriert Beispieldaten", () => {
  const quiet = bigDrop({
    prices: { tickers: [{ example: true, changePct: -8 }] },
    alerts: { alerts: [{ example: true, direction: "down", changePct: -4, timestamp: "2026-11-04T10:00:00+01:00" }] }
  }, new Date("2026-11-04T12:00:00+01:00"));
  assert.equal(quiet.active, false);
  const loud = bigDrop({
    prices: { tickers: [{ example: false, changePct: -2.1, symbol: "TSLA" }] },
    alerts: { alerts: [] }
  });
  assert.equal(loud.active, true);
});

test("Punkte gibt es nur, wenn Justy und Karl dieselbe Frage beantwortet haben", () => {
  const file = {
    current: { id: "a", outcome: null, karlAnswer: "ja" },
    history: [
      { id: "b", outcome: "ja", karlAnswer: "ja" },
      { id: "c", outcome: "nein", karlAnswer: "ja" }
    ]
  };
  const empty = scoreboard(file, { answers: {} });
  assert.deepEqual(empty, { justy: 0, karl: 0, decided: 0 });
  const scored = scoreboard(file, { answers: { b: { answer: "ja" }, c: { answer: "nein" } } });
  assert.deepEqual(scored, { justy: 2, karl: 1, decided: 2 });
});

test("Der nächste Termin ist der früheste, bei gleichem Tag der wichtigere", () => {
  const events = [
    { id: "late", date: "2026-12-01", impact: "hoch" },
    { id: "soon-low", date: "2026-11-08", impact: "niedrig" },
    { id: "soon-high", date: "2026-11-08", impact: "hoch" },
    { id: "past", date: "2026-11-01", impact: "hoch" }
  ];
  const pick = headlineEvent(events, new Date(2026, 10, 4));
  assert.equal(pick.id, "soon-high");
});

test("Nur die App-Adresse bleibt im Fenster", () => {
  const origin = "https://justy-gtr.github.io";
  const base = "/Justy-gtr-app";
  assert.equal(isInAppUrl(new URL("https://justy-gtr.github.io/Justy-gtr-app/"), origin, base), true);
  assert.equal(isInAppUrl(new URL("https://justy-gtr.github.io/Justy-gtr-app/index.html"), origin, base), true);
  assert.equal(isInAppUrl(new URL("https://x.com/SpaceX"), origin, base), false);
  assert.equal(isInAppUrl(new URL("https://justy-gtr.github.io/Justy-gtr-app/data/prices.json"), origin, base), false);
});

test("Zeiten landen in Europe/Berlin, auch aus US-Zeit", () => {
  const berlin = zonedWallTime("2026-11-06", "14:30", "Europe/Berlin");
  assert.equal(formatFeedTime(berlin, new Date("2026-11-06T12:00:00+01:00")), "heute 14:30");
  const ny = zonedWallTime("2026-11-06", "14:30", "America/New_York");
  assert.equal(formatFeedTime(ny, new Date("2026-11-06T18:00:00+01:00")), "heute 20:30");
  assert.equal(formatEventClock({ date: "2026-11-06", time: "14:30", timezone: "America/New_York" }, new Date("2026-11-05T10:00:00+01:00")), "6. Nov. · 20:30");
  const morning = new Date("2026-11-05T07:59:20Z");
  assert.equal(formatFeedTime(morning, new Date("2026-11-05T10:00:00+01:00")), "heute 08:59");
});

test("Der Feed mischt Post, Termin, Kurs und Briefing, neueste zuerst", () => {
  const now = new Date("2026-11-05T10:00:00+01:00");
  const feed = buildFeed({
    posts: { posts: [
      { id: "p1", postedAt: "2026-11-05T08:59:20+01:00", summaryDe: "Musk am Morgen", account: "@elonmusk" },
      { id: "old", postedAt: "2026-10-01T08:00:00+01:00", summaryDe: "zu alt" }
    ] },
    alerts: { alerts: [{ id: "a1", symbol: "TSLA", changePct: -4.9, priceEur: 342.15, timestamp: "2026-11-04T21:25:22.584Z" }] },
    briefing: { date: "2026-11-05", bullets: ["Erster Punkt", "Zweiter Punkt"] },
    calendar: { events: [
      { id: "soon", title: "Arbeitsmarkt", date: "2026-11-06", time: "14:30", timezone: "Europe/Berlin" },
      { id: "far", title: "Viel später", date: "2027-06-01", time: "10:00", timezone: "Europe/Berlin" }
    ] }
  }, now);
  assert.equal(feed.some((item) => item.kind === "post" && item.timeLabel === "heute 08:59"), true);
  assert.equal(feed.filter((item) => item.kind === "briefing").every((item) => item.timeLabel === "heute 07:00"), true);
  assert.equal(feed.some((item) => item.kind === "alert"), true);
  assert.equal(feed.some((item) => item.kind === "briefing"), true);
  assert.equal(feed.some((item) => item.kind === "event" && item.title.startsWith("Arbeitsmarkt")), true);
  assert.equal(feed.some((item) => item.title === "zu alt" || item.title === "Viel später"), false);
  assert.ok(feed.findIndex((item) => item.kind === "post") < feed.findIndex((item) => item.kind === "event"));
  const postsFile = JSON.parse(fs.readFileSync("data/posts.json", "utf8"));
  const briefingFile = JSON.parse(fs.readFileSync("data/briefing.json", "utf8"));
  const latestPost = Math.max(0, ...(postsFile.posts || []).map((post) => Date.parse(post.postedAt) || 0));
  const realNow = new Date(latestPost || now.getTime());
  const real = buildFeed({
    posts: postsFile,
    alerts: JSON.parse(fs.readFileSync("data/alerts.json", "utf8")),
    briefing: briefingFile,
    calendar: JSON.parse(fs.readFileSync("data/calendar.json", "utf8"))
  }, realNow);
  const kinds = new Set(real.map((item) => item.kind));
  assert.ok(kinds.has("post"));
  assert.match(real.find((item) => item.kind === "post").timeLabel, /^heute \d{2}:\d{2}$/);
  const berlinDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(realNow);
  if (briefingFile?.date === berlinDay && briefingFile.bullets?.length) assert.ok(kinds.has("briefing"));
  assert.ok(real.every((item) => item.kind && item.title && item.timeLabel));
  const alertsFile = JSON.parse(fs.readFileSync("data/alerts.json", "utf8"));
  assert.equal(alertsFile.alerts.some((alert) => alert.symbol === "TSLA" && alert.changePct === -9.8 && alert.priceEur === 323.7), false);
  const monday = buildFeed({
    alerts: alertsFile,
    posts: { posts: [] },
    calendar: { events: [] }
  }, new Date("2026-11-09T13:00:00+01:00"));
  assert.equal(monday.some((item) => item.kind === "alert" && /TSLA/.test(item.title) && /9,8/.test(item.title)), false);
});

test("Markt heute mischt Börsenzeiten in Berlin mit Zahlen und Politik", () => {
  const now = new Date("2026-11-05T11:00:00Z");
  const rows = buildMarketTimeline({
    calendar: { events: [
      { id: "earn", title: "Quartalszahlen SpaceX", date: "2026-11-05", time: "16:00", timezone: "Europe/Berlin", category: "earnings" },
      { id: "pol", title: "politische Entscheidung", date: "2026-11-05", time: "18:30", timezone: "Europe/Berlin", category: "politik" },
      { id: "ny", title: "Fed-Rede", date: "2026-11-05", time: "10:00", timezone: "America/New_York", category: "zinsen" },
      { id: "jobs", title: "Arbeitsmarkt", date: "2026-11-06", time: "14:30", timezone: "Europe/Berlin", category: "makro" },
      { id: "launch", title: "Start", date: "2026-11-05", time: "12:00", timezone: "Europe/Berlin", category: "start" }
    ] }
  }, now);
  const byTitle = (title) => rows.find((row) => row.title === title);
  assert.equal(byTitle("Tokio auf").timeLabel, "01:00");
  assert.equal(byTitle("Tokio zu").status, "");
  assert.equal(byTitle("Xetra auf").timeLabel, "09:00");
  assert.equal(byTitle("Xetra auf").status, "offen");
  assert.equal(byTitle("NYSE / Nasdaq auf").timeLabel, "15:30");
  assert.equal(byTitle("NYSE / Nasdaq zu").timeLabel, "22:00");
  assert.equal(byTitle("Xetra zu").status, "");
  assert.equal(byTitle("Quartalszahlen SpaceX").label, "Zahlen");
  assert.equal(byTitle("politische Entscheidung").label, "Politik");
  assert.equal(byTitle("Fed-Rede").timeLabel, "16:00");
  assert.equal(byTitle("Fed-Rede").label, "Politik");
  assert.equal(rows.some((row) => row.title === "Start" || row.title === "Arbeitsmarkt"), false);
  const index = (title) => rows.findIndex((row) => row.title === title);
  assert.ok(index("NYSE / Nasdaq auf") < index("Quartalszahlen SpaceX"));
  assert.ok(index("Quartalszahlen SpaceX") < index("politische Entscheidung"));
  assert.equal(rows.some((row) => row.timeLabel.startsWith("morgen")), false);

  const gap = buildMarketTimeline({ calendar: { events: [] } }, new Date("2026-10-28T11:00:00Z"));
  assert.equal(gap.find((row) => row.title === "NYSE / Nasdaq auf").timeLabel, "14:30");
  const summer = buildMarketTimeline({ calendar: { events: [] } }, new Date("2026-07-15T10:00:00Z"));
  assert.equal(summer.find((row) => row.title === "NYSE / Nasdaq auf").timeLabel, "15:30");

  const soon = buildMarketTimeline({ calendar: { events: [] } }, new Date("2026-11-05T14:00:00Z"));
  assert.equal(soon.find((row) => row.title === "NYSE / Nasdaq auf").status, "bald");

  const evening = buildMarketTimeline({ calendar: { events: [] } }, new Date("2026-11-05T21:30:00Z"));
  assert.equal(evening.find((row) => row.title === "Xetra auf" && row.timeLabel === "09:00").status, "");
  assert.equal(evening.some((row) => row.title === "NYSE / Nasdaq zu"), true);
  assert.equal(evening.some((row) => row.title === "Xetra auf" && row.timeLabel === "morgen 09:00"), true);
  assert.equal(evening.some((row) => row.title.startsWith("NYSE") && row.timeLabel.startsWith("morgen")), false);

  const real = buildMarketTimeline({
    calendar: JSON.parse(fs.readFileSync("data/calendar.json", "utf8"))
  }, new Date("2026-11-06T07:00:00Z"));
  assert.equal(real.some((row) => row.label === "Politik" && row.timeLabel === "14:30" && row.title.includes("Arbeitsmarkt")), true);
  assert.equal(real.some((row) => row.label === "Zahlen"), false);

  const saturday = buildMarketTimeline({ calendar: { events: [] } }, new Date("2026-11-07T10:00:00Z"));
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].title, "Wochenende");
  assert.equal(saturday[0].status, "zu");
});

test("Max zeigt die längste Reihe und behält den feineren Tag", () => {
  const ticker = {
    history: {
      "1M": [{ t: "2026-10-01", eur: 1 }, { t: "2026-10-02", eur: 2 }],
      "5Y": [{ t: "2022-01-03", eur: 0.5 }, { t: "2026-10-01T00:00:00.000Z", eur: 9 }]
    }
  };
  const merged = maxPoints(ticker.history);
  assert.equal(merged[0].t, "2022-01-03");
  assert.equal(merged.find((point) => point.t === "2026-10-01").eur, 1);
  const series = seriesFor(ticker, "Max", false);
  assert.equal(series.range, "Max");
  assert.equal(series.points.at(-1).eur, 2);
  assert.equal(seriesFor(ticker, "1M", false).points.length, 2);
});

test("Halten heißt neutral, und beide Seiten bleiben lesbar", () => {
  assert.equal(opinionWord("halten"), "neutral");
  const mixed = compactStances({ swarmStance: "kauf", karlStance: "halten" });
  assert.equal(mixed.swarm, "optimistisch");
  assert.equal(mixed.karl, "neutral");
  const quiet = compactStances({ swarmStance: "kaum", karlStance: "halten" });
  assert.equal(quiet.swarm, "redet kaum darüber");
  assert.equal(quiet.karl, "neutral");
  assert.equal(JSON.stringify(mixed).includes("anders"), false);
  assert.equal(JSON.stringify(quiet).includes("anders"), false);
  const favorites = JSON.parse(fs.readFileSync("data/favorites.json", "utf8")).favorites;
  assert.equal(favorites.length, 10);
  for (const favorite of favorites) {
    const words = compactStances(favorite);
    assert.ok(words.swarm && words.karl);
    assert.equal(`${words.swarm} ${words.karl}`.includes("anders"), false);
    assert.equal(favorite.priceEur > 0, true);
  }
});

test("Das Abzeichen sagt dasselbe wie die beiden Chips", () => {
  assert.equal(opinionWord("kauf"), "optimistisch");
  assert.equal(opinionWord("halten"), "neutral");
  assert.equal(opinionWord("kaum"), "redet kaum darüber");
  assert.equal(opinionWord("vorsichtig"), "vorsichtig");

  assert.deepEqual(verdictForStances("kauf", "halten"), { label: "Nicht gleich", kind: "mixed" });
  assert.deepEqual(verdictForStances("kaum", "halten"), { label: "Nicht gleich", kind: "mixed" });
  assert.deepEqual(verdictForStances("kauf", "vorsichtig"), { label: "Karl dagegen", kind: "against" });
  assert.deepEqual(verdictForStances("vorsichtig", "kauf"), { label: "Karl dagegen", kind: "against" });
  assert.deepEqual(verdictForStances("kauf", "kauf"), { label: "Einig", kind: "agree" });
  assert.deepEqual(verdictForStances("halten", "halten"), { label: "Einig", kind: "agree" });
  assert.equal(verdictForStances("kauf", "halten").label === "Einig", false);
  assert.equal(verdictForStances("kaum", "halten").label === "Karl dagegen", false);
});

test("Karl gegen den Schwarm ist ein klares Urteil", () => {
  assert.deepEqual(vsSwarmVerdict({ vsSwarm: "zuversichtlicher" }), {
    key: "zuversichtlicher",
    label: "Karl zuversichtlicher",
    kind: "warm"
  });
  assert.deepEqual(vsSwarmVerdict({ vsSwarm: "skeptischer" }), {
    key: "skeptischer",
    label: "Karl skeptischer",
    kind: "cool"
  });
  assert.equal(vsSwarmVerdict({ karlStance: "halten", swarmStance: "kaum" }).key, "zuversichtlicher");
  assert.equal(vsSwarmVerdict({ karlStance: "vorsichtig", swarmStance: "kauf" }).key, "skeptischer");
  assert.equal(vsSwarmVerdict({ karlStance: "halten", swarmStance: "kauf" }).key, "skeptischer");
  assert.equal(vsSwarmVerdict({ karlStance: "halten", swarmStance: "halten" }).key, "skeptischer");

  const favorites = JSON.parse(fs.readFileSync("data/favorites.json", "utf8")).favorites;
  const warm = favorites.filter((item) => item.vsSwarm === "zuversichtlicher").map((item) => item.symbol).sort();
  assert.deepEqual(warm, ["HEN3", "RKLB", "SAP"]);
  for (const favorite of favorites) {
    assert.equal(vsSwarmVerdict(favorite).key, favorite.vsSwarm);
    assert.ok(favorite.karlTake.length > 20 && favorite.karlTake.length < 180);
    assert.ok(favorite.karlCounter.length > 10 && favorite.karlCounter.length < 180);
    assert.deepEqual(karlVoiceIssues(favorite.karlTake), []);
    assert.deepEqual(karlVoiceIssues(favorite.karlCounter), []);
    assert.equal(/\b(kaufen|verkaufen)\b/i.test(`${favorite.karlTake} ${favorite.karlCounter}`), false);
  }

  const comparison = JSON.parse(fs.readFileSync("data/crowd.json", "utf8")).comparison;
  assert.equal(comparison.swarmHitRatePct, null);
  assert.equal(comparison.karlHitRatePct, null);
  assert.deepEqual(karlVoiceIssues(comparison.summary), []);
  assert.equal(/zuversichtlicher/i.test(comparison.summary), true);
  assert.equal(/skeptischer/i.test(comparison.summary), true);
  const bySymbol = Object.fromEntries(favorites.map((item) => [item.symbol, item]));
  for (const pick of comparison.picks) {
    const favorite = bySymbol[pick.symbol];
    assert.equal(pick.vsSwarm, favorite.vsSwarm);
    assert.equal(pick.karlTake, favorite.karlTake);
    assert.equal(pick.karlCounter, favorite.karlCounter);
    assert.deepEqual(karlVoiceIssues(pick.karlTake), []);
  }
});

test("Trefferquote rechnet nur entschiedene Ideen", () => {
  const summary = trackSummary([
    { result: "treffer" },
    { result: "daneben" },
    { result: "offen" }
  ]);
  assert.equal(summary.hitRatePct, 50);
  assert.equal(summary.open, 1);
});

test("5-Minuten-Abruf behält nur die letzten Handelstage", () => {
  const points = [
    { t: "2026-11-04T15:00:00.000Z", eur: 1 },
    { t: "2026-11-05T15:00:00.000Z", eur: 2 },
    { t: "2026-11-06T15:00:00.000Z", eur: 3 },
    { t: "2026-11-06T20:00:00.000Z", eur: 4 },
    { t: "2026-11-09T14:00:00.000Z", eur: 5 }
  ];
  assert.deepEqual(keepTradingDays(points, 3).map((point) => point.eur), [2, 3, 4, 5]);
  assert.equal(keepTradingDays(points, 3).some((point) => point.eur === 1), false);
});

test("1 Min behält jeden Punkt, 5 Min den letzten im Block", () => {
  const start = Date.parse("2026-11-06T14:00:00.000Z");
  const intraday = Array.from({ length: 10 }, (_, index) => ({
    t: new Date(start + index * 60 * 1000).toISOString(),
    eur: index + 1,
    session: index < 3 ? "pre" : "regular"
  }));
  const ticker = { history: { intraday, "1M": [{ t: "2026-11-01", eur: 9 }] } };
  const minute = seriesFor(ticker, "1 Min", false);
  assert.equal(minute.range, "1 Min");
  assert.equal(minute.points.length, 10);
  assert.equal(minute.points[2].session, "pre");
  const coarse = seriesFor(ticker, "5 Min", false);
  assert.equal(coarse.range, "5 Min");
  assert.equal(coarse.points.length, 2);
  assert.equal(coarse.points[0].eur, 5);
  assert.equal(coarse.points[0].session, "regular");
  assert.equal(coarse.points[1].eur, 10);
  assert.equal(bucketMinutes(intraday, 1).length, 10);
  const sampled = sparkSample(intraday, 4);
  assert.equal(sampled.length, 4);
  assert.equal(sampled[0].eur, 1);
  assert.equal(sampled.at(-1).eur, 10);
  assert.equal(seriesFor(ticker, "Tag", false).range, "1 Min");
  assert.equal(seriesFor(ticker, "5 Min").range, "5 Min");
});

test("Euro-Platz gewinnt erst mit einer echten Minutenreihe", () => {
  const eu = [{ t: "2026-11-06T09:00:00.000Z", eur: 10 }];
  const usd = [
    { t: "2026-11-06T14:00:00.000Z", eur: 11, session: "pre" },
    { t: "2026-11-06T16:00:00.000Z", eur: 12, session: "regular" }
  ];
  const thin = chooseIntraday(eu, usd, "direct_eur");
  assert.equal(thin.method, "usd_div_eurusd");
  assert.equal(thin.points.length, 2);
  const denseEu = Array.from({ length: 12 }, (_, index) => ({
    t: new Date(Date.parse("2026-11-06T08:00:00.000Z") + index * 60 * 1000).toISOString(),
    eur: 100 + index,
    session: "regular"
  }));
  const stitched = chooseIntraday(denseEu, usd, "direct_eur");
  assert.equal(stitched.method, "direct_eur_plus_us");
  assert.equal(stitched.points.length, 14);
  assert.equal(stitched.points[11].eur, 111);
  assert.equal(stitched.points[12].session, "pre");
  const alone = chooseIntraday(denseEu, [], "direct_eur");
  assert.equal(alone.method, "direct_eur");
  assert.equal(alone.points.length, 12);
});

test("Minutenreihe bleibt ein Handelstag", () => {
  const last = Date.parse("2026-11-06T20:00:00.000Z");
  const points = [
    { t: new Date(last - 40 * 3600 * 1000).toISOString(), eur: 1 },
    { t: new Date(last - 2 * 3600 * 1000).toISOString(), eur: 2 },
    { t: new Date(last).toISOString(), eur: 3 }
  ];
  const kept = keepRecentSession(points);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].eur, 2);
  const many = Array.from({ length: 20 }, (_, index) => ({
    t: new Date(last - (19 - index) * 60 * 1000).toISOString(),
    eur: index
  }));
  const capped = keepRecentSession(many, { maxPoints: 5 });
  assert.equal(capped.length, 5);
  assert.equal(capped.at(-1).eur, 19);
  assert.equal(keepRecentSession([]).length, 0);
});

test("Die App schaut nur hin, solange ein neuer Kurs möglich ist", () => {
  const samples = [
    "2026-11-06T04:00:00Z",
    "2026-11-06T03:59:00Z",
    "2026-11-06T10:00:00Z",
    "2026-11-06T21:20:00Z",
    "2026-11-07T01:30:00Z",
    "2026-11-07T01:31:00Z",
    "2026-11-08T15:00:00Z",
    "2026-07-15T23:30:00Z",
    "2026-07-16T00:45:00Z"
  ];
  for (const iso of samples) {
    const date = new Date(iso);
    const parts = berlinParts(date);
    const minutes = parts.hour * 60 + parts.minute;
    const weekdayWindow = parts.weekday <= 4 && minutes >= 5 * 60 && minutes <= 22 * 60 + 15;
    assert.equal(marketWatch(date), weekdayWindow || usSessionActive(date), iso);
    if (parts.weekday >= 5 && !usSessionActive(date)) assert.equal(marketWatch(date), false, iso);
  }
});
