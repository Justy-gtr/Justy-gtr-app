import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { renderAnalyse } from "../js/analyse-view.js";
import { TICKERS } from "./fetch-prices.mjs";
import { MIN_CASES } from "../js/analysis.js";
import {
  EARLY_NOTE_DE,
  EARLY_NOTE_MIX,
  EARLY_NOTE_US,
  HOUR_SLOTS,
  SEASON_N_LEGEND,
  acceptBar,
  aggregateGrid,
  aggregateHours,
  aggregateWeekdays,
  berlinClock,
  buildWindows,
  chooseEarlyBars,
  hourSlot,
  isUsEarlyBar,
  keepSettledDaily,
  keepSettledHours,
  renderSeasonalityCard,
  seasonalityHeadline,
  summarizeWeek,
  upPercent
} from "../js/seasonality.js";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kaufsignal|verkaufssignal|kaufempfehlung)\b/i;

function rowText(html, weekday) {
  const start = html.indexOf(`data-weekday="${weekday}"`);
  const end = html.indexOf("wd-row", start + 10);
  return html.slice(start, end === -1 ? html.length : end);
}

function tagRow(html) {
  const start = html.indexOf("clock-split is-day");
  const end = html.indexOf("</div>", start);
  return html.slice(start, end === -1 ? html.length : end);
}

