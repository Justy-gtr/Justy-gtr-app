import assert from "node:assert/strict";
import test from "node:test";
import { pagerIndex, pagerLeft } from "../js/nav.js";

const PAGES = ["heute", "kalender", "posts", "schwarm", "charts", "analyse", "mehr"];

test("Jeder Tab trifft seine eigene Seite, nicht die Mitte", () => {
  for (const width of [390, 430]) {
    PAGES.forEach((id, index) => {
      assert.equal(pagerLeft(index, width), index * width);
      assert.equal(pagerIndex(index * width, width, PAGES.length), index);
      assert.equal(PAGES[pagerIndex(index * width, width)], id);
    });
    assert.notEqual(pagerIndex(0, width), PAGES.indexOf("schwarm"));
    assert.notEqual(pagerIndex(6 * width, width), PAGES.indexOf("schwarm"));
  }
  assert.equal(pagerIndex(390 * 3 + 40, 390), 3);
  assert.equal(pagerIndex(390 * 3 + 200, 390), 4);
});
