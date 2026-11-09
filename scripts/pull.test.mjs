import assert from "node:assert/strict";
import test from "node:test";
import { PULL_THRESHOLD, pullDecision } from "../js/pull.js";

test("Ziehen ab etwa 70 Pixel löst aus, kürzer nicht", () => {
  assert.equal(PULL_THRESHOLD, 70);
  const armed = pullDecision({ dy: 70, locked: "v" });
  assert.equal(armed.trigger, true);
  assert.equal(armed.pulling, true);
  const short = pullDecision({ dy: 69, locked: "v" });
  assert.equal(short.trigger, false);
  assert.equal(short.distance, 69);
});

test("Runterscrollen und seitliches Blättern lösen nicht aus", () => {
  assert.equal(pullDecision({ scrollTop: 40, dy: 120 }).trigger, false);
  assert.equal(pullDecision({ scrollTop: 40, dy: 120 }).locked, "scroll");
  const horizontal = pullDecision({ dx: 30, dy: 8 });
  assert.equal(horizontal.locked, "h");
  assert.equal(horizontal.trigger, false);
  const follow = pullDecision({ dx: 40, dy: 90, locked: "h" });
  assert.equal(follow.trigger, false);
});

test("Nach oben wischen bleibt Scrollen", () => {
  const up = pullDecision({ dx: 0, dy: -40 });
  assert.equal(up.locked, "v");
  assert.equal(up.pulling, false);
  assert.equal(up.trigger, false);
});
