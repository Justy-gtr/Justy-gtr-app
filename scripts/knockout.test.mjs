import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOCK_HINT,
  knockOut,
  moveSentence,
  parseDecimal,
  readKnockStore,
  warningText,
  writeKnockStore
} from "../js/knockout.js";

const ADVICE = /kaufen|verkaufen|empfehlung/i;

test("Komma ist ein Dezimalzeichen", () => {
  assert.equal(parseDecimal("136,2"), 136.2);
  assert.equal(parseDecimal("0,1"), 0.1);
  assert.equal(parseDecimal("136.2"), 136.2);
  assert.equal(parseDecimal("1.234,5"), 1234.5);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("  "), null);
});

test("Schwelle in Dollar wird mit dem App-Kurs nach Euro gerechnet", () => {
  const result = knockOut({
    priceEur: 119.98,
    priceUsd: 134.27,
    rate: 1.1191,
    barrier: "136,2",
    side: "long"
  });
  assert.ok(Math.abs(result.barrierEur - 136.2 / 1.1191) < 1e-9);
  assert.ok(Math.abs(result.distanceEur - Math.abs(119.98 - result.barrierEur)) < 1e-9);
  assert.ok(Math.abs(result.distancePct - (result.distanceEur / 119.98) * 100) < 1e-9);
  assert.ok(Math.abs(result.leverage - 119.98 / result.distanceEur) < 1e-9);
  assert.equal(result.behind, true);
  assert.equal(result.band, "nah");
  assert.equal(warningText(result), "Sehr nah an der Schwelle · Kurs ist hinter der Schwelle");
  assert.equal(result.move, null);
});

test("Abstand färbt sich an 15 und an 5 Prozent", () => {
  const at = (priceEur, barrierUsd, rate = 1) => knockOut({ priceEur, rate, barrier: barrierUsd, side: "long" });
  assert.equal(at(100, 80).band, "weit");
  assert.equal(at(100, 84.99).band, "weit");
  assert.equal(at(100, 85).band, "mittel");
  assert.equal(at(100, 95).band, "mittel");
  assert.equal(at(100, 95.01).band, "nah");
  assert.equal(warningText(at(100, 96)), "Sehr nah an der Schwelle");
  assert.equal(warningText(at(100, 90)), "");
  assert.equal(at(100, 100).leverage, null);
});

test("Short nutzt dieselbe Hebel-Formel, der Abstand bleibt der Betrag", () => {
  const result = knockOut({ priceEur: 200, rate: 1, barrier: 180, side: "short" });
  assert.equal(result.distanceEur, 20);
  assert.equal(result.distancePct, 10);
  assert.equal(result.leverage, 10);
  assert.equal(result.band, "mittel");
  assert.equal(result.behind, true);
});

test("Ein Prozent nur mit Bezugsverhältnis, Long und Short mit umgekehrtem Vorzeichen", () => {
  const long = knockOut({ priceEur: 100, rate: 1, barrier: 80, side: "long", ratio: "0,1", qty: "2", qtyMode: "anzahl" });
  assert.equal(long.move.upEur, 0.2);
  assert.equal(long.move.downEur, -0.2);
  const sentence = moveSentence(long.move);
  assert.match(sentence, /steigt\/fällt/);
  assert.equal(ADVICE.test(sentence), false);
  const short = knockOut({ priceEur: 100, rate: 1, barrier: 120, side: "short", ratio: "0,1", qty: "2" });
  assert.equal(short.move.upEur, -0.2);
  assert.equal(short.move.downEur, 0.2);
  const skipped = knockOut({ priceEur: 100, rate: 1, barrier: 80, side: "long", qty: "2" });
  assert.equal(skipped.move, null);
  assert.equal(moveSentence(skipped.move), "");
});

test("Einsatz rechnet den Hebel, aber nur wenn ein Verhältnis da ist", () => {
  const withRatio = knockOut({
    priceEur: 100,
    rate: 1,
    barrier: 90,
    side: "long",
    ratio: "0,1",
    qty: "50",
    qtyMode: "einsatz"
  });
  assert.equal(withRatio.leverage, 10);
  assert.ok(Math.abs(withRatio.move.upEur - 5) < 1e-9);
  const noRatio = knockOut({ priceEur: 100, rate: 1, barrier: 90, side: "long", qty: "50", qtyMode: "einsatz" });
  assert.equal(noRatio.move, null);
});

test("Ohne Kurs oder ohne Wechselkurs gibt es keine Schwelle", () => {
  assert.equal(knockOut({ priceEur: 100, rate: 0, barrier: 10 }).barrierEur, null);
  assert.equal(knockOut({ priceEur: 100, barrier: 10 }).barrierEur, null);
  assert.equal(knockOut({ rate: 1.1, barrier: 10 }).distancePct, null);
});

test("Hinweis bleibt der eine Satz und enthält keine Anlageberatung", () => {
  assert.equal(KNOCK_HINT, "Der Knock-out greift auch außerhalb der US-Börsenzeit. Keine Anlageberatung.");
  assert.equal(ADVICE.test(KNOCK_HINT), false);
});

test("Letzte Eingaben und gespeicherte Knock-outs bleiben im Speicher", () => {
  const bag = new Map();
  const storage = {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => bag.set(key, value)
  };
  writeKnockStore(storage, {
    draft: { symbol: "TSLA", side: "short", barrier: "400,5", ratio: "", qty: "", qtyMode: "anzahl", name: "" },
    saved: [{ id: "a", name: "Tesla Short", symbol: "TSLA", side: "short", barrier: "400,5", ratio: "", qty: "", qtyMode: "anzahl" }]
  });
  const loaded = readKnockStore(storage);
  assert.equal(loaded.draft.symbol, "TSLA");
  assert.equal(loaded.draft.side, "short");
  assert.equal(loaded.draft.barrier, "400,5");
  assert.equal(loaded.saved.length, 1);
  assert.equal(loaded.saved[0].name, "Tesla Short");
  const live = knockOut({ priceEur: 350, rate: 1, barrier: loaded.saved[0].barrier, side: loaded.saved[0].side });
  assert.equal(live.behind, false);
  assert.ok(live.distancePct > 14 && live.distancePct < 15);
});
