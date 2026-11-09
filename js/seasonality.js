import { MIN_CASES } from "./analysis.js";
import { esc } from "./logic.js";

export { MIN_CASES };

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr"];
export const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
export const HOUR_SLOTS = ["15:30", "16:30", "17:30", "18:30", "19:30", "20:30", "21:30"];

/** Same idea as the Muster card: n is this stock's own comparable cases, not the market. */
export const SEASON_N_LEGEND = "n zählt vergleichbare Tage und Stunden dieser Aktie, nicht den ganzen Markt.";
export const PAST_NOTE = "Vergangenheit, keine Vorhersage.";

/** Days this close are not a pattern. A few points, including a coin-flip around 50 %. */
const TINY_SPREAD = 4;
const NEAR_HALF = 3;
const MAX_DAILY_GAP = 7;

const BERLIN = "Europe/Berlin";
const NEW_YORK = "America/New_York";

function round2(value) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100)) / 100;
}

function weekdayFromDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function clockIn(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: dateKey, hour, minute: Number(parts.minute) };
}

/** Berlin wall time from a real timestamp. DST is whatever Europe/Berlin says that day. */
export function berlinClock(instant) {
  return clockIn(instant, BERLIN);
}

export function berlinDay(instant) {
  return berlinClock(instant)?.date || null;
}

function nyClock(instant) {
  return clockIn(instant, NEW_YORK);
}

/** Trading day of a US listing. A date-only string is already that day. */
export function tradingDate(value) {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return nyClock(raw)?.date || null;
}

function daysBetween(earlier, later) {
  const [ay, am, ad] = earlier.split("-").map(Number);
  const [by, bm, bd] = later.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function addDays(isoDate, delta) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
}

function inRange(date, range) {
  if (!range || !date) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/**
 * US regular session in Berlin, one slot per clock hour starting at :30.
 * Returns null outside 15:30–21:30, so a daylight-saving mismatch (14:30) stays out
 * instead of being painted onto the wrong hour.
 */
export function hourSlot(instant) {
  const clock = berlinClock(instant);
  if (!clock || clock.minute !== 30) return null;
  const label = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  return HOUR_SLOTS.includes(label) ? label : null;
}

/**
 * Full pre-market hours from 10:00 Berlin up to, not including, the cash open.
 * A bar that runs across 09:30 New York is left out.
 */
export function isPremarketHour(instant) {
  const clock = berlinClock(instant);
  if (!clock || clock.minute !== 0) return false;
  const startMinute = clock.hour * 60 + clock.minute;
  if (startMinute < 10 * 60 || startMinute >= 15 * 60) return false;
  const end = new Date(new Date(instant).getTime() + 60 * 60 * 1000);
  const endNy = nyClock(end);
  if (!endNy) return false;
  return endNy.hour * 60 + endNy.minute <= 9 * 60 + 30;
}

export function hourMove(bar) {
  const open = Number(bar?.open);
  const close = Number(bar?.close ?? bar?.eur);
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(close)) return null;
  return ((close - open) / open) * 100;
}

