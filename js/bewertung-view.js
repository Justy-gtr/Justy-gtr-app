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
import { esc, formatNumber } from "./logic.js";

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

function bar(placement, label) {
  if (!placement?.enough) {
    return `<div class="value-block"><p class="kicker">${esc(label)}</p><p class="value-empty">noch zu wenig Daten</p></div>`;
  }
  const left = (placement.position * 100).toFixed(1);
  return `<div class="value-block">
    <p class="kicker">${esc(label)}</p>
    <div class="value-scale" role="img" aria-label="${esc(placement.word)}">
      <div class="value-bar"><span class="value-mark" style="left:${left}%"></span></div>
      <div class="value-labels"><span>günstig</span><span>normal</span><span>teuer</span></div>
    </div>
    <p class="value-word">${esc(placement.word)}</p>
  </div>`;
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
  const historyNote = data?.fundamentals?.historyNote || "Die Spanne vergleicht den heutigen Gewinn mit den Tagesschlüssen der letzten zwölf Monate.";
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
      ${bar(history, "Gegen die eigene Spanne")}
      ${history.enough ? `<p class="muted value-note">${esc(historyNote)}</p>` : ""}
      ${bar(peers, "KGV gegen die anderen beobachteten Aktien")}
      ${peers.enough ? `<p class="muted value-note">Mittel der anderen: ${esc(formatRatio(peers.median))}.</p>` : ""}
      ${bar(salesPeers, "KUV gegen die anderen beobachteten Aktien")}
      <p class="muted value-note">Für die eigene Spanne des KUV liegt keine frühere Umsatzreihe vor.</p>
    </article>
    <section class="card cheap-card" aria-label="Vergleichsweise niedrig bewertet">
      <p class="kicker">Vergleichsweise niedrig bewertet</p>
      ${cheap.length ? `<ul class="cheap-list">${cheap.map((item) => {
        const figure = item.trailingPe > 0 ? `KGV ${formatRatio(item.trailingPe)}` : `KUV ${formatRatio(item.priceToSales)}`;
        return `<li><strong>${esc(NAMES[item.symbol] || item.symbol)}</strong><span>${esc(figure)}</span></li>`;
      }).join("")}</ul>` : `<p class="value-empty">noch zu wenig Daten</p>`}
    </section>
  `;
}
