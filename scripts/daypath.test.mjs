import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { renderAnalyse } from "../js/analyse-view.js";
import {
  DAYPATH_AXIS,
  DAYPATH_SCHEMA,
  DAYPATH_SLOTS,
  PATH_FEW_DAYS,
  collectPriceBars,
  dayPathReadout,
  dayPathsFor,
  formatPathPct,
  mergeIntradayPaths,
  renderDayPaths,
  weekdayPaths,
  weekdayPathsMerged
} from "../js/daypath.js";
import { berlinClock } from "../js/seasonality.js";
import { dayPathVenues, dayPathsStale, shouldSkipSeasonality } from "./fetch-seasonality.mjs";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kauf|verkauf|empfehl\w*)\b/i;

function at(day, clock, eur) {
  const [hour, minute] = clock.split(":").map(Number);
  const utc = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    hour - 1,
    minute
  );
  return { t: new Date(utc).toISOString(), eur };
}

test("07:00 ist die Basis, der Wochentag mischt sich nicht", () => {
  assert.deepEqual(DAYPATH_AXIS, ["07:00", "15:30", "23:00"]);
  assert.equal(DAYPATH_SLOTS[0], "07:00");
  assert.equal(DAYPATH_SLOTS.at(-1), "23:00");
  assert.equal(DAYPATH_SLOTS.includes("15:30"), true);

  const monday = [
    at("2026-11-02", "07:00", 100),
    at("2026-11-02", "15:30", 110),
    at("2026-11-02", "23:00", 120)
  ];
  const mondayLater = [
    at("2026-11-09", "07:00", 200),
    at("2026-11-09", "15:30", 200),
    at("2026-11-09", "23:00", 180)
  ];
  const friday = [
    at("2026-11-06", "07:00", 50),
    at("2026-11-06", "23:00", 60)
  ];
  const paths = weekdayPaths([...monday, ...mondayLater, ...friday]);
  const montag = paths.days[0];
  const freitag = paths.days[4];
  assert.equal(montag.name, "Montag");
  assert.equal(montag.n, 2);
  assert.equal(freitag.n, 1);
  assert.equal(paths.days[1].n, 0);
  const open = DAYPATH_SLOTS.indexOf("07:00");
  const cash = DAYPATH_SLOTS.indexOf("15:30");
  const close = DAYPATH_SLOTS.indexOf("23:00");
  assert.equal(montag.points[open].avg, 0);
  assert.equal(montag.points[cash].avg, 5);
  assert.equal(montag.points[close].avg, 5);
  assert.equal(montag.end, 5);
  assert.equal(freitag.points[close].avg, 20);
  assert.equal(Number.isFinite(montag.points[close].spread), true);
  assert.equal(freitag.points[close].spread, null);
});

test("Fehlende frühe und späte Stunden bleiben leer", () => {
  const winter = [
    { t: "2026-11-09T14:30:00.000Z", eur: 100 },
    { t: "2026-11-09T16:00:00.000Z", eur: 110 },
    { t: "2026-11-09T22:00:00.000Z", eur: 103 }
  ];
  const paths = weekdayPaths(winter);
  const day = paths.days[0];
  assert.equal(day.n, 1);
  assert.equal(day.points[DAYPATH_SLOTS.indexOf("07:00")].avg, null);
  assert.equal(day.points[DAYPATH_SLOTS.indexOf("15:30")].avg, 0);
  assert.equal(day.points[DAYPATH_SLOTS.indexOf("23:00")].avg, 3);
  assert.equal(day.end, 3);

  const before = [{ t: "2026-11-09T05:30:00.000Z", eur: 90 }];
  const after = [{ t: "2026-11-09T22:30:00.000Z", eur: 90 }];
  assert.equal(weekdayPaths(before).days[0].n, 0);
  assert.equal(weekdayPaths(after).days[0].n, 0);
  assert.equal(berlinClock(before[0].t).hour, 6);
  assert.equal(berlinClock(after[0].t).hour, 23);
  assert.equal(berlinClock(after[0].t).minute, 30);
});