function normalizeDaily(points) {
  const rows = [];
  (points || []).forEach((point, order) => {
    const date = tradingDate(point?.t);
    const close = Number(point?.close ?? point?.eur);
    if (!date || !Number.isFinite(close) || close <= 0) return;
    rows.push({ date, close, weekday: weekdayFromDate(date), order });
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  const byDate = new Map();
  for (const row of rows) byDate.set(row.date, row);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return round2(sorted[mid]);
  return round2((sorted[mid - 1] + sorted[mid]) / 2);
}

function summarize(values, withMedian) {
  if (!values.length) {
    return withMedian ? { n: 0, up: 0, avg: null, med: null } : { n: 0, up: 0, avg: null };
  }
  const up = values.filter((value) => value > 0).length;
  const avg = round2(values.reduce((sum, value) => sum + value, 0) / values.length);
  const row = { n: values.length, up, avg };
  if (withMedian) row.med = median(values);
  return row;
}

/** Close-to-close moves, Mo–Fr, one stock's daily prints only. */
export function aggregateWeekdays(points, range = null) {
  const buckets = [[], [], [], [], []];
  let prev = null;
  for (const point of normalizeDaily(points)) {
    if (point.weekday === 0 || point.weekday === 6) continue;
    const countIt = prev && point.weekday >= 1 && point.weekday <= 5 && inRange(point.date, range);
    if (countIt) {
      const gap = daysBetween(prev.date, point.date);
      if (gap >= 1 && gap <= MAX_DAILY_GAP && prev.close > 0) {
        const rounded = round2(((point.close - prev.close) / prev.close) * 100);
        if (rounded != null) buckets[point.weekday - 1].push(rounded);
      }
    }
    prev = point;
  }
  return buckets.map((values) => summarize(values, true));
}

function dedupedBars(bars, range) {
  const seen = new Map();
  for (const bar of bars || []) {
    const clock = berlinClock(bar?.t);
    if (!clock || !inRange(clock.date, range)) continue;
    seen.set(String(bar.t), { bar, clock });
  }
  return [...seen.values()];
}

/** One stock's regular-session hours, bucketed by Berlin clock time. */
export function aggregateHours(bars, range = null) {
  const buckets = HOUR_SLOTS.map(() => []);
  for (const { bar } of dedupedBars(bars, range)) {
    const slot = hourSlot(bar.t);
    const move = round2(hourMove(bar));
    if (!slot || move == null) continue;
    buckets[HOUR_SLOTS.indexOf(slot)].push(move);
  }
  return buckets.map((values) => summarize(values, false));
}

/** Five weekdays by seven Berlin hours. Color comes from the average move. */
export function aggregateGrid(bars, range = null) {
  const buckets = Array.from({ length: 5 }, () => HOUR_SLOTS.map(() => []));
  for (const { bar, clock } of dedupedBars(bars, range)) {
    const slot = hourSlot(bar.t);
    const weekday = weekdayFromDate(clock.date);
    const move = round2(hourMove(bar));
    if (!slot || weekday < 1 || weekday > 5 || move == null) continue;
    buckets[weekday - 1][HOUR_SLOTS.indexOf(slot)].push(move);
  }
  return buckets.map((row) => row.map((values) => {
    if (!values.length) return { n: 0, avg: null };
    return {
      n: values.length,
      avg: round2(values.reduce((sum, value) => sum + value, 0) / values.length)
    };
  }));
}

export function aggregatePremarket(bars, range = null) {
  const values = [];
  const hours = new Set();
  for (const { bar, clock } of dedupedBars(bars, range)) {
    if (!isPremarketHour(bar.t)) continue;
    const move = round2(hourMove(bar));
    if (move == null) continue;
    values.push(move);
    hours.add(clock.hour);
  }
  if (values.length < MIN_CASES || hours.size < 3) return null;
  return summarize(values, false);
}

function spanOf(points, range) {
  const dates = [];
  for (const point of normalizeDaily(points)) {
    if (inRange(point.date, range)) dates.push(point.date);
  }
  return { from: dates[0] || null, to: dates.at(-1) || null };
}

export function buildWindow(dailyPoints, hourBars, preBars, range = null) {
  const span = spanOf(dailyPoints, range);
  return {
    from: span.from,
    to: span.to,
    days: aggregateWeekdays(dailyPoints, range),
    hours: aggregateHours(hourBars, range),
    grid: aggregateGrid(hourBars, range),
    pre: aggregatePremarket(preBars, range)
  };
}

export function buildWindows(dailyPoints, hourBars, preBars) {
  const end = spanOf(dailyPoints, null).to;
  const year = end ? { from: addDays(end, -365), to: end } : null;
  return {
    all: buildWindow(dailyPoints, hourBars, preBars, null),
    year: buildWindow(dailyPoints, hourBars, preBars, year)
  };
}

/** Share of rising cases, only once n reaches the same floor as the Muster card. */
export function upPercent(row) {
  if (!row || !Number.isInteger(row.n) || row.n < MIN_CASES) return null;
  if (!Number.isInteger(row.up) || row.up < 0 || row.up > row.n) return null;
  return Math.round((row.up / row.n) * 100);
}

export function shownAverage(row) {
  if (!row || row.n < MIN_CASES || !Number.isFinite(row.avg)) return null;
  return row.avg;
}

export function shownMedian(row) {
  if (!row || row.n < MIN_CASES || !Number.isFinite(row.med)) return null;
  return row.med;
}

export function formatSignedPct(value) {
  if (!Number.isFinite(value)) return "—";
  const number = round2(value);
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(number));
  if (number > 0) return `+${body} %`;
  if (number < 0) return `−${body} %`;
  return `${body} %`;
}

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

/**
 * Strongest and weakest weekday, or an honest shrug when the days barely differ.
 * Only days with enough cases take part.
 */
export function seasonalityHeadline(symbol, windowStats) {
  const rows = (windowStats?.days || []).map((row, index) => ({
    index,
    name: WEEKDAY_NAMES[index],
    n: row?.n || 0,
    avg: Number.isFinite(row?.avg) ? row.avg : 0,
    share: upPercent(row)
  })).filter((row) => row.share != null);
  if (rows.length < 2) return "Zu wenig Tage für einen Vergleich.";
  const shares = rows.map((row) => row.share);
  const spread = Math.max(...shares) - Math.min(...shares);
  const nearHalf = shares.every((share) => Math.abs(share - 50) <= NEAR_HALF);
  if (spread <= TINY_SPREAD || nearHalf) return "Kaum Unterschied zwischen den Tagen.";
  const strongest = [...rows].sort((a, b) => b.share - a.share || b.avg - a.avg || b.n - a.n || a.index - b.index)[0];
  const weakest = [...rows].sort((a, b) => a.share - b.share || a.avg - b.avg || a.n - b.n || a.index - b.index)[0];
  const name = symbol || "die Aktie";
  return `${strongest.name}s stieg ${name} am häufigsten (${strongest.share} %, n = ${strongest.n}). ${weakest.name}s am seltensten (${weakest.share} %, n = ${weakest.n}).`;
}

function heatStyle(avg, scale) {
  if (!Number.isFinite(avg) || avg === 0 || !scale) return "";
  const amount = Math.min(1, Math.abs(avg) / scale);
  const alpha = Math.round((0.22 + amount * 0.7) * 100) / 100;
  const rgb = avg > 0 ? "125, 222, 192" : "255, 139, 152";
  return `background:rgba(${rgb},${alpha})`;
}

function barWidth(avg, scale) {
  if (!Number.isFinite(avg) || !scale) return 8;
  return Math.max(8, Math.min(100, Math.round((Math.abs(avg) / scale) * 100)));
}

function weekdayRows(days) {
  const visible = days.map((row) => shownAverage(row)).filter((value) => value != null);
  const scale = visible.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return days.map((row, index) => {
    const share = upPercent(row);
    const avg = shownAverage(row);
    const med = shownMedian(row);
    const label = WEEKDAY_LABELS[index];
    const name = WEEKDAY_NAMES[index];
    const meta = share == null
      ? `n = ${row?.n || 0} · keine Prozentzahl`
      : `${share} % der Tage gestiegen · n = ${row.n}`;
    const aria = share == null
      ? `${name}, n = ${row?.n || 0}, keine Prozentzahl`
      : `${name}, im Schnitt ${formatSignedPct(avg)}, Median ${formatSignedPct(med)}, ${share} % der Tage gestiegen, n = ${row.n}`;
    const width = share == null ? 0 : barWidth(avg, scale);
    const bar = share == null
      ? ""
      : `<span class="wd-bar ${tone(avg)}" style="width:${width}%"></span>`;
    const avgText = share == null ? "" : `<span class="wd-avg ${tone(avg)}">${esc(formatSignedPct(avg))}</span>`;
    return `<div class="wd-row" data-weekday="${label}">
      <div class="wd-line">
        <span class="wd-name">${label}</span>
        <span class="wd-track" aria-hidden="true">${bar}</span>
        ${avgText}
      </div>
      <p class="wd-meta">${esc(meta)}</p>
      <p class="sr-only">${esc(aria)}</p>
    </div>`;
  }).join("");
}

function clockBlock(hours, grid) {
  const avgs = [];
  hours.forEach((row) => {
    const avg = shownAverage(row);
    if (avg != null) avgs.push(avg);
  });
  grid.forEach((row) => row.forEach((cell) => {
    if ((cell?.n || 0) >= MIN_CASES && Number.isFinite(cell.avg)) avgs.push(cell.avg);
  }));
  const scale = avgs.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const heads = HOUR_SLOTS.map((slot) => `<span class="clock-hour">${slot}</span>`).join("");
  const body = grid.map((row, index) => {
    const cells = row.map((cell, slotIndex) => {
      const slot = HOUR_SLOTS[slotIndex];
      const show = (cell?.n || 0) >= MIN_CASES && Number.isFinite(cell?.avg);
      const style = show ? heatStyle(cell.avg, scale) : "";
      const aria = show
        ? `${WEEKDAY_NAMES[index]} ${slot}, im Schnitt ${formatSignedPct(cell.avg)}, n = ${cell.n}`
        : `${WEEKDAY_NAMES[index]} ${slot}, n = ${cell?.n || 0}, keine Prozentzahl`;
      return `<span class="clock-cell${show ? "" : " is-quiet"}" style="${style}" role="img" aria-label="${esc(aria)}"></span>`;
    }).join("");
    return `<span class="clock-name">${WEEKDAY_LABELS[index]}</span>${cells}`;
  }).join("");
  const summary = hours.map((row, index) => {
    const share = upPercent(row);
    const avg = shownAverage(row);
    const slot = HOUR_SLOTS[index];
    const style = share == null ? "" : heatStyle(avg, scale);
    const text = share == null ? "–" : `${share} %`;
    const aria = share == null
      ? `${slot} Uhr Berlin, alle Wochentage dieser Aktie, n = ${row?.n || 0}, keine Prozentzahl`
      : `${slot} Uhr Berlin, alle Wochentage dieser Aktie, ${share} % der Stunden gestiegen, im Schnitt ${formatSignedPct(avg)}, n = ${row.n}`;
    return `<span class="clock-sum${share == null ? " is-quiet" : ""}" style="${style}" role="img" aria-label="${esc(aria)}">${text}</span>`;
  }).join("");
  return `<div class="clock">
    <span class="clock-name"></span>${heads}
    ${body}
    <span class="clock-name">Woche</span>${summary}
  </div>
  <p class="chart-legend"><span><i class="swatch support" aria-hidden="true"></i>gestiegen</span><span><i class="swatch resist" aria-hidden="true"></i>gefallen</span><span>Farbe: mittlere Bewegung. Zahl: Anteil steigender Stunden. Woche: Mo–Fr dieser Aktie.</span></p>`;
}

function premarketLine(pre) {
  const share = upPercent(pre);
  const avg = shownAverage(pre);
  if (share == null || !pre) return "";
  return `<p class="season-pre">Vorbörse 10:00–15:00 · ${share} % der Stunden gestiegen · ${esc(formatSignedPct(avg))} · n = ${pre.n}</p>`;
}

function rangesMatch(pack) {
  const year = pack?.ranges?.year;
  const all = pack?.ranges?.all;
  return !year || !all || (year.from === all.from && year.to === all.to);
}

export function renderSeasonalityCard(seasonality, ticker, season) {
  const symbol = ticker?.symbol || "";
  const pack = seasonality?.symbols?.[symbol];
  if (!pack?.ranges?.all) {
    return `<article class="card season-card" aria-label="Wochentag und Uhrzeit">
      <p class="kicker">Wochentag &amp; Uhrzeit</p>
      <p class="season-note">Für diese Aktie liegen noch keine eigenen Tageszahlen.</p>
      <p class="season-note">${esc(PAST_NOTE)}</p>
    </article>`;
  }
  const key = season === "year" && pack.ranges.year ? "year" : "all";
  const stats = pack.ranges[key];
  const headline = seasonalityHeadline(symbol, stats);
  const toggle = rangesMatch(pack) ? "" : `<div class="season-toggle" role="group" aria-label="Zeitraum der Statistik">
      <button type="button" data-action="analyse-season" data-season="year" aria-pressed="${key === "year" ? "true" : "false"}">1 Jahr</button>
      <button type="button" data-action="analyse-season" data-season="all" aria-pressed="${key === "all" ? "true" : "false"}">Alles</button>
    </div>`;
  return `<article class="card season-card" aria-label="Wochentag und Uhrzeit" data-season="${key}">
    <div class="season-head">
      <p class="kicker">Wochentag &amp; Uhrzeit</p>
      ${toggle}
    </div>
    <p class="season-lead">${esc(headline)}</p>
    <p class="season-kicker">Tage, Schluss zu Schluss</p>
    <div class="wd-list">${weekdayRows(stats.days || [])}</div>
    <p class="season-kicker">Uhrzeit, Berlin</p>
    ${clockBlock(stats.hours || [], stats.grid || [])}
    ${premarketLine(stats.pre)}
    <p class="season-note">${esc(PAST_NOTE)}</p>
    <p class="analysis-note n-legend">${esc(SEASON_N_LEGEND)}</p>
  </article>`;
}

/** Drop today's daily bar while the New York cash session is still open. */
export function keepSettledDaily(points, now = new Date()) {
  const today = nyClock(now)?.date;
  const clock = nyClock(now);
  const stillOpen = clock && clock.hour * 60 + clock.minute < 16 * 60 + 5;
  return (points || []).filter((point) => {
    const date = tradingDate(point?.t);
    if (!date) return false;
    if (stillOpen && date === today) return false;
    return true;
  });
}

/** Drop an hour bar that has not finished. */
export function keepSettledHours(bars, now = new Date()) {
  const limit = now.getTime() - 60 * 60 * 1000;
  return (bars || []).filter((bar) => {
    const time = Date.parse(bar?.t);
    return Number.isFinite(time) && time <= limit;
  });
}
