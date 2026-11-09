import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BACKOFF_SECONDS, PUSH_ATTEMPTS, backoffSeconds } from "./push-main.mjs";

test("Push wartet 5, 15 und 30 Sekunden und hört nach vier Versuchen auf", () => {
  assert.deepEqual(BACKOFF_SECONDS, [5, 15, 30]);
  assert.equal(PUSH_ATTEMPTS, 4);
  assert.equal(backoffSeconds(1), 5);
  assert.equal(backoffSeconds(2), 15);
  assert.equal(backoffSeconds(3), 30);
  assert.equal(backoffSeconds(4), 30);
});

test("Ein Konflikt in data behält die eben erzeugte Fassung", () => {
  const source = fs.readFileSync(new URL("./push-main.mjs", import.meta.url), "utf8");
  assert.match(source, /checkout", "--theirs", "--", "data"/);
  assert.match(source, /pull", "--rebase", "origin"/);
  assert.match(source, /JGTR_REGENERATE/);
});
