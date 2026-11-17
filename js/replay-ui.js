/** Rückspiel-Oberfläche. Füllt #page-training und rührt die anderen Seiten nicht an.
 *  Der 5-Tab-Umbau behält diese Datei. Er setzt nur <section id="page-training">
 *  und ruft initTraining() nach dem Rendern. Die Seite nicht in renderShell leeren.
 */

import { appBase, esc } from "./logic.js";
import {
  LEVERAGE_PRESETS,
  REPLAY_POOL,
  SPEEDS,
  UI,
  closeManual,
  createRound,
  formatDayDe,
  formatEuroCents,
  formatMinute,
  formatSignedEuroCents,
  formatSignedPct,
  formatUsd,
  hiddenLabels,
  historyStats,
  knockBarrier,
  liveSnapshot,
  loadHistory,
  openTrade,
  pauseRound,
  pickRound,
  reasonLabel,
  rememberRound,
  roundSummary,
  saveHistory,
  setSpeed,
  settingsFromFields,
  sideLabel,
  skipToOpen,
  stepCandle,
  tick,
  unpackBar
} from "./replay.js";

const PAGE_ID = "page-training";

function fieldNumber(id, fallback) {
  const node = document.getElementById(id);
  return node ? node.value : fallback;
}

function readFields() {
  return settingsFromFields({
    stake: fieldNumber("replay-stake", "100"),
    leverage: fieldNumber("replay-lev", "10"),
    spread: fieldNumber("replay-spread", "0,5"),
    balance: fieldNumber("replay-balance", "1000"),
    target: fieldNumber("replay-target", ""),
    reenter: fieldNumber("replay-reenter", "")
  });
}

function statsLine(history) {
  const stats = historyStats(history);
  const hits = stats.hitRate == null ? "—" : formatSignedPct(stats.hitRate * 100).replace("+", "");
  return `${UI.statsRounds} ${stats.rounds} · ${UI.statsHits} ${hits} · ${UI.statsSum} ${formatSignedEuroCents(stats.sumCents)}`;
}

function setupHtml(history, note) {
  const saved = history?.settings;
  const stake = saved?.stake ?? 100;
  const leverage = saved?.leverage ?? 10;
  const spread = saved ? String(Math.round(saved.spread * 10000) / 100).replace(".", ",") : "0,5";
  const balance = saved?.balance ?? 1000;
  const target = saved?.takeProfitPct ?? "";
  const again = saved?.reenterPct ?? "";
  const presets = LEVERAGE_PRESETS.map((value) => `
    <button type="button" data-action="replay-lev" data-lev="${value}" aria-pressed="${value === leverage ? "true" : "false"}">${value}</button>`).join("");
  return `
    <div class="replay" data-replay-root data-screen="setup">
      <header class="replay-head">
        <p class="eyebrow">${esc(UI.title)}</p>
        <h2>Training</h2>
        <p class="lede">${esc(UI.lede)}</p>
      </header>
      <p class="replay-stats">${esc(statsLine(history))}</p>
      ${note ? `<p class="replay-note">${esc(note)}</p>` : ""}
      <label class="replay-field">${esc(UI.balance)}
        <input id="replay-balance" inputmode="decimal" autocomplete="off" value="${esc(balance)}">
      </label>
      <label class="replay-field">${esc(UI.stake)}
        <input id="replay-stake" inputmode="decimal" autocomplete="off" value="${esc(stake)}">
      </label>
      <p class="kicker">${esc(UI.leverage)}</p>
      <div class="replay-presets" role="group" aria-label="${esc(UI.leverage)}">${presets}
        <label class="replay-free">${esc(UI.custom)}
          <input id="replay-lev" inputmode="decimal" autocomplete="off" value="${esc(leverage)}">
        </label>
      </div>
      <label class="replay-field">${esc(UI.spread)}
        <input id="replay-spread" inputmode="decimal" autocomplete="off" value="${esc(spread)}">
      </label>
      <p class="replay-hint">${esc(UI.spreadHint)}</p>
      <label class="replay-field">${esc(UI.target)}
        <input id="replay-target" inputmode="decimal" autocomplete="off" placeholder="${esc(UI.targetHint)}" value="${esc(target)}">
      </label>
      <label class="replay-field">${esc(UI.reenter)}
        <input id="replay-reenter" inputmode="decimal" autocomplete="off" placeholder="${esc(UI.targetHint)}" value="${esc(again)}">
      </label>
      <p class="replay-hint">${esc(UI.priceNote)}</p>
      <button type="button" class="replay-go" data-action="replay-start">${esc(UI.start)}</button>
    </div>`;
}

