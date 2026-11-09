import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { detailContent } from "../js/views.js";
import {
  formatLaunchWhen,
  planGap,
  priceMove,
  productionCaption,
  productionValue,
  weekCurve
} from "../js/logic.js";

const production = JSON.parse(fs.readFileSync("data/production.json", "utf8"));
const weekly = JSON.parse(fs.readFileSync("data/weekly.json", "utf8"));
const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
const calendar = JSON.parse(fs.readFileSync("data/calendar.json", "utf8"));

function series(id) {
  return production.series.find((item) => item.id === id);
}

test("Starship-Karte formatiert Berlin und zählt aus dem Ziel", () => {
  assert.equal(formatLaunchWhen(production.nextLaunch.target), "Fr 13.11. · 23:45 Berlin");
});

test("Produktionszeilen kommen aus den Punkten, nicht aus festem Text", () => {
  assert.equal(productionValue(series("starlink_users"), production.asOf).text, "13,6");
  assert.equal(productionValue(series("starlink_users"), production.asOf).unit, "Mio.");
  assert.equal(productionCaption(series("starlink_users")), "+89 % zum Vorjahr · 7,2 → 13,6 Mio.");
  assert.equal(productionCaption(series("spacex_launches_2026")), "kumuliert bis Ende Q3 · Vorjahr gleiche Zeit 128");
  assert.equal(productionCaption(series("starship_launches")), "2023–2026: 2 · 4 · 5 · 3 · Flight 12–14 bisher");
  assert.equal(productionValue(series("starship_launches"), production.asOf).unit, "in 2026");
  assert.equal(productionCaption(series("tesla_deliveries")), "+1,3 % zum Vorquartal · Q2 war 480.126");
  assert.equal(productionValue(series("tesla_deliveries"), production.asOf).text, "486.532");
  assert.equal(productionValue(series("tesla_deliveries"), production.asOf).unit, "");
});

test("Plan nur bei einer offiziellen Zahl, nicht bei einer Schätzung", () => {
  assert.equal(planGap(series("starship_launches"), production.asOf), "Plan 2026: 25 · bisher 3");
  assert.equal(series("starship_launches").plan[0].source.url, "https://www.faa.gov/space/stakeholder_engagement/spacex_starship");
  assert.equal(planGap(series("tesla_deliveries"), production.asOf), "");
  assert.equal(series("tesla_deliveries").plan, undefined);
  assert.equal(planGap(series("starlink_users"), production.asOf), "");
  assert.equal(planGap(series("spacex_launches_2026"), production.asOf), "");
});

test("Wochenkurve nimmt die Stundenreihe", () => {
  const spcx = prices.tickers.find((item) => item.symbol === "SPCX");
  const curve = weekCurve(spcx.history, weekly.sessions);
  const days = [...new Set(curve.map((point) => point.day))];
  assert.deepEqual(days, ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  const hourly = new Set((spcx.history["1H"] || []).map((point) => point.t));
  assert.ok(curve.length >= 40, `zu wenig Stunden: ${curve.length}`);
  assert.ok(curve.every((point) => hourly.has(point.t)));
  const thursday = curve.filter((point) => point.day === "2026-11-05");
  assert.ok(thursday.length < 30, "Donnerstag darf nicht die 5-Minuten-Reihe sein");
  assert.equal(curve.some((point) => point.day === "2026-11-01"), false);
  for (const row of weekly.symbols) {
    const move = priceMove(row.startEur, row.endEur);
    assert.equal(Math.round(move * 10) / 10, row.changePct);
  }
});

test("Beide Ansichten bleiben ohne Kauf- und Beratungssätze", () => {
  const ctx = { data: { production, weekly, prices, calendar }, ui: {}, store: {} };
  const prod = detailContent("open-production", {}, ctx).html;
  const week = detailContent("open-weekly", {}, ctx).html;
  assert.match(prod, /Was die Firmen wirklich schaffen/);
  assert.match(prod, /data-countdown/);
  assert.match(prod, /data-part="days"/);
  assert.match(prod, /Plan 2026: 25/);
  assert.equal(prod.includes("461.000"), false);
  assert.equal(prod.includes("Plan Q3"), false);
  assert.match(prod, /Ist/);
  assert.match(prod, /Quellen/);
  assert.equal(prod.includes("kaufen"), false);
  assert.equal(prod.includes("verkaufen"), false);
  assert.equal(prod.includes("Anlageberatung"), false);
  assert.match(week, /Woche in %/);
  assert.match(week, /5 Handelstage/);
  assert.match(week, /Was passiert ist/);
  assert.match(week, /Nächste Woche/);
  assert.match(week, /Mehr lesen/);
  assert.match(week, /data-chart="week"/);
  assert.match(week, /ESCAPADE Gold/);
  assert.equal(week.includes("kaufen"), false);
  assert.equal(week.includes("Anlageberatung"), false);
});

test("Wochenend-Cron trifft nur die drei Berliner Slots in beiden Zonen", () => {
  const yml = fs.readFileSync(".github/workflows/prices.yml", "utf8");
  assert.match(yml, /0 7,8,12,13,18,19 \* \* 0,6/);
  assert.equal(yml.includes("30 4,5,6,7,8,9,10 * * 0,6"), false);
  assert.match(yml, /\*\/5 3-21 \* \* 1-5/);
});
