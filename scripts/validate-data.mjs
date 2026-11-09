import fs from "node:fs";
import path from "node:path";
import { karlVoiceIssues } from "../js/logic.js";
import { DAYPATH_SCHEMA, DAYPATH_SLOTS } from "../js/daypath.js";
import {
  EARLY_NOTE_DE,
  EARLY_NOTE_MIX,
  EARLY_NOTE_US,
  HOUR_SLOTS,
  WEEKDAY_LABELS
} from "../js/seasonality.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataDir = path.join(root, "data");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    fail(`fehlt: data/${name}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`kein JSON: data/${name} (${error.message})`);
    return null;
  }
}

function isUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function barOk(point, label) {
  if (!point || typeof point.eur !== "number" || !point.t) {
    fail(`${label} punkt`);
    return;
  }
  for (const key of ["open", "high", "low"]) {
    if (point[key] != null && typeof point[key] !== "number") fail(`${label}.${key}`);
  }
  const close = point.eur;
  const open = typeof point.open === "number" ? point.open : close;
  if (typeof point.high === "number" && typeof point.low === "number" && point.high < point.low) {
    fail(`${label} high < low`);
  }
  if (typeof point.high === "number" && point.high + 0.02 < Math.max(open, close)) fail(`${label} high < body`);
  if (typeof point.low === "number" && point.low - 0.02 > Math.min(open, close)) fail(`${label} low > body`);
}

function sourcesOk(sources, label) {
  if (!Array.isArray(sources) || sources.length === 0) {
    fail(`${label}: sources fehlt`);
    return;
  }
  sources.forEach((source, index) => {
    if (!source || typeof source.title !== "string" || !source.title.trim()) {
      fail(`${label}: sources[${index}].title`);
    }
    if (!isUrl(source?.url)) fail(`${label}: sources[${index}].url`);
  });
}

const files = [
  "meta.json", "prices.json", "calendar.json", "posts.json", "favorites.json", "crowd.json",
  "promises.json", "production.json", "insiders.json", "briefing.json", "weekly.json",
  "daily_question.json", "glossary.json", "track_record.json", "alerts.json",
  "scenarios.json", "companies.json", "seasonality.json", "moonshots.json", "turbo-universe.json"
];
const loaded = Object.fromEntries(files.map((name) => [name, read(name)]));

const meta = loaded["meta.json"];
if (meta) {
  for (const key of ["lastUpdated", "dataMode", "timezone", "disclaimer"]) {
    if (!meta[key]) fail(`meta.${key}`);
  }
}