function tagCells(html) {
  return [...tagRow(html).matchAll(/class="clock-(?:cell|sum) is-day[^"]*"[^>]*>([^<]*)</g)].map((match) => match[1]);
}

test("Wochentage zählen nur die eigenen Schlüsse, Wochenende und Lücken bleiben draußen", () => {
  const days = aggregateWeekdays([
    { t: "2026-01-02", close: 100 },
    { t: "2026-01-05", close: 110 },
    { t: "2026-01-06", close: 110 },
    { t: "2026-01-07", close: 99 },
    { t: "2026-01-08", close: 100 },
    { t: "2026-01-09", close: 90 },
    { t: "2026-01-10", close: 50 },
    { t: "2026-02-20", close: 10 }
  ]);
  assert.equal(days.length, 5);
  assert.equal(days[0].n, 1);
  assert.equal(days[0].up, 1);
  assert.equal(days[0].avg, 10);
  assert.equal(days[0].med, 10);
  assert.equal(days[1].n, 1);
  assert.equal(days[1].up, 0);
  assert.equal(days[1].avg, 0);
  assert.equal(days[2].up, 0);
  assert.equal(days[2].avg, -10);
  assert.equal(days[3].up, 1);
  assert.equal(days[3].avg, 1.01);
  assert.equal(days[4].n, 1);
  assert.equal(days[4].up, 0);
  assert.equal(days[4].avg, -10);

  const paired = aggregateWeekdays([
    { t: "2026-01-02", close: 100 },
    { t: "2026-01-05", close: 110 },
    { t: "2026-01-09", close: 110 },
    { t: "2026-01-12", close: 107.8 }
  ]);
  assert.equal(paired[0].n, 2);
  assert.equal(paired[0].up, 1);
  assert.equal(paired[0].med, 4);

  const own = aggregateWeekdays([{ t: "2026-01-02", close: 100 }, { t: "2026-01-05", close: 110 }]);
  const other = aggregateWeekdays([{ t: "2026-01-02", close: 100 }, { t: "2026-01-05", close: 90 }]);
  assert.equal(own[0].up, 1);
  assert.equal(other[0].up, 0);
  assert.notEqual(own[0].avg, other[0].avg);
});

test("Ein Zeitstempel nimmt den Handelstag in New York, nicht Mitternacht in Berlin", () => {
  const days = aggregateWeekdays([
    { t: "2026-01-02T14:30:00.000Z", close: 100 },
    { t: "2026-01-05T00:00:00.000Z", close: 150 },
    { t: "2026-01-05T14:30:00.000Z", close: 110 }
  ]);
  assert.equal(days[0].n, 1);
  assert.equal(days[0].avg, 10);
  assert.equal(days[0].up, 1);
});

test("Berliner Stunden bleiben bei Sommer- und Winterzeit auf der echten Uhr", () => {
  assert.equal(HOUR_SLOTS[0], "08");
  assert.equal(HOUR_SLOTS.includes("15:00"), true);
  assert.equal(HOUR_SLOTS.at(-1), "21:30");
  const cash = HOUR_SLOTS.indexOf("15:30");
  assert.equal(hourSlot("2026-01-05T14:30:00.000Z"), "15:30");
  assert.equal(hourSlot("2026-01-05T20:30:00.000Z"), "21:30");
  assert.equal(hourSlot("2026-07-06T13:30:00.000Z"), "15:30");
  assert.equal(hourSlot("2026-07-06T19:30:00.000Z"), "21:30");
  assert.equal(berlinClock("2026-03-09T13:30:00.000Z").hour, 14);
  assert.equal(berlinClock("2026-03-09T13:30:00.000Z").minute, 30);
  assert.equal(hourSlot("2026-03-09T13:30:00.000Z"), null);
  assert.equal(hourSlot("2026-03-09T14:30:00.000Z"), "15:30");
  assert.equal(berlinClock("2026-10-26T13:30:00.000Z").hour, 14);
  assert.equal(hourSlot("2026-10-26T13:30:00.000Z"), null);
  assert.equal(hourSlot("2026-11-06T21:00:00.000Z"), null);
  assert.equal(hourSlot("2026-01-05T07:00:00.000Z"), "08");
  assert.equal(hourSlot("2026-07-06T06:00:00.000Z"), "08");
  assert.equal(hourSlot("2026-01-05T14:00:00.000Z"), null);
  assert.equal(hourSlot("2026-01-05T14:00:00.000Z", 30), "15:00");

  const hours = aggregateHours([
    { t: "2026-01-05T14:30:00.000Z", open: 100, close: 101 },
    { t: "2026-07-06T13:30:00.000Z", open: 100, close: 102 },
    { t: "2026-03-09T13:30:00.000Z", open: 100, close: 110 },
    { t: "2026-11-06T21:00:00.000Z", open: 100, close: 100 },
    { t: "2026-01-05T07:00:00.000Z", open: 100, close: 101, durationMin: 60 },
    { t: "2026-01-05T14:00:00.000Z", open: 100, close: 110, durationMin: 60 },
    { t: "2026-01-05T14:00:00.000Z", open: 100, close: 103, durationMin: 30 }
  ]);
  assert.equal(hours[cash].n, 2);
  assert.equal(hours[cash].up, 2);
  assert.equal(hours[HOUR_SLOTS.indexOf("08")].n, 1);
  assert.equal(hours[HOUR_SLOTS.indexOf("15:00")].n, 1);
  assert.equal(hours[HOUR_SLOTS.indexOf("15:00")].avg, 3);
  assert.equal(hours.reduce((sum, row) => sum + row.n, 0), 4);

  const grid = aggregateGrid([
    { t: "2026-01-05T14:30:00.000Z", open: 100, close: 101 },
    { t: "2026-03-09T13:30:00.000Z", open: 100, close: 110 }
  ]);
  assert.equal(grid[0][cash].n, 1);
  assert.equal(grid[0][cash].up, 1);
  assert.equal(grid.flat().reduce((sum, cell) => sum + cell.n, 0), 1);

  assert.equal(isUsEarlyBar("2026-01-05T13:00:00.000Z", 60), true);
  assert.equal(isUsEarlyBar("2026-07-06T12:00:00.000Z", 60), true);
  assert.equal(isUsEarlyBar("2026-01-05T14:00:00.000Z", 60), false);
  assert.equal(isUsEarlyBar("2026-01-05T14:00:00.000Z", 30), true);
  assert.equal(isUsEarlyBar("2026-03-09T13:00:00.000Z", 60), false);
  assert.equal(acceptBar("2026-03-09T13:00:00.000Z", 60, "de"), "14");
  assert.equal(acceptBar("2026-03-09T13:00:00.000Z", 60, "us"), null);
  assert.equal(acceptBar("2026-01-05T14:30:00.000Z", 60, "de"), null);
  assert.equal(acceptBar("2026-01-05T14:30:00.000Z", 60, "us"), "15:30");
});

test("Frühe Stunden nehmen eine Quelle und mischen sie nicht", () => {
  const de = [];
  const us = [];
  for (let day = 5; day <= 14; day += 1) {
    const stamp = `2026-01-${String(day).padStart(2, "0")}`;
    de.push({ t: `${stamp}T07:00:00.000Z`, open: 100, close: 101, durationMin: 60 });
    us.push({ t: `${stamp}T09:00:00.000Z`, open: 100, close: 99, durationMin: 60 });
    us.push({ t: `${stamp}T14:00:00.000Z`, open: 100, close: 101, durationMin: 30 });
  }
  for (let day = 5; day <= 8; day += 1) {
    de.push({ t: `2026-01-${String(day).padStart(2, "0")}T14:00:00.000Z`, open: 50, close: 55, durationMin: 30 });
  }
  const picked = chooseEarlyBars(de, us);
  assert.equal(picked.note, EARLY_NOTE_MIX);
  const hours = aggregateHours(picked.bars);
  assert.equal(hours[HOUR_SLOTS.indexOf("08")].n, 8);
  assert.equal(hours[HOUR_SLOTS.indexOf("08")].avg, 1);
  assert.equal(hours[HOUR_SLOTS.indexOf("10")].n, 8);
  assert.equal(hours[HOUR_SLOTS.indexOf("10")].avg, -1);
  assert.equal(hours[HOUR_SLOTS.indexOf("15:00")].avg, 1);
  assert.equal(hours[HOUR_SLOTS.indexOf("15:00")].n, 8);
  const onlyDe = chooseEarlyBars(de, []);
  assert.equal(onlyDe.note, EARLY_NOTE_DE);
  const onlyUs = chooseEarlyBars([], us);
  assert.equal(onlyUs.note, EARLY_NOTE_US);
});

test("Unter sieben Fällen gibt es keine Prozentzahl", () => {
  assert.equal(MIN_CASES, 7);
  assert.equal(upPercent({ n: 6, up: 6 }), null);
  assert.equal(upPercent({ n: 7, up: 6 }), 86);
  const thin = chooseEarlyBars([
    { t: "2026-01-05T07:00:00.000Z", open: 10, close: 11, durationMin: 60 },
    { t: "2026-01-06T07:00:00.000Z", open: 10, close: 11, durationMin: 60 },
    { t: "2026-01-07T07:00:00.000Z", open: 10, close: 11, durationMin: 60 }
  ], []);
  assert.equal(thin.note, EARLY_NOTE_DE);
  assert.equal(aggregateHours(thin.bars)[0].n, 3);

  const days = [
    { n: 6, up: 6, avg: 2, med: 2 },
    { n: 10, up: 8, avg: 0.4, med: 0.2 },
    { n: 10, up: 2, avg: -0.5, med: -0.4 },
    { n: 10, up: 5, avg: 0.1, med: 0 },
    { n: 10, up: 6, avg: 0.2, med: 0.1 }
  ];
  const hours = HOUR_SLOTS.map((_, index) => ({ n: index === 0 ? 6 : 20, up: 12, avg: index === 2 ? -0.2 : 0.15 }));
  const grid = Array.from({ length: 5 }, () => HOUR_SLOTS.map((_, index) => (
    index === 0 ? { n: 4, up: 3, avg: 3 } : { n: 8, up: 4, avg: 0.05 }
  )));
  const seasonality = {
    symbols: {
      TSLA: {
        name: "Tesla",
        earlyNote: EARLY_NOTE_DE,
        ranges: {
          all: { from: "2025-01-02", to: "2026-11-06", days, hours, grid },
          year: { from: "2025-11-06", to: "2026-11-06", days, hours, grid }
        }
      },
      SPCX: {
        name: "SpaceX",
        earlyNote: EARLY_NOTE_US,
        ranges: {
          all: {
            from: "2026-06-12",
            to: "2026-11-06",
            days: days.map(() => ({ n: 12, up: 3, avg: -0.8, med: -0.5 })),
            hours,
            grid
          },
          year: {
            from: "2026-06-12",
            to: "2026-11-06",
            days: days.map(() => ({ n: 12, up: 3, avg: -0.8, med: -0.5 })),
            hours,
            grid
          }
        }
      }
    }
  };
  const html = renderSeasonalityCard(seasonality, { symbol: "TSLA", name: "Tesla" }, "all");
  assert.match(html, /Wochentag &amp; Uhrzeit/);
  assert.match(html, /Dienstags stieg TSLA am häufigsten \(80 %, n = 10\)/);
  assert.match(html, /Mittwochs am seltensten \(20 %, n = 10\)/);
  assert.match(rowText(html, "Mo"), /keine Prozentzahl/);
  assert.equal(/%/.test(rowText(html, "Mo")), false);
  assert.match(rowText(html, "Di"), /80 % der Tage gestiegen/);
  assert.match(html, /n = 6, keine Prozentzahl/);
  assert.match(html, /Vergangenheit, keine Vorhersage/);
  assert.match(html, new RegExp(EARLY_NOTE_DE));
  assert.match(html, /data-hour="08"/);
  assert.match(html, /data-hour="15:00"/);
  assert.match(html, /data-hour="15:30"/);
  assert.match(html, /Zahl: Anteil steigender Stunden/);
  assert.match(html, /Tag: Anteil steigender Tage/);
  assert.equal(/Keine Anlageberatung/.test(html), false);
  assert.match(html, /clock-cell[^>]*>50%</);
  assert.match(html, /clock-cell is-quiet[^>]*>–</);
  assert.ok(html.indexOf('data-hour="21:30"') < html.indexOf('data-row="tag"'));
  assert.ok(html.indexOf('data-row="tag"') < html.indexOf("chart-legend"));
  assert.deepEqual(tagCells(html), ["–", "80%", "20%", "50%", "60%", "59 %"]);
  assert.match(tagRow(html), /clock-name is-day/);
  assert.match(tagRow(html), /background:rgba\(125, 222, 192/);
  assert.match(tagRow(html), /background:rgba\(255, 139, 152/);
  assert.equal(html.includes("Vorbörse 10:00"), false);
  assert.match(html, /–/);
  assert.match(html, new RegExp(SEASON_N_LEGEND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /dieser Aktie/);
  assert.equal(ADVICE.test(html), false);
  assert.match(html, /season-card" aria-label="Wochentag und Uhrzeit" data-season="all"/);
  assert.match(html, /aria-pressed="true">Alles/);
  const year = renderSeasonalityCard(seasonality, { symbol: "TSLA" }, "year");
  assert.match(year, /data-season="year"/);
  assert.match(year, /1 Jahr/);
  const spcx = renderSeasonalityCard(seasonality, { symbol: "SPCX", name: "SpaceX" }, "all");
  assert.match(spcx, /Kaum Unterschied zwischen den Tagen/);
  assert.equal(spcx.includes("TSLA"), false);
  assert.equal(spcx.includes("1 Jahr"), false);
  assert.equal(ADVICE.test(spcx), false);
  const quiet = seasonalityHeadline("TSLA", {
    days: [
      { n: 100, up: 50, avg: 0.1 },
      { n: 100, up: 51, avg: 0.1 },
      { n: 100, up: 49, avg: 0 },
      { n: 100, up: 50, avg: 0 },
      { n: 100, up: 52, avg: 0.2 }
    ]
  });
  assert.equal(quiet, "Kaum Unterschied zwischen den Tagen.");
  assert.equal(ADVICE.test(quiet), false);
});

test("Die Tag-Zeile zählt steigende Tage im selben Zeitraum wie die Balken", () => {
  assert.deepEqual(summarizeWeek([
    { n: 10, up: 6, avg: 1.5 },
    { n: 10, up: 4, avg: -0.5 }
  ]), { n: 20, up: 10, avg: 0.5 });
  assert.deepEqual(summarizeWeek([
    { n: 6, up: 6, avg: 2 },
    { n: 0, up: 0, avg: null },
    { n: 4, up: 9, avg: 1 }
  ]), { n: 6, up: 6, avg: 2 });
  assert.equal(upPercent(summarizeWeek([
    { n: 6, up: 6, avg: 2, med: 2 },
    { n: 10, up: 8, avg: 0.4, med: 0.2 },
    { n: 10, up: 2, avg: -0.5, med: -0.4 },
    { n: 10, up: 5, avg: 0.1, med: 0 },
    { n: 10, up: 6, avg: 0.2, med: 0.1 }
  ])), 59);

  const hours = HOUR_SLOTS.map(() => ({ n: 0, up: 0, avg: null }));
  const grid = Array.from({ length: 5 }, () => HOUR_SLOTS.map(() => ({ n: 0, up: 0, avg: null })));
  const allDays = [0, 1, 2, 3, 4].map(() => ({ n: 10, up: 8, avg: 1, med: 1 }));
  const yearDays = [
    { n: 8, up: 2, avg: -1, med: -1 },
    { n: 8, up: 2, avg: -1, med: -1 },
    { n: 8, up: 2, avg: -1, med: -1 },
    { n: 8, up: 2, avg: -1, med: -1 },
    { n: 5, up: 5, avg: 3, med: 3 }
  ];
  const pack = {
    symbols: {
      SPCX: {
        name: "SpaceX",
        ranges: {
          all: { from: "2024-01-02", to: "2026-11-06", days: allDays, hours, grid },
          year: { from: "2025-11-06", to: "2026-11-06", days: yearDays, hours, grid }
        }
      }
    }
  };
  const all = renderSeasonalityCard(pack, { symbol: "SPCX" }, "all");
  const year = renderSeasonalityCard(pack, { symbol: "SPCX" }, "year");
  assert.deepEqual(tagCells(all), ["80%", "80%", "80%", "80%", "80%", "80 %"]);
  assert.deepEqual(tagCells(year), ["25%", "25%", "25%", "25%", "–", "35 %"]);
  assert.match(all, /Tag: Anteil steigender Tage/);
  assert.match(tagRow(all), /ganzer Tag, Schluss zu Schluss, 80 % der Tage gestiegen/);
  assert.match(year, /data-season="year"/);
  assert.equal(/Keine Anlageberatung/.test(all + year), false);
  assert.equal(ADVICE.test(all + year), false);
});

test("Ein Jahr schneidet alte Tage ab und mischt keine zweite Aktie hinein", () => {
  const daily = [
    { t: "2024-11-01", close: 100 },
    { t: "2024-11-04", close: 200 },
    { t: "2026-06-01", close: 200 },
    { t: "2026-06-02", close: 210 }
  ];
  const windows = buildWindows(daily, [], []);
  assert.equal(windows.all.days[0].n, 1);
  assert.equal(windows.all.days[0].avg, 100);
  assert.equal(windows.year.days[0].n, 0);
  assert.equal(windows.year.days[1].n, 1);
  assert.equal(windows.year.from, "2026-06-01");
});

test("Die offene New-York-Sitzung zählt noch nicht als Tag", () => {
  const now = new Date("2026-11-09T15:00:00.000Z");
  const kept = keepSettledDaily([
    { t: "2026-11-06T14:30:00.000Z", close: 10 },
    { t: "2026-11-09T14:30:00.000Z", close: 12 }
  ], now);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].close, 10);
  const later = keepSettledDaily([
    { t: "2026-11-09T14:30:00.000Z", close: 12 }
  ], new Date("2026-11-09T21:30:00.000Z"));
  assert.equal(later.length, 1);
});

test("Die Karte steht unter dem Muster und die Spanne lässt sie in Ruhe", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const seasonality = JSON.parse(fs.readFileSync("data/seasonality.json", "utf8"));
  const ui = { analyseSymbol: "TSLA", analyseRange: "15 Min", analyseSeason: "all", live: false };
  const html = renderAnalyse({ prices, seasonality }, ui);
  const other = renderAnalyse({ prices, seasonality }, { ...ui, analyseRange: "1J" });
  const card = (value) => value.slice(value.indexOf("season-card"), value.indexOf("Warum diese Bewegung"));
  assert.ok(html.indexOf("Muster") < html.indexOf("Wochentag"));
  assert.ok(html.indexOf("Wochentag") < html.indexOf("Warum diese Bewegung"));
  assert.equal(card(html), card(other));
  assert.match(html, /<p class="scrub"><\/p>/);
  assert.equal(ADVICE.test(html), false);
  assert.equal(/\b(kaufen|verkaufen)\b/i.test(html), false);
  assert.equal(/Kaufsignal/i.test(fs.readFileSync("data/seasonality.json", "utf8")), false);
  assert.equal(ADVICE.test(fs.readFileSync("js/seasonality.js", "utf8")), false);
  for (const symbol of TICKERS.map((spec) => spec.symbol)) {
    const pack = seasonality.symbols[symbol];
    for (const key of ["all", "year"]) {
      const line = seasonalityHeadline(symbol, pack.ranges[key]);
      assert.equal(ADVICE.test(line), false, line);
      assert.equal(/Kaufsignal/i.test(line), false);
      const view = renderSeasonalityCard(seasonality, { symbol, name: pack.name }, key);
      assert.equal(ADVICE.test(view), false, symbol);
      assert.equal(/Keine Anlageberatung/.test(view), false, symbol);
      assert.match(view, /Vergangenheit, keine Vorhersage/);
      assert.match(view, /nicht den ganzen Markt/);
      assert.match(view, /Tag: Anteil steigender Tage/);
      assert.ok(view.indexOf('data-hour="21:30"') < view.indexOf('data-row="tag"'), symbol);
      const expected = pack.ranges[key].days.map((row) => {
        const share = upPercent(row);
        return share == null ? "–" : `${share}%`;
      });
      const weekShare = upPercent(summarizeWeek(pack.ranges[key].days));
      expected.push(weekShare == null ? "–" : `${weekShare} %`);
      assert.deepEqual(tagCells(view), expected, `${symbol} ${key}`);
    }
  }
  const tsla = renderSeasonalityCard(seasonality, { symbol: "TSLA" }, "all");
  const spcx = renderSeasonalityCard(seasonality, { symbol: "SPCX" }, "all");
  const rklb = renderSeasonalityCard(seasonality, { symbol: "RKLB" }, "all");
  assert.match(tsla, /TSLA/);
  assert.equal(spcx.includes("TSLA"), false);
  assert.match(tsla, /vor 15:30: Handel in Deutschland/);
  assert.match(rklb, /vor 15:30: Handel in Deutschland/);
  assert.match(spcx, /vor 15:30: Handel in Deutschland/);
  assert.match(JSON.stringify(seasonality.sources), /quote\/SPX\.F/);
  assert.equal(tsla.includes("Vorbörse 10:00"), false);
  assert.equal(spcx.includes("Vorbörse 10:00"), false);
  const slot = (symbol, label) => seasonality.symbols[symbol].ranges.all.hours[HOUR_SLOTS.indexOf(label)];
  assert.ok(slot("TSLA", "08").n >= MIN_CASES);
  assert.ok(slot("TSLA", "15:00").n >= MIN_CASES);
  assert.ok(slot("TSLA", "15:30").n >= MIN_CASES);
  assert.ok(slot("RKLB", "08").n >= MIN_CASES);
  assert.ok(slot("SPCX", "08").n >= MIN_CASES);
  assert.ok(slot("SPCX", "09").n >= MIN_CASES);
  assert.ok(slot("SPCX", "10").n >= MIN_CASES);
  assert.ok(slot("SPCX", "15:00").n >= MIN_CASES);
  assert.match(spcx, /data-hour="08"/);
  assert.match(spcx, /–/);
  const mrvlCard = renderSeasonalityCard(seasonality, { symbol: "MRVL" }, "all");
  assert.match(mrvlCard, /MRVL/);
  assert.match(mrvlCard, /vor 15:30: Handel in Deutschland/);
  assert.equal(ADVICE.test(mrvlCard), false);
  assert.ok(slot("MRVL", "08").n >= MIN_CASES);
  assert.ok(slot("MRVL", "15:30").n >= MIN_CASES);
  assert.match(JSON.stringify(seasonality.sources), /quote\/9MW\.(?:DE|F)/);
  const mrvlPaths = seasonality.symbols.MRVL.dayPaths;
  assert.equal(mrvlPaths.days.length, 5);
  assert.ok(mrvlPaths.days.some((day) => day.n >= MIN_CASES));
});
