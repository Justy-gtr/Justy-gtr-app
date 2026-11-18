import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ANALYSE_RANGES } from "../js/candles.js";
import { analyseChart } from "../js/analyse.js";
import { hourWeek } from "../js/news.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "data", "lines.json");

function slimLine(line) {
  return {
    kind: line.kind,
    i0: line.i0 ?? 0,
    i1: line.i1 ?? null,
    eur0: line.eur0 ?? null,
    eur1: line.eur1 ?? null,
    marker: line.marker || "",
    n: Number.isFinite(Number(line.n)) ? Number(line.n) : null,
    bounce: Number.isFinite(Number(line.bounce)) ? Number(line.bounce) : null
  };
}

function hourSnapshot(ticker, now) {
  const hour = hourWeek(ticker, now);
  return {
    hour: hour.hour,
    n: hour.n,
    up: hour.up,
    down: hour.down,
    share: hour.share,
    avgUp: hour.avgUp,
    avgDown: hour.avgDown
  };
}

export function buildLines(prices, now = new Date()) {
  const symbols = {};
  for (const ticker of prices?.tickers || []) {
    if (!ticker?.symbol) continue;
    const ranges = {};
    for (const range of ANALYSE_RANGES) {
      const result = analyseChart(ticker, range);
      ranges[range] = {
        patternId: result.patternId || "unklar",
        lines: (result.lines || []).filter((line) => line?.kind && line.kind !== "mark" && line.eur0 != null).map(slimLine)
      };
    }
    symbols[ticker.symbol] = { hour: hourSnapshot(ticker, now), ranges };
  }
  return {
    schema: 1,
    example: false,
    asOf: now.toISOString(),
    timezone: "Europe/Berlin",
    everyMin: 15,
    window: "Mo–Fr 14:00–22:00",
    note: "Nur bestätigte Linien, höchstens drei. Die aktuelle Stunde steht daneben.",
    symbols
  };
}

function bodyOf(doc) {
  if (!doc) return "";
  const copy = { ...doc };
  delete copy.asOf;
  return JSON.stringify(copy);
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  try {
    const prices = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "prices.json"), "utf8"));
    const next = buildLines(prices, new Date());
    const previous = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null;
    if (previous && bodyOf(previous) === bodyOf(next)) {
      console.log("Linien unverändert.");
    } else {
      fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
      console.log("data/lines.json geschrieben.");
    }
  } catch (error) {
    console.log(`::warning::Linien: ${error.message}`);
  }
}
