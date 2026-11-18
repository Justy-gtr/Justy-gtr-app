import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  INTERVAL_MIN,
  aggregateBars,
  previewRound,
  withInterval,
  REPLAY_POOL,
  SESSION_FROM,
  SESSION_TO,
  START_EUROS,
  UI,
  US_OPEN_MIN,
  assembleDay,
  berlinParts,
  catchUp,
  closeManual,
  createRound,
  formatMinute,
  grossPnlCents,
  hiddenLabels,
  historyStats,
  inspectCandle,
  knockBarrier,
  liveSnapshot,
  normalizeSettings,
  rescueBalance,
  tradeStakeCents,
  openTrade,
  pickRound,
  rememberRound,
  roundSummary,
  sessionBars,
  setSpeed,
  settingsFromFields,
  skipToOpen,
  stepCandle,
  theoreticalCents,
  tick,
  unpackBar
} from "../js/replay.js";
import { checkReplayArchive } from "./replay-check.mjs";

const BANNED = /kaufen|verkaufen|empfehlung|kaufsignal|anlageberatung|keine anlageberatung/i;

function flatDay(price = 100) {
  const bars = [];
  for (let minute = SESSION_FROM; minute < SESSION_TO; minute += INTERVAL_MIN) {
    const quiet = minute < US_OPEN_MIN ? 0 : 1000;
    bars.push([minute, price, price + 0.4, price - 0.4, price, quiet]);
  }
  return { b: bars };
}

function risingDay() {
  const bars = [];
  let price = 100;
  for (let minute = SESSION_FROM; minute < SESSION_TO; minute += INTERVAL_MIN) {
    const next = price + 0.05;
    bars.push([minute, price, next + 0.1, price - 0.05, next, minute < 10 * 60 ? 0 : 50]);
    price = next;
  }
  return { b: bars };
}

test("Berliner Uhr im Winter und im Sommer", () => {
  const winter = berlinParts(Date.parse("2026-01-15T07:00:00.000Z"));
  assert.equal(winter.date, "2026-01-15");
  assert.equal(winter.minutes, 8 * 60);
  assert.equal(winter.weekday, "Thu");
  const summer = berlinParts(Date.parse("2026-07-15T06:00:00.000Z"));
  assert.equal(summer.date, "2026-07-15");
  assert.equal(summer.minutes, 8 * 60);
  assert.equal(formatMinute(US_OPEN_MIN), "15:30");
  assert.equal(formatMinute(SESSION_TO), "22:00");
});

test("Der Tag mischt frühe Euro-Drucke und die US-Reihe, ohne die Zukunft", () => {
  const date = "2026-11-16";
  const at = (hm, clock) => Date.parse(`2026-11-16T${clock}:00.000Z`);
  // 08:00 Berlin ist 07:00 UTC im November.
  const eur = [{
    rank: 0,
    points: [
      { t: at("08:00", "07:00"), o: 90, h: 91, l: 89, c: 90, v: 10 },
      { t: at("10:00", "09:00"), o: 92, h: 93, l: 91, c: 92, v: 10 }
    ]
  }];
  const us = [
    { t: at("07:00", "06:00"), o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: at("10:00", "09:00"), o: 100, h: 101, l: 99, c: 100, v: 0 },
    { t: at("15:30", "14:30"), o: 110, h: 112, l: 109, c: 111, v: 500 },
    { t: at("21:55", "20:55"), o: 120, h: 121, l: 119, c: 120, v: 80 },
    { t: at("22:00", "21:00"), o: 130, h: 131, l: 129, c: 130, v: 0 }
  ];
  const filler = [];
  for (let minute = 10 * 60 + 5; minute < 21 * 60; minute += 5) {
    const utcH = Math.floor((minute - 60) / 60);
    const utcM = (minute - 60) % 60;
    const stamp = `2026-11-16T${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}:00.000Z`;
    filler.push({ t: Date.parse(stamp), o: 100, h: 101, l: 99, c: 100, v: minute >= US_OPEN_MIN ? 10 : 0 });
  }
  const fx = [{ t: Date.parse("2026-11-16T06:00:00.000Z"), c: 1.1 }];
  const bars = assembleDay(date, us.concat(filler), eur, fx);
  assert.ok(bars);
  assert.equal(bars[0][0], 8 * 60);
  assert.equal(bars[0][4], 99);
  assert.equal(bars.some((bar) => bar[0] < SESSION_FROM || bar[0] >= SESSION_TO), false);
  const ten = bars.find((bar) => bar[0] === 10 * 60);
  assert.equal(ten[4], 100);
  assert.equal(ten[5], 0);
  assert.equal(bars.some((bar) => bar[0] === 22 * 60), false);
  const kept = sessionBars({ b: [...bars, [7 * 60, 1, 1, 1, 1, 0], [22 * 60, 1, 1, 1, 1, 0]] });
  assert.equal(kept.some((bar) => bar[0] < SESSION_FROM || bar[0] >= SESSION_TO), false);
});

