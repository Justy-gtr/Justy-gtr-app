import { esc } from "./logic.js";

const PAGES = ["heute", "kalender", "posts", "schwarm", "charts", "analyse", "mehr"];

/** Page slot from the pager's own width. offsetLeft follows the wrong box once overlays sit beside the scroller. */
export function pagerIndex(scrollLeft, width, count = PAGES.length) {
  const size = Number(width) || 1;
  const index = Math.round(Number(scrollLeft) / size);
  return Math.min(count - 1, Math.max(0, index));
}

export function pagerLeft(index, width) {
  return Math.max(0, Number(index) || 0) * (Number(width) || 0);
}

export function initNav(pager, { onPage } = {}) {
  const root = document.getElementById("detail-root");
  const stack = [];
  let closing = false;
  let current = "heute";
  let lockUntil = 0;

  function indexOf(id) {
    const index = PAGES.indexOf(id);
    return index < 0 ? 0 : index;
  }

  function go(id, { smooth = false } = {}) {
    if (!pager || !PAGES.includes(id)) return;
    current = id;
    const left = pagerLeft(indexOf(id), pager.clientWidth);
    lockUntil = Date.now() + (smooth ? 700 : 80);
    pager.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    setActive(id);
    onPage?.(id);
  }

  function align() {
    if (!pager) return;
    pager.scrollLeft = pagerLeft(indexOf(current), pager.clientWidth);
  }

  function setActive(id) {
    current = id;
    document.querySelectorAll(".tab").forEach((button) => {
      const on = button.dataset.page === id;
      button.setAttribute("aria-current", on ? "page" : "false");
    });
  }

  function paint({ immediate = false } = {}) {
    try {
    if (!stack.length) {
      root.innerHTML = "";
      document.body.classList.remove("detail-open");
      return;
    }
    document.body.classList.add("detail-open");
    root.innerHTML = stack.map((item, index) => `
      <section class="detail${index === stack.length - 1 ? " top" : ""}" data-kind="${esc(item.kind)}" role="dialog" aria-modal="true" aria-label="${esc(item.title)}" tabindex="-1">
        <header class="detail-head">
          <button type="button" class="close-btn" data-action="close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M15 5 8 12l7 7"/></svg>
            <span>Schließen</span>
          </button>
          <p class="eyebrow">Detail</p>
          <h2>${esc(item.title)}</h2>
        </header>
        <div class="detail-body">${item.html}</div>
      </section>
    `).join("");
    const top = root.querySelector(".detail.top");
    if (immediate) top?.classList.add("open");
    else requestAnimationFrame(() => top?.classList.add("open"));
    if (top) bindEdge(top);
    top?.focus?.({ preventScroll: true });
    } catch (error) {
      stack.length = 0;
      closing = false;
      root.innerHTML = "";
      document.body.classList.remove("detail-open");
      console.error(error);
    }
  }

  function bindEdge(el) {
    let tracking = false;
    let active = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    el.addEventListener("pointerdown", (event) => {
      if (event.clientX > 32) return;
      tracking = true;
      active = false;
      dx = 0;
      startX = event.clientX;
      startY = event.clientY;
      el.setPointerCapture?.(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (!tracking) return;
      const x = event.clientX - startX;
      const y = event.clientY - startY;
      if (!active) {
        if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) {
          tracking = false;
          return;
        }
        if (x > 8) active = true;
      }
      if (!active) return;
      dx = Math.max(0, x);
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (!active) {
        tracking = false;
        return;
      }
      el.style.transition = "";
      el.style.transform = "";
      if (dx > 88) close();
      tracking = false;
      active = false;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function open(kind, title, html) {
    stack.push({ kind, title, html });
    closing = false;
    paint();
  }

  function replace(kind, title, html) {
    if (!stack.length) {
      open(kind, title, html);
      return;
    }
    stack[stack.length - 1] = { kind, title, html };
    paint({ immediate: true });
  }

  function close() {
    if (closing || !stack.length) return;
    const top = root.querySelector(".detail.top");
    if (!top) {
      stack.pop();
      paint();
      return;
    }
    closing = true;
    top.style.transform = "";
    top.classList.remove("open");
    top.classList.add("closing");
    window.setTimeout(() => {
      stack.pop();
      closing = false;
      paint();
    }, 320);
  }

  function closeAll() {
    if (!stack.length) return;
    stack.length = 0;
    closing = false;
    paint();
  }

  pager?.addEventListener("scroll", () => {
    if (Date.now() < lockUntil) return;
    const id = PAGES[pagerIndex(pager.scrollLeft, pager.clientWidth)];
    if (id !== current) {
      current = id;
      setActive(id);
      onPage?.(id);
    }
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    const typing = event.target.matches("input, textarea");
    if (event.key === "Escape" && stack.length) {
      event.preventDefault();
      close();
      return;
    }
    if (typing || stack.length) return;
    if (event.key === "ArrowRight") go(PAGES[Math.min(PAGES.length - 1, indexOf(current) + 1)]);
    if (event.key === "ArrowLeft") go(PAGES[Math.max(0, indexOf(current) - 1)]);
  });

  return {
    go,
    open,
    replace,
    close,
    closeAll,
    topKind: () => stack.at(-1)?.kind || null,
    setActive,
    align
  };
}
