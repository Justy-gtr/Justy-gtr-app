/** Tagesbewegungen um alte Termine. Prozent erst ab sieben Fällen. */

export const HISTORY_MIN_N = 7;
export const MOVE_THRESHOLD = 5;

export function shiftIso(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Letzte gut zwei Jahre bis zum letzten Tageskurs. */
export function barsInWindow(bars, { years = 2, extraDays = 40 } = {}) {
  if (!bars?.length) return [];
  const end = bars[bars.length - 1].date;
  const start = shiftIso(end, -(365 * years + extraDays));
  return bars.filter((bar) => bar.date >= start && bar.date <= end);
}

/**
 * Reaktion am nächsten Handelstag nach einem Termin nach US-Schluss.
 * Basis ist der Schluss am Termin-Tag, sonst der letzte Schluss davor.
 */
export function catalystMoves(bars, dates, threshold = MOVE_THRESHOLD) {
  const unique = [...new Set((dates || []).filter(Boolean))].sort();
  const moves = [];
  let up = 0;
  let down = 0;
  for (const date of unique) {
    let baseIndex = -1;
    for (let index = bars.length - 1; index >= 0; index -= 1) {
      if (bars[index].date <= date) {
        baseIndex = index;
        break;
      }
    }
    if (baseIndex < 0 || baseIndex >= bars.length - 1) continue;
    const base = bars[baseIndex];
    const next = bars[baseIndex + 1];
    if (!(base.close > 0) || !(next.close > 0)) continue;
    const raw = ((next.close - base.close) / base.close) * 100;
    if (raw >= threshold) up += 1;
    if (raw <= -threshold) down += 1;
    moves.push({
      date,
      base: base.date,
      reaction: next.date,
      pct: Math.round(raw * 100) / 100
    });
  }
  const n = moves.length;
  return { n, up, down, showPct: n >= HISTORY_MIN_N, moves };
}

/** Anteil der Tage mit einer Schluss-zu-Schluss-Bewegung von mindestens `threshold` Prozent. */
export function wideDays(bars, threshold = MOVE_THRESHOLD) {
  let n = 0;
  let wide = 0;
  for (let index = 1; index < (bars || []).length; index += 1) {
    const prev = bars[index - 1].close;
    const close = bars[index].close;
    if (!(prev > 0) || !(close > 0)) continue;
    n += 1;
    const raw = ((close - prev) / prev) * 100;
    if (Math.abs(raw) >= threshold) wide += 1;
  }
  return {
    n,
    wide,
    sharePct: n >= HISTORY_MIN_N ? Math.round((wide / n) * 100) : null,
    showPct: n >= HISTORY_MIN_N
  };
}
