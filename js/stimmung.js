import { MOODS } from "./sentiment.js";

export const TRACK_MIN = 7;
const LAMP_SYMBOLS = ["SPCX", "TSLA", "RKLB", "MRVL"];

/**
 * How often a stored lamp direction matched the next move.
 * sentiment.history is optional. Without enough rows the text stays honest.
 */
export function moodReliability(file) {
  const rows = Array.isArray(file?.history) ? file.history : [];
  const usable = rows.filter((row) => {
    const direction = row?.direction;
    const next = row?.next;
    return (direction === "up" || direction === "down") && (next === "up" || next === "down");
  });
  if (usable.length < TRACK_MIN) {
    return { enough: false, n: usable.length, matched: null, text: "noch zu wenig Daten" };
  }
  const matched = usable.filter((row) => row.direction === row.next).length;
  return {
    enough: true,
    n: usable.length,
    matched,
    text: `${matched} von ${usable.length} Mal passte die Richtung zum nächsten Schritt.`
  };
}

export function marketMood(file) {
  const moods = LAMP_SYMBOLS
    .map((symbol) => file?.symbols?.[symbol]?.mood)
    .filter((mood) => MOODS.includes(mood));
  if (!moods.length) return { mood: "", label: "noch keine Daten" };
  if (new Set(moods).size === 1) return { mood: moods[0], label: moods[0] };
  return { mood: "gemischt", label: "gemischt" };
}

/** Marker from -1 to 1. Score is -100…100. Missing score follows the lamp word. */
export function moodPosition(entry) {
  const score = Number(entry?.score);
  if (Number.isFinite(score)) return Math.max(-1, Math.min(1, score / 100));
  if (entry?.mood === "gut") return 0.7;
  if (entry?.mood === "schlecht") return -0.7;
  if (entry?.mood === "gemischt") return 0;
  return null;
}
