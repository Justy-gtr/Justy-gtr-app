/** Rückspiel-Oberfläche. Füllt #page-training und rührt die anderen Seiten nicht an.
 *  Der 5-Tab-Umbau behält diese Datei. Er setzt nur <section id="page-training">
 *  und ruft initTraining() nach dem Rendern. Die Seite nicht in renderShell leeren.
 */

import { appBase, esc } from "./logic.js";
import {
  LEVERAGE_PRESETS,
  REPLAY_POOL,
  TAKE_PRESETS,
  UI,
  archiveSymbols,
  chooseReplaySymbol,
  closeManual,
  confirmRestart,
  createRound,
  normalizeSymbol,
  sameGesture,
  endRound,
  formatDayDe,
  formatEuroCents,
  formatMinute,
  formatSignedEuroCents,
  formatSignedPct,
  formatUsd,
  hiddenLabels,
  historyStats,
  applyOneMinute,
  candleWindow,
  dismissSheet,
  intervalMarks,
  knockBarrier,
  liveSnapshot,
  loadHistory,
  nextRoundEuros,
  openTrade,
  pauseRound,
  pickRound,
  previewRound,
  withInterval,
  reasonLabel,
  rememberRound,
  resetHistory,
  roundSummary,
  saveHistory,
  settingsFromFields,
  stakeBasisCents,
  stakeChoice,
  takeShare,
  sideLabel,
  skipToOpen,
  stepCandle,
  undoCandle,
  unpackBar
} from "./replay.js";

const PAGE_ID = "page-training";
let chartZoom = 0;

function stakeButtons(choice) {
  const presets = choice.presets.map((euros) => `
    <button type="button" data-action="replay-stake" data-stake="${euros}" aria-pressed="${!choice.allIn && choice.amount === euros ? "true" : "false"}" ${choice.enabled[euros] ? "" : "disabled"}>${euros} €</button>`).join("");
  const all = `<button type="button" data-action="replay-stake" data-stake="all" aria-pressed="${choice.allIn ? "true" : "false"}" ${choice.allInEnabled ? "" : "disabled"}>All in</button>`;
  return presets + all;
}

function fieldNumber(id, fallback) {
  const node = document.getElementById(id);
  return node ? node.value : fallback;
}

function readFields() {
  return settingsFromFields({
    stake: fieldNumber("replay-stake", "100"),
    leverage: fieldNumber("replay-lev", "100"),
    spread: fieldNumber("replay-spread", "0,5"),
    balance: fieldNumber("replay-balance", "100"),
    target: fieldNumber("replay-target", ""),
    reenter: fieldNumber("replay-reenter", ""),
    takeShare: fieldNumber("replay-take", "100")
  });
}

function statsBlock(history) {
  const stats = historyStats(history);
  const pct = (value) => (value == null ? "—" : `${Math.round(value * 100)} %`);
  const money = (value) => (value == null ? "—" : formatSignedEuroCents(value));
  const rows = [
    [UI.statsHits, pct(stats.hitRate)],
    [UI.statsRoundHits, pct(stats.roundHitRate)],
    [UI.statsTrades, String(stats.tradeCount || 0)],
    [UI.statsRounds, String(stats.rounds || 0)],
    [UI.statsAvgWin, money(stats.avgWinCents)],
    [UI.statsAvgLoss, money(stats.avgLossCents)],
    [UI.statsBest, money(stats.bestCents)],
    [UI.statsWorst, money(stats.worstCents)]
  ];
  const path = (stats.balances || []).slice(0, 6).map((cents) => formatEuroCents(cents)).join(" · ");
  const seen = [];
  for (const item of history?.rounds || []) {
    const symbol = String(item?.symbol || "");
    if (symbol && !seen.includes(symbol)) seen.push(symbol);
  }
  const symbolLine = seen.slice(0, 5).join(" · ");
  return `<section class="replay-statbox" aria-label="Statistik">
    <div class="replay-stathead">
      <p class="kicker">Statistik</p>
      <span class="replay-armnote" data-arm-note hidden>Nochmal?</span>
      <button type="button" class="replay-statreset" data-action="replay-reset-stats" aria-label="Statistik zurücksetzen">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13"/></svg>
      </button>
    </div>
    ${rows.map(([label, value]) => `<p class="replay-statrow"><span>${esc(label)}</span><strong>${esc(value)}</strong></p>`).join("")}
    ${symbolLine ? `<p class="replay-hint">${esc(symbolLine)}</p>` : ""}
    ${path ? `<p class="replay-hint">${esc(UI.statsBalance)} ${esc(path)}</p>` : ""}
  </section>`;
}

