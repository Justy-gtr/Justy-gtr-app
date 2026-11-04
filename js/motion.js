import { formatDuration } from "./logic.js";

let firedFor = null;

export function playLiftoff() {
  const rocket = document.getElementById("rocket");
  const card = document.getElementById("launch-card");
  if (!rocket) return;
  rocket.classList.remove("gone");
  card?.classList.remove("launching");
  void rocket.offsetWidth;
  rocket.classList.add("gone");
  card?.classList.add("launching");
  whoosh();
}

export function tickCountdown() {
  const el = document.getElementById("count-num");
  if (!el) return;
  const target = el.dataset.target;
  const time = new Date(target).getTime();
  if (Number.isNaN(time)) {
    el.textContent = "Kein Fenster";
    return;
  }
  const diff = time - Date.now();
  if (diff <= 0) {
    el.textContent = "Fenster offen";
    if (firedFor !== target) {
      firedFor = target;
      playLiftoff();
    }
    return;
  }
  el.textContent = formatDuration(diff);
}

function whoosh() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(640, ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch {
    /* Audio ist Beiwerk. */
  }
}
