import assert from "node:assert/strict";
import test from "node:test";
import { buildSymbolRecord, cheaperNames, historyPlacement, peerPlacement, shouldSkipFundamentals } from "../js/bewertung.js";
import { renderBewertung } from "../js/bewertung-view.js";
import { buildNews, filterNews, glancePoints } from "../js/news.js";
import { renderNews } from "../js/news-view.js";
import { aggregateWeekdays } from "../js/seasonality.js";
import { renderDirectionBlock } from "../js/seasonality.js";
import { moodReliability } from "../js/stimmung.js";
import { renderStimmung } from "../js/stimmung-view.js";
import { renderTraining } from "../js/training-view.js";

const BANNED = /kaufen|verkaufen|empfehlung|kaufsignal|anlageberatung/i;

test("News steht neueste zuerst und filtert nach Aktie", () => {
  const data = {
    posts: {
      posts: [
        { id: "alt", postedAt: "2026-11-01T10:00:00+01:00", summaryDe: "Alter Beitrag.", tickers: ["TSLA"], displayName: "Tesla", sources: [] },
        { id: "neu", postedAt: "2026-11-17T18:00:00+01:00", summaryDe: "Neuer Beitrag zu SpaceX.", tickers: ["SPCX"], displayName: "SpaceX", sources: [] },
        { id: "markt", postedAt: "2026-11-17T12:00:00+01:00", summaryDe: "Der Markt war ruhig.", tickers: [], displayName: "Börse", sources: [] }
      ]
    },
    alerts: {
      alerts: [
        { id: "A", symbol: "NVDA", changePct: 3.2, priceEur: 140, timestamp: "2026-11-17T20:00:00+01:00", name: "NVIDIA", sources: [{ title: "Yahoo", url: "https://finance.yahoo.com/quote/NVDA" }] }
      ]
    }
  };
  const items = buildNews(data);
  assert.equal(items[0].id, "alert:A");
  assert.equal(items[0].importance, "wichtig");
  assert.equal(items[1].id, "post:neu");
  assert.equal(items.at(-1).id, "post:alt");
  assert.deepEqual(items.map((item) => item.id), items.map((item) => item.id));
  assert.equal(filterNews(items, "NVDA").length, 1);
  assert.equal(filterNews(items, "SPCX")[0].id, "post:neu");
  assert.equal(filterNews(items, "Markt")[0].id, "post:markt");
  assert.equal(filterNews(items, "RKLB").length, 0);
  const html = renderNews(data, { newsFilter: "alle" }, new Date("2026-11-17T21:00:00+01:00"));
  assert.match(html, /Heute auf einen Blick/);
  assert.match(html, /Was bewegt den Kurs/);
  assert.match(html, /data-filter="NVDA"/);
  assert.match(html, /data-filter="Markt"/);
  assert.ok(html.indexOf("NVDA") < html.indexOf("Neuer Beitrag"));
  assert.equal(BANNED.test(html), false);
  const glance = glancePoints({
    prices: { tickers: [{ symbol: "TSLA", changePct: -2, why: "Die Aktie gab nach." }] },
    calendar: { events: [{ id: "e", title: "Zahlen", date: "2026-11-18", time: "22:00", timezone: "Europe/Berlin" }] },
    briefing: { bullets: ["Nvidia am Abend."] }
  }, new Date("2026-11-17T12:00:00+01:00"));
  assert.equal(glance.length, 3);
  for (const line of glance) assert.ok(line.split(" ").length <= 6, line);
  assert.match(renderNews(data, { newsFilter: "alle" }), /<th>Aktie<\/th>/);
});

test("Stimmung nennt fehlende Treffer und behält die Bereiche", () => {
  assert.equal(moodReliability({}).text, "noch zu wenig Daten");
  assert.equal(moodReliability({ history: [{ direction: "up", next: "up" }] }).enough, false);
  const history = Array.from({ length: 7 }, (_, index) => ({
    direction: index % 2 ? "down" : "up",
    next: "up"
  }));
  const record = moodReliability({ history });
  assert.equal(record.enough, true);
  assert.equal(record.matched, 4);
  const html = renderStimmung({
    prices: { tickers: [{ symbol: "TSLA", name: "Tesla", priceEur: 10, changePct: 1, history: { intraday: [], "1M": [] } }] },
    sentiment: { symbols: {} },
    seasonality: {},
    production: { nextLaunch: { name: "Starship", status: "geplant" } },
    weekly: { title: "Wochenrückblick", lede: "Eine ruhige Woche." },
    germany: { symbols: [] },
    crowd: {},
    favorites: { favorites: [] }
  }, { analyseSymbol: "TSLA", analyseRange: "15 Min", analyseView: "kerzen" });
  assert.match(html, /Barometer/);
  assert.match(html, /noch zu wenig Daten/);
  assert.match(html, /Kursbild/);
  assert.match(html, /Schwarm/);
  assert.match(html, /Deutschland/);
  assert.match(html, /Produktion/);
  assert.match(html, /Wochenrückblick/);
  assert.match(html, /Werkzeuge/);
  assert.match(html, /Kerzen/);
  assert.equal(BANNED.test(html), false);
  const training = renderTraining();
  assert.match(training, /id="training-mount"/);
  assert.match(training, /Rückspiel/);
  assert.equal(BANNED.test(training), false);
});