function stockPicker(history, index) {
  const symbols = archiveSymbols(index);
  const current = normalizeSymbol(history?.settings?.symbol);
  const chips = symbols.map((symbol) => `
    <button type="button" data-action="replay-symbol" data-symbol="${esc(symbol)}" aria-pressed="${symbol === current ? "true" : "false"}">${esc(symbol)}</button>`).join("");
  const note = history?.symbolNote || "";
  return `<div class="replay-symbols">
    <p class="kicker">Aktie</p>
    <div class="replay-symbol-row" role="group" aria-label="Aktie">${chips}</div>
    ${note ? `<p class="replay-note">${esc(note)}</p>` : ""}
  </div>`;
}

function setupHtml(history, note) {
  const saved = history?.settings;
  const stake = saved?.stake ?? 100;
  const leverage = saved?.leverage ?? 100;
  const presets = LEVERAGE_PRESETS.map((value) => `
    <button type="button" data-action="replay-lev" data-lev="${value}" aria-pressed="${value === Number(leverage) ? "true" : "false"}">${value}</button>`).join("");
  return `
    <div class="replay" data-replay-root data-screen="setup">
      <button type="button" class="replay-sheet-close" data-action="replay-close">Schließen</button>
      <header class="replay-head">
        <p class="eyebrow">${esc(UI.title)}</p>
        <h2>Training</h2>
        <p class="lede">Kerze für Kerze. Nach jeder Kerze hält es an. Der Gewinn bleibt im nächsten Einsatz.</p>
      </header>
      ${stockPicker(history, null)}
      ${statsBlock(history)}
      ${note ? `<p class="replay-note">${esc(note)}</p>` : ""}
      <label class="replay-field">${esc(UI.stakePick)}
        <input id="replay-stake" inputmode="decimal" autocomplete="off" value="${esc(stake)}">
      </label>
      <p class="kicker">${esc(UI.leverage)}</p>
      <div class="replay-presets" role="group" aria-label="${esc(UI.leverage)}">${presets}
        <label class="replay-free">${esc(UI.custom)}
          <input id="replay-lev" inputmode="decimal" autocomplete="off" value="${esc(leverage)}">
        </label>
      </div>
      <div class="replay-actions">
        <button type="button" class="replay-long" data-action="replay-begin" data-side="long">${esc(UI.long)}</button>
        <button type="button" class="replay-short" data-action="replay-begin" data-side="short">${esc(UI.short)}</button>
      </div>
      <p class="replay-hint">Start 100 €. Unter 25 € beginnt die nächste Runde wieder bei 100 €.</p>
    </div>`;
}

