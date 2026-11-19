import assert from "node:assert/strict";
import test from "node:test";
import { buildSymbolRecord, cheaperNames, historyPlacement, peerPlacement, shouldSkipFundamentals } from "../js/bewertung.js";
import { renderBewertung } from "../js/bewertung-view.js";
import { buildNews, filterNews, freshNews, glancePoints, hourHeader, hourSlot, hourWeek, sentimentLight, stockAgenda, swarmList, swarmPotential } from "../js/news.js";
import { renderNews } from "../js/news-view.js";
import { aggregateWeekdays, renderSeasonalityCard } from "../js/seasonality.js";
import { moodReliability } from "../js/stimmung.js";
import { renderStimmung } from "../js/stimmung-view.js";
import { renderMehr } from "../js/views.js";
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
  assert.match(html, /Diese Stunde, Di 21–22 Uhr/);
  assert.match(html, /Die nächsten drei Stunden/);
  assert.equal(html.includes("Was bewegt den Kurs"), false);
  assert.match(html, /data-filter="NVDA"/);
  assert.match(html, /data-filter="Markt"/);
  assert.match(html, /NVDA/);
  assert.equal(html.includes("Neuer Beitrag"), false);
  assert.equal(html.includes("Alter Beitrag"), false);
  assert.equal(freshNews(items, new Date("2026-11-17T21:00:00+01:00")).some((item) => item.id === "alert:A"), true);
  assert.equal(freshNews(items, new Date("2026-11-17T21:00:00+01:00")).some((item) => item.id === "post:neu"), false);
  assert.equal(BANNED.test(html), false);
  const glance = glancePoints({
    prices: { tickers: [{ symbol: "TSLA", changePct: -2, why: "Die Aktie gab nach." }] },
    calendar: { events: [{ id: "e", title: "Zahlen", date: "2026-11-18", time: "22:00", timezone: "Europe/Berlin" }] },
    briefing: { bullets: ["Nvidia am Abend."] }
  }, new Date("2026-11-17T12:00:00+01:00"));
  assert.equal(glance.length, 3);
  for (const line of glance) assert.ok(line.split(" ").length <= 6, line);
  const agenda = stockAgenda({
    calendar: {
      events: [
        { id: "old", title: "Alt.", date: "2026-11-01", time: "10:00", timezone: "Europe/Berlin", tickers: ["TSLA"] },
        { id: "soon", title: "Tesla legt Zahlen vor.", date: "2026-11-18", time: "22:20", timezone: "Europe/Berlin", tickers: ["TSLA"] },
        { id: "later", title: "Ein später Termin.", date: "2026-11-20", time: "09:00", timezone: "Europe/Berlin", tickers: ["TSLA"] },
        { id: "third", title: "Noch ein Termin.", date: "2026-11-21", time: "09:00", timezone: "Europe/Berlin", tickers: ["TSLA"] },
        { id: "fourth", title: "Zu viel.", date: "2026-11-22", time: "09:00", timezone: "Europe/Berlin", tickers: ["TSLA"] }
      ]
    }
  }, "TSLA", new Date("2026-11-17T12:00:00+01:00"));
  assert.deepEqual(agenda.map((event) => event.id), ["soon", "later", "third"]);
  const view = renderNews({
    calendar: { events: agenda },
    prices: { tickers: [] },
    posts: { posts: [] }
  }, { newsFilter: "TSLA" }, new Date("2026-11-17T12:00:00+01:00"));
  assert.match(view, /Mi 18\.11\. 22:20/);
  assert.match(view, /Tesla legt Zahlen vor/);
  assert.match(view, /data-action="open-event"/);
  assert.equal(view.includes("…"), false);
  const now = new Date("2026-11-17T15:00:00+01:00");
  const bars = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16"].map((day, index) => ({
    t: `${day}T14:00:00Z`,
    open: 100,
    eur: index < 3 ? 101 : 99
  }));
  const week = hourWeek({ history: { "1H": bars } }, now);
  assert.equal(week.hour, 15);
  assert.equal(week.n, 5);
  assert.equal(week.up, 3);
  assert.equal(week.share, 60);
  assert.equal(sentimentLight({ sentiment: { symbols: { TSLA: { mood: "gut", updatedAt: "2026-11-17T15:00:00+01:00" } } } }, "TSLA").word, "positiv");
  assert.equal(sentimentLight({ sentiment: { symbols: { RKLB: { mood: "gemischt", updatedAt: "2026-11-17T15:00:00+01:00" } } } }, "RKLB").word, "gemischt");
  assert.equal(sentimentLight({ sentiment: { symbols: { SPCX: { mood: "schlecht", updatedAt: "2026-11-17T15:00:00+01:00" } } } }, "SPCX").word, "negativ");
  const lit = renderNews({
    prices: { tickers: [{ symbol: "TSLA", history: { "1H": bars } }] },
    sentiment: { symbols: { TSLA: { mood: "gut", updatedAt: "2026-11-17T15:00:00+01:00" } } },
    posts: { posts: [] },
    calendar: { events: [] }
  }, { newsFilter: "TSLA" }, now);
  assert.match(lit, /Stimmung positiv/);
  assert.match(lit, /#22c55e/);
  const night = new Date("2026-11-18T01:10:00+01:00");
  const slot = hourSlot(night);
  assert.equal(slot.live, false);
  assert.equal(slot.weekday, 3);
  assert.equal(slot.hour, 8);
  assert.equal(hourHeader(slot), "Nächste Handelsstunde: Mi 08–09 Uhr");
  assert.equal(hourSlot(new Date("2026-11-18T15:30:00+01:00")).live, true);
  assert.equal(hourSlot(new Date("2026-11-20T23:00:00+01:00")).weekday, 1);
  const nightView = renderNews({
    hours: { symbols: { SPCX: { "3": { "8": { up: 7, down: 5, n: 12 }, "21": { up: 1, down: 11, n: 12 } } } } },
    prices: { tickers: [] },
    posts: { posts: [] },
    calendar: { events: [] }
  }, { newsFilter: "alle" }, night);
  assert.match(nightView, /Nächste Handelsstunde: Mi 08–09 Uhr/);
  assert.match(nightView, /Mittwochs 08–09 Uhr: 58 % hoch · 42 % runter \(n=12\)/);
  assert.equal(nightView.includes("21–22"), false);
});