const prices = loaded["prices.json"];
if (prices) {
  const symbols = new Set((prices.tickers || []).map((ticker) => ticker.symbol));
  for (const symbol of ["SPCX", "TSLA", "RKLB"]) {
    if (!symbols.has(symbol)) fail(`prices fehlt ${symbol}`);
  }
  for (const ticker of prices.tickers || []) {
    const label = `prices.${ticker.symbol}`;
    for (const key of ["name", "priceEur", "changePct", "history", "why"]) {
      if (ticker[key] == null) fail(`${label}.${key}`);
    }
    for (const range of ["intraday", "1M", "6M", "1Y"]) {
      if (!Array.isArray(ticker.history?.[range])) fail(`${label}.history.${range}`);
    }
    const five = ticker.history?.["5m"];
    if (five != null) {
      if (!Array.isArray(five)) fail(`${label}.history.5m`);
      if (five.length > 1000) fail(`${label}.history.5m zu lang`);
      for (const point of five) barOk(point, `${label}.history.5m`);
      if (five.length >= 2) {
        const span = Date.parse(five.at(-1).t) - Date.parse(five[0].t);
        if (Number.isFinite(span) && span > 10 * 86400000) fail(`${label}.history.5m länger als zehn Tage`);
      }
    }
    const hour = ticker.history?.["1H"];
    if (hour != null) {
      if (!Array.isArray(hour)) fail(`${label}.history.1H`);
      if (hour.length > 400) fail(`${label}.history.1H zu lang`);
      for (const point of hour) barOk(point, `${label}.history.1H`);
      if (hour.length >= 2) {
        const span = Date.parse(hour.at(-1).t) - Date.parse(hour[0].t);
        if (Number.isFinite(span) && span > 24 * 86400000) fail(`${label}.history.1H länger als 24 Tage`);
      }
    }
    const four = ticker.history?.["4H"];
    if (four != null) {
      if (!Array.isArray(four)) fail(`${label}.history.4H`);
      if (four.length > 2500) fail(`${label}.history.4H zu lang`);
      for (const point of four) barOk(point, `${label}.history.4H`);
      if (four.length >= 2) {
        const span = Date.parse(four.at(-1).t) - Date.parse(four[0].t);
        if (Number.isFinite(span) && span <= 36 * 3600 * 1000) fail(`${label}.history.4H nur eine Sitzung`);
      }
    }
    for (const range of ["1M", "6M", "1Y", "5Y"]) {
      for (const point of ticker.history?.[range] || []) {
        if (point && (point.open != null || point.high != null || point.low != null)) {
          barOk(point, `${label}.history.${range}`);
        }
      }
    }
    for (const key of ["dayHighEur", "dayLowEur", "overnightEur", "overnightHighEur", "overnightLowEur"]) {
      if (ticker[key] != null && typeof ticker[key] !== "number") fail(`${label}.${key}`);
    }
    if (typeof ticker.dayHighEur === "number" && typeof ticker.dayLowEur === "number" && ticker.dayHighEur < ticker.dayLowEur) {
      fail(`${label} day high < low`);
    }
    const phases = ["nachhandel", "vorboerse", "us"];
    if (ticker.overnightPhase != null && !phases.includes(ticker.overnightPhase)) fail(`${label}.overnightPhase`);
    if (ticker.overnightEur != null && !phases.includes(ticker.overnightPhase)) fail(`${label}.overnightPhase`);
    if (ticker.source != null && !["alpaca-iex", "yahoo"].includes(ticker.source)) fail(`${label}.source`);
    if (typeof ticker.overnightHighEur === "number" && typeof ticker.overnightLowEur === "number" && ticker.overnightHighEur < ticker.overnightLowEur) {
      fail(`${label} overnight high < low`);
    }
    const intraday = ticker.history?.intraday || [];
    if (intraday.length > 1600) fail(`${label}.history.intraday zu lang`);
    if (intraday.length >= 2) {
      const start = Date.parse(intraday[0].t);
      const end = Date.parse(intraday.at(-1).t);
      if (Number.isFinite(start) && Number.isFinite(end) && end - start > 36 * 3600 * 1000) {
        fail(`${label}.history.intraday länger als ein Handelstag`);
      }
    }
    for (const point of intraday) {
      if (point?.session != null && !["pre", "regular", "post"].includes(point.session)) {
        fail(`${label}.history.intraday.session`);
      }
    }
    sourcesOk(ticker.sources, label);
  }
}

const calendar = loaded["calendar.json"];
for (const event of calendar?.events || []) {
  const label = `calendar.${event.id}`;
  for (const key of ["title", "date", "kind", "probabilityPct", "reasoning"]) {
    if (event[key] == null) fail(`${label}.${key}`);
  }
  if (!["company", "external"].includes(event.kind)) fail(`${label}.kind`);
  sourcesOk(event.sources, label);
}

const posts = loaded["posts.json"];
if (posts) {
  if (posts.sentiment?.SPCX?.score == null) fail("posts.sentiment.SPCX");
  if (posts.sentiment?.TSLA?.score == null) fail("posts.sentiment.TSLA");
  for (const post of posts.posts || []) {
    const label = `posts.${post.id}`;
    for (const key of ["account", "summaryDe", "url", "postedAt"]) {
      if (!post[key]) fail(`${label}.${key}`);
    }
    sourcesOk(post.sources, label);
  }
}

const VS_SWARM = new Set(["zuversichtlicher", "skeptischer"]);

function voiceOk(item, label) {
  if (!VS_SWARM.has(item?.vsSwarm)) fail(`${label}.vsSwarm`);
  if (!item?.karlTake) fail(`${label}.karlTake`);
  if (!item?.karlCounter) fail(`${label}.karlCounter`);
  for (const issue of karlVoiceIssues(item?.karlTake)) fail(`${label}.karlTake ${issue}`);
  for (const issue of karlVoiceIssues(item?.karlCounter)) fail(`${label}.karlCounter ${issue}`);
}

for (const favorite of loaded["favorites.json"]?.favorites || []) {
  const label = `favorites.${favorite.id}`;
  if (typeof favorite.score !== "number") fail(`${label}.score`);
  if (!favorite.reason) fail(`${label}.reason`);
  voiceOk(favorite, label);
  sourcesOk(favorite.sources, label);
}