function playHtml(round, mask, history, symbol) {
  const snap = liveSnapshot(round);
  const choice = stakeChoice(stakeBasisCents(round), round.settings);
  if (round.settings && choice.allIn) round.settings.stakeAllIn = true;
  const open = round.position;
  const figure = open ? formatSignedEuroCents(snap.grossCents) : formatSignedEuroCents(snap.roundCents);
  const pct = open ? formatSignedPct(snap.pct) : "";
  const leverage = Number(round.settings?.leverage) || 100;
  const presets = LEVERAGE_PRESETS.map((value) => `
    <button type="button" data-action="replay-lev" data-lev="${value}" aria-pressed="${value === leverage ? "true" : "false"}">${value}</button>`).join("");
  const intervals = [1, 5, 10].map((value) => `
    <button type="button" data-action="replay-interval" data-min="${value}" aria-pressed="${(round.intervalAsk || round.interval) === value ? "true" : "false"}">${value} Min</button>`).join("");
  const undo = `<button type="button" data-action="replay-undo" ${round.undo?.length ? "" : "disabled"}>${esc(UI.undo)}</button>`;
  const pos = open
    ? `<p class="replay-pos">${esc(sideLabel(open.side))} · ${esc(formatEuroCents(open.stakeCents))} · ${esc(UI.leverage)} ${esc(open.leverage)} · ${esc(UI.reasonKo)} ${esc(formatUsd(snap.barrier))}</p>`
    : "";
  const zoomMax = Math.max(8, round.visible || 8);
  const zoomValue = chartZoom > 0 ? Math.min(Math.max(8, chartZoom), zoomMax) : zoomMax;
  const zoomLabel = chartZoom > 0 && chartZoom < zoomMax ? String(Math.round(chartZoom)) : "Tag";
  const zoomCaption = symbol ? `${zoomLabel} · ${symbol}` : zoomLabel;
  return `
    <div class="replay replay-live" data-replay-root data-screen="play">
      <header class="replay-top">
        <div>
          <p class="replay-secret">${esc(mask.stock)}</p>
          <p class="replay-secret muted">${esc(mask.day)}</p>
        </div>
        <p class="replay-clock" id="replay-clock">${esc(formatMinute(snap.minute))}</p>
      </header>
      <div class="replay-chart">
        <canvas id="replay-canvas" aria-label="Kerzen bis zur aktuellen Minute. Spätere Kerzen bleiben verdeckt."></canvas>
      </div>
      <label class="replay-zoom">
        <span>Zoom</span>
        <input id="replay-zoom" type="range" min="8" max="${zoomMax}" step="1" value="${zoomValue}" aria-label="Zoom">
        <span id="replay-zoom-n">${esc(zoomCaption)}</span>
      </label>
      <div class="replay-restart-row">
        <span class="replay-armnote" data-arm-note hidden>Nochmal?</span>
        <button type="button" class="replay-restart" data-action="replay-fresh" aria-label="Neu mit 100 €">
          <span class="replay-restart-icon" aria-hidden="true">↻</span>
          <span class="replay-restart-eur">100 €</span>
        </button>
      </div>
      <div class="replay-speeds" role="group" aria-label="Kerzengrösse">${intervals}${undo}</div>
      ${round.intervalNote ? `<p class="replay-note">${esc(round.intervalNote)}</p>` : ""}
      <div class="replay-hud">
        <p><span>${esc(UI.account)}</span><strong id="replay-equity">${esc(formatEuroCents(snap.equityCents))}</strong></p>
        <p><span>${esc(UI.result)}</span><strong id="replay-pnl" class="${(open ? snap.grossCents : snap.roundCents) < 0 ? "down" : "up"}">${esc(figure)}${pct ? ` <small>${esc(pct)}</small>` : ""}</strong></p>
      </div>
      <p class="replay-price" id="replay-price">${snap.price == null ? "" : esc(formatUsd(snap.price))}</p>
      ${pos}
      <p class="replay-warn" id="replay-warn"></p>
      <div class="replay-actions">
        <button type="button" class="replay-go" data-action="replay-step">${esc(UI.weiter)}</button>
        <button type="button" class="replay-long" data-action="replay-long" ${open ? "disabled" : ""}>${esc(UI.long)}</button>
        <button type="button" class="replay-short" data-action="replay-short" ${open ? "disabled" : ""}>${esc(UI.short)}</button>
        <button type="button" class="replay-out" data-action="replay-out" ${open ? "" : "disabled"}>${esc(UI.out)}</button>
        <button type="button" class="replay-allout" data-action="replay-end">${esc(UI.allOut)}</button>
      </div>
      <div class="replay-band replay-band-2">
        <div class="replay-tile">EINSATZ</div>
        <div class="replay-stake-grid" role="group" aria-label="${esc(UI.stake)}">${stakeButtons(choice)}</div>
      </div>
      <div class="replay-band">
        <div class="replay-tile">HEBEL</div>
        <div class="replay-lev-grid" role="group" aria-label="${esc(UI.leverage)}">${presets}</div>
      </div>
    </div>`;
}

function sheetHtml(round, history, index) {
  const leverage = Number(round?.settings?.leverage) || 100;
  const presets = LEVERAGE_PRESETS.map((value) => `
    <button type="button" data-action="replay-lev" data-lev="${value}" aria-pressed="${value === leverage ? "true" : "false"}">${value}</button>`).join("");
  return `
    <div class="replay-sheet" data-replay-sheet>
      <button type="button" class="replay-sheet-backdrop" data-action="replay-close" aria-label="Schließen"></button>
      <div class="replay-sheet-panel" data-replay-panel>
        <button type="button" class="replay-sheet-close" data-action="replay-close">Schließen</button>
        <p class="kicker">${esc(UI.settings)}</p>
        <div class="replay-presets" role="group" aria-label="${esc(UI.leverage)}">${presets}
          <label class="replay-free">${esc(UI.custom)}
            <input id="replay-lev" inputmode="decimal" autocomplete="off" value="${esc(leverage)}">
          </label>
        </div>
        ${stockPicker(history, index)}
        ${statsBlock(history)}
      </div>
    </div>`;
}

