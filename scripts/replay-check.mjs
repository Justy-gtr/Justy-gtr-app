import fs from "node:fs";
import path from "node:path";
import { REPLAY_POOL, SESSION_FROM, SESSION_TO } from "../js/replay.js";

const BANNED = /kaufen|verkaufen|empfehlung|kaufsignal|anlageberatung/i;
const SECRET = /(api[_-]?key|secret_key|AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20})/;

export function checkReplayArchive(root) {
  const errors = [];
  const dir = path.join(root, "data", "replay");
  const indexFile = path.join(dir, "index.json");
  if (!fs.existsSync(indexFile)) {
    errors.push("fehlt: data/replay/index.json");
    return errors;
  }
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  } catch (error) {
    errors.push(`kein JSON: data/replay/index.json (${error.message})`);
    return errors;
  }
  const text = fs.readFileSync(indexFile, "utf8");
  if (SECRET.test(text)) errors.push("Schlüssel-Muster in data/replay/index.json");
  if (BANNED.test(text)) errors.push("verbotenes Wort in data/replay/index.json");
  if (index.schema !== 1) errors.push("replay.schema");
  if (index.tz !== "Europe/Berlin") errors.push("replay.tz");
  if (index.price !== "USD") errors.push("replay.price");
  if (index.intervalMin !== 5) errors.push("replay.interval");
  const symbols = new Set((index.pool || []).map((item) => item.symbol));
  for (const spec of REPLAY_POOL) {
    if (!symbols.has(spec.symbol)) errors.push(`replay.pool fehlt ${spec.symbol}`);
  }
  const days = index.days || [];
  if (days.length < REPLAY_POOL.length * 10) errors.push("replay.days zu wenig");
  const seen = new Set();
  for (const day of days) {
    const key = `${day.s}:${day.d}`;
    if (seen.has(key)) errors.push(`replay doppelt ${key}`);
    seen.add(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.d || "")) errors.push(`replay datum ${key}`);
    const file = path.join(dir, day.s, `${day.d}.json`);
    if (!fs.existsSync(file)) {
      errors.push(`fehlt: data/replay/${day.s}/${day.d}.json`);
      continue;
    }
    let body;
    try {
      body = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`kein JSON: ${day.s}/${day.d} (${error.message})`);
      continue;
    }
    if (body.s !== day.s || body.d !== day.d) errors.push(`replay kopf ${key}`);
    if (!Array.isArray(body.b) || body.b.length !== day.n) errors.push(`replay n ${key}`);
    let prev = -1;
    for (const bar of body.b || []) {
      if (!Array.isArray(bar) || bar.length !== 6) {
        errors.push(`replay balken ${key}`);
        break;
      }
      const [minute, open, high, low, close, volume] = bar;
      if (minute < SESSION_FROM || minute >= SESSION_TO || minute < prev) {
        errors.push(`replay zeit ${key} ${minute}`);
        break;
      }
      prev = minute;
      if (![open, high, low, close].every((value) => typeof value === "number" && value > 0)) {
        errors.push(`replay preis ${key}`);
        break;
      }
      if (high < low || high + 1e-6 < Math.max(open, close) || low - 1e-6 > Math.min(open, close)) {
        errors.push(`replay spanne ${key}`);
        break;
      }
      if (typeof volume !== "number") {
        errors.push(`replay umsatz ${key}`);
        break;
      }
    }
  }
  return errors;
}
