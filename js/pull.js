export const PULL_THRESHOLD = 70;

/**
 * Finger travel while a scroller sits at the top.
 * Horizontal movement stays with the pager. Only a downward pull can refresh.
 */
export function pullDecision({ scrollTop = 0, dx = 0, dy = 0, locked = null } = {}) {
  if (scrollTop > 1) return { locked: "scroll", pulling: false, distance: 0, trigger: false };
  if (locked === "h" || locked === "scroll") return { locked, pulling: false, distance: 0, trigger: false };
  if (locked == null) {
    if (Math.hypot(dx, dy) < 8) return { locked: null, pulling: false, distance: 0, trigger: false };
    if (Math.abs(dx) > Math.abs(dy)) return { locked: "h", pulling: false, distance: 0, trigger: false };
    if (dy <= 0) return { locked: "v", pulling: false, distance: 0, trigger: false };
  }
  const distance = Math.max(0, dy);
  return { locked: "v", pulling: distance > 0, distance, trigger: distance >= PULL_THRESHOLD };
}

export function initPull({ getScroller, refresh, roots }) {
  const ind = document.getElementById("pull-ind");
  const chip = document.getElementById("pull-chip");
  let tracking = null;
  let busy = false;

  function paint(distance, armed, spinning) {
    if (!ind || !chip) return;
    if (!spinning && distance <= 0) {
      ind.hidden = true;
      chip.classList.remove("is-armed", "is-busy");
      return;
    }
    ind.hidden = false;
    chip.style.transform = `translateY(${Math.min(28, distance * 0.35)}px)`;
    chip.classList.toggle("is-armed", Boolean(armed) && !spinning);
    chip.classList.toggle("is-busy", Boolean(spinning));
    const arrow = chip.querySelector(".pull-arrow");
    if (arrow && !spinning) arrow.style.transform = `rotate(${armed ? 0 : 180}deg)`;
  }

  function onStart(event) {
    if (busy || event.touches.length !== 1) return;
    const scroller = getScroller(event.target);
    if (!scroller || scroller.scrollTop > 1) return;
    const touch = event.touches[0];
    tracking = { scroller, x: touch.clientX, y: touch.clientY, locked: null, armed: false };
  }

  function onMove(event) {
    if (!tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const decision = pullDecision({
      scrollTop: tracking.scroller.scrollTop,
      dx: touch.clientX - tracking.x,
      dy: touch.clientY - tracking.y,
      locked: tracking.locked
    });
    tracking.locked = decision.locked;
    tracking.armed = decision.trigger;
    if (decision.locked === "h" || decision.locked === "scroll") {
      tracking = null;
      paint(0, false, false);
      return;
    }
    if (decision.locked === "v") {
      if (decision.pulling && event.cancelable) event.preventDefault();
      paint(decision.distance, decision.trigger, false);
    }
  }

  async function finish(commit) {
    const armed = Boolean(tracking?.armed);
    tracking = null;
    if (!commit || !armed || busy) {
      if (!busy) paint(0, false, false);
      return;
    }
    busy = true;
    paint(PULL_THRESHOLD, true, true);
    try {
      await refresh();
    } finally {
      busy = false;
      paint(0, false, false);
    }
  }

  for (const root of roots || []) {
    if (!root) continue;
    root.addEventListener("touchstart", onStart, { passive: true, capture: true });
    root.addEventListener("touchmove", onMove, { passive: false, capture: true });
    root.addEventListener("touchend", () => { finish(true); });
    root.addEventListener("touchcancel", () => { finish(false); });
  }
}