test("Frankfurt am Morgen, die US-Reihe danach, ohne Sprung", () => {
  const german = [
    at("2026-11-09", "07:00", 100),
    at("2026-11-09", "15:00", 110)
  ];
  const us = [
    { t: "2026-11-09T15:00:00.000Z", eur: 50 },
    { t: "2026-11-09T21:00:00.000Z", eur: 55 }
  ];
  const day = weekdayPathsMerged(german, us).days[0];
  assert.equal(day.n, 1);
  assert.equal(day.points[DAYPATH_SLOTS.indexOf("07:00")].avg, 0);
  assert.equal(day.points[DAYPATH_SLOTS.indexOf("15:00")].avg, 10);
  assert.equal(day.end, 21);
});

test("Die Karte bleibt beschreibend und nutzt die gespeicherten Tage, wenn es mehr sind", () => {
  const bars = [
    { t: "2026-11-09T07:00:00.000Z", eur: 10 },
    { t: "2026-11-09T21:00:00.000Z", eur: 11 }
  ];
  const ticker = { symbol: "SPCX", history: { "5m": bars, intraday: [], "1H": [] } };
  assert.equal(collectPriceBars(ticker).length, 2);
  const local = dayPathsFor(ticker, null);
  assert.equal(local.days[0].n, 1);
  const stored = weekdayPaths([
    ...bars,
    at("2026-11-02", "07:00", 10),
    at("2026-11-02", "23:00", 12)
  ]);
  const picked = dayPathsFor(ticker, { symbols: { SPCX: { dayPaths: stored } } });
  assert.equal(picked.days[0].n, 2);
  const html = renderDayPaths(picked);
  assert.match(html, /Durchschnittlicher Tagesverlauf/);
  assert.match(html, /Montag/);
  assert.match(html, /Dienstag/);
  assert.match(html, /Mittwoch/);
  assert.match(html, /Donnerstag/);
  assert.match(html, /Freitag/);
  assert.match(html, /07:00/);
  assert.match(html, /23:00/);
  assert.equal(html.includes("08:00"), false);
  assert.equal(html.includes("22:00"), false);
  assert.match(html, /n = 2 Tage/);
  assert.match(html, /n = 0 Tage/);
  assert.equal(ADVICE.test(html), false);
  assert.equal(html.includes("Keine Anlageberatung"), false);
  assert.equal(formatPathPct(1.5), "+1,50 %");
  assert.equal(formatPathPct(-0.2).includes("−"), true);
  const page = renderAnalyse({
    prices: { tickers: [{ symbol: "SPCX", name: "SpaceX", priceEur: 100, history: { "5m": bars } }] },
    seasonality: { symbols: { SPCX: { dayPaths: stored } } }
  }, { analyseSymbol: "SPCX", analyseRange: "15 Min" });
  assert.match(page, /Durchschnittlicher Tagesverlauf/);
  assert.equal(ADVICE.test(page), false);
  assert.equal(page.includes("Keine Anlageberatung"), false);
  assert.equal(berlinClock(bars[0].t).date, "2026-11-09");
});

function headOf(html, name) {
  const token = `<strong>${name}</strong>`;
  const start = html.indexOf(token);
  const end = html.indexOf("</div>", start);
  return html.slice(start, end);
}

test("Wenige Tage bleiben als Linie stehen, leere Körbe bleiben Lücken", () => {
  assert.equal(PATH_FEW_DAYS, 7);
  const mondays = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"];
  const points = montaysSafe(mondays);
  const paths = weekdayPaths(points);
  assert.equal(paths.schema, DAYPATH_SCHEMA);
  assert.equal(paths.days[0].n, 7);
  assert.equal(paths.days[1].n, 0);
  assert.equal(paths.days[0].points[DAYPATH_SLOTS.indexOf("12:00")].avg, null);
  const html = renderDayPaths(paths);
  assert.equal(headOf(html, "Montag").includes("wenige Tage"), false);
  assert.match(headOf(html, "Dienstag"), /wenige Tage/);
  assert.match(headOf(html, "Mittwoch"), /wenige Tage/);
  assert.equal(html.split('data-chart="daypath"').length - 1, 5);
  assert.equal(html.split('class="scrub daypath-scrub"').length - 1, 5);
  assert.match(html, /data-weekday="1"/);
  assert.match(html, /data-weekday="2"/);
  assert.equal(ADVICE.test(html), false);
  assert.equal(html.includes("Keine Anlageberatung"), false);
});

