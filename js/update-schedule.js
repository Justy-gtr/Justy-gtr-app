/**
 * Fahrplan der Datenläufe, Europe/Berlin.
 * Nur diese Datei anfassen, wenn sich eine Uhrzeit ändert.
 * Tage: 0 Sonntag … 6 Samstag.
 */

const TIME_ZONE = "Europe/Berlin";
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const berlinFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const zonedFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short"
});

export const SCHEDULES = [
  {
    id: "prices",
    label: "Kurse",
    lines: [
      "Mo–Fr alle 5 Min von 05:00 bis 22:15",
      "Sa/So um 09:00, 14:00 und 20:00"
    ],
    rules: [
      { days: WEEKDAYS, start: [5, 0], end: [22, 15], every: 5 },
      { days: [6, 0], at: [[9, 0], [14, 0], [20, 0]] }
    ]
  },
  {
    id: "sentiment",
    label: "Stimmung-Lampe",
    lines: [
      "Mo–Fr 08:00–10:30 alle 5 Min",
      "10:50, dann 11:10–13:50 alle 20 Min",
      "14:10, dann 14:20–16:40 alle 5 Min",
      "Wochenende keine"
    ],
    rules: [
      { days: WEEKDAYS, start: [8, 0], end: [10, 30], every: 5 },
      { days: WEEKDAYS, at: [[10, 50]] },
      { days: WEEKDAYS, start: [11, 10], end: [13, 50], every: 20 },
      { days: WEEKDAYS, at: [[14, 10]] },
      { days: WEEKDAYS, start: [14, 20], end: [16, 40], every: 5 }
    ]
  },
  {
    id: "content",
    label: "Datenupdate",
    lines: [
      "Täglich 05:00, 06:30, 08:30, 09:30, 11:30, 13:00",
      "14:00, 15:00, 16:00, 18:00, 20:00, 22:00",
      "Meldungen, Kalender, Wahrscheinlichkeiten, Erklärtexte"
    ],
    rules: [
      {
        days: ALL_DAYS,
        at: [
          [5, 0], [6, 30], [8, 30], [9, 30], [11, 30], [13, 0],
          [14, 0], [15, 0], [16, 0], [18, 0], [20, 0], [22, 0]
        ]
      }
    ]
  },
  {
    id: "alarm",
    label: "Kursalarm",
    lines: ["Mo–Fr alle 15 Min von 15:00 bis 21:45"],
    rules: [
      { days: WEEKDAYS, start: [15, 0], end: [21, 45], every: 15 }
    ]
  },
  {
    id: "weekly",
    label: "Wochenrückblick",
    lines: ["Sonntag 18:00"],
    rules: [
      { days: [0], at: [[18, 0]] }
    ]
  }
];