const crowd = loaded["crowd.json"];
if (!crowd?.comparison?.summary) fail("crowd.comparison");
for (const issue of karlVoiceIssues(crowd?.comparison?.summary)) fail(`crowd.comparison.summary ${issue}`);
for (const pick of crowd?.comparison?.picks || []) {
  voiceOk(pick, `crowd.pick.${pick.symbol}`);
}
for (const investor of crowd?.investors || []) {
  sourcesOk(investor.sources, `crowd.${investor.id}`);
  if (!Array.isArray(investor.tickers)) fail(`crowd.${investor.id}.tickers`);
}

for (const promise of loaded["promises.json"]?.promises || []) {
  const label = `promises.${promise.id}`;
  for (const key of ["promise", "promisedOn", "targetDate", "status"]) {
    if (!promise[key]) fail(`${label}.${key}`);
  }
  sourcesOk(promise.sources, label);
}

const production = loaded["production.json"];
if (!production?.nextLaunch?.target) fail("production.nextLaunch");
sourcesOk(production?.nextLaunch?.sources, "production.nextLaunch");
for (const series of production?.series || []) {
  if (!Array.isArray(series.points) || !series.points.length) fail(`production.${series.id}`);
  sourcesOk(series.sources, `production.${series.id}`);
}

for (const trade of loaded["insiders.json"]?.trades || []) {
  sourcesOk(trade.sources, `insiders.${trade.id}`);
  if (!trade.side || !trade.symbol) fail(`insiders.${trade.id}`);
}

const briefing = loaded["briefing.json"];
if (briefing) {
  if (!briefing.summary || !briefing.title) fail("briefing text");
  sourcesOk(briefing.sources, "briefing");
}
const weekly = loaded["weekly.json"];
if (weekly) {
  if (!weekly.summary) fail("weekly.summary");
  sourcesOk(weekly.sources, "weekly");
}

const question = loaded["daily_question.json"];
if (!question?.current?.question || !question.current.karlAnswer) fail("daily_question.current");
sourcesOk(question?.current?.sources, "daily_question.current");

for (const term of loaded["glossary.json"]?.terms || []) {
  if (!term.term || !term.explanation) fail(`glossary.${term.id}`);
  sourcesOk(term.sources, `glossary.${term.id}`);
}

for (const pick of loaded["track_record.json"]?.picks || []) {
  sourcesOk(pick.sources, `track.${pick.id}`);
  if (!pick.result) fail(`track.${pick.id}.result`);
}

const alerts = loaded["alerts.json"];
if (!alerts || typeof alerts.thresholdPct !== "number") fail("alerts.thresholdPct");
for (const alert of alerts?.alerts || []) {
  if (typeof alert.notified !== "boolean") fail(`alerts.${alert.id}.notified`);
  if (typeof alert.changePct !== "number") fail(`alerts.${alert.id}.changePct`);
  sourcesOk(alert.sources, `alerts.${alert.id}`);
}

for (const scenario of loaded["scenarios.json"]?.scenarios || []) {
  if (!scenario.title || !Array.isArray(scenario.reactions)) fail(`scenarios.${scenario.id}`);
  sourcesOk(scenario.sources, `scenarios.${scenario.id}`);
}
if (!(loaded["scenarios.json"]?.recoveries || []).length) fail("scenarios.recoveries");

const ids = new Set((loaded["companies.json"]?.companies || []).map((company) => company.id));
for (const id of ["spacex", "tesla", "rocketlab", "neuralink", "xai", "terafab", "boring"]) {
  if (!ids.has(id)) fail(`companies.${id}`);
}
for (const company of loaded["companies.json"]?.companies || []) {
  if (!Array.isArray(company.firstPrinciples) || !company.firstPrinciples.length) {
    fail(`companies.${company.id}.firstPrinciples`);
  }
  sourcesOk(company.sources, `companies.${company.id}`);
}

function countRow(row, label, withMedian) {
  if (!row || !Number.isInteger(row.n) || row.n < 0) {
    fail(`${label}.n`);
    return;
  }
  if (!Number.isInteger(row.up) || row.up < 0 || row.up > row.n) fail(`${label}.up`);
  if (row.n === 0) {
    if (row.avg != null) fail(`${label}.avg`);
  } else if (typeof row.avg !== "number" || Number.isNaN(row.avg)) fail(`${label}.avg`);
  if (!withMedian) return;
  if (row.n === 0) {
    if (row.med != null) fail(`${label}.med`);
  } else if (typeof row.med !== "number" || Number.isNaN(row.med)) fail(`${label}.med`);
}

