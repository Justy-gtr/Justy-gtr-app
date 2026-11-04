import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** Fixed local times in Europe/Berlin, plus the weekday US cash window. */
export const FIXED_SLOTS = [
  [5, 0],
  [6, 30],
  [8, 30],
  [9, 30],
  [11, 30],
  [13, 0],
  [14, 0],
  [15, 0],
  [16, 0],
  [18, 0],
  [20, 0],
  [22, 0]
];

const SLOT_TOLERANCE_MIN = 14;
const US_START = 15 * 60 + 30;
const US_END = 22 * 60 + SLOT_TOLERANCE_MIN;

export function berlinParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday]
  };
}

/**
 * Cron is UTC and cannot express Europe/Berlin across DST.
 * The workflow therefore runs on a UTC grid, and this gate keeps only
 * the Berlin slots Justy asked for.
 */
export function shouldRun(parts, { force = false } = {}) {
  if (force) return true;
  const minutes = parts.hour * 60 + parts.minute;
  const weekday = parts.weekday;
  if (weekday >= 0 && weekday <= 4 && minutes >= US_START && minutes <= US_END) return true;
  return FIXED_SLOTS.some(([hour, minute]) => {
    const delta = minutes - (hour * 60 + minute);
    return delta >= 0 && delta <= SLOT_TOLERANCE_MIN;
  });
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const force = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" || process.argv.includes("--force");
  const parts = berlinParts(new Date());
  const run = shouldRun(parts, { force });
  const line = `run=${run ? "true" : "false"}\n`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
  console.log(
    `Berlin ${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ` +
      `Wochentag ${parts.weekday} force=${force} run=${run}`
  );
}
