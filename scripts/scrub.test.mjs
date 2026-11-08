import assert from "node:assert/strict";
import test from "node:test";
import { scrubDelta } from "../js/logic.js";

const ADVICE = /\b(kaufen|verkaufen|kauft|verkauft|kauf|verkauf)\b/i;

test("Ziehen: Prozent gegen den ersten sichtbaren Punkt, deutsch mit Vorzeichen", () => {
  assert.deepEqual(scrubDelta(100, 101.23), { text: "+1,23 %", direction: "up" });
  assert.deepEqual(scrubDelta(100, 99.55), { text: "−0,45 %", direction: "down" });
  assert.equal(scrubDelta(100, 99.55).text.includes("−"), true);
  assert.equal(scrubDelta(100, 99.55).text.includes("-"), false);
  assert.deepEqual(scrubDelta(120.8, 120.8), { text: "0,00 %", direction: "flat" });
  assert.deepEqual(scrubDelta(100, 100.004), { text: "0,00 %", direction: "flat" });
  assert.deepEqual(scrubDelta(100, 100.02), { text: "+0,02 %", direction: "up" });
  assert.deepEqual(scrubDelta(100, 99.98), { text: "−0,02 %", direction: "down" });
  assert.equal(scrubDelta(0, 10), null);
  assert.equal(scrubDelta(null, 10), null);
  for (const sample of [scrubDelta(80, 95), scrubDelta(80, 70), scrubDelta(80, 80)]) {
    assert.equal(ADVICE.test(sample.text), false);
  }
});