function cellRow(cell, label) {
  if (!cell || !Number.isInteger(cell.n) || cell.n < 0) {
    fail(`${label}.n`);
    return;
  }
  if (!Number.isInteger(cell.up) || cell.up < 0 || cell.up > cell.n) fail(`${label}.up`);
  if (cell.n === 0) {
    if (cell.avg != null) fail(`${label}.avg`);
  } else if (typeof cell.avg !== "number" || Number.isNaN(cell.avg)) fail(`${label}.avg`);
}

const seasonality = loaded["seasonality.json"];
if (seasonality) {
  if (seasonality.timezone !== "Europe/Berlin") fail("seasonality.timezone");
  if (seasonality.usFeed != null && !["alpaca-iex", "yahoo"].includes(seasonality.usFeed)) fail("seasonality.usFeed");
  if (!seasonality.asOf || Number.isNaN(Date.parse(seasonality.asOf))) fail("seasonality.asOf");
  if (!Array.isArray(seasonality.hourSlots) || seasonality.hourSlots.join("|") !== HOUR_SLOTS.join("|")) {
    fail("seasonality.hourSlots");
  }
  if (!Array.isArray(seasonality.weekdays) || seasonality.weekdays.join("|") !== WEEKDAY_LABELS.join("|")) {
    fail("seasonality.weekdays");
  }
  sourcesOk(seasonality.sources, "seasonality");
  for (const symbol of ["SPCX", "TSLA", "RKLB"]) {
    const pack = seasonality.symbols?.[symbol];
    if (!pack?.name) fail(`seasonality.${symbol}`);
    for (const key of ["all", "year"]) {
      const windowStats = pack?.ranges?.[key];
      const label = `seasonality.${symbol}.${key}`;
      if (!windowStats) {
        fail(label);
        continue;
      }
      if (windowStats.from && !/^\d{4}-\d{2}-\d{2}$/.test(windowStats.from)) fail(`${label}.from`);
      if (windowStats.to && !/^\d{4}-\d{2}-\d{2}$/.test(windowStats.to)) fail(`${label}.to`);
      if (!Array.isArray(windowStats.days) || windowStats.days.length !== 5) fail(`${label}.days`);
      (windowStats.days || []).forEach((row, index) => countRow(row, `${label}.days.${index}`, true));
      if (!Array.isArray(windowStats.hours) || windowStats.hours.length !== HOUR_SLOTS.length) fail(`${label}.hours`);
      (windowStats.hours || []).forEach((row, index) => countRow(row, `${label}.hours.${index}`, false));
      if (!Array.isArray(windowStats.grid) || windowStats.grid.length !== 5) fail(`${label}.grid`);
      (windowStats.grid || []).forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length !== HOUR_SLOTS.length) fail(`${label}.grid.${rowIndex}`);
        (row || []).forEach((cell, index) => cellRow(cell, `${label}.grid.${rowIndex}.${index}`));
      });
    }
    const notes = new Set([EARLY_NOTE_DE, EARLY_NOTE_US, EARLY_NOTE_MIX]);
    if (pack.earlyNote != null && !notes.has(pack.earlyNote)) fail(`seasonality.${symbol}.earlyNote`);
    const paths = pack.dayPaths;
    const label = `seasonality.${symbol}.dayPaths`;
    if (!paths || paths.schema !== DAYPATH_SCHEMA) fail(`${label}.schema`);
    if (!Array.isArray(paths?.slots) || paths.slots.join("|") !== DAYPATH_SLOTS.join("|")) fail(`${label}.slots`);
    if (!Array.isArray(paths?.days) || paths.days.length !== 5) fail(`${label}.days`);
    if (!Array.isArray(paths?.coverage) || paths.coverage.length !== DAYPATH_SLOTS.length) fail(`${label}.coverage`);
    (paths?.coverage || []).forEach((row, index) => {
      if (row?.slot !== DAYPATH_SLOTS[index]) fail(`${label}.coverage.${index}.slot`);
      if (!Number.isInteger(row?.n) || row.n < 0) fail(`${label}.coverage.${index}.n`);
      if (typeof row?.where !== "string" || !row.where.trim()) fail(`${label}.coverage.${index}.where`);
    });
    (paths?.days || []).forEach((day, index) => {
      if (!day || !Number.isInteger(day.n) || day.n < 0) fail(`${label}.days.${index}.n`);
      if (!Array.isArray(day.points) || day.points.length !== DAYPATH_SLOTS.length) {
        fail(`${label}.days.${index}.points`);
        return;
      }
      day.points.forEach((point, pointIndex) => {
        const pointLabel = `${label}.days.${index}.points.${pointIndex}`;
        if (!point || !Number.isInteger(point.n) || point.n < 0) fail(`${pointLabel}.n`);
        if (point.n === 0) {
          if (point.avg != null) fail(`${pointLabel}.avg`);
        } else if (typeof point.avg !== "number" || typeof point.min !== "number" || typeof point.max !== "number") {
          fail(`${pointLabel}.avg`);
        }
      });
    });
  }
}

