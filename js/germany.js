/** Morning range on Xetra: 09:00 inclusive until 10:30, Berlin. */
export const MORNING_OPEN = 9 * 60;
export const MORNING_CLOSE = 10 * 60 + 30;
export const MORNING_SESSIONS = 21;

export const GERMANY_INTRO = "Aktien mit großem Auf und Ab zwischen 9:00 und 10:30 Uhr, bei Trade Republic mit Hebel handelbar.";

const BANNED = /kaufen|verkaufen|empfehlung|anlageberatung/i;

export function germanyCopyOk(text) {
  return !BANNED.test(String(text || ""));
}

function berlinFields(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    weekend: parts.weekday === "Sat" || parts.weekday === "Sun"
  };
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Average of (high − low) / open for the morning window, over the last 21 finished Xetra sessions.
 * `points` are { t, open, high, low, close }.
 */
export function morningSwing(points, now = new Date()) {
  const clock = berlinFields(now instanceof Date ? now : new Date(now));
  const byDay = new Map();
  for (const point of points || []) {
    const time = new Date(point?.t);
    if (Number.isNaN(time.getTime())) continue;
    const fields = berlinFields(time);
    if (fields.weekend) continue;
    if (fields.minutes < MORNING_OPEN || fields.minutes >= MORNING_CLOSE) continue;
    if (fields.day === clock.day && clock.minutes < MORNING_CLOSE) continue;
    const list = byDay.get(fields.day) || [];
    list.push({ ...point, minutes: fields.minutes });
    byDay.set(fields.day, list);
  }
  const sessions = [];
  for (const day of [...byDay.keys()].sort()) {
    const bars = byDay.get(day).sort((a, b) => a.minutes - b.minutes);
    const open = num(bars[0].open) ?? num(bars[0].close);
    const high = Math.max(...bars.map((bar) => num(bar.high) ?? num(bar.close) ?? Number.NEGATIVE_INFINITY));
    const low = Math.min(...bars.map((bar) => num(bar.low) ?? num(bar.close) ?? Number.POSITIVE_INFINITY));
    if (!(open > 0) || !Number.isFinite(high) || !Number.isFinite(low) || high < low) continue;
    sessions.push({ day, pct: ((high - low) / open) * 100 });
  }
  const used = sessions.slice(-MORNING_SESSIONS);
  if (!used.length) return { avgPct: null, maxPct: null, maxDay: null, n: 0 };
  const avg = used.reduce((sum, item) => sum + item.pct, 0) / used.length;
  let max = used[0];
  for (const item of used) {
    if (item.pct > max.pct || (item.pct === max.pct && item.day > max.day)) max = item;
  }
  return {
    avgPct: round1(avg),
    maxPct: round1(max.pct),
    maxDay: max.day,
    n: used.length
  };
}

export function sortByMorning(symbols) {
  return [...(symbols || [])].sort((a, b) => {
    const av = num(a?.morning?.avgPct);
    const bv = num(b?.morning?.avgPct);
    if (av == null && bv == null) return String(a?.name || "").localeCompare(String(b?.name || ""), "de");
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return String(a?.name || a?.symbol || "").localeCompare(String(b?.name || b?.symbol || ""), "de");
  });
}

export function morningLabel(morning) {
  if (morning?.avgPct == null || morning?.maxPct == null) return "Morgens noch offen";
  const format = (value) => new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
  return `Morgens Ø ${format(morning.avgPct)} % · max ${format(morning.maxPct)} %`;
}
