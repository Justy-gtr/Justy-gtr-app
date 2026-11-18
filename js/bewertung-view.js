import {
  cheaperNames,
  historyPlacement,
  peerPlacement,
  peerValues,
  symbolsOf,
  VALUE_SYMBOLS
} from "./bewertung.js";

const NAMES = {
  SPCX: "SpaceX",
  TSLA: "Tesla",
  RKLB: "Rocket Lab",
  MRVL: "Marvell",
  NVDA: "Nvidia",
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  META: "Meta",
  AMD: "AMD",
  AVGO: "Broadcom",
  INTC: "Intel",
  QCOM: "Qualcomm",
  ASML: "ASML",
  "SAP.DE": "SAP",
  "IFX.DE": "Infineon"
};
import { berlinDate, calendarList, calendarSentence, calendarWhen, esc, formatEUR, formatNumber } from "./logic.js";

function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function formatCapEur(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const abs = Math.abs(number);
  if (abs >= 1e12) return `${formatNumber(number / 1e12, 2)} Bio. €`;
  if (abs >= 1e9) return `${formatNumber(number / 1e9, 1)} Mrd. €`;
  if (abs >= 1e6) return `${formatNumber(number / 1e6, 0)} Mio. €`;
  return `${formatNumber(number, 0)} €`;
}

function peSentence(row) {
  if (!row) return "Keine Zahlen hinterlegt.";
  if (row.peState === "negativ") return "KGV nicht sinnvoll, der Gewinn der letzten zwölf Monate ist negativ.";
  if (row.peState === "fehlt" || row.trailingPe == null) return "Kein KGV gemeldet.";
  if (row.peState === "gerechnet") return "Gerechnet aus Kurs und Gewinn je Aktie.";
  return "";
}

function forwardSentence(row) {
  if (!row || row.forwardState === "fehlt" || row.forwardPe == null) {
    if (row?.forwardState === "negativ") return "Vorausschauendes KGV nicht sinnvoll.";
    return "Kein vorausschauendes KGV gemeldet.";
  }
  return "";
}

function placeLine(label, placement) {
  const text = placement?.enough ? placement.word : "noch zu wenig Daten";
  return `<p class="value-plain">${esc(label)}: ${esc(text)}.</p>`;
}

export function renderBewertung(data, ui) {
  const rows = symbolsOf(data?.fundamentals);
  const active = VALUE_SYMBOLS.includes(ui?.valueSymbol) ? ui.valueSymbol : (rows[0]?.symbol || "SPCX");
  const row = rows.find((item) => item.symbol === active) || null;
  const chips = VALUE_SYMBOLS.map((symbol) => `
    <button type="button" class="chip" data-action="value-symbol" data-symbol="${esc(symbol)}" aria-pressed="${symbol === active}">${esc(symbol)}</button>`).join("");
  const focus = rows.filter((item) => VALUE_SYMBOLS.includes(item.symbol));
  const history = historyPlacement(row?.history);
  const peers = peerPlacement(row?.trailingPe, peerValues(focus, active, "trailingPe"));
  const salesPeers = peerPlacement(row?.priceToSales, peerValues(focus, active, "priceToSales"));
  const cheap = cheaperNames(rows, { skip: active });
  const peLine = peSentence(row);
  const forwardLine = forwardSentence(row);
  const salesLine = row?.priceToSales == null ? "Kein KUV gemeldet." : "";
  const cap = formatCapEur(row?.marketCapEur);
  return `
    <header class="page-head">
      <p class="eyebrow">Bewertung</p>
      <h2>${esc(NAMES[active] || active)}</h2>
      <p class="lede">Wo die Zahl heute liegt. Beschreibung, nichts weiter.</p>
    </header>
    <div class="chips" role="tablist" aria-label="Aktie">${chips}</div>
    <article class="card value-card">
      <div class="value-grid">
        <div><span class="value-num">${esc(formatRatio(row?.trailingPe))}</span><span class="muted">KGV bisher</span></div>
        <div><span class="value-num">${esc(formatRatio(row?.forwardPe))}</span><span class="muted">KGV voraus</span></div>
        <div><span class="value-num">${esc(formatRatio(row?.priceToSales))}</span><span class="muted">KUV</span></div>
      </div>
      ${peLine ? `<p class="value-plain">${esc(peLine)}</p>` : ""}
      ${forwardLine ? `<p class="value-plain">${esc(forwardLine)}</p>` : ""}
      ${salesLine ? `<p class="value-plain">${esc(salesLine)}</p>` : ""}
      <p class="value-cap">Marktkapitalisierung <strong>${esc(cap)}</strong></p>
      ${placeLine("Gegen die eigene Spanne", history)}
      ${placeLine("Gegen die anderen", peers.enough ? peers : salesPeers)}
    </article>
    <section class="card cheap-card" aria-label="Vergleichsweise niedrig bewertet">
      <p class="kicker">Vergleichsweise niedrig bewertet</p>
      ${cheap.length ? `<div class="cheap-list">${cheap.map((item) => {
        const figure = item.trailingPe > 0 ? `KGV ${formatRatio(item.trailingPe)}` : `KUV ${formatRatio(item.priceToSales)}`;
        return `<button type="button" class="cheap-hit" data-action="open-value" data-symbol="${esc(item.symbol)}"><strong>${esc(NAMES[item.symbol] || item.symbol)}</strong><span>${esc(figure)}</span></button>`;
      }).join("")}</div>` : `<p class="value-empty">noch zu wenig Daten</p>`}
    </section>
  `;
}

function datedLine(iso, text, now) {
  if (!iso || iso < berlinDate(now)) return "";
  const when = calendarWhen({ date: iso });
  return `<li><span class="muted">${esc(when)}</span> ${esc(text)}</li>`;
}

export function valueDetail(data, symbol, now = new Date()) {
  const row = symbolsOf(data?.fundamentals).find((item) => item.symbol === symbol) || null;
  const name = NAMES[symbol] || row?.name || symbol || "Aktie";
  const events = calendarList(data?.calendar?.events || [], now)
    .filter((event) => (event.tickers || []).includes(symbol))
    .slice(0, 3);
  const range = row?.weekLowEur != null && row?.weekHighEur != null
    ? `${formatEUR(row.weekLowEur)} bis ${formatEUR(row.weekHighEur)}`
    : "nicht gemeldet";
  const upcoming = [
    datedLine(row?.earningsDate, "Zahlen stehen an.", now),
    datedLine(row?.dividendDate, "Eine Dividende steht an.", now),
    ...events.map((event) => `<li><span class="muted">${esc(calendarWhen(event))}</span> ${esc(calendarSentence(event))}</li>`)
  ].filter(Boolean).join("");
  return {
    kind: "value",
    title: name,
    html: `
      <p>${esc(row?.about || "Keine kurze Beschreibung hinterlegt.")}</p>
      <div class="value-grid">
        <div><span class="value-num">${esc(formatRatio(row?.trailingPe))}</span><span class="muted">KGV bisher</span></div>
        <div><span class="value-num">${esc(formatRatio(row?.priceToSales))}</span><span class="muted">KUV</span></div>
      </div>
      <p class="value-cap">Marktkapitalisierung <strong>${esc(formatCapEur(row?.marketCapEur))}</strong></p>
      <p>52-Wochen-Spanne ${esc(range)}.</p>
      <p class="kicker">Die nächsten Tage</p>
      ${upcoming ? `<ul class="cheap-list">${upcoming}</ul>` : `<p class="muted">Keine Termine in den nächsten Tagen.</p>`}
    `
  };
}