test("Knock-out und Ergebnis folgen dem Hebel", () => {
  const stake = 10000;
  const leverage = 10;
  const entry = 100;
  assert.equal(knockBarrier(entry, leverage, "long"), 90);
  assert.equal(knockBarrier(entry, leverage, "short"), 110);
  assert.equal(grossPnlCents(stake, leverage, entry, 101, "long"), 1000);
  assert.equal(theoreticalCents(stake, leverage, entry, 101, "long"), 11000);
  assert.equal(grossPnlCents(stake, leverage, entry, 99, "short"), 1000);
  assert.equal(grossPnlCents(stake, leverage, entry, 90, "long"), -stake);
  assert.equal(grossPnlCents(stake, leverage, entry, 80, "long"), -stake);
  const longKo = inspectCandle(
    { entry, leverage, side: "long" },
    { t: 600, o: 100, h: 101, l: 90, c: 100 },
    null
  );
  assert.equal(longKo.reason, "ko");
  const shortKo = inspectCandle(
    { entry, leverage, side: "short" },
    { t: 600, o: 100, h: 110, l: 99, c: 100 },
    20
  );
  assert.equal(shortKo.reason, "ko");
  const safe = inspectCandle(
    { entry, leverage, side: "long" },
    { t: 600, o: 100, h: 101, l: 90.01, c: 100 },
    null
  );
  assert.equal(safe, null);
  const target = inspectCandle(
    { entry, leverage, side: "long" },
    { t: 600, o: 100, h: 103, l: 99, c: 101 },
    20
  );
  assert.equal(target.reason, "ziel");
  assert.ok(Math.abs(target.price - 102) < 1e-9);
});

test("Eine Kerze mit Ziel und Knock-out endet im Knock-out", () => {
  const state = createRound(flatDay(100), { balance: 1000, stake: 100, leverage: 10, spread: 0.005, takeProfitPct: 20 });
  let round = stepCandle(state);
  const opened = openTrade(round, "long");
  assert.equal(opened.ok, true);
  assert.equal(opened.state.cashCents, 100000 - 10000 - 50);
  const bars = opened.state.bars.slice();
  const next = bars[opened.state.visible];
  bars[opened.state.visible] = [next[0], 100, 110, 89, 105, 10];
  const after = catchUp({ ...opened.state, bars }, opened.state.marketMin + INTERVAL_MIN);
  assert.equal(after.trades.at(-1).reason, "ko");
  assert.equal(after.position, null);
  assert.equal(after.trades.at(-1).pnlCents, -10000 - 50);
  assert.equal(after.cashCents, 100000 - 10000 - 50);
});