test("Bewertung lässt ein negatives KGV leer und setzt die Spanne", () => {
  const closes = Array.from({ length: 30 }, (_, index) => 80 + index);
  const loss = buildSymbolRecord({
    symbol: "RKLB",
    summary: {
      trailingPE: { raw: -12 },
      forwardPE: { raw: 20 },
      priceToSalesTrailing12Months: { raw: 9.5 },
      marketCap: { raw: 20_000_000_000 }
    },
    stats: { trailingEps: { raw: -0.4 }, forwardEps: { raw: 0.2 } },
    price: { currency: "USD", regularMarketPrice: { raw: 50 }, longName: "Rocket Lab" },
    closes,
    fxRate: 1.16
  });
  assert.equal(loss.trailingPe, null);
  assert.equal(loss.peState, "negativ");
  assert.equal(loss.forwardPe, 20);
  assert.equal(loss.history.n, 0);
  assert.ok(loss.marketCapEur > 17_000_000_000 && loss.marketCapEur < 18_000_000_000);
  const rich = buildSymbolRecord({
    symbol: "TSLA",
    summary: { trailingPE: { raw: 40 }, forwardPE: { raw: 30 }, priceToSalesTrailing12Months: { raw: 8 }, marketCap: { raw: 1_000_000_000_000 } },
    stats: { trailingEps: { raw: 2 }, forwardEps: { raw: 3 } },
    price: { currency: "USD", regularMarketPrice: { raw: 80 }, longName: "Tesla" },
    closes,
    fxRate: 1.25
  });
  assert.equal(rich.peState, "gemeldet");
  assert.equal(rich.history.n, 30);
  assert.equal(rich.history.min, 40);
  assert.equal(rich.history.current, 54.5);
  assert.equal(historyPlacement({ n: 10, min: 1, max: 2, current: 1 }).text, "noch zu wenig Daten");
  assert.equal(historyPlacement(rich.history).word, "teuer");
  assert.equal(peerPlacement(40, [10]).text, "noch zu wenig Daten");
  assert.equal(peerPlacement(10, [40, 50]).word, "günstig");
  assert.equal(peerPlacement(80, [40, 50]).word, "teuer");
  assert.equal(shouldSkipFundamentals(null, new Date(), false, () => "2026-11-17"), false);
  const low = cheaperNames([
    { symbol: "AAA", trailingPe: 12, priceToSales: 2, history: { n: 0 } },
    { symbol: "BBB", trailingPe: 80, priceToSales: 10, history: { n: 0 } },
    { symbol: "CCC", trailingPe: 90, priceToSales: 12, history: { n: 0 } },
    { symbol: "DDD", trailingPe: null, peState: "negativ", priceToSales: 1, history: { n: 0 } }
  ]);
  assert.deepEqual(low.map((item) => item.symbol), ["AAA"]);
  assert.match(renderBewertung({ fundamentals: { symbols: [loss, rich, { symbol: "INTC", name: "Intel", trailingPe: 12, peState: "gemeldet", priceToSales: 3, marketCapEur: 1e11, history: { n: 0 } }] } }, { valueSymbol: "RKLB" }), /Vergleichsweise niedrig bewertet/);
  const html = renderBewertung({
    fundamentals: {
      historyNote: "Spanne aus dem Kurs.",
      symbols: [loss, rich]
    }
  }, { valueSymbol: "RKLB" });
  assert.match(html, /KGV nicht sinnvoll/);
  assert.match(html, /Marktkapitalisierung/);
  assert.match(html, /KUV/);
  assert.match(html, /noch zu wenig Daten/);
  assert.equal(html.includes("Keine Anlageberatung"), false);
  assert.equal(BANNED.test(html), false);
});

test("Wochentag nennt mittleren Anstieg und Rückgang in gleich hohen Bahnen", () => {
  const days = aggregateWeekdays([
    { t: "2026-01-02", close: 100 },
    { t: "2026-01-05", close: 110 },
    { t: "2026-01-09", close: 110 },
    { t: "2026-01-12", close: 99 }
  ]);
  assert.equal(days[0].avgUp, 10);
  assert.equal(days[0].avgDown, -10);
  const fat = [0, 1, 2, 3, 4].map((index) => ({
    n: 10,
    up: 6,
    down: 4,
    avg: 0.2,
    avgUp: 1.2 + index * 0.1,
    avgDown: -0.8
  }));
  const html = renderDirectionBlock({ days: fat, hours: fat, source: "datei" });
  assert.equal((html.match(/heat-cell/g) || []).length, 20);
  assert.match(html, /background:rgba\(125, 222, 192/);
  assert.match(html, /background:rgba\(255, 139, 152/);
  assert.match(html, /Mittlere Bewegung hoch und runter/);
  assert.match(html, />hoch</);
  assert.equal(BANNED.test(html), false);
  const thin = renderDirectionBlock({ days: [{ n: 2, up: 1, down: 1, avgUp: 1, avgDown: -1 }], hours: [] });
  assert.match(thin, /noch zu wenig Daten/);
  assert.equal((thin.match(/heat-cell/g) || []).length, 0);
});
