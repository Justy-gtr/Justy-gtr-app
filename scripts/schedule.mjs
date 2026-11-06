import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { usSessionActive } from "./market.mjs";

/** Feste Uhrzeiten Europe/Berlin. Am Wochenende zählt ein Lauf,
 *  wenn er höchstens SLOT_TOLERANCE_MIN nach so einem Slot startet.
 *  Werktags entscheidet das Band in shouldRun, nicht diese Liste. */
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

/** GitHub startet den Cron oft später als geplant. 45 Minuten reichen,
 *  damit ein verspäteter Wochenend-Lauf noch zählt. */
const SLOT_TOLERANCE_MIN = 45;
const WEEKDAY_START = 5 * 60;
const WEEKDAY_END = 22 * 60 + 15;

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
 * Cron ist UTC und kann Europe/Berlin über die Sommerzeit nicht ausdrücken.
 * Der Workflow läuft deshalb auf einem UTC-Gitter, und dieses Tor entscheidet.
 * Mo–Fr: jeder Start zwischen 05:00 und 22:15 Berlin zählt, auch wenn der
 * Cron später als der 5-Minuten-Takt kommt. Zusätzlich, solange in New York
 * Vorbörse, Regulärhandel oder Nachhandel läuft (plus 30 Minuten Puffer).
 * Sa/So: nur die festen Slots, mit 45 Minuten Toleranz danach.
 */
export function shouldRun(parts, { force = false, usOpen = false } = {}) {
  if (force) return true;
  const minutes = parts.hour * 60 + parts.minute;
  const weekday = parts.weekday;
  if (weekday >= 0 && weekday <= 4 && minutes >= WEEKDAY_START && minutes <= WEEKDAY_END) return true;
  if (usOpen) return true;
  if (weekday >= 0 && weekday <= 4) return false;
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
  const now = new Date();
  const parts = berlinParts(now);
  const run = shouldRun(parts, { force, usOpen: usSessionActive(now) });
  const line = `run=${run ? "true" : "false"}\n`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
  console.log(
    `Berlin ${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ` +
      `Wochentag ${parts.weekday} force=${force} run=${run}`
  );
}