test("Raus bucht den Spread, Ziel kann neu rein", () => {
  let round = stepCandle(createRound(flatDay(100), { balance: 1000, stake: 100, leverage: 10, spread: 0.005 }));
  round = openTrade(round, "long").state;
  round = closeManual(round);
  const trade = round.trades[0];
  assert.equal(trade.reason, "raus");
  assert.equal(trade.pnlCents, -50 - 50);
  assert.equal(round.position, null);

  const rising = risingDay();
  let again = stepCandle(createRound(rising, {
    balance: 1000,
    stake: 100,
    leverage: 10,
    spread: 0,
    takeProfitPct: 5,
    reenterPct: 50
  }));
  again = openTrade(again, "long").state;
  const entry = again.position.entry;
  let guard = 0;
  while (again.position && again.phase === "play" && guard < 40) {
    again = stepCandle(again);
    guard += 1;
  }
  assert.ok(again.trades.some((item) => item.reason === "ziel"));
  const ziel = again.trades.find((item) => item.reason === "ziel");
  assert.ok(ziel.exit > entry);
  if (again.position) assert.equal(again.position.side, "long");
});

test("Pause, Einzelschritt und Tempo zeigen nur vergangene Kerzen", () => {
  const start = createRound(flatDay(), { balance: 1000, stake: 100, leverage: 10, spread: 0 });
  assert.equal(start.visible, 0);
  assert.equal(tick(start, 30).visible, 0);
  const speed = setSpeed(start, 1);
  assert.equal(speed.paused, false);
  assert.equal(speed.speed, 1);
  const five = tick(speed, 5);
  assert.equal(five.visible, 1);
  assert.equal(five.marketMin, SESSION_FROM + 5);
  const paused = { ...five, paused: true };
  assert.equal(tick(paused, 60).visible, 1);
  const one = stepCandle(paused);
  assert.equal(one.visible, 2);
  assert.equal(one.paused, true);
  const skipped = skipToOpen(start);
  assert.equal(skipped.paused, true);
  assert.equal(skipped.marketMin, US_OPEN_MIN);
  assert.ok(skipped.visible > 10);
  assert.ok(skipped.bars[skipped.visible - 1][0] + INTERVAL_MIN <= US_OPEN_MIN);
  assert.ok(skipped.bars[skipped.visible][0] + INTERVAL_MIN > US_OPEN_MIN);
  const fast = tick(setSpeed(start, 2), 7.5);
  assert.equal(fast.visible, 3);
});

test("Vorspulen löst einen Knock-out unterwegs aus", () => {
  const day = flatDay(100);
  const index = day.b.findIndex((bar) => bar[0] === 12 * 60);
  day.b[index] = [12 * 60, 100, 100.2, 80, 99, 10];
  let round = stepCandle(createRound(day, { balance: 1000, stake: 100, leverage: 10, spread: 0 }));
  round = openTrade(round, "long").state;
  round = skipToOpen(round);
  assert.equal(round.position, null);
  assert.equal(round.trades.at(-1).reason, "ko");
  assert.ok(round.marketMin >= US_OPEN_MIN);
});

test("Zufall nimmt nur einen Tag aus dem Katalog und verdeckt den Namen", () => {
  const index = {
    pool: REPLAY_POOL,
    days: [
      { s: "TSLA", d: "2026-11-10", n: 100 },
      { s: "NVDA", d: "2026-11-11", n: 100 },
      { s: "SPCX", d: "2026-11-12", n: 12 }
    ]
  };
  const seq = [0, 0.5];
  let cursor = 0;
  const rng = () => seq[cursor++];
  const first = pickRound(index, rng);
  assert.equal(first.symbol, "TSLA");
  assert.equal(first.name, "Tesla");
  assert.equal(first.date, "2026-11-10");
  const second = pickRound(index, rng, first);
  assert.equal(second.symbol, "NVDA");
  assert.deepEqual(hiddenLabels(), { stock: UI.stock, day: UI.day });
  assert.equal(UI.stock.includes("TSLA"), false);
  const fields = settingsFromFields({ stake: "100", leverage: "30", spread: "0,5", balance: "1000", target: "", reenter: "" });
  assert.equal(fields.leverage, 30);
  assert.equal(fields.spread, 0.005);
  assert.equal(fields.balance, 1000);
  assert.equal(fields.takeProfitPct, null);
});