function doneHtml(meta, round, history) {
  const pnl = round.cashCents - round.startCents;
  const rows = round.trades.map((trade) => `
    <li>
      <span>${esc(formatMinute(trade.entryMin))}–${esc(formatMinute(trade.exitMin))} · ${esc(sideLabel(trade.side))} · ${esc(reasonLabel(trade.reason))}</span>
      <span>${esc(formatUsd(trade.entry))} → ${esc(formatUsd(trade.exit))}</span>
      <strong class="${trade.pnlCents < 0 ? "down" : "up"}">${esc(formatSignedEuroCents(trade.pnlCents))}</strong>
    </li>`).join("");
  return `
    <div class="replay" data-replay-root data-screen="done">
      <header class="replay-head">
        <p class="eyebrow">${esc(UI.reveal)}</p>
        <h2>${esc(meta.name)}</h2>
        <p class="lede">${esc(formatDayDe(meta.date))}</p>
      </header>
      <p class="replay-end">${esc(UI.endBalance)} <strong>${esc(formatEuroCents(round.cashCents))}</strong></p>
      <p class="replay-end ${pnl < 0 ? "down" : "up"}">${esc(UI.result)} ${esc(formatSignedEuroCents(pnl))}</p>
      <p class="kicker">${esc(UI.trades)}</p>
      ${rows ? `<ul class="replay-trades">${rows}</ul>` : `<p class="replay-hint">${esc(UI.noTrades)}</p>`}
      ${statsBlock(history)}
      <button type="button" class="replay-go" data-action="replay-again">${esc(UI.newRound)}</button>
      <button type="button" class="replay-back" data-action="replay-setup">${esc(UI.settings)}</button>
    </div>`;
}

function drawChart(canvas, round) {
  if (!canvas || !round) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 220;
  const pxW = Math.round(width * dpr);
  const pxH = Math.round(height * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const padL = 8;
  const padR = 58;
  const padT = 16;
  const padB = 18;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const visible = [];
  for (let index = 0; index < round.visible; index += 1) visible.push(unpackBar(round.bars[index]));
  const frame = candleWindow(visible.length, plotW, chartZoom);
  const shown = visible.slice(frame.from);
  const xAt = (index) => padL + (index + 0.5) * frame.slot;
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const candle of (shown.length ? shown : visible)) {
    cMin = Math.min(cMin, candle.l);
    cMax = Math.max(cMax, candle.h);
  }
  if (!Number.isFinite(cMin)) {
    cMin = 0;
    cMax = 1;
  }
  const span = Math.max(cMax - cMin, Math.abs(cMax) * 0.004, 0.01);
  let min = cMin - span * 0.16;
  let max = cMax + span * 0.16;
  let barrier = null;
  let pinned = "";
  if (round.position) {
    barrier = knockBarrier(round.position.entry, round.position.leverage, round.position.side);
    const room = Math.max(span * 2.2, Math.abs(cMax) * 0.012);
    if (barrier >= cMin - room && barrier <= cMax + room) {
      min = Math.min(min, barrier);
      max = Math.max(max, barrier);
    } else pinned = barrier < cMin ? "low" : "high";
  }
  const yOf = (price) => padT + (1 - (price - min) / (max - min || 1)) * plotH;
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.lineWidth = 1;
  for (const price of [max, (min + max) / 2, min]) {
    const y = Math.min(padT + plotH - 2, Math.max(padT + 10, yOf(price)));
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.moveTo(padL, yOf(price));
    ctx.lineTo(padL + plotW, yOf(price));
    ctx.stroke();
    ctx.fillStyle = "#b7c0d0";
    ctx.fillText(formatUsd(price).replace(" $", ""), width - 4, y);
  }
  if (shown.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#b7c0d0";
    const first = shown[0];
    const lastTime = shown.at(-1);
    ctx.fillText(formatMinute(first.t), padL + 16, height - 4);
    ctx.fillText(formatMinute(lastTime.t + (lastTime.span || round.interval || 5)), padL + plotW - 16, height - 4);
  }
  for (let index = 0; index < shown.length; index += 1) {
    const candle = shown[index];
    const x = xAt(index);
    const bodyW = frame.body;
    const up = candle.c >= candle.o;
    const quiet = candle.v === 0;
    ctx.globalAlpha = quiet ? 0.82 : 1;
    ctx.strokeStyle = up ? "#7ddec0" : "#ff8b98";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(candle.h));
    ctx.lineTo(x, yOf(candle.l));
    ctx.stroke();
    const top = yOf(Math.max(candle.o, candle.c));
    const bot = yOf(Math.min(candle.o, candle.c));
    const h = Math.max(1, bot - top);
    if (quiet) ctx.strokeRect(x - bodyW / 2, top, bodyW, h);
    else ctx.fillRect(x - bodyW / 2, top, bodyW, h);
  }
  ctx.globalAlpha = 1;
  const marks = intervalMarks(shown.map((candle) => [candle.t, candle.o, candle.h, candle.l, candle.c, candle.v, candle.span || round.interval || 5]));
  if (round.intervalAsk === 1 && (marks.five || marks.one)) {
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(183,192,208,.85)";
    if (marks.five && !marks.one) ctx.fillText("5 Min", padL + 4, padT + 11);
    if (marks.one && !marks.five) ctx.fillText("1 Min", padL + 4, padT + 11);
    if (marks.five && marks.one && marks.switchMin != null) {
      const switchIndex = shown.findIndex((candle) => candle.t >= marks.switchMin);
      const x = switchIndex >= 0 ? xAt(switchIndex) - frame.slot / 2 : padL;
      ctx.strokeStyle = "rgba(228,177,90,.55)";
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText("5 Min", padL + 4, padT + 11);
      ctx.fillText("1 Min", Math.min(padL + plotW - 36, x + 4), padT + 11);
    }
  }
  if (barrier != null) {
    const y = pinned === "low" ? padT + plotH - 1 : pinned === "high" ? padT + 1 : yOf(barrier);
    ctx.strokeStyle = "#ff8b98";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ff8b98";
    const label = pinned ? `${UI.reasonKo} ${formatUsd(barrier).replace(" $", "")}` : UI.reasonKo;
    ctx.fillText(label, padL + 4, pinned === "low" ? y - 4 : y + 11);
  }
  const last = visible.at(-1);
  if (last) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#f6e7c4";
    ctx.fillText(formatUsd(last.c).replace(" $", ""), padL + plotW + 4, yOf(last.c) + 3);
  }
}

