import fs from "node:fs";
import path from "node:path";

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
  "scenarios.json", "companies.json"
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

for (const favorite of loaded["favorites.json"]?.favorites || []) {
  const label = `favorites.${favorite.id}`;
  if (typeof favorite.score !== "number") fail(`${label}.score`);
  if (!favorite.reason) fail(`${label}.reason`);
  sourcesOk(favorite.sources, label);
}

const crowd = loaded["crowd.json"];
if (!crowd?.comparison?.summary) fail("crowd.comparison");
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
