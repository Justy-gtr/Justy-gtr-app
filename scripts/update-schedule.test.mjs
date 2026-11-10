import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { detailContent, renderMehr } from "../js/views.js";
import {
  SCHEDULES,
  formatLastUpdate,
  formatNextUpdate,
  nextUpdate,
  sourceUpdates
} from "../js/update-schedule.js";

const BANNED = /kaufen|verkaufen|empfehlung|kaufsignal|anlageberatung/i;

function at(iso) {
  return new Date(iso);
}

test("Kurse: letzter Slot am Freitagabend, danach das Wochenende", () => {
  assert.equal(nextUpdate("prices", at("2026-11-06T21:14:00Z")).toISOString(), "2026-11-06T21:15:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-06T21:15:00Z")).toISOString(), "2026-11-07T08:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-06T21:16:00Z")).toISOString(), "2026-11-07T08:00:00.000Z");
  assert.equal(
    formatNextUpdate(nextUpdate("prices", at("2026-11-06T21:14:00Z")), at("2026-11-06T21:14:00Z")),
    "nächste: 22:15 (in 1 Min)"
  );
});

test("Kurse am Wochenende nur 09:00, 14:00 und 20:00, Montag wieder 05:00", () => {
  assert.equal(nextUpdate("prices", at("2026-11-07T07:30:00Z")).toISOString(), "2026-11-07T08:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-07T08:01:00Z")).toISOString(), "2026-11-07T13:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-07T09:00:00Z")).toISOString(), "2026-11-07T13:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-07T18:30:00Z")).toISOString(), "2026-11-07T19:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-08T19:01:00Z")).toISOString(), "2026-11-09T04:00:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-11-08T19:30:00Z")).toISOString(), "2026-11-09T04:00:00.000Z");
  assert.equal(
    formatNextUpdate(nextUpdate("prices", at("2026-11-07T09:00:00Z")), at("2026-11-07T09:00:00Z")),
    "nächste: 14:00 (in 4 Std)"
  );
});

test("Kurse bleiben an Berlin gebunden, auch in der Sommerzeit", () => {
  assert.equal(nextUpdate("prices", at("2026-07-10T20:14:00Z")).toISOString(), "2026-07-10T20:15:00.000Z");
  assert.equal(nextUpdate("prices", at("2026-07-10T20:16:00Z")).toISOString(), "2026-07-11T07:00:00.000Z");
  assert.equal(formatLastUpdate("2026-07-10T14:31:00Z", at("2026-07-10T14:34:00Z")), "vor 3 Min · 16:31");
});

test("Werktags alle 5 Minuten, die nächste Uhr steht in Berlin", () => {
  const now = at("2026-11-10T15:32:00Z");
  const next = nextUpdate("prices", now);
  assert.equal(next.toISOString(), "2026-11-10T15:35:00.000Z");
  assert.equal(formatNextUpdate(next, now), "nächste: 16:35 (in 3 Min)");
  assert.equal(formatLastUpdate("2026-11-10T15:31:00Z", at("2026-11-10T15:34:00Z")), "vor 3 Min · 16:31");
  assert.equal(formatLastUpdate("2026-11-09", at("2026-11-10T15:34:00Z")), "gestern");
  assert.equal(formatLastUpdate("2026-11-10", at("2026-11-10T15:34:00Z")), "heute");
  assert.equal(formatLastUpdate("2026-11-07", at("2026-11-10T15:34:00Z")), "vor 3 Tagen");
});

test("Stimmung: Lücken am Vormittag, 20-Minuten-Takt, Freitagabend und Wochenende", () => {
  assert.equal(nextUpdate("sentiment", at("2026-11-10T09:31:00Z")).toISOString(), "2026-11-10T09:50:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-10T09:50:00Z")).toISOString(), "2026-11-10T10:10:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-10T11:00:00Z")).toISOString(), "2026-11-10T11:10:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-10T11:10:00Z")).toISOString(), "2026-11-10T11:30:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-10T12:50:00Z")).toISOString(), "2026-11-10T13:10:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-10T13:11:00Z")).toISOString(), "2026-11-10T13:20:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-06T15:39:00Z")).toISOString(), "2026-11-06T15:40:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-06T15:41:00Z")).toISOString(), "2026-11-09T07:00:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-07T11:00:00Z")).toISOString(), "2026-11-09T07:00:00.000Z");
  assert.equal(nextUpdate("sentiment", at("2026-11-08T15:00:00Z")).toISOString(), "2026-11-09T07:00:00.000Z");
});

test("Datenupdate läuft auch am Wochenende, Kursalarm endet freitagabends", () => {
  assert.equal(nextUpdate("content", at("2026-11-08T03:30:00Z")).toISOString(), "2026-11-08T04:00:00.000Z");
  assert.equal(nextUpdate("content", at("2026-11-07T21:30:00Z")).toISOString(), "2026-11-08T04:00:00.000Z");
  assert.equal(nextUpdate("content", at("2026-11-08T21:30:00Z")).toISOString(), "2026-11-09T04:00:00.000Z");
  assert.equal(nextUpdate("alarm", at("2026-11-06T20:44:00Z")).toISOString(), "2026-11-06T20:45:00.000Z");
  assert.equal(nextUpdate("alarm", at("2026-11-06T20:45:00Z")).toISOString(), "2026-11-09T14:00:00.000Z");
  assert.equal(nextUpdate("alarm", at("2026-11-07T12:00:00Z")).toISOString(), "2026-11-09T14:00:00.000Z");
});