export function initTraining() {
  let screen = "setup";
  let sheet = false;
  let round = null;
  let freshArm = 0;
  let statsArm = 0;
  let lastTapAt = 0;
  let tapStart = null;
  let toastAfterBegin = false;
  let pendingSide = "";
  let meta = null;
  let index = null;
  let history = { rounds: [], settings: null };
  let note = "";
  let raf = 0;
  let last = 0;
  let drawn = -1;
  let bound = false;
  let busy = false;

  function page() {
    return document.getElementById(PAGE_ID);
  }

  function store() {
    try {
      history = loadHistory(localStorage);
    } catch {
      history = { rounds: [], settings: null };
    }
  }

  function persist(next) {
    history = next;
    try { saveHistory(localStorage, history); } catch { /* Gerät voll. */ }
  }

  function paint(full) {
    const root = page();
    if (!root) return;
    if (full || !root.querySelector("[data-replay-root]")) {
      if (screen === "play" && round && meta) root.innerHTML = playHtml(round, hiddenLabels(), history, meta.symbol);
      else if (screen === "done" && round && meta) root.innerHTML = doneHtml(meta, round, history);
      else root.innerHTML = setupHtml(history, note);
      drawn = -1;
    }
    if (sheet) mountSheet();
    if (screen === "play" && round) {
      updateHud();
      const canvas = document.getElementById("replay-canvas");
      const stamp = `${round.visible}:${round.position ? round.position.entry : 0}:${round.phase}`;
      if (stamp !== drawn) {
        drawChart(canvas, round);
        drawn = stamp;
      }
    }
    paintArm();
  }

  function showToast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => el.classList.remove("show"), 2200);
  }

  function paintArm() {
    const root = page();
    if (!root) return;
    const now = Date.now();
    markArm(root, "replay-fresh", confirmRestart(freshArm, now), "Neu mit 100 €");
    markArm(root, "replay-reset-stats", confirmRestart(statsArm, now), "Statistik zurücksetzen");
  }

  function markArm(root, action, on, label) {
    root.querySelectorAll(`[data-action="${action}"]`).forEach((button) => {
      button.classList.toggle("is-armed", on);
      button.setAttribute("aria-label", on ? `Nochmal? ${label}` : label);
      const note = button.parentElement?.querySelector("[data-arm-note]");
      if (note) note.hidden = !on;
    });
  }

  function updateHud() {
    if (!round) return;
    const snap = liveSnapshot(round);
    const clock = document.getElementById("replay-clock");
    if (clock) clock.textContent = formatMinute(snap.minute);
    const equity = document.getElementById("replay-equity");
    if (equity) equity.textContent = formatEuroCents(snap.equityCents);
    const pnl = document.getElementById("replay-pnl");
    if (pnl) {
      const cents = round.position ? snap.grossCents : snap.roundCents;
      const pct = round.position ? ` ${formatSignedPct(snap.pct)}` : "";
      pnl.textContent = `${formatSignedEuroCents(cents)}${pct}`;
      pnl.className = cents < 0 ? "down" : "up";
    }
    const price = document.getElementById("replay-price");
    if (price) price.textContent = snap.price == null ? "" : formatUsd(snap.price);
    const lastTrade = round.trades?.at(-1);
    const note = document.getElementById("replay-warn");
    if (note) note.classList.toggle("replay-ko", !round.position && lastTrade?.reason === "ko");
    if (!round.position && lastTrade?.reason === "ko") warn(UI.reasonKo);
  }

  function warn(text) {
    const node = document.getElementById("replay-warn");
    if (node) node.textContent = text || "";
  }

  function finishIfDone(prev) {
    if (round?.phase === "done" && prev !== "done") {
      const summary = roundSummary(meta, round);
      summary.at = new Date().toISOString();
      persist(rememberRound(history, summary, summary.at));
      screen = "done";
      paint(true);
      return true;
    }
    return false;
  }

  function loop(now) {
    raf = window.requestAnimationFrame(loop);
    const root = page();
    const box = root?.getBoundingClientRect();
    const onScreen = box && box.width > 40 && box.left < window.innerWidth - 8 && box.right > 8;
    if (document.hidden || !onScreen) {
      last = now;
      return;
    }
    if (screen === "play" && round) {
      const canvas = document.getElementById("replay-canvas");
      const width = canvas?.clientWidth || 0;
      if (width > 40 && drawn !== `${width}:${round.visible}:${round.interval}`) {
        drawChart(canvas, round);
        drawn = `${width}:${round.visible}:${round.interval}`;
      }
    }
    last = now;
  }

  async function ensureIndex() {
    if (index?.days?.length) return index;
    const response = await fetch(`${appBase()}/data/replay/index.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    index = await response.json();
    return index;
  }

  async function loadOneMinute() {
    if (!round || !meta) return;
    let bars = null;
    try {
      const response = await fetch(`${appBase()}/data/replay/1m/${meta.symbol}/${meta.date}.json`, { cache: "no-cache" });
      if (response.ok) {
        const body = await response.json();
        bars = body?.b || null;
      }
    } catch {
      bars = null;
    }
    round = applyOneMinute(round, bars);
    paint(true);
  }

  async function loadDay(choice) {
    const response = await fetch(`${appBase()}/data/replay/${choice.symbol}/${choice.date}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function begin(keepSettings, side) {
    if (busy) {
      toastAfterBegin = false;
      return;
    }
    busy = true;
    pendingSide = side || "";
    const settings = keepSettings || readFields();
    note = UI.loading;
    if (screen === "setup") paint(true);
    try {
      const catalog = await ensureIndex();
      let choice = null;
      let day = null;
      for (let attempt = 0; attempt < 4 && !day; attempt += 1) {
        choice = pickRound(catalog, Math.random, meta, history?.settings?.symbol || "");
        if (!choice) break;
        try {
          day = await loadDay(choice);
        } catch {
          day = null;
        }
      }
      if (!choice || !day?.b?.length) {
        const wanted = normalizeSymbol(history?.settings?.symbol);
        if (wanted) {
          history = { ...history, symbolNote: `Keine Kursdaten für ${wanted}` };
          note = history.symbolNote;
          screen = round ? (round.phase === "done" ? "done" : "play") : "setup";
        } else {
          note = UI.missing;
          screen = "setup";
        }
        paint(true);
        return;
      }
      history = { ...history, symbolNote: "" };
      meta = choice;
      round = previewRound(createRound(day, settings));
      if (pendingSide) {
        const opened = openTrade(round, pendingSide);
        if (opened.ok) round = pauseRound(opened.state);
        pendingSide = "";
      }
      history = { ...history, settings: { ...settings, symbol: history?.settings?.symbol || "" } };
      try { saveHistory(localStorage, history); } catch { /* bleibt im Speicher. */ }
      screen = "play";
      note = "";
      paint(true);
      if (toastAfterBegin) showToast("Konto 100 €");
    } catch {
      note = UI.missing;
      screen = "setup";
      paint(true);
    } finally {
      toastAfterBegin = false;
      busy = false;
    }
  }

  function openSettings() {
    sheet = true;
    mountSheet();
  }

  function closeSettings() {
    sheet = false;
    page()?.querySelector("[data-replay-sheet]")?.remove();
    if (screen === "setup" && round) {
      screen = round.phase === "done" ? "done" : "play";
      paint(true);
    }
  }

  function mountSheet() {
    const root = page();
    if (!root || root.querySelector("[data-replay-sheet]")) return;
    root.insertAdjacentHTML("beforeend", sheetHtml(round, history, index));
    const panel = root.querySelector("[data-replay-panel]");
    if (!panel) return;
    let startY = 0;
    let dy = 0;
    panel.addEventListener("touchstart", (event) => {
      startY = event.touches[0]?.clientY || 0;
      dy = 0;
    }, { passive: true });
    panel.addEventListener("touchmove", (event) => {
      const y = event.touches[0]?.clientY || startY;
      dy = y - startY;
      if (dy > 0 && panel.scrollTop <= 0) panel.style.transform = `translateY(${Math.min(dy, 160)}px)`;
      else panel.style.transform = "";
    }, { passive: true });
    panel.addEventListener("touchend", () => {
      if (dismissSheet(dy, panel.scrollTop)) closeSettings();
      else panel.style.transform = "";
      dy = 0;
    });
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    const root = page();
    if (!el || !root?.contains(el)) return;
    if (!String(el.dataset.action || "").startsWith("replay-")) return;
    event.stopPropagation();
    const action = el.dataset.action;
    if (action === "replay-symbol") {
      const picked = chooseReplaySymbol(history, round, index, el.dataset.symbol);
      history = picked.history;
      if (picked.round) round = picked.round;
      if (picked.ok) persist(history);
      else note = history.symbolNote || "";
      paint(true);
      return;
    }
    if (action === "replay-reset-stats" || action === "replay-fresh") {
      if (event.pointerType === "touch") return;
      armOrRun(action === "replay-fresh" ? "fresh" : "stats");
      return;
    }
    if (action === "replay-stake") {
      if (!round?.settings || el.disabled) return;
      if (el.dataset.stake === "all") round.settings.stakeAllIn = true;
      else {
        round.settings.stakeAllIn = false;
        round.settings.stake = Number(el.dataset.stake);
      }
      paint(true);
      return;
    }
    if (action === "replay-lev") {
      const input = document.getElementById("replay-lev");
      if (input) input.value = el.dataset.lev || "";
      if (round?.settings) round.settings.leverage = Number(el.dataset.lev) || round.settings.leverage;
      root.querySelectorAll("[data-action='replay-lev']").forEach((button) => {
        button.setAttribute("aria-pressed", button === el ? "true" : "false");
      });
      return;
    }
    if (action === "replay-begin") {
      begin(null, el.dataset.side === "short" ? "short" : "long");
      return;
    }
    if (action === "replay-interval") {
      const minutes = Number(el.dataset.min);
      if (!round) return;
      if (minutes === 1) {
        loadOneMinute();
        return;
      }
      round = withInterval(round, minutes);
      paint(true);
      return;
    }
    if (action === "replay-settings" || action === "replay-setup") {
      openSettings();
      return;
    }
    if (action === "replay-close") {
      closeSettings();
      return;
    }
    if (action === "replay-again") {
      const settings = { ...(round?.settings || history.settings || readFields()) };
      settings.balance = nextRoundEuros(round ? round.cashCents / 100 : null);
      begin(settings);
      return;
    }
    if (action === "replay-take") {
      const input = document.getElementById("replay-take");
      if (input) input.value = el.dataset.take || "100";
      root.querySelectorAll("[data-action='replay-take']").forEach((button) => {
        button.setAttribute("aria-pressed", button === el ? "true" : "false");
      });
      return;
    }
    if (action === "replay-tempo") {
      root.querySelectorAll("[data-action='replay-tempo']").forEach((button) => {
        button.setAttribute("aria-pressed", button === el ? "true" : "false");
      });
      return;
    }
    if (!round || screen !== "play") return;
    if (action === "replay-undo") {
      if (!round.undo?.length) return;
      round = undoCandle(round);
      paint(true);
      return;
    }
    if (action === "replay-step") {
      const prev = round.phase;
      round = stepCandle(pauseRound(round));
      if (!finishIfDone(prev)) paint(true);
      return;
    }
    if (action === "replay-skip") {
      const prev = round.phase;
      round = skipToOpen(round);
      if (!finishIfDone(prev)) paint(true);
      return;
    }
    if (action === "replay-long" || action === "replay-short") {
      const opened = openTrade(round, action === "replay-short" ? "short" : "long");
      if (!opened.ok) {
        warn(opened.reason === "candle" ? UI.noCandle : UI.stakeFit);
        return;
      }
      round = opened.state;
      warn("");
      paint(true);
      return;
    }
    if (action === "replay-out") {
      round = closeManual(round);
      paint(true);
      return;
    }
    if (action === "replay-end") {
      sheet = false;
      const prev = round.phase;
      round = endRound(round);
      if (!finishIfDone(prev)) paint(true);
    }
  }

  function armOrRun(which) {
    const now = Date.now();
    if (sameGesture(lastTapAt, now)) return;
    lastTapAt = now;
    const armedAt = which === "fresh" ? freshArm : statsArm;
    if (!confirmRestart(armedAt, now)) {
      if (which === "fresh") freshArm = now;
      else statsArm = now;
      paintArm();
      window.setTimeout(() => {
        const at = which === "fresh" ? freshArm : statsArm;
        if (confirmRestart(at, Date.now())) return;
        if (which === "fresh") freshArm = 0;
        else statsArm = 0;
        paintArm();
      }, 3100);
      return;
    }
    if (which === "fresh") {
      freshArm = 0;
      toastAfterBegin = true;
      const settings = { ...(round?.settings || history.settings || {}), balance: 100, stake: 100, stakeAllIn: false, leverage: round?.settings?.leverage || 100 };
      begin(settings);
      return;
    }
    statsArm = 0;
    history = resetHistory(history);
    persist(history);
    paint(true);
    showToast("Statistik gelöscht");
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const el = event.target instanceof Element
      ? event.target.closest("[data-action='replay-fresh'], [data-action='replay-reset-stats']")
      : null;
    if (!el || !page()?.contains(el)) {
      tapStart = null;
      return;
    }
    tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY, action: el.dataset.action };
  }

  function onPointerUp(event) {
    if (!tapStart || event.pointerId !== tapStart.id) return;
    const start = tapStart;
    tapStart = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14) return;
    const el = event.target instanceof Element ? event.target.closest(`[data-action="${start.action}"]`) : null;
    if (!el || !page()?.contains(el)) return;
    event.preventDefault();
    event.stopPropagation();
    armOrRun(start.action === "replay-fresh" ? "fresh" : "stats");
  }

  function bind(root) {
    if (bound) return;
    bound = true;
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", () => { tapStart = null; });
    root.addEventListener("click", onClick);
    root.addEventListener("input", (event) => {
      const target = event.target;
      if (target?.id === "replay-lev") {
        root.querySelectorAll("[data-action='replay-lev']").forEach((button) => {
          button.setAttribute("aria-pressed", String(button.dataset.lev) === target.value ? "true" : "false");
        });
      }
      if (target?.id === "replay-zoom") {
        if (!event.isTrusted) return;
        const max = Number(target.max) || 8;
        const value = Number(target.value);
        if (!Number.isFinite(value)) return;
        chartZoom = value >= max - 0.01 ? 0 : Math.max(8, Math.min(max, value));
        const count = document.getElementById("replay-zoom-n");
        if (count) count.textContent = `${chartZoom ? String(Math.round(chartZoom)) : "Tag"}${meta?.symbol ? ` · ${meta.symbol}` : ""}`;
        const canvas = document.getElementById("replay-canvas");
        if (canvas && round) drawChart(canvas, round);
        return;
      }
      if ((target?.id === "replay-stake-live" || target?.id === "replay-stake") && round?.settings) {
        const next = Number(String(target.value).replace(",", "."));
        if (Number.isFinite(next) && next > 0) {
          round.settings.stake = next;
          const otherId = target.id === "replay-stake" ? "replay-stake-live" : "replay-stake";
          const other = document.getElementById(otherId);
          if (other && other !== target) other.value = target.value;
        }
      }
    });
    const canvas = () => document.getElementById("replay-canvas");
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        if (screen === "play" && round) drawChart(canvas(), round);
      });
      observer.observe(root);
    }
  }

  return {
    sync() {
      const root = page();
      if (!root) return;
      if (!history.rounds.length && !history.settings) store();
      bind(root);
      if (!root.querySelector("[data-replay-root]")) paint(true);
      if (!round && !busy) begin(history.settings || null);
      if (!raf) {
        last = performance.now();
        raf = window.requestAnimationFrame(loop);
      }
    }
  };
}

export { REPLAY_POOL };