function walkStrings(value, visit) {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, visit));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => walkStrings(item, visit));
}

function sideRow(block, label, withSides) {
  if (!block || !Number.isInteger(block.n) || block.n < 0) {
    fail(`${label}.n`);
    return;
  }
  if (block.showPct !== (block.n >= 7)) fail(`${label}.showPct`);
  if (!withSides) {
    if (!Number.isInteger(block.wide) || block.wide < 0 || block.wide > block.n) fail(`${label}.wide`);
    if (block.n >= 7 && (!Number.isInteger(block.sharePct) || block.sharePct < 0 || block.sharePct > 100)) {
      fail(`${label}.sharePct`);
    }
    return;
  }
  if (!Number.isInteger(block.up) || block.up < 0 || block.up > block.n) fail(`${label}.up`);
  if (!Number.isInteger(block.down) || block.down < 0 || block.down > block.n) fail(`${label}.down`);
  if (block.up + block.down > block.n) fail(`${label} up+down`);
}

const moon = loaded["moonshots.json"];
const ADVICE = /\b(kaufen|verkaufen)\b|empfehlung|wird steigen/i;
if (!moon || moon.example === true) fail("moonshots.example");
if (moon?.disclaimer !== "Keine Anlageberatung. Hebel kann Totalverlust bedeuten. Vergangenheit, keine Vorhersage.") {
  fail("moonshots.disclaimer");
}
if (!Array.isArray(moon?.candidates) || moon.candidates.length !== 3) fail("moonshots.candidates");
if (typeof moon?.fx?.rate !== "number") fail("moonshots.fx");
const seenSymbols = new Set();
for (const item of moon?.candidates || []) {
  const label = `moonshots.${item?.symbol || "?"}`;
  if (["TSLA", "RKLB", "SPCX"].includes(item?.symbol)) fail(`${label} schon in der App`);
  if (seenSymbols.has(item?.symbol)) fail(`${label} doppelt`);
  seenSymbols.add(item?.symbol);
  if (!item?.name || !item?.id) fail(`${label}.name`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item?.catalyst?.date || "")) fail(`${label}.catalyst.date`);
  if (item?.catalyst?.timezone !== "Europe/Berlin") fail(`${label}.catalyst.timezone`);
  if (!Array.isArray(item?.for) || item.for.length < 2 || item.for.length > 3) fail(`${label}.for`);
  if (!Array.isArray(item?.against) || item.against.length < 2 || item.against.length > 3) fail(`${label}.against`);
  if (item?.leverage?.available !== true) fail(`${label}.leverage`);
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(item?.leverage?.isin || "")) fail(`${label}.isin`);
  if (typeof item?.priceEur !== "number" || typeof item?.changePct !== "number") fail(`${label}.priceEur`);
  if (!Array.isArray(item?.sparkline) || item.sparkline.length < 2) fail(`${label}.sparkline`);
  sourcesOk(item?.sources, label);
  if (!isUrl(item?.marketSource?.url)) fail(`${label}.marketSource`);
  sideRow(item?.history?.catalyst, `${label}.catalyst`, true);
  sideRow(item?.history?.days, `${label}.days`, false);
  if (!Array.isArray(item?.history?.moves) || item.history.moves.length !== item.history.catalyst.n) {
    fail(`${label}.moves`);
  }
  for (const move of item?.history?.moves || []) {
    if (typeof move?.pct !== "number" || !/^\d{4}-\d{2}-\d{2}$/.test(move?.date || "")) fail(`${label}.move`);
  }
  walkStrings(item, (text) => {
    if (ADVICE.test(text)) fail(`${label} verbotenes Wort`);
  });
}