function montaysSafe(dates) {
  return dates.flatMap((day) => [
    at(day, "08:00", 100),
    at(day, "15:30", 110)
  ]);
}

test("Die Anzeige nennt Uhrzeit, mittleren Verlauf, Tage und das Band", () => {
  const thin = { avg: 1.5, spread: 0.5, min: 1, max: 2, q1: null, q3: null, n: 2 };
  assert.equal(dayPathReadout("15:30", thin), "15:30 Uhr · +1,50 % · n = 2 Tage\nSpanne +1,00 % bis +2,00 %");
  const wide = { avg: 0.4, min: -3, max: 4, q1: -0.2, q3: 1.1, n: 18 };
  assert.match(dayPathReadout("08:30", wide), /08:30 Uhr · \+0,40 % · n = 18 Tage/);
  assert.match(dayPathReadout("08:30", wide), /Quartil −0,20 % bis \+1,10 %/);
  assert.equal(dayPathReadout("07:00", { avg: null, n: 0 }), "07:00 Uhr · —");
  assert.equal(ADVICE.test(dayPathReadout("15:30", wide)), false);
  const gap = JSON.parse(fs.readFileSync("scripts/fixtures/daypath-gap.json", "utf8"));
  const merged = mergeIntradayPaths([
    { id: "SPX.F", label: "Frankfurt", points: gap.frankfurt },
    { id: "SPX.SG", label: "Stuttgart", points: gap.stuttgart },
    { id: "SPCX", label: "US", points: gap.us }
  ]);
  const day = merged.days[0];
  const atSlot = (label) => day.points[DAYPATH_SLOTS.indexOf(label)];
  assert.equal(atSlot("08:00").avg, 0);
  assert.equal(atSlot("08:30").avg, 5);
  assert.equal(atSlot("09:00").avg, 15.5);
  assert.equal(atSlot("10:00").avg, null);
  assert.equal(atSlot("10:30").avg, 27.05);
  assert.equal(merged.coverage[DAYPATH_SLOTS.indexOf("08:30")].where, "Stuttgart");
  assert.equal(merged.coverage[DAYPATH_SLOTS.indexOf("07:00")].where, "leer");
  assert.equal(merged.coverage[DAYPATH_SLOTS.indexOf("10:30")].where, "US");
});

test("Ohne dayPaths oder bei neuer Fassung wird neu gerechnet", () => {
  const now = new Date("2026-11-09T18:00:00.000Z");
  const dayPaths = { schema: DAYPATH_SCHEMA, days: [{}, {}, {}, {}, {}] };
  const current = {
    asOf: "2026-11-09T08:00:00.000Z",
    symbols: {
      SPCX: { dayPaths },
      TSLA: { dayPaths },
      RKLB: { dayPaths }
    }
  };
  assert.equal(shouldSkipSeasonality(current, now, false), true);
  assert.equal(shouldSkipSeasonality(current, now, true), false);
  assert.equal(shouldSkipSeasonality({ ...current, asOf: "2026-11-08T18:00:00.000Z" }, now, false), false);
  const missing = structuredClone(current);
  delete missing.symbols.SPCX.dayPaths;
  assert.equal(dayPathsStale(missing), true);
  assert.equal(shouldSkipSeasonality(missing, now, false), false);
  const old = structuredClone(current);
  old.symbols.TSLA.dayPaths = { schema: DAYPATH_SCHEMA - 1, days: [{}, {}, {}, {}, {}] };
  assert.equal(shouldSkipSeasonality(old, now, false), false);
  assert.deepEqual(dayPathVenues({ earlySymbols: ["SPX.F", "SPX.DE"], eurSymbols: [] }).map((venue) => venue.symbol), [
    "SPX.F", "SPX.DE", "SPX.SG", "SPX.MU"
  ]);
  assert.deepEqual(dayPathVenues({ eurSymbols: ["TL0.DE", "TL0.F"] }).map((venue) => venue.label), [
    "Frankfurt", "Xetra", "Stuttgart", "München"
  ]);
});
