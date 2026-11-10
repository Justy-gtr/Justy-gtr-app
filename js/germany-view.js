import { esc, formatEUR, formatPct } from "./logic.js";
import { GERMANY_INTRO, morningLabel, sortByMorning } from "./germany.js";

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function dotSpark(values) {
  const nums = (values || []).map(Number).filter((value) => Number.isFinite(value));
  if (nums.length < 2) return "";
  const sample = nums.length <= 12 ? nums : Array.from({ length: 12 }, (_, index) => nums[Math.round((index * (nums.length - 1)) / 11)]);
  const width = 76;
  const height = 28;
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const span = max - min || 1;
  const coords = sample.map((value, index) => ({
    x: (index / (sample.length - 1)) * (width - 4) + 2,
    y: height - ((value - min) / span) * (height - 6) - 3
  }));
  const stroke = sample.at(-1) >= sample[0] ? "#3ddc84" : "#ff5d6c";
  const d = coords.map((coord, index) => `${index ? "L" : "M"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(" ");
  const dots = coords.map((coord) => `<circle cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="1.6" fill="${stroke}"/>`).join("");
  return `<svg class="spark de-spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

function meter(avg, top) {
  if (avg == null || !(top > 0)) return "";
  const width = Math.max(8, Math.min(100, Math.round((avg / top) * 100)));
  return `<span class="de-meter" style="--w:${width}%"></span>`;
}

function exampleBlock(title, example) {
  if (!example?.isin) return "";
  return `<div class="de-isin">
    <p class="kicker">${esc(title)}</p>
    <button type="button" data-action="copy-isin" data-isin="${esc(example.isin)}">${esc(example.isin)} <span>Kopieren</span></button>
    <p class="muted">${esc(example.issuer || "")}</p>
  </div>`;
}

export function renderDeutschland(data, ui) {
  const rows = sortByMorning(data?.germany?.symbols || []);
  const top = Math.max(...rows.map((row) => Number(row.morning?.avgPct) || 0), 0);
  const open = ui?.deSymbol || "";
  const list = rows.map((row) => {
    const expanded = open === row.symbol;
    const change = Number(row.changePct);
    return `<article class="card de-row${expanded ? " is-open" : ""}">
      <button type="button" class="de-hit" data-action="de-toggle" data-symbol="${esc(row.symbol)}" aria-expanded="${expanded ? "true" : "false"}">
        <span class="de-main">
          <strong>${esc(row.name || row.symbol)}</strong>
          <span class="muted">${esc(row.symbol)}</span>
        </span>
        <span class="de-px">
          <strong>${esc(formatEUR(row.priceEur))}</strong>
          <span class="${tone(change)}">${esc(formatPct(row.changePct))}</span>
        </span>
        ${dotSpark(row.sparkline)}
        <span class="de-morning">${meter(row.morning?.avgPct, top)}<span>${esc(morningLabel(row.morning))}</span></span>
        <span class="de-badge">TR Knock-out Long/Short</span>
      </button>
      ${expanded ? `<div class="de-more">
        <div class="de-sides">${exampleBlock("Long", row.longExample)}${exampleBlock("Short", row.shortExample)}</div>
        <p class="muted">Eine einzelne ISIN kann nach dem Knock-out verschwinden. Verbindlich ist, was die Trade-Republic-App zeigt.</p>
        <p class="muted">${row.morning?.n ? esc(`${row.morning.n} Tage, größter Morgen ${row.morning.maxDay || ""}.`) : ""}</p>
        <div class="chart-wrap de-chart-wrap">
          <p class="scrub"></p>
          <canvas class="chart chart-price" data-chart="de" data-symbol="${esc(row.symbol)}" aria-label="Kurslinie in Euro. Ziehen zeigt Zeit und Kurs."></canvas>
        </div>
      </div>` : ""}
    </article>`;
  }).join("");
  return `
    <header class="page-head">
      <p class="eyebrow">Deutschland</p>
      <h2>Xetra am Morgen</h2>
      <p class="lede">${esc(GERMANY_INTRO)}</p>
    </header>
    <div class="stack">${list || `<p class="empty">Noch keine deutschen Kurse.</p>`}</div>
  `;
}
