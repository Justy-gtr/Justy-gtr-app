import { esc, safeUrl } from "./logic.js";

export const MOODS = ["gut", "gemischt", "schlecht"];
export const STALE_MS = 2 * 60 * 60 * 1000;
export const EMPTY_PHRASE = "noch keine Daten";
export const MOOD_KEY = "jgtr-mood";

export const MOOD_COLOR = {
  gut: "#22c55e",
  schlecht: "#ef4444",
  gemischt: "#f59e0b",
  leer: "#6b7280"
};

function asDate(value) {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** HH:MM in Europe/Berlin. Empty when the stamp cannot be read. */
export function berlinHm(value) {
  const date = asDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  if (!hour || parts.minute == null) return "";
  return `${hour}:${parts.minute}`;
}

export function moodShift(previous, mood) {
  if (!MOODS.includes(previous) || !MOODS.includes(mood)) return false;
  return previous !== mood;
}

function moodOf(value) {
  return MOODS.includes(value) ? value : "";
}

/**
 * Lamp for one symbol. Grey when the mood is missing or the stamp is older than two hours.
 * The label is the Berlin time of updatedAt, or "noch keine Daten".
 */
export function lampState(entry, now = new Date()) {
  const mood = moodOf(entry?.mood);
  const empty = !mood;
  const updatedAt = typeof entry?.updatedAt === "string" ? entry.updatedAt : "";
  const stamp = Date.parse(updatedAt);
  const nowMs = asDate(now)?.getTime();
  const age = Number.isFinite(stamp) && Number.isFinite(nowMs) ? nowMs - stamp : Infinity;
  const stale = !empty && (!Number.isFinite(stamp) || age > STALE_MS);
  const tone = empty || stale ? "leer" : mood;
  const time = berlinHm(updatedAt);
  const score = Number.isFinite(Number(entry?.score)) ? Number(entry.score) : null;
  const postsCount = Number.isInteger(entry?.postsCount) ? entry.postsCount : null;
  const previousMood = moodOf(entry?.previousMood);
  return {
    tone,
    color: MOOD_COLOR[tone],
    stale,
    empty,
    label: !empty && time ? `Stimmung · ${time}` : `Stimmung · ${EMPTY_PHRASE}`,
    time,
    mood,
    previousMood,
    changed: !empty && !stale && moodShift(previousMood, mood),
    score,
    postsCount,
    reason: typeof entry?.reason === "string" ? entry.reason.trim() : "",
    sources: Array.isArray(entry?.sources) ? entry.sources : [],
    updatedAt
  };
}

function formatScore(score) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(score);
}

function postsLine(count) {
  const body = new Intl.NumberFormat("de-DE").format(count);
  return count === 1 ? "1 Beitrag" : `${body} Beiträge`;
}

function sourceList(sources) {
  const list = (sources || [])
    .map((source) => ({ title: source?.title || "Quelle", href: safeUrl(source?.url) }))
    .filter((source) => source.href);
  if (!list.length) return `<p class="mood-quiet">Keine Quelle hinterlegt.</p>`;
  return `<ul class="mood-sources">${list.map((source) => `<li><a href="${esc(source.href)}" target="_blank">${esc(source.title)}</a></li>`).join("")}</ul>`;
}

function sheetBody(state) {
  if (state.empty) {
    return `<p class="mood-lead">Noch keine Daten.</p><p class="mood-quiet">Hier steht, wie auf X über die Aktie geredet wird.</p>`;
  }
  const meta = [];
  if (state.mood) meta.push(`Ton ${state.mood}`);
  if (state.postsCount != null) meta.push(postsLine(state.postsCount));
  if (state.score != null) meta.push(`Wert ${formatScore(state.score)}`);
  const when = state.time ? `${state.time} Uhr Berlin` : "Zeit fehlt";
  const age = state.stale ? " Älter als zwei Stunden." : "";
  return `
    <p class="mood-lead">${esc(state.reason || "Kein kurzer Satz.")}</p>
    ${meta.length ? `<p class="mood-meta">${esc(meta.join(" · "))}</p>` : ""}
    <p class="mood-quiet">${esc(`${when}.${age}`)} So wird auf X geredet.</p>
    ${sourceList(state.sources)}
  `;
}

export function renderMoodLamp(file, symbol, now = new Date(), place = "chart", extra = "") {
  const state = lampState(file?.symbols?.[symbol], now);
  const safeSymbol = esc(symbol || "");
  const id = `mood-sheet-${place}-${symbol || "x"}`;
  const classes = ["mood-lamp", `is-${state.tone}`];
  if (extra) classes.push(extra);
  if (state.empty) classes.push("is-empty");
  if (state.stale) classes.push("is-stale");
  if (state.changed) classes.push("is-changed");
  const aria = state.empty
    ? "Stimmung auf X. Noch keine Daten."
    : state.stale
      ? `Stimmung auf X, ${state.mood}. Stand ${state.time || "ohne Zeit"}, älter als zwei Stunden.`
      : `Stimmung auf X, ${state.mood}. Stand ${state.time} Uhr.`;
  return `<div class="${classes.join(" ")}" data-symbol="${safeSymbol}" data-mood="${esc(state.mood)}" data-stale="${state.stale ? "1" : "0"}" data-changed="${state.changed ? "1" : "0"}" style="--mood:${state.color}">
    <button type="button" class="mood-hit" data-action="mood-lamp" aria-expanded="false" aria-controls="${esc(id)}" aria-label="${esc(aria)}">
      <span class="mood-dot" aria-hidden="true"></span>
      <span class="mood-label">${esc(state.label)}</span>
    </button>
    <div class="mood-sheet" id="${esc(id)}" hidden role="dialog" aria-label="Stimmung auf X">
      ${sheetBody(state)}
      <button type="button" class="mood-close" data-action="close-mood">Schließen</button>
    </div>
  </div>`;
}

/** Pulse once when this update's mood differs from the last fresh mood on this phone. */
export function markMoodPulse(root, storage) {
  const store = storage === undefined
    ? (typeof localStorage === "undefined" ? null : localStorage)
    : storage;
  if (!root?.querySelectorAll || !store) return;
  let seen = {};
  try {
    const parsed = JSON.parse(store.getItem(MOOD_KEY) || "{}");
    if (parsed && typeof parsed === "object") seen = parsed;
  } catch {
    seen = {};
  }
  const next = { ...seen };
  root.querySelectorAll(".mood-lamp").forEach((node) => {
    const symbol = node.dataset?.symbol || "";
    const mood = node.dataset?.mood || "";
    const stale = node.dataset?.stale === "1";
    const fromFile = node.dataset?.changed === "1";
    const on = !stale && (fromFile || moodShift(seen[symbol], mood));
    node.classList?.toggle?.("is-changed", on);
    if (!stale && MOODS.includes(mood)) next[symbol] = mood;
  });
  try {
    store.setItem(MOOD_KEY, JSON.stringify(next));
  } catch {
    /* Privater Modus. Die Lampe bleibt, nur ohne Puls. */
  }
}
