import { esc, formatEUR, formatNumber, formatStamp } from "./logic.js";
import {
  emptyDraft,
  knockOut,
  latestQuote,
  moveSentence,
  parseDecimal,
  readKnockStore,
  warningText,
  writeKnockStore
} from "./knockout.js";

const SYMBOLS = ["SPCX", "TSLA", "RKLB"];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function tickerOf(data, symbol) {
  return (data?.prices?.tickers || []).find((item) => item.symbol === symbol) || null;
}

function orderedTickers(data) {
  const tickers = data?.prices?.tickers || [];
  const known = SYMBOLS.map((symbol) => tickers.find((item) => item.symbol === symbol)).filter(Boolean);
  return known.length ? known : tickers;
}

function rateOf(data, ticker) {
  const rate = Number(data?.prices?.fx?.rate ?? ticker?.fxRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function leverageText(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, value >= 20 ? 0 : 1);
}

function quoteFor(data, symbol) {
  const ticker = tickerOf(data, symbol);
  const rate = rateOf(data, ticker);
  return { ticker, rate, quote: latestQuote(ticker, rate) };
}

function priceLine(quote) {
  if (!quote || quote.eur == null) return "Kurs fehlt";
  const usd = quote.usd == null ? "" : ` · ${formatNumber(quote.usd, 2)} $`;
  const when = quote.label ? `<span class="ko-when">${esc(quote.label)}</span>` : "";
  return `${formatEUR(quote.eur)}${usd}${when}`;
}

function outputHtml(data, draft) {
  const { quote, rate } = quoteFor(data, draft.symbol);
  const fx = data?.prices?.fx;
  if (parseDecimal(draft.barrier) == null) return `<p class="muted">Schwelle fehlt.</p>`;
  if (!quote || quote.eur == null) return `<p class="muted">Kurs fehlt.</p>`;
  if (rate == null) return `<p class="muted">Kurs USD/EUR fehlt.</p>`;
  const result = knockOut({
    priceEur: quote.eur,
    rate,
    barrier: draft.barrier,
    side: draft.side,
    ratio: draft.ratio,
    qty: draft.qty,
    qtyMode: draft.qtyMode
  });
  const warn = warningText(result);
  const band = result.band || "";
  const warnBand = result.behind ? "nah" : band;
  return `
    <p class="ko-line"><span>Schwelle</span><strong>${esc(formatEUR(result.barrierEur))}</strong></p>
    <p class="muted">USD/EUR ${esc(formatNumber(rate, 4))} · Stand ${esc(formatStamp(fx?.asOf))}</p>
    <p class="ko-line ko-${esc(band)}"><span>Abstand</span><strong>${esc(formatNumber(result.distancePct, 1))} % · ${esc(formatEUR(result.distanceEur))}</strong></p>
    <p class="ko-line"><span>Hebel</span><strong>ca. ${esc(leverageText(result.leverage))}</strong></p>
    ${warn ? `<p class="ko-warn ko-${esc(warnBand)}">${esc(warn)}</p>` : ""}
  `;
}

function savedHtml(data, saved) {
  if (!saved.length) return `<p class="muted">Noch keiner.</p>`;
  return saved.map((item) => {
    const { quote, rate } = quoteFor(data, item.symbol);
    const result = knockOut({
      priceEur: quote?.eur,
      rate,
      barrier: item.barrier,
      side: item.side
    });
    const dist = result.distancePct == null ? "—" : `${formatNumber(result.distancePct, 1)} %`;
    const side = item.side === "short" ? "Short" : "Long";
    return `<div class="ko-saved">
      <button type="button" data-action="load-ko" data-id="${esc(item.id)}">
        <span class="ko-saved-name">${esc(item.name)}</span>
        <span class="muted">${esc(item.symbol)} ${side} · ${esc(item.barrier)} $</span>
      </button>
      <span class="ko-dist ko-${esc(result.band || "")}">${esc(dist)}</span>
      <button type="button" class="ko-x" data-action="delete-ko" data-id="${esc(item.id)}" aria-label="${esc(item.name)} entfernen">×</button>
    </div>`;
  }).join("");
}

export function initKnockout({ getData } = {}) {
  const sheet = document.getElementById("ko-sheet");
  if (!sheet) {
    return { open() {}, close() {}, isOpen: () => false, sync() {} };
  }
  const memory = storage();
  let state = memory ? readKnockStore(memory) : { draft: emptyDraft(), saved: [] };
  const barrier = document.getElementById("ko-barrier");
  const ratio = document.getElementById("ko-ratio");
  const qty = document.getElementById("ko-qty");
  const name = document.getElementById("ko-name");

  function persist() {
    if (!memory) return;
    try { writeKnockStore(memory, state); } catch { /* Speicher voll oder gesperrt. */ }
  }

  function draftFromForm() {
    return {
      symbol: sheet.dataset.symbol || state.draft.symbol || "SPCX",
      side: sheet.dataset.side === "short" ? "short" : "long",
      barrier: barrier?.value ?? "",
      ratio: ratio?.value ?? "",
      qty: qty?.value ?? "",
      qtyMode: sheet.dataset.qtyMode === "einsatz" ? "einsatz" : "anzahl",
      name: name?.value ?? ""
    };
  }

  function paint(draft) {
    const data = getData?.() || null;
    const symbols = document.getElementById("ko-symbols");
    if (symbols) {
      symbols.innerHTML = orderedTickers(data).map((ticker) => `
        <button type="button" class="chip" data-action="ko-symbol" data-symbol="${esc(ticker.symbol)}" aria-pressed="${ticker.symbol === draft.symbol}">${esc(ticker.symbol)}</button>
      `).join("");
    }
    const price = document.getElementById("ko-price");
    if (price) price.innerHTML = priceLine(quoteFor(data, draft.symbol).quote);
    sheet.querySelectorAll("[data-action='ko-side']").forEach((button) => {
      button.setAttribute("aria-selected", button.dataset.side === draft.side ? "true" : "false");
    });
    sheet.querySelectorAll("[data-action='ko-mode']").forEach((button) => {
      button.setAttribute("aria-selected", button.dataset.mode === draft.qtyMode ? "true" : "false");
    });
    if (qty) qty.placeholder = draft.qtyMode === "einsatz" ? "Euro" : "Stück";
    const out = document.getElementById("ko-out");
    if (out) out.innerHTML = outputHtml(data, draft);
    const move = document.getElementById("ko-move");
    if (move) {
      const { quote, rate } = quoteFor(data, draft.symbol);
      const result = knockOut({
        priceEur: quote?.eur,
        rate,
        barrier: draft.barrier,
        side: draft.side,
        ratio: draft.ratio,
        qty: draft.qty,
        qtyMode: draft.qtyMode
      });
      move.textContent = moveSentence(result.move);
    }
    const saved = document.getElementById("ko-saved");
    if (saved) saved.innerHTML = savedHtml(data, state.saved);
  }

  function apply(draft) {
    const next = { ...emptyDraft(), ...draft };
    sheet.dataset.symbol = next.symbol;
    sheet.dataset.side = next.side;
    sheet.dataset.qtyMode = next.qtyMode;
    if (barrier) barrier.value = next.barrier;
    if (ratio) ratio.value = next.ratio;
    if (qty) qty.value = next.qty;
    if (name) name.value = next.name;
    state.draft = next;
  }

  function sync() {
    if (sheet.hidden) return;
    state.draft = draftFromForm();
    persist();
    paint(state.draft);
  }

  function open() {
    apply(state.draft);
    sheet.hidden = false;
    paint(state.draft);
    barrier?.focus();
  }

  function close() {
    if (!sheet.hidden) state.draft = draftFromForm();
    persist();
    sheet.hidden = true;
    document.querySelector("[data-action='open-ko']")?.focus();
  }

  sheet.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || !sheet.contains(el)) return;
    event.stopPropagation();
    const { action } = el.dataset;
    if (action === "close-ko") {
      close();
      return;
    }
    if (action === "ko-symbol" && el.dataset.symbol) {
      sheet.dataset.symbol = el.dataset.symbol;
      sync();
      return;
    }
    if (action === "ko-side" && el.dataset.side) {
      sheet.dataset.side = el.dataset.side === "short" ? "short" : "long";
      sync();
      return;
    }
    if (action === "ko-mode" && el.dataset.mode) {
      sheet.dataset.qtyMode = el.dataset.mode === "einsatz" ? "einsatz" : "anzahl";
      sync();
      return;
    }
    if (action === "save-ko") {
      const draft = draftFromForm();
      if (parseDecimal(draft.barrier) == null) return;
      const nameText = draft.name.trim() || `${draft.symbol} ${draft.side === "short" ? "Short" : "Long"}`;
      state.saved = [{
        id: Date.now().toString(36),
        name: nameText,
        symbol: draft.symbol,
        side: draft.side,
        barrier: draft.barrier,
        ratio: draft.ratio,
        qty: draft.qty,
        qtyMode: draft.qtyMode
      }, ...state.saved].slice(0, 6);
      state.draft = draft;
      persist();
      paint(draft);
      return;
    }
    if (action === "load-ko") {
      const item = state.saved.find((entry) => entry.id === el.dataset.id);
      if (!item) return;
      apply({ ...item, name: item.name });
      paint(state.draft);
      persist();
      return;
    }
    if (action === "delete-ko") {
      state.saved = state.saved.filter((entry) => entry.id !== el.dataset.id);
      persist();
      paint(draftFromForm());
    }
  });

  sheet.addEventListener("input", (event) => {
    if (!event.target.closest("input")) return;
    sync();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sheet.hidden) {
      event.preventDefault();
      close();
    }
  });

  return {
    open,
    close,
    isOpen: () => !sheet.hidden,
    sync
  };
}