test("Wochenrückblick ist Sonntag 18:00, danach der nächste Sonntag", () => {
  assert.equal(nextUpdate("weekly", at("2026-11-08T16:30:00Z")).toISOString(), "2026-11-08T17:00:00.000Z");
  assert.equal(nextUpdate("weekly", at("2026-11-08T17:00:00Z")).toISOString(), "2026-11-15T17:00:00.000Z");
  assert.equal(nextUpdate("weekly", at("2026-11-04T15:00:00Z")).toISOString(), "2026-11-08T17:00:00.000Z");
  assert.match(formatNextUpdate(nextUpdate("weekly", at("2026-11-04T15:00:00Z")), at("2026-11-04T15:00:00Z")), /^nächste: So 18:00 \(in \d+ Tagen\)$/);
});

test("Fahrplan steht nur im einen Modul und nennt die Fenster", () => {
  const text = SCHEDULES.map((item) => `${item.label} ${item.lines.join(" ")}`).join("\n");
  assert.match(text, /Kurse/);
  assert.match(text, /05:00 bis 22:15/);
  assert.match(text, /09:00, 14:00 und 20:00/);
  assert.match(text, /Stimmung-Lampe/);
  assert.match(text, /Wochenende keine/);
  assert.match(text, /11:10–13:50 alle 20 Min/);
  assert.match(text, /14:20–16:40 alle 5 Min/);
  assert.match(text, /Datenupdate/);
  assert.match(text, /22:00/);
  assert.match(text, /Kursalarm/);
  assert.match(text, /15:00 bis 21:45/);
  assert.match(text, /Wochenrückblick/);
  assert.match(text, /Sonntag 18:00/);
  assert.equal(BANNED.test(text), false);
});

test("Zeitstempel kommen aus den Dateien, ohne einen zu erfinden", () => {
  const now = at("2026-11-10T15:34:00Z");
  const rows = sourceUpdates({
    prices: { asOf: "2026-11-10T15:31:00Z" },
    sentiment: { updatedAt: "2026-11-10T15:20:00+01:00" },
    germany: { asOf: "2026-11-10T15:31:30Z" },
    alerts: { alerts: [{ timestamp: "2026-11-10T08:00:00Z" }, { timestamp: "2026-11-10T12:00:00Z" }] },
    weekly: { weekOf: "2026-11-02" },
    calendar: { events: [] },
    moonshots: { asOf: "2026-11-09T06:00:00+01:00", fx: { asOf: "2026-11-10T14:52:00+01:00" } }
  }, now);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.text]));
  assert.equal(byId.prices, "vor 3 Min · 16:31");
  assert.equal(byId.sentiment, "vor 1 Std · 15:20");
  assert.equal(byId.germany, "vor 2 Min · 16:31");
  assert.equal(byId.alerts, "vor 3 Std · 13:00");
  assert.equal(byId.moonshots, "vor 1 Std · 14:52");
  assert.equal(byId.weekly, undefined);
  assert.equal(byId.calendar, undefined);
  assert.equal(BANNED.test(JSON.stringify(rows)), false);
});

test("Mehr zeigt den Knopf, die Tafel die drei Blöcke", () => {
  const menu = renderMehr();
  assert.match(menu, /data-action="open-updates"/);
  assert.match(menu, /Aktualisierungen/);
  assert.match(menu, /class="eyebrow">Mehr</);
  const now = at("2026-11-10T15:32:00Z");
  const detail = detailContent("open-updates", {}, {
    data: {
      prices: { asOf: "2026-11-10T15:31:00Z" },
      sentiment: { updatedAt: "2026-11-10T15:27:00+01:00" }
    },
    ui: {},
    store: {},
    now
  });
  assert.equal(detail.kind, "updates");
  assert.equal(detail.title, "Aktualisierungen");
  assert.match(detail.html, /Zuletzt aktualisiert/);
  assert.match(detail.html, /vor 1 Min · 16:31/);
  assert.match(detail.html, /Nächste Aktualisierung/);
  assert.match(detail.html, /nächste: 16:35 \(in 3 Min\)/);
  assert.match(detail.html, /Fahrplan/);
  assert.match(detail.html, /einmal pro Minute/);
  assert.match(detail.html, /zwei Minuten im Hintergrund/);
  assert.match(detail.html, /nach unten/);
  assert.equal(detail.html.includes("Keine Anlageberatung"), false);
  assert.equal(BANNED.test(detail.html), false);
  const sw = fs.readFileSync("sw.js", "utf8");
  assert.match(sw, /jgtr-v38/);
  assert.match(sw, /js\/update-schedule\.js/);
});