/** Felder, die einen echten Zeitstempel tragen. Ohne Stempel keine Zeile. */
export const SOURCE_STAMPS = [
  { id: "prices", label: "Kurse", read: (data) => data?.prices?.asOf },
  { id: "sentiment", label: "Stimmung-Lampe", read: (data) => data?.sentiment?.updatedAt },
  { id: "alerts", label: "Meldungen", read: (data) => newest((data?.alerts?.alerts || []).map((item) => item?.timestamp)) },
  { id: "germany", label: "Deutschland", read: (data) => data?.germany?.asOf },
  { id: "weekly", label: "Wochenrückblick", read: (data) => data?.weekly?.updatedAt || data?.weekly?.asOf },
  { id: "posts", label: "Posts", read: (data) => data?.posts?.asOf },
  { id: "moonshots", label: "Moonshots", read: (data) => newest([data?.moonshots?.asOf, data?.moonshots?.fx?.asOf]) },
  { id: "seasonality", label: "Wochentage", read: (data) => data?.seasonality?.asOf },
  { id: "favorites", label: "Favoriten", read: (data) => data?.favorites?.asOf },
  { id: "crowd", label: "Schwarm", read: (data) => data?.crowd?.asOf },
  { id: "insiders", label: "Insider", read: (data) => data?.insiders?.asOf },
  { id: "production", label: "Produktion", read: (data) => data?.production?.asOf },
  { id: "track_record", label: "Treffer-Check", read: (data) => data?.track_record?.asOf },
  { id: "briefing", label: "Morgen-Briefing", read: (data) => data?.briefing?.date },
  { id: "daily_question", label: "Tagesfrage", read: (data) => data?.daily_question?.current?.date },
  { id: "calendar", label: "Kalender", read: (data) => data?.calendar?.updatedAt || data?.calendar?.asOf },
  { id: "scenarios", label: "Was-wäre-wenn", read: (data) => data?.scenarios?.updatedAt || data?.scenarios?.asOf },
  { id: "companies", label: "Erste Prinzipien", read: (data) => data?.companies?.updatedAt || data?.companies?.asOf },
  { id: "glossary", label: "Glossar", read: (data) => data?.glossary?.updatedAt || data?.glossary?.asOf },
  { id: "promises", label: "Versprechen", read: (data) => data?.promises?.updatedAt || data?.promises?.asOf }
];

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function partsOf(date) {
  const parts = Object.fromEntries(berlinFmt.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday]
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function clockOf(date) {
  const parts = partsOf(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function daysBetween(earlier, later) {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Wall clock in Europe/Berlin → instant. Same idea as logic.zonedWallTime. */
export function berlinWallTime(dateStr, timeStr) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  const clockMatch = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ""));
  if (!dateMatch || !clockMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const zoned = (ms) => {
    const parts = Object.fromEntries(zonedFmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute)
    );
  };
  let utc = desired;
  for (let step = 0; step < 3; step += 1) {
    const delta = zoned(utc) - desired;
    if (delta === 0) break;
    utc -= delta;
  }
  return new Date(utc);
}

function weekdayOf(dateStr) {
  const noon = berlinWallTime(dateStr, "12:00");
  return noon ? partsOf(noon).weekday : null;
}

function berlinInstant(dateStr, minutes) {
  return berlinWallTime(dateStr, `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
}

function ruleMinutes(rule) {
  if (rule.at) return rule.at.map(([hour, minute]) => hour * 60 + minute);
  const start = rule.start[0] * 60 + rule.start[1];
  const end = rule.end[0] * 60 + rule.end[1];
  const step = rule.every || 1;
  const minutes = [];
  for (let value = start; value <= end; value += step) minutes.push(value);
  return minutes;
}

function slotsFor(schedule, weekday) {
  const minutes = [];
  for (const rule of schedule.rules) {
    if (!rule.days.includes(weekday)) continue;
    minutes.push(...ruleMinutes(rule));
  }
  minutes.sort((a, b) => a - b);
  return [...new Set(minutes)];
}

export function nextUpdate(scheduleId, nowInput = new Date()) {
  const schedule = SCHEDULES.find((item) => item.id === scheduleId);
  if (!schedule) return null;
  const now = asDate(nowInput);
  const start = partsOf(now);
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addDays(start.date, offset);
    const weekday = weekdayOf(date);
    for (const minutes of slotsFor(schedule, weekday)) {
      const instant = berlinInstant(date, minutes);
      if (instant && instant.getTime() > now.getTime()) return instant;
    }
  }
  return null;
}

function dayLabel(date) {
  return dayFmt.format(date).replace(/\s+/g, " ").replace(/(\p{L})\./gu, "$1").trim();
}

export function formatNextUpdate(when, nowInput = new Date()) {
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) return "nächste: —";
  const now = asDate(nowInput);
  const clock = clockOf(when);
  const today = partsOf(now).date;
  const whenDay = partsOf(when).date;
  const delta = when.getTime() - now.getTime();
  let whenLabel = clock;
  if (whenDay === addDays(today, 1)) whenLabel = `morgen ${clock}`;
  else if (whenDay !== today) whenLabel = `${WEEKDAY_SHORT[partsOf(when).weekday]} ${clock}`;
  return `nächste: ${whenLabel} (${formatIn(delta)})`;
}

function formatIn(ms) {
  if (ms <= 30_000) return "gleich";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} Min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 36) return `in ${Math.max(1, hours)} Std`;
  const days = Math.max(1, Math.round(ms / 86_400_000));
  return days === 1 ? "in 1 Tag" : `in ${days} Tagen`;
}

function parseStamp(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = berlinWallTime(text, "12:00");
    return date ? { date, dateOnly: true, day: text } : null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return { date, dateOnly: false, day: partsOf(date).date };
}

function stampMs(value) {
  const parsed = parseStamp(value);
  return parsed ? parsed.date.getTime() : NaN;
}

function newest(values) {
  let best = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values || []) {
    const ms = stampMs(value);
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

export function formatLastUpdate(value, nowInput = new Date()) {
  const parsed = parseStamp(value);
  if (!parsed) return "";
  const now = asDate(nowInput);
  const today = partsOf(now).date;
  if (parsed.dateOnly) {
    const days = daysBetween(parsed.day, today);
    if (days === 0) return "heute";
    if (days === 1) return "gestern";
    if (days > 1 && days < 7) return `vor ${days} Tagen`;
    return dayLabel(parsed.date);
  }
  const clock = clockOf(parsed.date);
  const ms = now.getTime() - parsed.date.getTime();
  if (ms < 60_000 && ms > -60_000) return `gerade eben · ${clock}`;
  if (parsed.day === today && ms >= 0) {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `vor ${minutes} Min · ${clock}`;
    return `vor ${Math.floor(ms / 3_600_000)} Std · ${clock}`;
  }
  if (parsed.day === addDays(today, -1)) return `gestern · ${clock}`;
  return `${dayLabel(parsed.date)} · ${clock}`;
}

export function sourceUpdates(data, nowInput = new Date()) {
  const now = asDate(nowInput);
  return SOURCE_STAMPS.map((source) => {
    let raw = null;
    try {
      raw = source.read(data);
    } catch {
      raw = null;
    }
    if (!raw) return null;
    const text = formatLastUpdate(raw, now);
    if (!text) return null;
    return { id: source.id, label: source.label, text };
  }).filter(Boolean);
}
