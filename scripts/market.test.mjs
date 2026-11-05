import assert from "node:assert/strict";
import test from "node:test";
import { berlinParts, shouldRun } from "./schedule.mjs";
import { fxFor, mergeTicker, meaningful, updateAlerts, usdToEur } from "./market.mjs";
import { bigDrop, buildFeed, buildMarketTimeline, compactStances, formatEventClock, formatFeedTime, headlineEvent, isInAppUrl, maxPoints, opinionWord, scoreboard, seriesFor, trackSummary, verdictForStances, zonedWallTime } from "../js/logic.js";
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
  const real = buildFeed({
    posts: JSON.parse(fs.readFileSync("data/posts.json", "utf8")),
    alerts: JSON.parse(fs.readFileSync("data/alerts.json", "utf8")),
    briefing: JSON.parse(fs.readFileSync("data/briefing.json", "utf8")),
    calendar: JSON.parse(fs.readFileSync("data/calendar.json", "utf8"))
  }, now);
  assert.deepEqual([...new Set(real.map((item) => item.kind))].sort(), ["alert", "briefing", "event", "post"]);
  assert.match(real.find((item) => item.kind === "post").timeLabel, /^heute \d{2}:\d{2}$/);
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

test("Trefferquote rechnet nur entschiedene Ideen", () => {
  const summary = trackSummary([
    { result: "treffer" },
    { result: "daneben" },
    { result: "offen" }
  ]);
  assert.equal(summary.hitRatePct, 50);
  assert.equal(summary.open, 1);
});