const near = moon?.nearTerm;
if (!near || typeof near.note !== "string" || !near.note.trim()) fail("moonshots.nearTerm");
if (near && near.window !== 3 && near.window !== 5) fail("moonshots.nearTerm.window");
if (near && near.expanded !== (near.window === 5)) fail("moonshots.nearTerm.expanded");
if (near?.expanded && !/5 Handelstage/.test(near.note)) fail("moonshots.nearTerm.note");
if (near && !near.expanded && !/3 Handelstage/.test(near.note)) fail("moonshots.nearTerm.note");
if (!/^\d{4}-\d{2}-\d{2}$/.test(near?.pickedOn || "")) fail("moonshots.nearTerm.pickedOn");
if (!Array.isArray(near?.candidates) || near.candidates.length > 3) fail("moonshots.nearTerm.candidates");
const nearSymbols = new Set();
for (const item of near?.candidates || []) {
  const label = `near.${item?.symbol || "?"}`;
  if (["TSLA", "RKLB", "SPCX"].includes(item?.symbol)) fail(`${label} schon in der App`);
  if (seenSymbols.has(item?.symbol) || nearSymbols.has(item?.symbol)) fail(`${label} doppelt`);
  nearSymbols.add(item?.symbol);
  if (!item?.name || !item?.id) fail(`${label}.name`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item?.catalyst?.date || "")) fail(`${label}.date`);
  if (item?.catalyst?.timezone !== "Europe/Berlin") fail(`${label}.timezone`);
  if (!["bmo", "amc", "na"].includes(item?.catalyst?.session)) fail(`${label}.session`);
  if (!Array.isArray(item?.for) || item.for.length < 2 || item.for.length > 3) fail(`${label}.for`);
  if (!Array.isArray(item?.against) || item.against.length < 2 || item.against.length > 3) fail(`${label}.against`);
  if (item?.leverage?.isin && !/^[A-Z]{2}[A-Z0-9]{10}$/.test(item.leverage.isin)) fail(`${label}.isin`);
  if (typeof item?.priceEur !== "number" || typeof item?.changePct !== "number") fail(`${label}.price`);
  sourcesOk(item?.sources, label);
  sideRow(item?.history?.catalyst, `${label}.catalyst`, true);
  if (!Array.isArray(item?.history?.moves) || item.history.moves.length !== item.history.catalyst.n) fail(`${label}.moves`);
  walkStrings(item, (text) => {
    if (ADVICE.test(text)) fail(`${label} verbotenes Wort`);
    if (/anlageberatung/i.test(text)) fail(`${label} anlageberatung`);
  });
}
if (near) sourcesOk(near.sources, "moonshots.nearTerm");

const universe = loaded["turbo-universe.json"];
if (!universe?.note || !/Knock-out|Turbos/.test(universe.note)) fail("universe.note");
if (!Array.isArray(universe?.symbols) || universe.symbols.length < 100) fail("universe.symbols");
sourcesOk(universe?.sources, "universe");
const universeSymbols = new Set();
for (const item of universe?.symbols || []) {
  if (!/^[A-Z][A-Z0-9.]{0,7}$/.test(item?.symbol || "")) fail(`universe.${item?.symbol || "?"}`);
  if (!item?.name) fail(`universe.${item?.symbol}.name`);
  if (["TSLA", "RKLB", "SPCX"].includes(item?.symbol)) fail(`universe.${item.symbol} fokus`);
  if (universeSymbols.has(item?.symbol)) fail(`universe.${item.symbol} doppelt`);
  universeSymbols.add(item?.symbol);
  if (item.underlyingIsin && !/^[A-Z]{2}[A-Z0-9]{10}$/.test(item.underlyingIsin)) fail(`universe.${item.symbol}.isin`);
}

const iconFiles = [
  "icons/logo.svg",
  "icons/favicon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];
for (const icon of iconFiles) {
  if (!fs.existsSync(path.join(root, icon))) fail(`fehlt: ${icon}`);
}

const banned = /(api[_-]?key|secret_key|AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20})/;
for (const name of files) {
  const text = fs.readFileSync(path.join(dataDir, name), "utf8");
  if (banned.test(text)) fail(`Schlüssel-Muster in data/${name}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Daten in Ordnung (${files.length} Dateien).`);
