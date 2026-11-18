/** Rückspiel: reine Rechnung. Kein DOM. Die Seite hängt das Modul in #page-training. */

import { parseDecimal } from "./knockout.js";

export const REPLAY_STORE_KEY = "jgtr-replay";
export const SESSION_FROM = 8 * 60;
export const SESSION_TO = 22 * 60;
export const US_OPEN_MIN = 15 * 60 + 30;
export const US_FROM_MIN = 10 * 60;
export const INTERVAL_MIN = 5;
export const INTERVALS = [1, 5, 10];
export const PREVIEW_BARS = 6;
export const START_EUROS = 100;
export const SPEEDS = [0.1, 0.2, 0.5, 1, 2];
export const LEVERAGE_PRESETS = [5, 10, 20, 50, 100];
export const TAKE_PRESETS = [25, 50, 100];
export const MIN_DAY_BARS = 60;
export const MIN_LAST_MIN = 20 * 60;

export const REPLAY_POOL = [
  { symbol: "SPCX", name: "SpaceX", yahoo: "SPCX", eur: ["SPX.F", "SPX.DE", "SPX.SG"] },
  { symbol: "TSLA", name: "Tesla", yahoo: "TSLA", eur: ["TL0.F", "TL0.DE", "TL0.SG"] },
  { symbol: "RKLB", name: "Rocket Lab", yahoo: "RKLB", eur: ["6RJ0.F", "6RJ0.SG", "6RJ0.MU"] },
  { symbol: "MRVL", name: "Marvell", yahoo: "MRVL", eur: ["9MW.F", "9MW.DE", "9MW.SG"] },
  { symbol: "NVDA", name: "NVIDIA", yahoo: "NVDA", eur: ["NVD.DE", "NVD.F"] }
];

/** Sichtbare Texte. Die Oberfläche nimmt nur diese Formulierungen. */
export const UI = {
  title: "Rückspiel",
  lede: "Ein zufälliger vergangener Tag, Kerze für Kerze. Name und Datum bleiben bis zum Schluss verdeckt.",
  stake: "Einsatz in €",
  leverage: "Hebel",
  spread: "Spread in %",
  spreadHint: "Anteil des Turbo-Preises je Handel. Wirkt auf das Konto, nicht auf das Ergebnis.",
  target: "Ziel in % vom Einsatz",
  targetHint: "Leer lassen, wenn keins.",
  reenter: "Wieder anlegen, % vom Konto",
  take: "Gewinn mitnehmen",
  takeShare: "Anteil in %",
  speed: "Zeitvorsprung",
  revived: "Konto neu bei 100 €",
  statsTrades: "Handel",
  statsRoundHits: "Runden im Plus",
  statsAvgWin: "Schnitt Gewinn",
  statsAvgLoss: "Schnitt Verlust",
  statsBest: "Beste Runde",
  statsWorst: "Schlechteste Runde",
  statsBalance: "Kontostand",
  balance: "Startkonto in €",
  priceNote: "Der Basiswert läuft in US-Dollar. Einsatz, Ergebnis und Konto sind Euro.",
  start: "Runde starten",
  stock: "Aktie ?",
  day: "Tag ?",
  pause: "Pause",
  step: "+1",
  skip: "bis 15:30",
  long: "Long",
  short: "Short",
  out: "Raus",
  weiter: "Nächste Kerze",
  play: "Play",
  oneMin: "1 Minute liegt im Archiv nicht vor. Gespeichert sind 5-Minuten-Kerzen, 10 Minuten werden daraus gebündelt.",
  allOut: "Komplett raus",
  stakePick: "Einsatz wählen",
  account: "Konto",
  result: "Ergebnis",
  newRound: "Neue Runde",
  settings: "Einstellungen",
  trades: "Handel",
  noTrades: "In dieser Runde kein Handel.",
  statsRounds: "Runden",
  statsHits: "Trefferquote",
  statsSum: "Summe",
  reasonZiel: "Ziel",
  reasonKo: "KO",
  reasonRaus: "Raus",
  quiet: "Kerzen ohne Umsatz sind blass.",
  loading: "Tage werden geladen …",
  missing: "Die Tage sind gerade nicht da.",
  noCandle: "Noch keine Kerze.",
  stakeFit: "Einsatz passt nicht ins Konto.",
  reveal: "Aufdeckung",
  endBalance: "Endstand",
  custom: "frei"
};

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function berlinParts(epochMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(new Date(epochMs));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + minute,
    weekday: get("weekday"),
    weekIndex: WEEKDAYS[get("weekday")] ?? -1
  };
}

