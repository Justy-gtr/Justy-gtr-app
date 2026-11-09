import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { historySentence } from "../js/logic.js";
import { detailContent } from "../js/views.js";
import { mergeCandidate } from "./fetch-moonshots.mjs";
import { barsInWindow, catalystMoves, wideDays } from "./moonshot-stats.mjs";

const ADVICE = /\b(kaufen|verkaufen)\b|empfehlung|wird steigen/i;

test("Unter sieben Terminen keine Prozentzahl, ab sieben mit n", () => {
  assert.equal(historySentence("Nach Zahlen", { n: 6, up: 4, down: 1 }), "Nach Zahlen: n = 6, keine Prozentzahl.");
  assert.equal(historySentence("Große Tage", { n: 0 }), "Große Tage: n = 0, keine Prozentzahl.");
  const line = historySentence("Nach Zahlen", { n: 8, up: 1, down: 2 });
  assert.equal(line, "Nach Zahlen: 1 von 8 Mal ≥ +5 %, 2 von 8 Mal ≤ −5 %. n = 8.");
  assert.match(historySentence("Große Tage", { n: 529, sharePct: 5 }), /5 % der Tage.*n = 529/);
});

test("Der Tag nach dem Termin zählt, ein fehlender Folgetag nicht", () => {
  const bars = [
    { date: "2026-01-05", close: 100 },
    { date: "2026-01-06", close: 106 },
    { date: "2026-01-07", close: 94 },
    { date: "2026-01-08", close: 94 }
  ];
  const pack = catalystMoves(bars, ["2026-01-05", "2026-01-06", "2026-01-08"]);
  assert.equal(pack.n, 2);
  assert.equal(pack.up, 1);
  assert.equal(pack.down, 1);
  assert.equal(pack.showPct, false);
  assert.equal(pack.moves[0].reaction, "2026-01-06");
  assert.equal(pack.moves[0].pct, 6);
  const days = wideDays(bars);
  assert.equal(days.n, 3);
  assert.equal(days.wide, 2);
  assert.equal(days.sharePct, null);
  const windowed = barsInWindow([
    { date: "2020-01-02", close: 1 },
    { date: "2026-01-08", close: 2 }
  ]);
  assert.deepEqual(windowed.map((bar) => bar.date), ["2026-01-08"]);
});

test("Der Kurslauf lässt die Sätze stehen", () => {
  const candidate = {
    id: "x",
    symbol: "X",
    for: ["Ein Fakt."],
    against: ["Ein anderer Fakt."],
    catalyst: { date: "2026-11-17" },
    leverage: { isin: "DE000HT5H997" },
    sources: [{ title: "Quelle", url: "https://example.com" }],
    pastCatalysts: { dates: ["2026-01-05"] },
    history: { catalystLabel: "Nach Zahlen", note: "Schluss zu Schluss." }
  };
  const next = mergeCandidate(candidate, {
    priceEur: 10,
    for: ["überschrieben"],
    history: { catalyst: { n: 8, up: 1, down: 2, showPct: true } }
  });
  assert.deepEqual(next.for, ["Ein Fakt."]);
  assert.equal(next.history.catalystLabel, "Nach Zahlen");
  assert.equal(next.history.note, "Schluss zu Schluss.");
  assert.equal(next.history.catalyst.n, 8);
  assert.equal(next.priceEur, 10);
  assert.equal(next.leverage.isin, "DE000HT5H997");
});

test("Die Seite zeigt drei Karten, den Hinweis und keine Beratung", () => {
  const file = JSON.parse(fs.readFileSync(new URL("../data/moonshots.json", import.meta.url), "utf8"));
  const html = detailContent("open-moonshots", {}, { data: { moonshots: file }, ui: {}, store: {} }).html;
  assert.equal(/anlageberatung/i.test(html), false);
  assert.match(html, /Kandidaten mit Kurstreibern/);
  assert.match(html, /n ist die Zahl der Termine oder Tage\. Unter 7 keine Prozentzahl\./);
  for (const symbol of ["NVDA", "TTWO", "MRVL"]) assert.match(html, new RegExp(symbol));
  assert.doesNotMatch(html, /TSLA|RKLB|SPCX/);
  assert.match(html, /DE000HT5H997/);
  assert.match(html, /DE000HF0H8S6/);
  assert.match(html, /DE000HM4DE28/);
  assert.match(html, /Mit Hebel bei Trade Republic: ja/);
  assert.match(html, /Nach Zahlen: 1 von 8 Mal/);
  assert.match(html, /n = 8/);
  assert.equal(ADVICE.test(html), false);
  assert.match(html, /17\. November 2026, 22:20 Uhr Berlin/);
  assert.match(html, /19\. November 2026/);
  assert.match(html, /1\. Dezember 2026, 22:30 Uhr Berlin/);
});
