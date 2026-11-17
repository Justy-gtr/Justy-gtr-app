import { berlinClock } from "./seasonality.js";

/** How often the open app and the afternoon job look again. */
export const QUARTER_MS = 15 * 60 * 1000;

/**
 * GitHub cron is UTC and has no summer time.
 * 12:00 UTC is 14:00 Berlin in summer, 13:00 UTC is 14:00 Berlin in winter.
 * 20:00 UTC is 22:00 Berlin in summer, 21:00 UTC is 22:00 Berlin in winter.
 */
export const AFTERNOON_CRON = "*/15 12-21 * * 1-5";

export function berlinWeekday(date = new Date()) {
  const clock = berlinClock(date);
  if (!clock?.date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clock.date);
  if (!match) return null;
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return { ...clock, weekday };
}

/** Monday to Friday, 14:00 through 22:00 Europe/Berlin, including the 22:00 mark. */
export function inAfternoonRefresh(date = new Date()) {
  const clock = berlinWeekday(date);
  if (!clock || clock.weekday === 0 || clock.weekday === 6) return false;
  const minutes = clock.hour * 60 + clock.minute;
  return minutes >= 14 * 60 && minutes <= 22 * 60;
}