export function isWeekday(epochMs) {
  const index = berlinParts(epochMs).weekIndex;
  return index >= 1 && index <= 5;
}

function roundPx(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function packBar(minute, open, high, low, close, volume) {
  const c = roundPx(close);
  const o = Number.isFinite(Number(open)) ? roundPx(open) : c;
  let h = Number.isFinite(Number(high)) ? roundPx(high) : Math.max(o, c);
  let l = Number.isFinite(Number(low)) ? roundPx(low) : Math.min(o, c);
  h = roundPx(Math.max(h, o, c));
  l = roundPx(Math.min(l, o, c));
  const vol = volume == null || Number.isNaN(Number(volume)) ? -1 : Math.max(0, Math.round(Number(volume)));
  return [minute, o, h, l, c, vol];
}

function fxAt(sorted, epoch) {
  if (!sorted?.length) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t <= epoch) {
      best = sorted[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (!best || !(best.c > 0)) return null;
  if (epoch - best.t > 6 * 3600 * 1000) return null;
  return best.c;
}

/**
 * Eine Berliner Sitzung. US-Dollar ab 10:00, davor deutsche Drucke umgerechnet.
 * `v === 0` ist ein Druck ohne Umsatz. `-1` heißt: Umsatz unbekannt.
 */
export function assembleDay(date, usPoints, eurSeries, fxPoints) {
  const fx = (fxPoints || []).slice().sort((a, b) => a.t - b.t);
  const chosen = new Map();

  for (const series of eurSeries || []) {
    const rank = Number(series.rank) || 0;
    for (const point of series.points || []) {
      if (!(point?.c > 0) || !Number.isFinite(point.t)) continue;
      const clock = berlinParts(point.t);
      if (clock.date !== date) continue;
      if (clock.minutes < SESSION_FROM || clock.minutes >= US_FROM_MIN) continue;
      const rate = fxAt(fx, point.t);
      if (!(rate > 0)) continue;
      const volume = point.v == null || Number.isNaN(Number(point.v)) ? -1 : Math.max(0, Math.round(Number(point.v)));
      const prev = chosen.get(clock.minutes);
      const prevVol = prev && prev.v > 0 ? prev.v : 0;
      const nextVol = volume > 0 ? volume : 0;
      if (prev && (nextVol < prevVol || (nextVol === prevVol && rank >= prev.rank))) continue;
      chosen.set(clock.minutes, {
        rank,
        v: volume,
        bar: packBar(clock.minutes, point.o * rate, point.h * rate, point.l * rate, point.c * rate, volume)
      });
    }
  }

  for (const point of usPoints || []) {
    if (!(point?.c > 0) || !Number.isFinite(point.t)) continue;
    const clock = berlinParts(point.t);
    if (clock.date !== date) continue;
    if (clock.minutes < US_FROM_MIN || clock.minutes >= SESSION_TO) continue;
    const volume = point.v == null || Number.isNaN(Number(point.v)) ? -1 : Math.max(0, Math.round(Number(point.v)));
    chosen.set(clock.minutes, {
      rank: -1,
      v: volume,
      bar: packBar(clock.minutes, point.o, point.h, point.l, point.c, volume)
    });
  }

  const bars = [...chosen.values()].map((item) => item.bar).sort((a, b) => a[0] - b[0]);
  if (bars.length < MIN_DAY_BARS) return null;
  if (bars[bars.length - 1][0] < MIN_LAST_MIN) return null;
  return bars;
}

export function unpackBar(bar) {
  return {
    t: bar[0],
    o: bar[1],
    h: bar[2],
    l: bar[3],
    c: bar[4],
    v: bar[5],
    span: Number(bar[6]) > 0 ? Number(bar[6]) : 0
  };
}

export function sessionBars(day) {
  return (day?.b || []).filter((bar) => Array.isArray(bar) && bar[0] >= SESSION_FROM && bar[0] < SESSION_TO && bar[4] > 0);
}

function barSpan(bar, fallback) {
  const span = Number(bar?.[6]);
  return span > 0 ? span : (fallback > 0 ? fallback : INTERVAL_MIN);
}

/** 5-minute bars before the US open, real 1-minute bars from 15:30. Nothing is filled in. */
export function mixSessionBars(fiveBars, oneBars) {
  const early = [];
  for (const bar of fiveBars || []) {
    if (!Array.isArray(bar) || bar[0] >= US_OPEN_MIN) continue;
    const next = bar.slice(0, 6);
    next[6] = 5;
    early.push(next);
  }
  const late = [];
  for (const bar of oneBars || []) {
    if (!Array.isArray(bar) || bar[0] < US_OPEN_MIN || bar[0] >= SESSION_TO) continue;
    const next = bar.slice(0, 6);
    next[6] = 1;
    late.push(next);
  }
  late.sort((a, b) => a[0] - b[0]);
  return { bars: early.concat(late), hasOne: late.length > 0 };
}

export function intervalMarks(bars) {
  let five = false;
  let one = false;
  let switchMin = null;
  for (const bar of bars || []) {
    const span = Number(bar?.[6]) || 0;
    if (span >= 5) five = true;
    if (span === 1) {
      one = true;
      if (switchMin == null) switchMin = bar[0];
    }
  }
  return { five, one, switchMin };
}

/** Bundle stored 5-minute bars. 1 minute is not invented. */
export function aggregateBars(bars, minutes) {
  if (minutes === 1) return null;
  const list = (bars || []).filter((bar) => Array.isArray(bar));
  if (!minutes || minutes === INTERVAL_MIN) return list.map((bar) => bar.slice());
  if (minutes % INTERVAL_MIN !== 0) return null;
  const out = [];
  let bucket = null;
  for (const bar of list) {
    const start = Math.floor(bar[0] / minutes) * minutes;
    if (!bucket || bucket.start !== start) {
      if (bucket) out.push(bucket.bar);
      bucket = { start, bar: [start, bar[1], bar[2], bar[3], bar[4], bar[5]] };
    } else {
      const packed = bucket.bar;
      packed[2] = Math.max(packed[2], bar[2]);
      packed[3] = Math.min(packed[3], bar[3]);
      packed[4] = bar[4];
      const left = packed[5];
      const right = bar[5];
      packed[5] = left < 0 || right < 0 ? Math.max(left, right) : left + right;
    }
  }
  if (bucket) out.push(bucket.bar);
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function num(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return fallback;
  const parsed = parseDecimal(value);
  return parsed == null ? fallback : parsed;
}

export function normalizeSettings(raw = {}) {
  const balance = clamp(num(raw.balance, START_EUROS), 10, 1_000_000);
  const stake = clamp(num(raw.stake, 100), 1, balance);
  const leverage = clamp(num(raw.leverage, 10), 1, 200);
  const spread = clamp(num(raw.spread, 0.005), 0, 0.25);
  const target = num(raw.takeProfitPct, 0);
  const again = num(raw.reenterPct, 0);
  return {
    balance,
    stake,
    leverage,
    spread,
    takeProfitPct: target > 0 ? clamp(target, 0.5, 500) : null,
    reenterPct: again > 0 ? clamp(again, 1, 100) : null,
    takeSharePct: clamp(num(raw.takeSharePct, 100), 1, 100)
  };
}

export function settingsFromFields(fields = {}) {
  const spreadPct = parseDecimal(fields.spread);
  const target = String(fields.target ?? "").trim();
  const again = String(fields.reenter ?? "").trim();
  return normalizeSettings({
    stake: parseDecimal(fields.stake),
    leverage: parseDecimal(fields.leverage),
    spread: spreadPct == null ? 0.005 : spreadPct / 100,
    balance: parseDecimal(fields.balance),
    takeProfitPct: target ? parseDecimal(target) : null,
    reenterPct: again ? parseDecimal(again) : null,
    takeSharePct: parseDecimal(fields.takeShare)
  });
}

export function poolName(index, symbol) {
  const pool = index?.pool?.length ? index.pool : REPLAY_POOL;
  return pool.find((item) => item.symbol === symbol)?.name || symbol;
}

export function pickRound(index, rng = Math.random, avoid = null) {
  let days = (index?.days || []).filter((day) => day?.s && day?.d && day.n >= 24);
  if (!days.length) return null;
  if (avoid?.symbol && avoid?.date && days.length > 1) {
    const rest = days.filter((day) => !(day.s === avoid.symbol && day.d === avoid.date));
    if (rest.length) days = rest;
  }
  const choice = days[Math.min(days.length - 1, Math.floor(rng() * days.length))];
  return {
    symbol: choice.s,
    name: poolName(index, choice.s),
    date: choice.d,
    n: choice.n
  };
}

export function hiddenLabels() {
  return { stock: UI.stock, day: UI.day };
}

export function eurosToCents(value) {
  return Math.round(Number(value) * 100);
}

export function knockBarrier(entry, leverage, side) {
  const gap = entry / leverage;
  return side === "short" ? entry + gap : entry - gap;
}

export function moveFraction(entry, price, side) {
  if (!(entry > 0) || !(price > 0)) return 0;
  const raw = (price - entry) / entry;
  return side === "short" ? -raw : raw;
}

/** Turbo-Wert in Cent. Unter null wird er null: das ist der Knock-out. */
export function theoreticalCents(stakeCents, leverage, entry, price, side) {
  const value = stakeCents * (1 + leverage * moveFraction(entry, price, side));
  return Math.max(0, Math.round(value));
}

/** Ergebnis = Einsatz × Hebel × Bewegung. Am Knock-out begrenzt auf den Einsatz. */
export function grossPnlCents(stakeCents, leverage, entry, price, side) {
  return theoreticalCents(stakeCents, leverage, entry, price, side) - stakeCents;
}

export function inspectCandle(position, candle, takeProfitPct) {
  if (!position || !candle) return null;
  const barrier = knockBarrier(position.entry, position.leverage, position.side);
  const knocked = position.side === "short" ? candle.h >= barrier : candle.l <= barrier;
  if (knocked) return { reason: "ko", price: barrier };
  if (takeProfitPct > 0) {
    const move = (takeProfitPct / 100) / position.leverage;
    const target = position.side === "short" ? position.entry * (1 - move) : position.entry * (1 + move);
    const hit = position.side === "short" ? candle.l <= target : candle.h >= target;
    if (hit && target > 0) return { reason: "ziel", price: target };
  }
  return null;
}

function applyClose(position, event, minute, settings, cashCents) {
  const value = event.reason === "ko"
    ? 0
    : theoreticalCents(position.stakeCents, position.leverage, position.entry, event.price, position.side);
  const exitFee = event.reason === "ko" ? 0 : Math.round(value * settings.spread);
  const payout = value - exitFee;
  const pnlCents = payout - position.stakeCents - position.entryFeeCents;
  const trade = {
    side: position.side,
    entryMin: position.entryMin,
    exitMin: minute,
    entry: position.entry,
    exit: event.reason === "ko" ? knockBarrier(position.entry, position.leverage, position.side) : event.price,
    reason: event.reason,
    pnlCents,
    stakeCents: position.stakeCents
  };
  let cash = cashCents + payout;
  let next = null;
  if (event.reason === "ziel" && settings.reenterPct > 0 && event.share !== "part") {
    const stake = Math.round(cash * settings.reenterPct / 100);
    const fee = Math.round(stake * settings.spread);
    if (stake >= 100 && cash >= stake + fee) {
      cash -= stake + fee;
      next = {
        side: position.side,
        entry: event.price,
        entryMin: minute,
        stakeCents: stake,
        leverage: position.leverage,
        entryFeeCents: fee
      };
    }
  }
  return { cashCents: cash, position: next, trade };
}

function settle(position, candle, settings, trades, cashCents) {
  let current = position;
  let cash = cashCents;
  for (let guard = 0; current && guard < 8; guard += 1) {
    const event = inspectCandle(current, candle, settings.takeProfitPct);
    if (!event) break;
    const closed = applyClose(current, event, candle.t, settings, cash);
    trades.push(closed.trade);
    cash = closed.cashCents;
    current = closed.position;
  }
  return { position: current, cashCents: cash };
}

export function createRound(day, settings) {
  const clean = normalizeSettings(settings);
  const startCents = eurosToCents(clean.balance);
  return {
    phase: "play",
    paused: true,
    speed: 1,
    marketMin: SESSION_FROM,
    visible: 0,
    bars: sessionBars(day),
    raw: sessionBars(day),
    interval: INTERVAL_MIN,
    intervalNote: "",
    cashCents: startCents,
    startCents,
    position: null,
    trades: [],
    settings: clean
  };
}

function finish(state) {
  let cashCents = state.cashCents;
  let position = state.position;
  const trades = state.trades.slice();
  if (position && state.visible > 0) {
    const candle = unpackBar(state.bars[state.visible - 1]);
    const closed = applyClose(position, { reason: "raus", price: candle.c }, SESSION_TO, state.settings, cashCents);
    trades.push(closed.trade);
    cashCents = closed.cashCents;
    position = null;
  }
  const done = { ...state, phase: "done", paused: true, marketMin: SESSION_TO, cashCents, position, trades };
  if (done.cashCents > 0) return done;
  return { ...done, cashCents: eurosToCents(START_EUROS), revived: (done.revived || 0) + 1 };
}

export function catchUp(state, marketMin) {
  if (!state || state.phase !== "play") return state;
  const limit = Math.min(Math.max(marketMin, state.marketMin), SESSION_TO);
  let visible = state.visible;
  let cashCents = state.cashCents;
  let position = state.position;
  const trades = state.trades.slice();
  while (visible < state.bars.length && state.bars[visible][0] + barSpan(state.bars[visible], state.interval) <= limit + 1e-9) {
    const candle = unpackBar(state.bars[visible]);
    if (position) {
      const settled = settle(position, candle, state.settings, trades, cashCents);
      position = settled.position;
      cashCents = settled.cashCents;
    }
    visible += 1;
  }
  const next = rescueBalance({ ...state, visible, cashCents, position, trades, marketMin: limit });
  if (limit >= SESSION_TO - 1e-9) return finish(next);
  return next;
}

/** One candle every 5 seconds at 100 %. 200 % is twice as fast. The candle size does not change the wait. */
export function tick(state, dtSec) {
  if (!state || state.phase !== "play" || state.paused || !(dtSec > 0)) return state;
  const pace = state.speed > 0 ? state.speed : 1;
  const every = 5 / pace;
  let acc = (state.acc || 0) + dtSec;
  let next = state;
  let steps = 0;
  while (acc >= every - 1e-9 && steps < 30 && next.phase === "play") {
    acc -= every;
    const bar = next.bars[next.visible];
    if (!bar) {
      next = finish({ ...next, paused: true, acc: 0 });
      break;
    }
    next = { ...catchUp(next, bar[0] + barSpan(bar, next.interval)), paused: false, acc };
    steps += 1;
  }
  if (next.phase !== "play") return next;
  return { ...next, acc, paused: false };
}

/** Show the first candles without naming the day. The rest stays hidden. */
export function previewRound(state, count = PREVIEW_BARS) {
  if (!state || !state.bars?.length) return state;
  const n = Math.min(count, state.bars.length);
  const last = state.bars[n - 1];
  return {
    ...state,
    raw: state.raw || state.bars,
    visible: n,
    marketMin: last[0] + state.interval,
    paused: true
  };
}

export function applyOneMinute(state, oneBars) {
  if (!state) return state;
  const late = (oneBars || []).filter((bar) => Array.isArray(bar) && bar[0] >= US_OPEN_MIN);
  if (!late.length) {
    return {
      ...state,
      intervalAsk: 1,
      intervalNote: "Für diesen Tag liegen keine 1-Minuten-Kerzen vor."
    };
  }
  const five = (state.raw || state.bars || []).map((bar) => bar.slice(0, 6));
  const mixed = mixSessionBars(five, late);
  let visible = 0;
  while (visible < mixed.bars.length && mixed.bars[visible][0] + barSpan(mixed.bars[visible], 5) <= state.marketMin + 1e-9) {
    visible += 1;
  }
  if (visible < 1) visible = Math.min(PREVIEW_BARS, mixed.bars.length);
  const last = mixed.bars[Math.max(0, visible - 1)];
  return {
    ...state,
    raw: five,
    oneBars: late,
    bars: mixed.bars,
    interval: 1,
    intervalAsk: 1,
    intervalNote: "",
    visible,
    marketMin: Math.max(state.marketMin, last[0] + barSpan(last, 1))
  };
}

export function withInterval(state, minutes) {
  if (!state) return state;
  if (minutes === 1) {
    if (state.oneBars?.length) return applyOneMinute(state, state.oneBars);
    return { ...state, intervalAsk: 1, intervalNote: "Für diesen Tag liegen keine 1-Minuten-Kerzen vor." };
  }
  const raw = state.raw || state.bars;
  const bars = aggregateBars(raw, minutes);
  if (!bars?.length) return { ...state, intervalNote: UI.oneMin };
  let visible = 0;
  while (visible < bars.length && bars[visible][0] + minutes <= state.marketMin + 1e-9) visible += 1;
  if (visible < 1) visible = Math.min(PREVIEW_BARS, bars.length);
  const last = bars[Math.max(0, visible - 1)];
  return {
    ...state,
    raw,
    bars,
    interval: minutes,
    visible,
    marketMin: Math.max(state.marketMin, last[0] + minutes),
    intervalNote: "",
    intervalAsk: minutes
  };
}

export function stepCandle(state) {
  if (!state || state.phase !== "play") return state;
  const nextBar = state.bars[state.visible];
  if (!nextBar) return finish({ ...state, paused: true });
  return { ...catchUp(state, nextBar[0] + barSpan(nextBar, state.interval)), paused: true };
}

export function skipToOpen(state) {
  if (!state || state.phase !== "play" || state.marketMin >= US_OPEN_MIN) return state;
  return { ...catchUp(state, US_OPEN_MIN), paused: true };
}

export function setSpeed(state, speed) {
  if (!state || state.phase !== "play") return state;
  const next = SPEEDS.includes(speed) ? speed : state.speed;
  return { ...state, speed: next, paused: false };
}

export function pauseRound(state) {
  if (!state || state.phase !== "play") return state;
  return { ...state, paused: true };
}

/** Next trade puts Einsatz plus the profit so far into the position, and never more than the account. */
export function tradeStakeCents(state) {
  const cash = Math.max(0, Number(state?.cashCents) || 0);
  const start = Number(state?.startCents) || eurosToCents(START_EUROS);
  const base = eurosToCents(state?.settings?.stake || START_EUROS);
  const profit = Math.max(0, cash - start);
  let wanted = Math.min(cash, base + profit);
  const spread = Number(state?.settings?.spread) || 0;
  const fee = Math.round(wanted * spread);
  if (wanted + fee > cash) wanted = Math.max(0, cash - Math.round(cash * spread));
  return wanted;
}

export function openTrade(state, side) {
  if (!state || state.phase !== "play" || state.position) return { state, ok: false, reason: "offen" };
  if (state.visible < 1) return { state, ok: false, reason: "candle" };
  let working = state;
  if (working.cashCents <= 0) {
    working = rescueBalance(working);
  }
  const cleanSide = side === "short" ? "short" : "long";
  const candle = unpackBar(working.bars[working.visible - 1]);
  const asked = eurosToCents(working.settings?.stake || 0);
  const started = Number(working.startCents) || eurosToCents(START_EUROS);
  if (asked > working.cashCents && asked > started) return { state: working, ok: false, reason: "stake" };
  const stake = tradeStakeCents(working);
  const fee = Math.round(stake * (Number(working.settings?.spread) || 0));
  if (stake < 100 || working.cashCents < stake + fee) return { state: working, ok: false, reason: "stake" };
  return {
    ok: true,
    state: {
      ...working,
      cashCents: working.cashCents - stake - fee,
      position: {
        side: cleanSide,
        entry: candle.c,
        entryMin: candle.t,
        stakeCents: stake,
        leverage: working.settings.leverage,
        entryFeeCents: fee
      }
    }
  };
}

/** Close anything open and end the round. The account stays for the next one. */
export function endRound(state) {
  if (!state || state.phase !== "play") return state;
  const closed = state.position ? closeManual(state) : state;
  return finish({ ...closed, paused: true });
}

export function speedLabel(speed) {
  return `${Math.round(Number(speed) * 100)} %`;
}

/** Fresh 100 € when a knock-out or a round leaves nothing. */
export function rescueBalance(state) {
  if (!state || state.position || state.cashCents > 0) return state;
  const cash = eurosToCents(START_EUROS);
  return {
    ...state,
    cashCents: cash,
    startCents: cash,
    revived: (state.revived || 0) + 1,
    settings: { ...(state.settings || {}), stake: START_EUROS, balance: START_EUROS }
  };
}

/** Close part or all of the open position. The rest stays. The payout returns to the account. */
export function takeShare(state, sharePct) {
  if (!state?.position || state.visible < 1 || state.phase !== "play") return state;
  const share = clamp(num(sharePct, state.settings?.takeSharePct || 100), 1, 100) / 100;
  const candle = unpackBar(state.bars[state.visible - 1]);
  const position = state.position;
  const partStake = Math.max(1, Math.round(position.stakeCents * share));
  const partFee = Math.round(position.entryFeeCents * (partStake / position.stakeCents));
  const part = { ...position, stakeCents: partStake, entryFeeCents: partFee };
  const trades = state.trades.slice();
  const closed = applyClose(part, { reason: "mitnehmen", price: candle.c, share: share < 0.999 ? "part" : "all" }, state.marketMin, state.settings, state.cashCents);
  trades.push(closed.trade);
  const left = position.stakeCents - partStake;
  const next = left >= 100 ? {
    ...position,
    stakeCents: left,
    entryFeeCents: Math.max(0, position.entryFeeCents - partFee)
  } : null;
  return rescueBalance({ ...state, cashCents: closed.cashCents, position: next, trades });
}

export function closeManual(state) {
  if (!state?.position || state.visible < 1) return state;
  const candle = unpackBar(state.bars[state.visible - 1]);
  const trades = state.trades.slice();
  const closed = applyClose(state.position, { reason: "raus", price: candle.c }, state.marketMin, state.settings, state.cashCents);
  trades.push(closed.trade);
  return rescueBalance({ ...state, cashCents: closed.cashCents, position: null, trades });
}

export function liveSnapshot(state) {
  const last = state?.visible > 0 ? unpackBar(state.bars[state.visible - 1]) : null;
  let equity = state?.cashCents || 0;
  let gross = 0;
  let barrier = null;
  let pct = 0;
  if (state?.position && last) {
    const value = theoreticalCents(state.position.stakeCents, state.position.leverage, state.position.entry, last.c, state.position.side);
    const exitFee = Math.round(value * state.settings.spread);
    equity += value - exitFee;
    gross = value - state.position.stakeCents;
    pct = state.position.stakeCents ? (gross / state.position.stakeCents) * 100 : 0;
    barrier = knockBarrier(state.position.entry, state.position.leverage, state.position.side);
  }
  return {
    price: last?.c ?? null,
    equityCents: equity,
    roundCents: equity - (state?.startCents || 0),
    grossCents: gross,
    pct,
    barrier,
    minute: state?.marketMin ?? SESSION_FROM
  };
}

export function roundSummary(meta, state) {
  return {
    id: `${meta.symbol}-${meta.date}-${state.cashCents}`,
    symbol: meta.symbol,
    name: meta.name,
    date: meta.date,
    pnlCents: state.cashCents - state.startCents,
    endCents: state.cashCents,
    tradeCount: state.trades.length,
    hitCount: state.trades.filter((trade) => trade.pnlCents > 0).length,
    at: ""
  };
}

export function historyStats(history) {
  const rounds = history?.rounds || [];
  let trades = 0;
  let hits = 0;
  let sum = 0;
  let roundHits = 0;
  let winSum = 0;
  let winCount = 0;
  let lossSum = 0;
  let lossCount = 0;
  let best = null;
  let worst = null;
  const balances = [];
  for (const round of rounds) {
    const pnl = Number(round.pnlCents) || 0;
    trades += Number(round.tradeCount) || 0;
    hits += Number(round.hitCount) || 0;
    sum += pnl;
    if (pnl > 0) {
      roundHits += 1;
      winSum += pnl;
      winCount += 1;
    } else if (pnl < 0) {
      lossSum += pnl;
      lossCount += 1;
    }
    if (best == null || pnl > best) best = pnl;
    if (worst == null || pnl < worst) worst = pnl;
    if (Number.isFinite(Number(round.endCents))) balances.push(Number(round.endCents));
  }
  return {
    rounds: rounds.length,
    hitRate: trades ? hits / trades : null,
    roundHitRate: rounds.length ? roundHits / rounds.length : null,
    sumCents: sum,
    tradeCount: trades,
    avgWinCents: winCount ? Math.round(winSum / winCount) : null,
    avgLossCents: lossCount ? Math.round(lossSum / lossCount) : null,
    bestCents: best,
    worstCents: worst,
    balances
  };
}

export function rememberRound(history, summary, at) {
  const row = { ...summary, at: at || summary.at || "" };
  return { rounds: [row, ...(history?.rounds || [])].slice(0, 40), settings: history?.settings || null };
}

export function loadHistory(storage) {
  try {
    const raw = JSON.parse(storage.getItem(REPLAY_STORE_KEY) || "");
    if (!raw || !Array.isArray(raw.rounds)) return { rounds: [], settings: raw?.settings || null };
    return { rounds: raw.rounds.slice(0, 40), settings: raw.settings || null };
  } catch {
    return { rounds: [], settings: null };
  }
}

export function saveHistory(storage, history) {
  storage.setItem(REPLAY_STORE_KEY, JSON.stringify({
    rounds: (history?.rounds || []).slice(0, 40),
    settings: history?.settings || null
  }));
}

export function formatMinute(min) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(min) || 0)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDayDe(iso) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatUsd(value) {
  if (!Number.isFinite(Number(value))) return "—";
  const body = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  return `${body} $`;
}

export function formatEuroCents(cents) {
  if (!Number.isFinite(Number(cents))) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(cents) / 100);
}

export function formatSignedEuroCents(cents) {
  const number = Number(cents);
  if (!Number.isFinite(number)) return "—";
  const body = formatEuroCents(Math.abs(number));
  if (number > 0) return `+${body}`;
  if (number < 0) return `−${body}`;
  return body;
}

export function formatSignedPct(value) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const body = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(number));
  if (number > 0) return `+${body} %`;
  if (number < 0) return `−${body} %`;
  return `${body} %`;
}

export function reasonLabel(reason) {
  if (reason === "ziel" || reason === "mitnehmen") return UI.take;
  if (reason === "ko") return UI.reasonKo;
  return UI.reasonRaus;
}

export function sideLabel(side) {
  return side === "short" ? UI.short : UI.long;
}