function playHtml(round, mask) {
  const snap = liveSnapshot(round);
  const open = round.position;
  const figure = open ? formatSignedEuroCents(snap.grossCents) : formatSignedEuroCents(snap.roundCents);
  const pct = open ? formatSignedPct(snap.pct) : "";
  const speeds = SPEEDS.map((speed) => `
    <button type="button" data-action="replay-speed" data-speed="${speed}" aria-pressed="${!round.paused && round.speed === speed ? "true" : "false"}">${speed}×</button>`).join("");
  const spreadPct = String(Math.round(round.settings.spread * 10000) / 100).replace(".", ",");
  const pos = open
    ? `<p class="replay-pos">${esc(sideLabel(open.side))} · ${esc(formatEuroCents(open.stakeCents))} · ${esc(UI.leverage)} ${esc(open.leverage)} · ${esc(UI.reasonKo)} ${esc(formatUsd(snap.barrier))}</p>`
    : "";
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
      <div class="replay-hud">
        <p><span>${esc(UI.account)}</span><strong id="replay-equity">${esc(formatEuroCents(snap.equityCents))}</strong></p>
        <p><span>${esc(UI.result)}</span><strong id="replay-pnl" class="${(open ? snap.grossCents : snap.roundCents) < 0 ? "down" : "up"}">${esc(figure)}${pct ? ` <small>${esc(pct)}</small>` : ""}</strong></p>
      </div>
      <p class="replay-price" id="replay-price">${snap.price == null ? "" : esc(formatUsd(snap.price))}</p>
      ${pos}
      <p class="replay-flatline">Spread ${esc(spreadPct)} % je Handel. ${esc(UI.quiet)}</p>
      <p class="replay-warn" id="replay-warn"></p>
      <div class="replay-speeds" role="group" aria-label="Beschleunigung">
        <button type="button" data-action="replay-pause" aria-pressed="${round.paused ? "true" : "false"}">${esc(UI.pause)}</button>
        <button type="button" data-action="replay-step">${esc(UI.step)}</button>
        ${speeds}
        <button type="button" data-action="replay-skip">${esc(UI.skip)}</button>
      </div>
      <div class="replay-actions">
        <button type="button" class="replay-long" data-action="replay-long" ${open ? "disabled" : ""}>${esc(UI.long)}</button>
        <button type="button" class="replay-short" data-action="replay-short" ${open ? "disabled" : ""}>${esc(UI.short)}</button>
        <button type="button" class="replay-out" data-action="replay-out" ${open ? "" : "disabled"}>${esc(UI.out)}</button>
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
      <p class="replay-stats">${esc(statsLine(history))}</p>
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
  const padL = 6;
  const padR = 62;
  const padT = 10;
  const padB = 20;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const xOf = (minute) => padL + ((minute - 8 * 60) / (14 * 60)) * plotW;
  const visible = [];
  for (let index = 0; index < round.visible; index += 1) visible.push(unpackBar(round.bars[index]));
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const candle of visible) {
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
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#b7c0d0";
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (const minute of [8 * 60, 12 * 60, 15 * 60 + 30, 18 * 60, 22 * 60]) {
    const x = xOf(minute);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillText(formatMinute(minute), Math.min(width - 18, Math.max(16, x)), height - 5);
  }
  const now = Math.max(8 * 60, Math.min(22 * 60, round.marketMin));
  ctx.strokeStyle = "rgba(228,177,90,.35)";
  ctx.beginPath();
  ctx.moveTo(xOf(now), padT);
  ctx.lineTo(xOf(now), padT + plotH);
  ctx.stroke();
  const slot = Math.max(1, xOf(8 * 60 + 5) - xOf(8 * 60));
  const bodyW = Math.max(1.4, Math.min(7, slot * 0.62));
  for (const candle of visible) {
    const x = xOf(candle.t + 2.5);
    const up = candle.c >= candle.o;
    const quiet = candle.v === 0;
    ctx.globalAlpha = quiet ? 0.35 : 1;
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
  let round = null;
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
      if (screen === "play" && round && meta) root.innerHTML = playHtml(round, hiddenLabels());
      else if (screen === "done" && round && meta) root.innerHTML = doneHtml(meta, round, history);
      else root.innerHTML = setupHtml(history, note);
      drawn = -1;
    }
    if (screen === "play" && round) {
      updateHud();
      const canvas = document.getElementById("replay-canvas");
      const stamp = `${round.visible}:${round.position ? round.position.entry : 0}:${round.phase}`;
      if (stamp !== drawn) {
        drawChart(canvas, round);
        drawn = stamp;
      }
    }
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
    if (screen !== "play" || !round || round.paused) {
      last = now;
      return;
    }
    const dt = Math.min(0.25, (now - last) / 1000 || 0);
    last = now;
    if (!(dt > 0)) return;
    const prevPhase = round.phase;
    const prevVisible = round.visible;
    const had = Boolean(round.position);
    round = tick(round, dt);
    if (finishIfDone(prevPhase)) return;
    const canvas = document.getElementById("replay-canvas");
    if (round.visible !== prevVisible || Boolean(round.position) !== had) {
      drawChart(canvas, round);
      drawn = `${round.visible}:${round.position ? round.position.entry : 0}:${round.phase}`;
      if (Boolean(round.position) !== had) paint(true);
    }
    updateHud();
  }

  async function ensureIndex() {
    if (index?.days?.length) return index;
    const response = await fetch(`${appBase()}/data/replay/index.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    index = await response.json();
    return index;
  }

  async function loadDay(choice) {
    const response = await fetch(`${appBase()}/data/replay/${choice.symbol}/${choice.date}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function begin(keepSettings) {
    if (busy) return;
    busy = true;
    const settings = keepSettings || readFields();
    note = UI.loading;
    if (screen === "setup") paint(true);
    try {
      const catalog = await ensureIndex();
      let choice = null;
      let day = null;
      for (let attempt = 0; attempt < 4 && !day; attempt += 1) {
        choice = pickRound(catalog, Math.random, meta);
        if (!choice) break;
        try {
          day = await loadDay(choice);
        } catch {
          day = null;
        }
      }
      if (!choice || !day?.b?.length) {
        note = UI.missing;
        screen = "setup";
        paint(true);
        return;
      }
      meta = choice;
      round = createRound(day, settings);
      history = { ...history, settings };
      try { saveHistory(localStorage, history); } catch { /* bleibt im Speicher. */ }
      screen = "play";
      note = "";
      paint(true);
    } catch {
      note = UI.missing;
      screen = "setup";
      paint(true);
    } finally {
      busy = false;
    }
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    const root = page();
    if (!el || !root?.contains(el)) return;
    if (!String(el.dataset.action || "").startsWith("replay-")) return;
    event.stopPropagation();
    const action = el.dataset.action;
    if (action === "replay-lev") {
      const input = document.getElementById("replay-lev");
      if (input) input.value = el.dataset.lev || "";
      root.querySelectorAll("[data-action='replay-lev']").forEach((button) => {
        button.setAttribute("aria-pressed", button === el ? "true" : "false");
      });
      return;
    }
    if (action === "replay-start") {
      begin(null);
      return;
    }
    if (action === "replay-setup") {
      screen = "setup";
      paint(true);
      return;
    }
    if (action === "replay-again") {
      begin(round?.settings || history.settings || readFields());
      return;
    }
    if (!round || screen !== "play") return;
    if (action === "replay-pause") {
      round = round.paused ? setSpeed(round, round.speed || 1) : pauseRound(round);
      paint(true);
      return;
    }
    if (action === "replay-speed") {
      round = setSpeed(round, Number(el.dataset.speed));
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
    }
  }

  function bind(root) {
    if (bound) return;
    bound = true;
    root.addEventListener("click", onClick);
    root.addEventListener("input", (event) => {
      if (event.target?.id !== "replay-lev") return;
      root.querySelectorAll("[data-action='replay-lev']").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.lev) === event.target.value ? "true" : "false");
      });
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
      if (!raf) {
        last = performance.now();
        raf = window.requestAnimationFrame(loop);
      }
    }
  };
}

export { REPLAY_POOL };
