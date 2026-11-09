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

function writeParts(el, parts) {
  for (const key of ["days", "hours", "minutes"]) {
    const node = el.querySelector(`[data-part="${key}"]`);
    if (node) node.textContent = parts ? String(parts[key]) : "—";
  }
}

function paintCountdown(el) {
  const target = el.dataset.target || "";
  const time = new Date(target).getTime();
  const legacy = el.id === "count-num";
  if (Number.isNaN(time)) {
    if (legacy) el.textContent = "Kein Fenster";
    else writeParts(el, null);
    return;
  }
  const diff = time - Date.now();
  if (diff <= 0) {
    if (legacy) el.textContent = "Fenster offen";
    else writeParts(el, { days: 0, hours: 0, minutes: 0 });
    if (firedFor !== target) {
      firedFor = target;
      playLiftoff();
    }
    return;
  }
  if (legacy) {
    el.textContent = formatDuration(diff);
    return;
  }
  const total = Math.floor(diff / 1000);
  writeParts(el, {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60)
  });
}

export function tickCountdown() {
  const nodes = document.querySelectorAll("[data-countdown], #count-num");
  const seen = new Set();
  nodes.forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    paintCountdown(el);
  });
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
