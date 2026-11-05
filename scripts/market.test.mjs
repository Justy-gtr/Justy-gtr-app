import assert from "node:assert/strict";
import test from "node:test";
import { berlinParts, shouldRun } from "./schedule.mjs";
import { fxFor, mergeTicker, meaningful, updateAlerts, usdToEur } from "./market.mjs";
import { bigDrop, headlineEvent, isInAppUrl, opinionWord, scoreboard, seriesFor, trackSummary, verdictForStances } from "../js/logic.js";

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

test("Berlin-Fenster: feste Slots, US-Sitzung, Wochenende, Sommer- und Winterzeit", () => {
  assert.equal(shouldRun({ weekday: 3, hour: 5, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 5, minute: 10 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 5, minute: 20 }), false);
  assert.equal(shouldRun({ weekday: 3, hour: 15, minute: 15 }), false);
  assert.equal(shouldRun({ weekday: 3, hour: 15, minute: 30 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 21, minute: 45 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 10 }), true);
  assert.equal(shouldRun({ weekday: 3, hour: 22, minute: 20 }), false);
  assert.equal(shouldRun({ weekday: 5, hour: 16, minute: 0 }), true);
  assert.equal(shouldRun({ weekday: 5, hour: 16, minute: 15 }), false);
  assert.equal(shouldRun({ weekday: 6, hour: 18, minute: 0 }), true);
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
});

test("Langfrist-Brille glättet und blendet den Tag aus", () => {
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

test("Trefferquote rechnet nur entschiedene Ideen", () => {
  const summary = trackSummary([
    { result: "treffer" },
    { result: "daneben" },
    { result: "offen" }
  ]);
  assert.equal(summary.hitRatePct, 50);
  assert.equal(summary.open, 1);
});
