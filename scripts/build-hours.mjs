import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPLAY = path.join(ROOT, "data", "replay");
const FILE = path.join(ROOT, "data", "hours.json");

function weekdayOf(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return -1;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function addMove(bucket, weekday, hour, up) {
  if (weekday < 1 || weekday > 5 || hour < 0 || hour > 23) return;
  const day = bucket[weekday] || (bucket[weekday] = {});
  const cell = day[hour] || (day[hour] = { up: 0, down: 0, n: 0 });
  if (up) cell.up += 1;
  else cell.down += 1;
  cell.n += 1;
}

function hourFromBars(bars) {
  const slots = new Map();
  for (const bar of bars || []) {
    if (!Array.isArray(bar) || !(bar[4] > 0)) continue;
    const hour = Math.floor(Number(bar[0]) / 60);
    if (hour < 8 || hour > 21) continue;
    const slot = slots.get(hour) || { open: bar[1], close: bar[4] };
    slot.close = bar[4];
    slots.set(hour, slot);
  }
  const moves = [];
  for (const [hour, slot] of slots) {
    if (slot.close === slot.open) continue;
    moves.push({ hour, up: slot.close > slot.open });
  }
  return moves;
}

export function buildHours(root = ROOT) {
  const symbols = {};
  const indexPath = path.join(root, "data", "replay", "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  for (const day of index.days || []) {
    const file = path.join(root, "data", "replay", day.s, `${day.d}.json`);
    if (!fs.existsSync(file)) continue;
    const weekday = weekdayOf(day.d);
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const bucket = symbols[day.s] || (symbols[day.s] = {});
    for (const move of hourFromBars(doc.b)) addMove(bucket, weekday, move.hour, move.up);
  }
  return {
    schema: 1,
    asOf: index.updated || new Date().toISOString(),
    timezone: "Europe/Berlin",
    note: "Je Wochentag und Stunde, Schluss gegen Eröffnung. Flache Stunden zählen nicht.",
    symbols
  };
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const next = buildHours(ROOT);
  fs.writeFileSync(FILE, `${JSON.stringify(next)}\n`);
  const sample = next.symbols.TSLA?.["2"]?.["15"];
  console.log("data/hours.json geschrieben.", sample ? `TSLA Dienstag 15 Uhr n=${sample.n}` : "");
}
