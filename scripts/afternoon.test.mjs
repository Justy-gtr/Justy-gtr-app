import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { AFTERNOON_CRON, QUARTER_MS, inAfternoonRefresh } from "../js/afternoon.js";
import { buildLines } from "./build-lines.mjs";

test("Nachmittag ist Mo–Fr 14:00 bis 22:00 Berlin", () => {
  assert.equal(QUARTER_MS, 15 * 60 * 1000);
  assert.equal(AFTERNOON_CRON, "*/15 12-21 * * 1-5");
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T12:59:00+01:00")), false);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T14:00:00+01:00")), true);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T22:00:00+01:00")), true);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T22:01:00+01:00")), false);
  assert.equal(inAfternoonRefresh(new Date("2026-11-21T15:00:00+01:00")), false);
  assert.equal(inAfternoonRefresh(new Date("2026-07-10T12:00:00Z")), true);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T13:00:00Z")), true);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T21:00:00Z")), true);
  assert.equal(inAfternoonRefresh(new Date("2026-11-17T21:15:00Z")), false);
  const workflow = fs.readFileSync(".github/workflows/afternoon.yml", "utf8");
  assert.match(workflow, /cron: "\*\/15 12-21 \* \* 1-5"/);
  assert.match(fs.readFileSync(".github/workflows/prices.yml", "utf8"), /build-lines\.mjs/);
  assert.match(fs.readFileSync("js/app.js", "utf8"), /refreshAfternoon/);
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const lines = buildLines(prices, new Date("2026-11-17T15:00:00+01:00"));
  assert.equal(lines.schema, 1);
  assert.equal(lines.everyMin, 15);
  for (const symbol of ["SPCX", "TSLA", "RKLB", "MRVL"]) {
    const row = lines.symbols[symbol];
    assert.ok(row, symbol);
    assert.equal(row.hour.hour, 15);
    for (const range of Object.values(row.ranges)) {
      assert.ok(range.lines.length <= 3);
      for (const line of range.lines) {
        assert.match(line.marker, /^(fest|2×|3×)$/);
        if (line.kind === "support" || line.kind === "resistance") assert.ok(line.n >= 2);
      }
    }
  }
});
