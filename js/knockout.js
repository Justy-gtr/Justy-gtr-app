import { formatEUR } from "./logic.js";

export const KNOCK_HINT = "Der Knock-out greift auch außerhalb der US-Börsenzeit.";
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clockParts(iso, timeZone, hourCycle) {
  const parts = new Intl.DateTimeFormat(hourCycle ? "en-US" : "de-DE", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return { weekday: get("weekday").replace(/\./g, ""), hour: get("hour"), minute: get("minute") };
}

function inferredSession(iso) {
  const { weekday, hour, minute } = clockParts(iso, "America/New_York", true);
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
  if (day == null || day > 4) return null;
  const minutes = Number(hour) * 60 + Number(minute);
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "post";
  return null;
}

export function quoteLabel(session, iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const { weekday, hour, minute } = clockParts(iso, "Europe/Berlin", false);
  const clock = `${hour}:${minute}`;
  if (session === "pre") return `vorbörslich ${clock}`;
  if (session === "post") return `nachbörslich ${clock}`;
  return `Schluss ${weekday} ${clock}`;
}

function pointScore(point) {
  let score = 0;
  if (point?.session) score += 2;
  if (finite(point?.usd) != null) score += 1;
  return score;
}

function latestPoint(ticker) {
  let best = null;
  let bestTime = -Infinity;
  for (const list of [ticker?.history?.intraday, ticker?.history?.["5m"]]) {
    for (const point of list || []) {
      const time = Date.parse(point?.t || "");
      if (!Number.isFinite(time)) continue;
      if (finite(point?.eur) == null && finite(point?.usd) == null) continue;
      if (!best || time > bestTime || (time === bestTime && pointScore(point) > pointScore(best))) {
        best = point;
        bestTime = time;
      }
    }
  }
  return best;
}

function convertPrint(eurRaw, usdRaw, rate) {
  const fx = finite(rate);
  const hasRate = fx != null && fx > 0;
  let eur = finite(eurRaw);
  let usd = finite(usdRaw);
  if (eur == null && usd != null && hasRate) eur = usd / fx;
  if (usd == null && eur != null && hasRate) usd = eur * fx;
  return { eur, usd };
}

/** Last pre-/after-market print, not the regular close stored on the ticker. */
export function latestQuote(ticker, rate) {
  if (!ticker) return null;
  const fx = finite(rate ?? ticker.fxRate);
  const point = latestPoint(ticker);
  if (point) {
    const money = convertPrint(point.eur, point.usd, fx);
    if (money.eur == null && money.usd == null) return null;
    const session = point.session || inferredSession(point.t);
    return { ...money, at: point.t, session, label: quoteLabel(session, point.t) };
  }
  const money = convertPrint(ticker.priceEur, ticker.priceUsd, fx);
  if (money.eur == null && money.usd == null) return null;
  const at = ticker.history?.["1M"]?.at?.(-1)?.t || null;
  return { ...money, at, session: "regular", label: quoteLabel("regular", at) };
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
