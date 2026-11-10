import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { orderCalendarEvents } from "../js/logic.js";
import { renderKalender } from "../js/views.js";

function event(id, date, time, extra = {}) {
  return {
    id,
    title: id,
    date,
    time,
    timezone: "Europe/Berlin",
    kind: "company",
    ...extra
  };
}

test("Kommendes oben, Vorbei darunter, älter als 24 Stunden weg", () => {
  const now = new Date("2026-11-10T12:00:00+01:00");
  const events = [
    event("old", "2026-11-08", "10:00"),
    event("yesterday-late", "2026-11-09", "20:00"),
    event("yesterday-early", "2026-11-09", "08:00"),
    event("today-morning", "2026-11-10", "09:00"),
    event("today-later", "2026-11-10", "18:00"),
    event("tomorrow", "2026-11-11", "09:00"),
    event("all-day-today", "2026-11-10", null),
    event("ongoing", "2026-11-09", "18:00", { end: "2026-11-10T20:00:00+01:00" }),
    event("ended-recent", "2026-11-10", "08:00", { end: "2026-11-10T11:00:00+01:00" }),
    event("ended-old", "2026-11-08", "08:00", { end: "2026-11-09T10:00:00+01:00" }),
    event("boundary", "2026-11-09", "12:00"),
    event("boundary-plus", "2026-11-09", "11:59"),
    event("long-ended-recently", "2026-11-08", "12:00", { end: "2026-11-10T10:00:00+01:00" }),
    event("no-end-old", "2026-11-08", "12:00")
  ];
  const ids = orderCalendarEvents(events, now).map((item) => item.id);
  assert.deepEqual(ids, [
    "ongoing",
    "all-day-today",
    "today-later",
    "tomorrow",
    "ended-recent",
    "long-ended-recently",
    "today-morning",
    "yesterday-late",
    "boundary"
  ]);
  for (const hidden of ["old", "yesterday-early", "ended-old", "boundary-plus", "no-end-old"]) {
    assert.equal(ids.includes(hidden), false, hidden);
  }
});

test("Genau 24 Stunden bleibt, eine Millisekunde darüber fällt weg", () => {
  const start = new Date("2026-11-09T12:00:00+01:00");
  const keep = orderCalendarEvents([event("edge", "2026-11-09", "12:00")], new Date(start.getTime() + 24 * 60 * 60 * 1000));
  assert.deepEqual(keep.map((item) => item.id), ["edge"]);
  const drop = orderCalendarEvents([event("edge", "2026-11-09", "12:00")], new Date(start.getTime() + 24 * 60 * 60 * 1000 + 1));
  assert.deepEqual(drop, []);
  const endKeep = orderCalendarEvents(
    [event("with-end", "2026-11-01", "09:00", { end: "2026-11-09T12:00:00+01:00" })],
    new Date(start.getTime() + 24 * 60 * 60 * 1000)
  );
  assert.deepEqual(endKeep.map((item) => item.id), ["with-end"]);
  const endDrop = orderCalendarEvents(
    [event("with-end", "2026-11-01", "09:00", { end: "2026-11-09T12:00:00+01:00" })],
    new Date(start.getTime() + 24 * 60 * 60 * 1000 + 1)
  );
  assert.deepEqual(endDrop, []);
});

test("Ein Endtag gilt bis Mitternacht, die Zone des Termins zählt", () => {
  const now = new Date("2026-11-10T18:00:00+01:00");
  const throughToday = orderCalendarEvents([
    event("span", "2026-11-08", "09:00", { end: "2026-11-10" })
  ], now);
  assert.deepEqual(throughToday.map((item) => item.id), ["span"]);
  const endedYesterday = orderCalendarEvents([
    event("span", "2026-11-08", "09:00", { end: "2026-11-08" })
  ], now);
  assert.deepEqual(endedYesterday, []);
  const ny = event("ny", "2026-11-10", "06:00", { timezone: "America/New_York" });
  const ids = orderCalendarEvents(
    [ny, event("berlin", "2026-11-10", "10:00")],
    new Date("2026-11-10T11:00:00+01:00")
  ).map((item) => item.id);
  assert.deepEqual(ids, ["ny", "berlin"]);
});

test("Die Kalenderseite rendert diese Reihenfolge und blendet Altes aus", () => {
  const now = new Date("2026-11-10T12:00:00+01:00");
  const events = [
    event("past-old", "2026-11-01", "10:00"),
    event("past-new", "2026-11-10", "08:00"),
    event("soon", "2026-11-10", "15:00"),
    event("later", "2026-11-12", "09:00"),
    event("extern", "2026-11-10", "16:00", { kind: "external" }),
    event("extern-old", "2026-10-01", "09:00", { kind: "external" })
  ];
  const company = renderKalender({ calendar: { events } }, { calKind: "company" }, now);
  const companyIds = [...company.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(companyIds, ["soon", "later", "past-new"]);
  assert.equal(company.includes("past-old"), false);
  assert.equal(companyIds.includes("extern"), false);
  const external = renderKalender({ calendar: { events } }, { calKind: "external" }, now);
  const externalIds = [...external.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(externalIds, ["extern"]);
  const file = JSON.parse(fs.readFileSync("data/calendar.json", "utf8"));
  const liveNow = new Date("2026-11-10T02:00:00+01:00");
  const html = renderKalender({ calendar: file }, { calKind: "company" }, liveNow);
  const ids = [...html.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]);
  const expected = orderCalendarEvents(file.events.filter((item) => item.kind === "company"), liveNow).map((item) => item.id);
  assert.deepEqual(ids, expected);
  assert.ok(ids.length > 0);
  const byId = new Map(file.events.map((item) => [item.id, item]));
  const first = byId.get(ids[0]);
  assert.ok(first.date >= "2026-11-10" || first.date === "2026-11-09");
  for (const id of ids) {
    const item = byId.get(id);
    assert.notEqual(item.date < "2026-11-08", true);
  }
});
