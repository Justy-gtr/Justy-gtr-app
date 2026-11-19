import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { packOneMinute } from "./fetch-replay-1m.mjs";
import {
  INTERVAL_MIN,
  LEVERAGE_PRESETS,
  aggregateBars,
  applyOneMinute,
  mixSessionBars,
  PREVIEW_BARS,
  candleWindow,
  dismissSheet,
  stakeBasisCents,
  stakeChoice,
  stakeLadder,
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
  loadHistory,
  normalizeSettings,
  rescueBalance,
  tradeStakeCents,
  openTrade,
  archiveSymbols,
  chooseReplaySymbol,
  normalizeSymbol,
  pickRound,
  reasonLabel,
  rememberRound,
  resetHistory,
  roundSummary,
  saveHistory,
  sessionBars,
  setSpeed,
  settingsFromFields,
  skipToOpen,
  stepCandle,
  confirmRestart,
  sameGesture,
  nextRoundEuros,
  undoCandle,
  UNDO_LIMIT,
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
  assert.equal(after.trades.at(-1).pnlCents, -10000);
  assert.equal(after.cashCents, 100000 - 10000);
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
  assert.equal(normalizeSettings({}).leverage, 100);
  assert.deepEqual(LEVERAGE_PRESETS, [10, 20, 50, 80, 100]);
  assert.equal(createRound(flatDay(), {}).cashCents, 10000);
  const wiped = rescueBalance({ phase: "play", position: null, cashCents: 0, revived: 0 });
  assert.equal(wiped.cashCents, 10000);
  assert.equal(wiped.revived, 1);
  assert.equal(tradeStakeCents({ cashCents: 15000, startCents: 10000, settings: { stake: 100, spread: 0 } }), 10000);
  assert.equal(tradeStakeCents({ cashCents: 15000, startCents: 10000, settings: { stake: 40, spread: 0 } }), 4000);
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
  assert.ok(PREVIEW_BARS >= 30 && PREVIEW_BARS <= 40);
  assert.equal(round.visible, PREVIEW_BARS);
  assert.equal(round.paused, true);
  const wide = candleWindow(400, 280);
  assert.equal(wide.shown, 400);
  assert.equal(wide.from, 0);
  assert.ok(wide.body < 6);
  const zoomed = candleWindow(400, 280, 12);
  assert.equal(zoomed.shown, 12);
  assert.ok(zoomed.body >= 6);
  assert.ok(zoomed.from > 0);
  const limited = candleWindow(400, 280, 80);
  assert.ok(limited.shown < 80);
  assert.ok(limited.shown <= Math.floor(280 / 8));
  assert.ok(limited.body >= 6);
  const ladder = stakeLadder(10000, 100);
  assert.equal(ladder.steps[0], 10);
  assert.equal(ladder.steps.at(-1), 100);
  assert.equal(ladder.picked, 100);
  assert.equal(stakeLadder(25000, 100).steps.at(-1), 250);
  assert.equal(stakeLadder(5000, 100).picked, 50);
  const held = stakeChoice(10000, { stake: 100 });
  assert.equal(held.allIn, false);
  assert.equal(held.enabled[100], true);
  assert.equal(held.enabled[200], false);
  assert.equal(held.enabled[20], true);
  const short = stakeChoice(8000, { stake: 100 });
  assert.equal(short.allIn, true);
  assert.equal(stakeChoice(8000, { stake: 50 }).allIn, false);
  assert.equal(tradeStakeCents({ cashCents: 8000, settings: { stake: 100, stakeAllIn: true, spread: 0 } }), 8000);
  let open = stepCandle(createRound(flatDay(100), { balance: 100, stake: 100, leverage: 10, spread: 0.005 }));
  open = openTrade(open, "long").state;
  assert.equal(open.settings.stake, 100);
  assert.equal(stakeChoice(stakeBasisCents(open), open.settings).allIn, false);
  assert.equal(dismissSheet(56, 0), true);
  assert.equal(dismissSheet(20, 0), false);
  assert.equal(dismissSheet(80, 12), false);
  const ui = fs.readFileSync(new URL("../js/replay-ui.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../css/replay.css", import.meta.url), "utf8");
  assert.match(ui, /Schließen/);
  assert.match(ui, /Neu mit 100/);
  assert.match(ui, /EINSATZ/);
  assert.match(ui, /HEBEL/);
  assert.match(ui, /replay-close/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"), /maximum-scale=1,\s*user-scalable=no/);
  assert.match(css, /overflow-y:\s*scroll/);
  assert.equal(css.includes("overflow: hidden"), false);
  const missing = withInterval(round, 1);
  assert.match(missing.intervalNote, /1-Minuten/);
  assert.equal(missing.interval, 5);
  const mixed = mixSessionBars(
    [[900, 1, 1, 1, 1, 0], [925, 1, 2, 1, 1, 0], [930, 9, 9, 9, 9, 0]],
    [[930, 2, 3, 1, 2, 4], [931, 2, 2, 2, 2, 1], [800, 5, 5, 5, 5, 1]]
  );
  assert.deepEqual(mixed.bars.filter((bar) => bar[6] === 5).map((bar) => bar[0]), [900, 925]);
  assert.deepEqual(mixed.bars.filter((bar) => bar[6] === 1).map((bar) => bar[0]), [930, 931]);
  const switched = applyOneMinute(round, [[930, 2, 3, 1, 2, 4], [931, 2, 2, 2, 2, 1]]);
  assert.equal(switched.interval, 1);
  assert.ok(switched.bars.some((bar) => bar[6] === 5 && bar[0] < 930));
  assert.ok(switched.bars.some((bar) => bar[6] === 1));
  const wider = withInterval(round, 10);
  assert.equal(wider.interval, 10);
  assert.ok(wider.visible >= 1);
  assert.match(ui, /"5 Min"/);
  assert.match(ui, /"1 Min"/);
  let walked = applyOneMinute({ ...round, marketMin: 930 }, [[930, 2, 3, 1, 2, 4], [931, 2, 2, 2, 2, 1]]);
  assert.ok(walked.bars[walked.visible - 1][0] < 930);
  walked = stepCandle(walked);
  assert.equal(walked.bars[walked.visible - 1][0], 930);
  assert.equal(walked.bars[walked.visible - 1][6], 1);
  assert.equal(walked.marketMin, 931);
  const packed = packOneMinute("TSLA", "2026-11-17", [
    { t: "2026-11-17T14:29:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: "2026-11-17T14:30:00Z", o: 2, h: 3, l: 1.5, c: 2.5, v: 9 }
  ]);
  assert.deepEqual(packed.b.map((bar) => bar[0]), [930]);
  assert.equal(packed.src, "alpaca-iex");
});

test("50 € Einsatz verliert höchstens 50 €, auch nach einem Gewinn", () => {
  let round = stepCandle(createRound(flatDay(100), { balance: 100, stake: 50, leverage: 20, spread: 0.005 }));
  round = { ...round, cashCents: 25000 };
  const opened = openTrade(round, "long");
  assert.equal(opened.ok, true);
  assert.equal(opened.state.position.stakeCents, 5000);
  const bars = opened.state.bars.slice();
  const next = bars[opened.state.visible];
  bars[opened.state.visible] = [next[0], 100, 100, 1, 1, 10];
  const after = catchUp({ ...opened.state, bars }, opened.state.marketMin + INTERVAL_MIN);
  const trade = after.trades.at(-1);
  assert.equal(trade.reason, "ko");
  assert.equal(reasonLabel(trade.reason), "Knock-out");
  assert.equal(trade.pnlCents, -5000);
  assert.equal(after.position, null);
  assert.equal(after.cashCents, 20000);
  assert.ok(after.cashCents >= 0);
  const staked = after.trades.reduce((sum, item) => sum + item.stakeCents, 0);
  const roundLoss = Math.max(0, after.startCents - after.cashCents);
  assert.ok(roundLoss <= staked);
  const wiped = stepCandle(createRound(flatDay(100), { balance: 100, stake: 50, leverage: 10, spread: 0.005 }));
  const lost = openTrade(wiped, "long").state;
  const book = lost.bars.slice();
  const bar = book[lost.visible];
  book[lost.visible] = [bar[0], 100, 100, 0, 0, 10];
  const end = catchUp({ ...lost, bars: book }, lost.marketMin + INTERVAL_MIN);
  assert.equal(end.trades.at(-1).pnlCents, -5000);
  assert.equal(end.cashCents, 5000);
  assert.ok(end.cashCents >= 0);
  assert.ok(end.startCents - end.cashCents <= 5000);
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

test("Zurück nimmt die letzte Kerze und den Handel darauf zurück", () => {
  const settings = { balance: 100, stake: 50, leverage: 10, spread: 0.005 };
  const fresh = previewRound(createRound(flatDay(100), settings));
  assert.equal(fresh.undo, undefined);
  assert.equal(undoCandle(fresh).cashCents, fresh.cashCents);
  assert.equal(undoCandle(fresh).visible, fresh.visible);
  const startVisible = fresh.visible;
  const startCash = fresh.cashCents;
  let round = stepCandle(fresh);
  assert.equal(round.visible, startVisible + 1);
  assert.equal(round.undo.length, 1);
  round = openTrade(round, "long").state;
  assert.ok(round.cashCents < startCash);
  round.settings.stake = 20;
  round.settings.leverage = 80;
  const back = undoCandle(round);
  assert.equal(back.visible, startVisible);
  assert.equal(back.cashCents, startCash);
  assert.equal(back.position, null);
  assert.equal(back.trades.length, 0);
  assert.equal(back.settings.stake, 20);
  assert.equal(back.settings.leverage, 80);
  assert.equal(back.undo.length, 0);

  let traded = stepCandle(createRound(flatDay(100), settings));
  traded = openTrade(traded, "short").state;
  const openCash = traded.cashCents;
  const openVisible = traded.visible;
  traded = stepCandle(traded);
  traded = closeManual(traded);
  const restored = undoCandle(traded);
  assert.equal(restored.visible, openVisible);
  assert.equal(restored.cashCents, openCash);
  assert.equal(restored.position.side, "short");
  assert.equal(restored.trades.length, 0);

  let knocked = stepCandle(createRound(flatDay(100), { balance: 100, stake: 50, leverage: 10, spread: 0 }));
  knocked = openTrade(knocked, "long").state;
  const beforeKnock = knocked.cashCents;
  const book = knocked.bars.slice();
  const bar = book[knocked.visible];
  book[knocked.visible] = [bar[0], 100, 100, 1, 1, 10];
  knocked = stepCandle({ ...knocked, bars: book });
  assert.equal(knocked.position, null);
  const revived = undoCandle(knocked);
  assert.equal(revived.position.side, "long");
  assert.equal(revived.cashCents, beforeKnock);
  assert.equal(revived.trades.length, 0);

  const switched = withInterval(stepCandle(createRound(flatDay(100), settings)), 10);
  assert.deepEqual(switched.undo, []);
  const ui = fs.readFileSync(new URL("../js/replay-ui.js", import.meta.url), "utf8");
  assert.match(ui, /data-action="replay-undo"/);
  assert.match(ui, /\$\{intervals\}\$\{undo\}/);
  assert.match(ui, /round\.undo\?\.length \? "" : "disabled"/);
});

test("Der Zurück-Stapel endet bei 500", () => {
  const bars = [];
  for (let minute = SESSION_FROM; minute < SESSION_FROM + 620; minute += 1) {
    bars.push([minute, 10, 10, 10, 10, 1]);
  }
  let round = createRound({ b: bars }, { balance: 100, stake: 10, leverage: 10, spread: 0 });
  for (let i = 0; i < 520; i += 1) round = stepCandle(round);
  assert.equal(round.undo.length, UNDO_LIMIT);
  assert.equal(round.visible, 520);
  assert.equal(undoCandle(round).visible, 519);
});

test("Neu mit 100 € braucht einen zweiten Tipp und sitzt unter Tag", () => {
  assert.equal(confirmRestart(0, 1000), false);
  assert.equal(confirmRestart(1000, 1000), true);
  assert.equal(confirmRestart(1000, 4000), true);
  assert.equal(confirmRestart(1000, 4001), false);
  const ui = fs.readFileSync(new URL("../js/replay-ui.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../css/replay.css", import.meta.url), "utf8");
  assert.match(ui, /replay-quote/);
  assert.equal(ui.includes("replay-zoom"), false);
  assert.match(ui, /\$\{intervals\}\$\{undo\}\$\{fresh\}/);
  assert.equal(ui.includes("replay-secret"), false);
  assert.match(ui, /aria-label="Neu mit 100 €"/);
  assert.match(ui, /data-action="replay-fresh"/);
  assert.match(ui, /Nochmal\?/);
  assert.match(ui, /pointerup/);
  assert.equal(sameGesture(1000, 1040), true);
  assert.equal(sameGesture(1000, 1200), false);
  assert.equal(ui.includes(">Neu mit 100 €</button>"), false);
  assert.match(css, /\.replay-quote[\s\S]*grid-template-columns:\s*1\.15fr 1fr 1\.15fr/);
  assert.match(css, /\.replay-clock[\s\S]*text-align:\s*center/);
  assert.match(css, /\.replay-speeds \.replay-restart \{[\s\S]*width:\s*40px/);
  assert.match(css, /\.replay-speeds \.replay-restart \{[\s\S]*height:\s*40px/);
});

test("Statistik-Reset löscht nur die Runden", () => {
  const settings = { stake: 50, leverage: 80, balance: 300 };
  const history = rememberRound({ rounds: [], settings }, {
    id: "t",
    symbol: "TSLA",
    name: "Tesla",
    date: "2026-11-10",
    pnlCents: 2500,
    endCents: 12500,
    tradeCount: 3,
    hitCount: 2,
    at: ""
  }, "2026-11-19T18:00:00+01:00");
  const cleared = resetHistory(history);
  assert.deepEqual(cleared.rounds, []);
  assert.equal(cleared.settings.stake, 50);
  assert.equal(cleared.settings.leverage, 80);
  assert.equal(cleared.settings.balance, 300);
  const stats = historyStats(cleared);
  assert.equal(stats.rounds, 0);
  assert.equal(stats.tradeCount, 0);
  assert.equal(stats.sumCents, 0);
  assert.equal(stats.hitRate, null);
  assert.equal(stats.bestCents, null);
  const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  saveHistory(storage, cleared);
  const loaded = loadHistory(storage);
  assert.deepEqual(loaded.rounds, []);
  assert.equal(loaded.settings.stake, 50);
  assert.equal(loaded.settings.leverage, 80);
  const ui = fs.readFileSync(new URL("../js/replay-ui.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../css/replay.css", import.meta.url), "utf8");
  assert.match(ui, /aria-label="Statistik zurücksetzen"/);
  assert.match(ui, /replay-stathead/);
  assert.match(ui, /Nochmal\?/);
  assert.match(ui, /pointerup/);
  assert.match(css, /\.replay-stathead[\s\S]*justify-content:\s*space-between/);
  assert.match(css, /\.replay-statreset \{[\s\S]*width:\s*30px/);
  assert.match(css, /\.replay-statreset \{[\s\S]*height:\s*30px/);
});

test("Training merkt sich nur eine Aktie aus dem Archiv", () => {
  const index = {
    pool: REPLAY_POOL,
    days: [
      { s: "TSLA", d: "2026-11-02", n: 40 },
      { s: "TSLA", d: "2026-11-03", n: 40 },
      { s: "NVDA", d: "2026-11-04", n: 40 },
      { s: "SPCX", d: "2026-11-05", n: 10 }
    ]
  };
  assert.deepEqual(archiveSymbols(index), ["TSLA", "NVDA"]);
  assert.equal(normalizeSymbol(" tsla "), "TSLA");
  assert.equal(normalizeSymbol("aapl-1"), "");
  assert.equal(pickRound(index, () => 0, null, "NVDA").symbol, "NVDA");
  assert.equal(pickRound(index, () => 0, null, "AAPL"), null);
  const round = { cashCents: 12300, undo: [{ visible: 1 }], settings: { stake: 50, leverage: 80 } };
  const history = { rounds: [{ symbol: "TSLA", pnlCents: 100 }], settings: { stake: 50, leverage: 80 }, recent: ["MRVL"] };
  const missed = chooseReplaySymbol(history, round, index, "AAPL");
  assert.equal(missed.ok, false);
  assert.match(missed.history.symbolNote, /Keine Kursdaten für AAPL/);
  assert.equal(missed.round.cashCents, 12300);
  assert.equal(missed.round.undo.length, 1);
  assert.equal(missed.history.settings.stake, 50);
  const picked = chooseReplaySymbol(history, round, index, "nvda");
  assert.equal(picked.ok, true);
  assert.equal(picked.history.settings.symbol, "NVDA");
  assert.equal(picked.history.settings.leverage, 80);
  assert.deepEqual(picked.history.rounds, history.rounds);
  assert.deepEqual(picked.round.undo, []);
  assert.equal(picked.round.cashCents, 12300);
  assert.deepEqual(picked.history.recent.slice(0, 2), ["NVDA", "MRVL"]);
  const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  saveHistory(storage, picked.history);
  const loaded = loadHistory(storage);
  assert.equal(loaded.settings.symbol, "NVDA");
  assert.equal(loaded.recent[0], "NVDA");
  const ui = fs.readFileSync(new URL("../js/replay-ui.js", import.meta.url), "utf8");
  assert.match(ui, /data-action="replay-symbol"/);
  assert.match(ui, /Keine Kursdaten für/);
  assert.match(ui, /replay-tick/);
});

test("Neue Runde behält das Konto ab 25 €", () => {
  assert.equal(nextRoundEuros(24.99), 100);
  assert.equal(nextRoundEuros(25), 25);
  assert.equal(nextRoundEuros(300), 300);
  assert.equal(nextRoundEuros(0), 100);
});
