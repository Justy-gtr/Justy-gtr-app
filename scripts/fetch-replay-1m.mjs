/**
 * 1-Minuten-Kerzen aus Alpaca IEX für das Rückspiel.
 * Nur die US-Sitzung ab 15:30 Berlin. Vorher bleiben die 5-Minuten-Kerzen.
 * Keine erfundenen Minuten. Ohne Schlüssel wird nichts geschrieben.
 *
 *   node scripts/fetch-replay-1m.mjs
 *   node scripts/fetch-replay-1m.mjs --force
 */
import fs from "node:fs";
import path from "node:path";
import { alpacaCredentials, assertMarketDataUrl, publicError, DATA_ORIGIN } from "./alpaca.mjs";
import { REPLAY_POOL, SESSION_TO, US_OPEN_MIN, berlinParts } from "../js/replay.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "data", "replay", "1m");
const INDEX = path.join(ROOT, "data", "replay", "index.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function recentDates(days, count = 3) {
  return [...new Set(days.map((day) => day.d))].sort().slice(-count);
}

async function fetchBars(symbol, date, creds) {
  let token = null;
  const rows = [];
  let retries = 0;
  for (let page = 0; page < 4; page += 1) {
    const url = new URL("/v2/stocks/bars", DATA_ORIGIN);
    url.searchParams.set("symbols", symbol);
    url.searchParams.set("timeframe", "1Min");
    url.searchParams.set("feed", "iex");
    url.searchParams.set("adjustment", "raw");
    url.searchParams.set("limit", "10000");
    url.searchParams.set("start", `${date}T12:00:00Z`);
    url.searchParams.set("end", `${date}T22:30:00Z`);
    if (token) url.searchParams.set("page_token", token);
    assertMarketDataUrl(url);
    const response = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.key,
        "APCA-API-SECRET-KEY": creds.secret,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 429) {
      retries += 1;
      if (retries > 5) throw new Error("HTTP 429");
      await sleep(1500);
      page -= 1;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    rows.push(...(body?.bars?.[symbol] || []));
    token = typeof body?.next_page_token === "string" ? body.next_page_token : "";
    if (!token) break;
  }
  return rows;
}

export function packOneMinute(symbol, date, rows) {
  const seen = new Set();
  const bars = [];
  for (const bar of rows || []) {
    const time = Date.parse(bar?.t);
    const parts = berlinParts(time);
    if (!parts || parts.date !== date) continue;
    if (parts.minutes < US_OPEN_MIN || parts.minutes >= SESSION_TO) continue;
    if (seen.has(parts.minutes)) continue;
    const close = Number(bar.c);
    if (!(close > 0)) continue;
    const open = Number(bar.o) > 0 ? Number(bar.o) : close;
    const high = Math.max(Number(bar.h) || close, open, close);
    const low = Math.min(Number(bar.l) > 0 ? Number(bar.l) : close, open, close);
    const volume = Number.isFinite(Number(bar.v)) ? Math.round(Number(bar.v)) : 0;
    seen.add(parts.minutes);
    bars.push([parts.minutes, round4(open), round4(high), round4(low), round4(close), volume]);
  }
  bars.sort((a, b) => a[0] - b[0]);
  return {
    s: symbol,
    d: date,
    src: "alpaca-iex",
    session: "US ab 15:30 Berlin",
    b: bars
  };
}

function writeDoc(doc) {
  const dir = path.join(OUT, doc.s);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${doc.d}.json`), JSON.stringify(doc));
}

async function main() {
  const creds = alpacaCredentials();
  if (!creds) {
    console.log("Alpaca-Schlüssel fehlen. Es wird nichts geholt.");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  const scheduled = process.env.GITHUB_EVENT_NAME === "schedule";
  const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const symbols = REPLAY_POOL.map((item) => item.symbol);
  const fresh = new Set(recentDates(index.days || []));
  let written = 0;
  let skipped = 0;
  const days = [];
  for (const day of index.days || []) {
    if (!symbols.includes(day.s)) continue;
    const target = path.join(OUT, day.s, `${day.d}.json`);
    const refresh = force || (scheduled && fresh.has(day.d));
    if (fs.existsSync(target) && !refresh) {
      skipped += 1;
      const kept = JSON.parse(fs.readFileSync(target, "utf8"));
      days.push({ s: day.s, d: day.d, n: kept.b?.length || 0 });
      continue;
    }
    try {
      const rows = await fetchBars(day.s, day.d, creds);
      const doc = packOneMinute(day.s, day.d, rows);
      if (doc.b.length < 30) {
        console.log(`${day.s} ${day.d}: nur ${doc.b.length} Kerzen, Datei bleibt liegen`);
        if (fs.existsSync(target)) {
          const kept = JSON.parse(fs.readFileSync(target, "utf8"));
          days.push({ s: day.s, d: day.d, n: kept.b?.length || 0 });
        }
      } else {
        writeDoc(doc);
        days.push({ s: day.s, d: day.d, n: doc.b.length });
        written += 1;
        console.log(`${day.s} ${day.d}: ${doc.b.length}`);
      }
    } catch (error) {
      console.log(`::warning::${day.s} ${day.d}: ${publicError(error, creds)}`);
    }
    await sleep(350);
  }
  days.sort((a, b) => a.d.localeCompare(b.d) || a.s.localeCompare(b.s));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    schema: 1,
    source: "alpaca-iex",
    session: "US 15:30–22:00 Europe/Berlin",
    note: "Vor 15:30 bleiben die 5-Minuten-Kerzen. Ab 15:30 die echten 1-Minuten-Kerzen von IEX. Nichts wird aufgefüllt.",
    days
  }));
  console.log(`geschrieben ${written}, unverändert ${skipped}, Einträge ${days.length}`);
}

const entry = process.argv[1] || "";
if (entry.endsWith("fetch-replay-1m.mjs")) main();