test("Die Historie zählt Runden, Treffer und die Summe", () => {
  const state = {
    cashCents: 110000,
    startCents: 100000,
    trades: [{ pnlCents: 500 }, { pnlCents: -100 }]
  };
  const summary = roundSummary({ symbol: "TSLA", name: "Tesla", date: "2026-11-10" }, state);
  assert.equal(summary.pnlCents, 10000);
  assert.equal(summary.hitCount, 1);
  const history = rememberRound({ rounds: [] }, summary, "2026-11-17T22:00:00+01:00");
  const stats = historyStats(history);
  assert.equal(stats.rounds, 1);
  assert.equal(stats.hitRate, 0.5);
  assert.equal(stats.sumCents, 10000);
  const empty = liveSnapshot(createRound(flatDay(), { balance: 1000, stake: 100, leverage: 10, spread: 0 }));
  assert.equal(empty.price, null);
  assert.equal(empty.equityCents, 100000);
});

test("Texte und Archiv bleiben ohne Rat und ohne Schlüssel", () => {
  const copy = Object.values(UI).join("\n");
  assert.equal(BANNED.test(copy), false);
  for (const file of ["js/replay.js", "js/replay-ui.js", "css/replay.css", "scripts/fetch-replay.mjs"]) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(BANNED.test(text), false, file);
    assert.equal(text.includes("Keine Anlageberatung"), false, file);
  }
  const html = fs.readFileSync("index.html", "utf8");
  const nav = fs.readFileSync("js/nav.js", "utf8");
  assert.match(html, /id="page-training"/);
  assert.match(html, /data-page="training"/);
  assert.match(nav, /"training"/);
  assert.match(fs.readFileSync("sw.js", "utf8"), /js\/replay\.js/);
  const root = new URL("..", import.meta.url).pathname;
  const errors = checkReplayArchive(root);
  assert.deepEqual(errors, []);
});

test("Startkonto ist 100 € und ein leeres Konto beginnt wieder bei 100 €", () => {
  assert.equal(START_EUROS, 100);
  assert.equal(normalizeSettings({}).balance, 100);
  assert.equal(createRound(flatDay(), {}).cashCents, 10000);
  const wiped = rescueBalance({ phase: "play", position: null, cashCents: 0, revived: 0 });
  assert.equal(wiped.cashCents, 10000);
  assert.equal(wiped.revived, 1);
  assert.equal(tradeStakeCents({ cashCents: 15000, startCents: 10000, settings: { stake: 100, spread: 0 } }), 15000);
  assert.equal(tradeStakeCents({ cashCents: 15000, startCents: 10000, settings: { stake: 40, spread: 0 } }), 9000);
  const kept = rescueBalance({ phase: "play", position: null, cashCents: 2500 });
  assert.equal(kept.cashCents, 2500);
  assert.match(fs.readFileSync("js/replay-ui.js", "utf8"), /balance: fieldNumber\("replay-balance", "100"\)/);
});

test("10 Minuten bündelt 5 Minuten, 1 Minute wird nicht erfunden", () => {
  const bars = [
    [480, 10, 12, 9, 11, 1],
    [485, 11, 13, 10, 12, 2],
    [490, 12, 12, 8, 9, 3]
  ];
  const ten = aggregateBars(bars, 10);
  assert.equal(ten.length, 2);
  assert.deepEqual(ten[0], [480, 10, 13, 9, 12, 3]);
  assert.equal(aggregateBars(bars, 1), null);
  const round = previewRound(createRound(flatDay(), { balance: 100, stake: 100, leverage: 10, spread: 0 }));
  assert.ok(round.visible >= 1);
  assert.equal(round.paused, true);
  const missing = withInterval(round, 1);
  assert.match(missing.intervalNote, /1 Minute/);
  assert.equal(missing.interval, 5);
  const wider = withInterval(round, 10);
  assert.equal(wider.interval, 10);
  assert.ok(wider.visible >= 1);
});

test("Einsatz über dem Konto geht nicht auf", () => {
  let round = stepCandle(createRound(flatDay(), { balance: 50, stake: 100, leverage: 10, spread: 0 }));
  assert.equal(round.settings.stake, 50);
  round = { ...round, settings: { ...round.settings, stake: 80 } };
  const denied = openTrade(round, "short");
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "stake");
  assert.equal(unpackBar(round.bars[0]).v, 0);
});
