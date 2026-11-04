import { berlinDate, loadStore, saveStore } from "./logic.js";

export function initEggs(toast) {
  const logo = document.getElementById("logo-btn");
  let taps = [];
  logo?.addEventListener("click", () => {
    const now = Date.now();
    taps = taps.filter((time) => now - time < 2600);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      nightDrive();
    }
  });

  return {
    afterRender(data) {
      const store = loadStore();
      store.highs = store.highs || {};
      const today = berlinDate();
      let changed = false;
      for (const ticker of data?.prices?.tickers || []) {
        if (ticker.example || ticker.narrativeExample) continue;
        if (ticker.priceEur == null || ticker.recordHighEur == null) continue;
        if (Number(ticker.priceEur) + 0.001 < Number(ticker.recordHighEur)) continue;
        const key = `${ticker.symbol}-${today}`;
        if (store.highs[key]) continue;
        store.highs[key] = true;
        changed = true;
        document.querySelector(`[data-symbol-card="${CSS.escape(ticker.symbol)}"]`)?.classList.add("is-high");
        toast(`Neuer Höchststand bei ${ticker.symbol}.`);
      }
      if (changed) saveStore(store);
    }
  };
}

function nightDrive() {
  const root = document.getElementById("egg-root");
  if (!root) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.innerHTML = `<div class="night-drive" role="presentation">
    ${reduced ? "" : Array.from({ length: 14 }, (_, index) => `<span class="streak" style="top:${8 + index * 6}%;animation-delay:${index * 0.08}s"></span>`).join("")}
    <div class="drive-copy"><p>GT-R</p><h2>Nachtfahrt. Die Sterne bleiben auf der Spur.</h2></div>
  </div>`;
  if (!reduced) rumble();
  const close = () => { root.innerHTML = ""; };
  root.querySelector(".night-drive")?.addEventListener("click", close);
  window.setTimeout(close, 4800);
}

function rumble() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(52, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 1.5);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.8);
  } catch {
    /* still */
  }
}
