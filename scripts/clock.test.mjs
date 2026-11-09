import assert from "node:assert/strict";
import test from "node:test";
import { berlinClockText, usSessionWord } from "../js/logic.js";

test("Die Berliner Uhr zeigt Stunden, Minuten und Sekunden", () => {
  assert.equal(berlinClockText(new Date("2026-11-09T16:54:07.000Z")), "17:54:07");
  assert.equal(berlinClockText(new Date("2026-07-06T14:30:00.000Z")), "16:30:00");
  assert.match(berlinClockText(new Date()), /^\d{2}:\d{2}:\d{2}$/);
});

test("Der US-Hinweis kommt nur aus der New-York-Uhr", () => {
  assert.equal(usSessionWord(new Date("2026-11-09T13:00:00.000Z")), "vorbörslich");
  assert.equal(usSessionWord(new Date("2026-11-09T14:30:00.000Z")), "offen");
  assert.equal(usSessionWord(new Date("2026-11-09T21:00:00.000Z")), "nachbörslich");
  assert.equal(usSessionWord(new Date("2026-11-10T01:30:00.000Z")), "geschlossen");
  assert.equal(usSessionWord(new Date("2026-11-07T15:00:00.000Z")), "geschlossen");
});
