import { formatEUR } from "./logic.js";

export const KNOCK_HINT = "Der Knock-out greift auch außerhalb der US-Börsenzeit. Keine Anlageberatung.";
export const KO_STORAGE_KEY = "jgtr-ko";
export const KO_SAVED_LIMIT = 6;

export function parseDecimal(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let text = String(value).trim().replace(/\s/g, "").replace("−", "-").replace("–", "-");
  if (!text || text === "-" || text === "+") return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = text.replace(",", ".");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function emptyDraft() {
  return { symbol: "SPCX", side: "long", barrier: "", ratio: "", qty: "", qtyMode: "anzahl", name: "" };
}

function cleanSide(side) {
  return side === "short" ? "short" : "long";
}

function cleanMode(mode) {
  return mode === "einsatz" ? "einsatz" : "anzahl";
}

export function knockOut(input = {}) {
  const priceEur = Number(input.priceEur);
  const rate = Number(input.rate);
  const barrierUsd = parseDecimal(input.barrierUsd ?? input.barrier);
  const side = cleanSide(input.side);
  const hasPrice = Number.isFinite(priceEur) && priceEur > 0;
  const hasRate = Number.isFinite(rate) && rate > 0;
  const hasBarrier = barrierUsd != null && barrierUsd > 0;
  const barrierEur = hasRate && hasBarrier ? barrierUsd / rate : null;
  const distanceEur = hasPrice && barrierEur != null ? Math.abs(priceEur - barrierEur) : null;
  const distancePct = distanceEur != null ? (distanceEur / priceEur) * 100 : null;
  const leverage = distanceEur != null && distanceEur > 0 ? priceEur / distanceEur : null;
  const behind = hasPrice && barrierEur != null && (side === "short" ? priceEur >= barrierEur : priceEur <= barrierEur);
  let band = null;
  if (distancePct != null) {
    if (distancePct > 15) band = "weit";
    else if (distancePct >= 5) band = "mittel";
    else band = "nah";
  }
  const ratio = parseDecimal(input.ratio);
  const qty = parseDecimal(input.qty);
  const qtyMode = cleanMode(input.qtyMode);
  const ratioOk = ratio != null && ratio > 0;
  const qtyOk = qty != null && qty > 0;
  let moveEur = null;
  if (ratioOk && qtyOk && hasPrice) {
    if (qtyMode === "einsatz") moveEur = leverage != null ? qty * leverage * 0.01 : null;
    else moveEur = priceEur * 0.01 * ratio * qty;
  }
  const move = moveEur == null
    ? null
    : (side === "short"
      ? { upEur: -moveEur, downEur: moveEur }
      : { upEur: moveEur, downEur: -moveEur });
  return {
    side,
    barrierUsd: hasBarrier ? barrierUsd : null,
    barrierEur,
    distanceEur,
    distancePct,
    leverage,
    behind,
    band,
    move
  };
}

function signedEur(value) {
  const body = formatEUR(Math.abs(value));
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

export function moveSentence(move) {
  if (!move || !Number.isFinite(move.upEur) || !Number.isFinite(move.downEur)) return "";
  return `Wenn der Basiswert um 1 % steigt/fällt: ca. ${signedEur(move.upEur)} / ${signedEur(move.downEur)}`;
}

export function warningText(result) {
  if (!result) return "";
  const lines = [];
  if (result.band === "nah") lines.push("Sehr nah an der Schwelle");
  if (result.behind) lines.push("Kurs ist hinter der Schwelle");
  return lines.join(" · ");
}

function cleanDraft(raw) {
  const draft = emptyDraft();
  if (!raw || typeof raw !== "object") return draft;
  draft.symbol = String(raw.symbol || draft.symbol).slice(0, 12);
  draft.side = cleanSide(raw.side);
  draft.barrier = String(raw.barrier ?? "").slice(0, 24);
  draft.ratio = String(raw.ratio ?? "").slice(0, 24);
  draft.qty = String(raw.qty ?? "").slice(0, 24);
  draft.qtyMode = cleanMode(raw.qtyMode);
  draft.name = String(raw.name ?? "").slice(0, 40);
  return draft;
}

function cleanSaved(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim().slice(0, 40);
  const symbol = String(raw.symbol || "").trim().slice(0, 12);
  if (!name || !symbol) return null;
  const barrier = parseDecimal(raw.barrier);
  if (barrier == null || barrier <= 0) return null;
  return {
    id: String(raw.id || `${symbol}-${barrier}`).slice(0, 40),
    name,
    symbol,
    side: cleanSide(raw.side),
    barrier: String(raw.barrier).slice(0, 24),
    ratio: String(raw.ratio ?? "").slice(0, 24),
    qty: String(raw.qty ?? "").slice(0, 24),
    qtyMode: cleanMode(raw.qtyMode)
  };
}

export function readKnockStore(storage) {
  try {
    const raw = JSON.parse(storage.getItem(KO_STORAGE_KEY) || "{}");
    const saved = Array.isArray(raw?.saved) ? raw.saved.map(cleanSaved).filter(Boolean).slice(0, KO_SAVED_LIMIT) : [];
    return { draft: cleanDraft(raw?.draft), saved };
  } catch {
    return { draft: emptyDraft(), saved: [] };
  }
}

export function writeKnockStore(storage, state) {
  const saved = (state?.saved || []).map(cleanSaved).filter(Boolean).slice(0, KO_SAVED_LIMIT);
  storage.setItem(KO_STORAGE_KEY, JSON.stringify({ draft: cleanDraft(state?.draft), saved }));
}