test("Schwarm auf News schaltet zwischen US und GER", () => {
  const data = {
    favorites: {
      favorites: [
        { symbol: "SPCX", name: "SpaceX", swarmStance: "kauf" },
        { symbol: "SAP", name: "SAP", swarmStance: "halten" },
        { symbol: "TSM", name: "TSMC", swarmStance: "kauf" }
      ]
    },
    germany: {
      symbols: [
        { symbol: "S92.DE", name: "SMA Solar" },
        { symbol: "HFG.DE", name: "HelloFresh" }
      ]
    },
    sentiment: { symbols: { TSLA: { mood: "gut", updatedAt: "2026-11-17T15:00:00+01:00" } } },
    posts: { posts: [] },
    calendar: { events: [] },
    prices: { tickers: [] }
  };
  const us = swarmList(data, "us");
  assert.equal(us.find((row) => row.symbol === "SPCX")?.note, "optimistisch");
  assert.ok(us.some((row) => row.symbol === "TSLA" && row.lamp?.word === "positiv" && row.note === "Stimmung"));
  assert.equal(us.find((row) => row.symbol === "SPCX")?.lamp.color, "#22c55e");
  const ranked = swarmPotential({
    ...data,
    prices: { tickers: [{ symbol: "TSLA", changePct: -3.2 }, { symbol: "SPCX", changePct: 0.4 }] }
  }, "us", new Date("2026-11-17T21:00:00+01:00"));
  assert.equal(ranked[0].symbol, "TSLA");
  assert.equal(ranked[0].lean, "Short");
  assert.equal(ranked.find((row) => row.symbol === "SPCX").lean, "Long");
  assert.ok(us.some((row) => row.symbol === "TSM"));
  assert.equal(us.some((row) => row.symbol === "SAP" || String(row.symbol).endsWith(".DE")), false);
  const ger = swarmList(data, "ger");
  assert.deepEqual(ger.map((row) => row.symbol), ["S92.DE", "HFG.DE"]);
  assert.ok(ger[0].lamp?.color);
  assert.equal(ger[0].note === "ohne Schwarm", false);
  const now = new Date("2026-11-17T21:00:00+01:00");
  const german = renderNews(data, { newsFilter: "alle", swarmSide: "ger" }, now);
  assert.match(german, /data-action="swarm-side"/);
  assert.match(german, />US</);
  assert.match(german, />GER</);
  assert.match(german, /aria-pressed="true">GER/);
  assert.match(german, /SMA Solar/);
  assert.equal(german.includes("SpaceX"), false);
  const american = renderNews(data, { newsFilter: "alle", swarmSide: "us" }, now);
  assert.match(american, /aria-pressed="true">US/);
  assert.match(american, /optimistisch/);
  assert.equal(american.includes("SMA Solar"), false);
  assert.equal(BANNED.test(german), false);
  assert.equal(BANNED.test(american), false);
  const kept = renderStimmung({
    prices: { tickers: [] },
    sentiment: { symbols: {} },
    seasonality: {},
    production: {},
    weekly: {},
    germany: { symbols: [] },
    crowd: { comparison: {} },
    favorites: { favorites: [] }
  }, { analyseSymbol: "TSLA", analyseRange: "15 Min", analyseView: "kerzen" });
  assert.match(kept, /Schwarm gegen Karl/);
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
  assert.equal(html.includes(">Produktion<"), false);
  assert.equal(html.includes(">Wochenrückblick<"), false);
  assert.match(renderMehr(), /Produktion/);
  assert.match(renderMehr(), /Wochenrückblick/);
  assert.match(renderMehr(), /Mehr/);
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

test("Moonshots bleiben zu, bis die Listen gefüllt sind, und klappen in der Zeile auf", () => {
  const now = new Date("2026-11-17T21:00:00+01:00");
  const item = (name, ticker, country, exchange) => ({
    name,
    ticker,
    country,
    exchange,
    priceEur: 42,
    hint: "Bewegung am Morgen",
    bullets: ["Erster Punkt", "Zweiter Punkt", "Dritter Punkt"],
    sources: [{ title: "Börse", url: "https://example.com/kurs" }]
  });
  const moonshots = {
    schema: 1,
    updatedAt: "2026-11-19T08:30:00+01:00",
    nextRun: "2026-11-19T14:00:00+01:00",
    long: [item("Nordwerk", "NORD", "US", "NYSE"), item("Rheinwerk", "RHEIN", "DE", "Xetra"), item("Hafenwerk", "HAFN", "JP", "TSE")],
    short: [item("Südwerk", "SUED", "HK", "HKEX"), item("Westwerk", "WEST", "KR", "KRX"), item("Ostwerk", "OST", "GB", "LSE")]
  };
  const hidden = renderNews({ moonshots: { long: [], short: [] } }, {}, now);
  assert.equal(hidden.includes("moon-board"), false);
  assert.equal(hidden.includes("ROCKET LAB NEWS"), false);
  const closed = renderNews({ moonshots }, {}, now);
  assert.match(closed, /moon-board/);
  assert.match(closed, /Stand 08:30 · nächster 14:00/);
  assert.match(closed, /könnten heute 10 % oder mehr steigen/);
  assert.match(closed, /könnten heute 7,5 % oder mehr fallen/);
  assert.match(closed, /Nordwerk/);
  assert.match(closed, /Südwerk/);
  assert.equal(closed.includes("Rheinwerk"), false);
  assert.equal(closed.includes("Erster Punkt"), false);
  assert.equal(closed.includes("Beispiel"), false);
  const open = renderNews({ moonshots }, { moonOpen: { long: true } }, now);
  assert.match(open, /Rheinwerk/);
  assert.match(open, /Hafenwerk/);
  assert.match(open, /Erster Punkt/);
  assert.match(open, /Quelle · Börse/);
  assert.equal(open.includes("Westwerk"), false);
  assert.match(open, /aria-expanded="true"/);
  const withNews = renderNews({
    moonshots: {
      ...moonshots,
      rocketLabNews: {
        text: "Ein Satz zur Firma.",
        updatedAt: "2026-11-19T14:00:00+01:00",
        sources: [{ title: "Firma", url: "https://example.com/rklb" }]
      }
    },
    hours: { symbols: { RKLB: { "2": { "21": { n: 10, up: 6, down: 4 } } } } }
  }, {}, now);
  const rklbAt = withNews.indexOf(">RKLB<");
  const newsAt = withNews.indexOf("ROCKET LAB NEWS");
  assert.ok(rklbAt > 0 && newsAt > rklbAt);
  assert.match(withNews, /einmal täglich · Stand 14:00/);
  assert.match(withNews, /Ein Satz zur Firma/);
  assert.equal(BANNED.test(open + withNews), false);
  assert.equal((open + withNews).includes("Keine Anlageberatung"), false);
});

test("Unter 50 Prozent ist rot, ab 50 Prozent grün", () => {
  const days = aggregateWeekdays([
    { t: "2026-01-02", close: 100 },
    { t: "2026-01-05", close: 110 },
    { t: "2026-01-09", close: 110 },
    { t: "2026-01-12", close: 99 }
  ]);
  assert.equal(days[0].avgUp, 10);
  assert.equal(days[0].avgDown, -10);
  const row = (up) => ({ n: 10, up, down: 10 - up, avg: 0 });
  const pack = {
    symbols: {
      TSLA: {
        ranges: {
          all: { days: [row(8), row(2), row(5), row(6), row(3)], hours: [], grid: [] },
          year: { days: [row(8), row(2), row(5), row(6), row(3)], hours: [], grid: [] }
        }
      }
    }
  };
  const html = renderSeasonalityCard(pack, { symbol: "TSLA" }, "all");
  assert.match(html, /Long: Wie oft ging es hoch/);
  assert.equal(html.includes("Short: Wie oft ging es runter"), false);
  assert.match(html, /data-row="tag"/);
  assert.equal(html.includes("Mittlere Bewegung"), false);
  const paint = (text) => html.slice(html.lastIndexOf("<span", html.indexOf(`>${text}<`)), html.indexOf(`>${text}<`));
  assert.match(paint("80%"), /125, 222, 192/);
  assert.match(paint("20%"), /255, 139, 152/);
  assert.equal(BANNED.test(html), false);
});
