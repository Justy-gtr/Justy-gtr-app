/**
 * Rückspiel-Archiv: 5-Minuten-Kerzen der letzten etwa 60 Tage.
 *
 * Yahoo Chart, includePrePost. US-Ticker ab 10:00 Berlin (Vorbörse, Umsatz oft 0).
 * Davor deutsche Drucke, über EURUSD in US-Dollar. Fenster 08:00–22:00 Berlin.
 *
 * Idempotent: liegende Tage bleiben. Nur fehlende Tage und die letzten zwei
 * Berliner Tage werden neu geschrieben. Ein täglicher Lauf reicht, nicht der
 * Fünf-Minuten-Kursjob. Beispiel, einmal nach Handelsschluss:
 *
 *   node scripts/fetch-replay.mjs
 *
 * --dry-run schreibt nichts. --symbol TSLA begrenzt den Lauf.
 */
import fs from "node:fs";
import path from "node:path";
import {
  INTERVAL_MIN,
  MIN_LAST_MIN,
  REPLAY_POOL,
  SESSION_FROM,
  SESSION_TO,
  assembleDay,
  berlinParts
} from "../js/replay.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "data", "replay");
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (compatible; JustyGTR/1.0; +https://github.com/Justy-gtr/Justy-gtr-app)";

function args() {
  const dry = process.argv.includes("--dry-run");
  const symbolFlag = process.argv.indexOf("--symbol");
  const only = symbolFlag >= 0 ? String(process.argv[symbolFlag + 1] || "").toUpperCase() : "";
  return { dry, only };
}

async function fetchChart(symbol) {
  let lastError = null;
  for (const host of HOSTS) {
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, host);
    url.searchParams.set("interval", "5m");
    url.searchParams.set("range", "60d");
    url.searchParams.set("includePrePost", "true");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(20000)
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`${symbol} HTTP ${response.status}`);
        const body = await response.json();
        const result = body?.chart?.result?.[0];
        if (!result) return null;
        return pointsOf(result);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error(`${symbol} fehlgeschlagen`);
}

function pointsOf(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const points = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = quote.close?.[index];
    if (close == null || Number.isNaN(Number(close)) || !(Number(close) > 0)) continue;
    points.push({
      t: timestamps[index] * 1000,
      o: numberOrNull(quote.open?.[index]),
      h: numberOrNull(quote.high?.[index]),
      l: numberOrNull(quote.low?.[index]),
      c: Number(close),
      v: quote.volume?.[index] == null ? null : Number(quote.volume[index])
    });
  }
  return points;
}

function numberOrNull(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function dayFile(symbol, date) {
  return path.join(DIR, symbol, `${date}.json`);
}

function dayComplete(day) {
  const bars = day?.b;
  return Array.isArray(bars) && bars.length >= 60 && bars[bars.length - 1][0] >= MIN_LAST_MIN;
}

function datesOf(points) {
  const dates = new Set();
  for (const point of points || []) {
    const clock = berlinParts(point.t);
    if (clock.weekIndex >= 1 && clock.weekIndex <= 5) dates.add(clock.date);
  }
  return dates;
}

function berlinOffset(epoch) {
  const clock = berlinParts(epoch);
  const utc = new Date(epoch);
  let diff = clock.minutes - (utc.getUTCHours() * 60 + utc.getUTCMinutes());
  if (diff < -12 * 60) diff += 24 * 60;
  if (diff > 12 * 60) diff -= 24 * 60;
  const sign = diff >= 0 ? "+" : "-";
  const abs = Math.abs(diff);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function stamp(epoch = Date.now()) {
  const clock = berlinParts(epoch);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(epoch));
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${clock.date}T${get("hour")}:${get("minute")}:${get("second")}${berlinOffset(epoch)}`;
}

function daysBefore(date, today) {
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

async function main() {
  const { dry, only } = args();
  const pool = REPLAY_POOL.filter((item) => !only || item.symbol === only);
  if (!pool.length) throw new Error(`Unbekanntes Symbol ${only}`);
  const today = berlinParts(Date.now()).date;
  const previous = readJson(path.join(DIR, "index.json")) || { days: [] };

  console.log(`EURUSD und ${pool.map((item) => item.symbol).join(", ")} …`);
  const fx = await fetchChart("EURUSD=X");
  if (!fx?.length) throw new Error("EURUSD ohne Daten");

  const built = [];
  let written = 0;
  let kept = 0;

  for (const spec of pool) {
    const us = await fetchChart(spec.yahoo);
    if (!us?.length) {
      console.warn(`${spec.symbol}: keine US-Reihe`);
      continue;
    }
    const eurSeries = [];
    for (const [rank, symbol] of spec.eur.entries()) {
      try {
        const points = await fetchChart(symbol);
        if (points?.length) eurSeries.push({ rank, points });
      } catch (error) {
        console.warn(`${symbol}: ${error.message}`);
      }
    }
    const dates = datesOf(us);
    for (const series of eurSeries) {
      for (const date of datesOf(series.points)) dates.add(date);
    }
    for (const date of [...dates].sort()) {
      const file = dayFile(spec.symbol, date);
      const existing = readJson(file);
      const recent = daysBefore(date, today) <= 2;
      if (!recent && dayComplete(existing)) {
        built.push({ s: spec.symbol, d: date, n: existing.b.length });
        kept += 1;
        continue;
      }
      const bars = assembleDay(date, us, eurSeries, fx);
      if (!bars) {
        if (!dry && recent && existing) fs.rmSync(file, { force: true });
        continue;
      }
      const payload = { s: spec.symbol, d: date, b: bars };
      const body = `${JSON.stringify(payload)}\n`;
      if (!dry) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === body) kept += 1;
        else {
          fs.writeFileSync(file, body);
          written += 1;
        }
      } else if (!dayComplete(existing)) written += 1;
      built.push({ s: spec.symbol, d: date, n: bars.length });
    }
  }

  const seen = new Set(built.map((day) => `${day.s}:${day.d}`));
  for (const old of previous.days || []) {
    if (only && old.s !== only) {
      if (!seen.has(`${old.s}:${old.d}`)) built.push(old);
      continue;
    }
    if (seen.has(`${old.s}:${old.d}`)) continue;
    if (dayComplete(readJson(dayFile(old.s, old.d)))) built.push({ s: old.s, d: old.d, n: old.n });
  }
  built.sort((a, b) => a.d.localeCompare(b.d) || a.s.localeCompare(b.s));

  const index = {
    schema: 1,
    updated: stamp(),
    tz: "Europe/Berlin",
    intervalMin: INTERVAL_MIN,
    fromMin: SESSION_FROM,
    toMin: SESSION_TO,
    price: "USD",
    note: "Basiswert in US-Dollar. Einsatz und Ergebnis in Euro. Kerzen mit Umsatz 0 sind Vorbörse oder Nachbörse.",
    pool: REPLAY_POOL.map((item) => ({ symbol: item.symbol, name: item.name, yahoo: item.yahoo })),
    days: built
  };
  if (!dry) fs.writeFileSync(path.join(DIR, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`${dry ? "Trockenlauf" : "Geschrieben"}: ${written} neu, ${kept} unverändert, ${built.length} Tage im Index.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
