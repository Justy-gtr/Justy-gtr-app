import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { formatEUR, marketLights } from "../js/logic.js";
import { renderHeute } from "../js/views.js";

const BANNED = /kaufen|verkaufen|empfehlung|anlageberatung/i;

test("Markt-Ampel kennt Tradegate, US-Kasse und die Nebenzeit", () => {
  const night = marketLights(new Date("2026-11-10T02:15:00.000Z"));
  assert.equal(night.tradegate, "zu");
  assert.equal(night.us, "zu");
  assert.equal(night.overnight, "zu");
  const morning = marketLights(new Date("2026-11-10T14:00:00.000Z"));
  assert.equal(morning.tradegate, "offen");
  assert.equal(morning.us, "neben");
  assert.equal(morning.overnight, "an");
  assert.equal(morning.usWord, "vorbörslich");
  const cash = marketLights(new Date("2026-11-10T16:00:00.000Z"));
  assert.equal(cash.us, "offen");
  assert.equal(cash.overnight, "zu");
});

test("Heute zeigt drei Karten, zwei Termine und drei Meldungen", () => {
  const alerts = [1, 2, 3, 4, 5].map((index) => ({
    symbol: `S${index}`,
    priceEur: index,
    changePct: index,
    timestamp: `2026-11-0${index}T12:00:00Z`,
    notified: false
  }));
  const html = renderHeute({
    prices: {
      fx: { rate: 1.1 },
      tickers: [
        { symbol: "MRVL", name: "Marvell Technology", priceEur: 8, changePct: -1, history: { intraday: [{ t: "2026-11-10T15:00:00Z", eur: 7 }, { t: "2026-11-10T16:00:00Z", eur: 8 }] } },
        { symbol: "TSLA", name: "Tesla", priceEur: 200, changePct: 2, history: { intraday: [{ t: "2026-11-10T15:00:00Z", eur: 190 }, { t: "2026-11-10T16:00:00Z", eur: 200 }] } },
        { symbol: "SPCX", name: "SpaceX", priceEur: 120, changePct: 1, history: { intraday: [{ t: "2026-11-10T15:00:00Z", eur: 110 }, { t: "2026-11-10T16:00:00Z", eur: 120 }] } }
      ]
    },
    sentiment: { symbols: {} },
    briefing: { summary: "Ein ruhiger Morgen.", bullets: ["Eins", "Zwei", "Drei", "Vier"] },
    calendar: {
      events: [
        { id: "old", title: "Alt", date: "2026-11-01", time: "10:00", timezone: "Europe/Berlin", probabilityPct: 10 },
        { id: "soon", title: "Bald", date: "2026-11-20", time: "11:00", timezone: "Europe/Berlin", probabilityPct: 40 },
        { id: "later", title: "Später", date: "2026-11-21", time: "12:00", timezone: "Europe/Berlin", probabilityPct: 70 },
        { id: "last", title: "Ganz später", date: "2026-12-01", time: "09:00", timezone: "Europe/Berlin", probabilityPct: 80 }
      ]
    },
    alerts: { alerts },
    moonshots: {
      nearTerm: { candidates: [{ symbol: "NVDA", name: "NVIDIA", priceEur: 100, changePct: 1, catalyst: { label: "Zahlen" } }] },
      candidates: []
    },
    companies: { companies: [{ id: "spacex", name: "SpaceX" }] },
    production: { nextLaunch: { name: "Starship", target: "2026-12-01T12:00:00Z", status: "geplant" } },
    favorites: { favorites: [] }
  }, {}, {});
  assert.match(html, /id="home-clock"/);
  assert.match(html, /class="ampel"/);
  assert.equal((html.match(/home-tick-go/g) || []).length, 3);
  const ticks = html.match(/<section class="home-ticks"[\s\S]*?<\/section>/)[0];
  const cards = [...ticks.matchAll(/class="home-tick-go"[^>]*data-symbol="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(cards, ["SPCX", "TSLA", "MRVL"]);
  assert.equal(ticks.includes("RKLB"), false);
  assert.match(ticks, /Marvell Technology/);
  assert.match(ticks, /€/);
  assert.match(html, /SPCX/);
  assert.match(html, /data-symbol="SPCX"/);
  assert.match(html, /<circle /);
  assert.match(html, /mood-lamp/);
  assert.match(html, /Mehr lesen/);
  assert.match(html, />Eins</);
  assert.equal(html.includes(">Vier<"), false);
  assert.match(html, /Alle Termine/);
  assert.match(html, /Bald/);
  assert.match(html, /Später/);
  assert.equal(html.includes("Ganz später"), false);
  assert.equal(html.includes(">Alt<"), false);
  assert.equal((html.match(/home-alerts[\s\S]*?<\/section>/)[0].match(/mini-note/g) || []).length, 3);
  assert.match(html, /Alle anzeigen/);
  assert.match(html, /moon-rail/);
  assert.match(html, /NVDA/);
  assert.match(html, /data-action="open-ko"/);
  assert.match(html, /Karls Top 10/);
  assert.match(html, /id="count-num"/);
  assert.match(html, /Kosmos/);
  assert.match(html, /Tagesfrage/);
  assert.equal(BANNED.test(html), false);
  assert.equal(html.includes("Keine Anlageberatung"), false);
});

test("Marvell-Karte bleibt grau ohne Stimmungsdaten, RKLB bleibt in Frage und Meldung", () => {
  const prices = JSON.parse(fs.readFileSync("data/prices.json", "utf8"));
  const sentiment = JSON.parse(fs.readFileSync("data/sentiment.json", "utf8"));
  const question = JSON.parse(fs.readFileSync("data/daily_question.json", "utf8"));
  assert.equal(sentiment.symbols?.MRVL, undefined);
  assert.ok(sentiment.symbols?.RKLB);
  assert.ok(prices.tickers.some((ticker) => ticker.symbol === "RKLB"));
  const mrvl = prices.tickers.find((ticker) => ticker.symbol === "MRVL");
  assert.equal(mrvl?.name, "Marvell Technology");
  assert.equal(mrvl.currency, "EUR");
  assert.equal(mrvl.eurSymbol, "9MW.DE");
  const fresh = new Date().toISOString();
  const html = renderHeute({
    prices,
    sentiment: {
      symbols: {
        SPCX: { ...sentiment.symbols.SPCX, updatedAt: fresh },
        TSLA: { ...sentiment.symbols.TSLA, updatedAt: fresh },
        RKLB: { ...sentiment.symbols.RKLB, updatedAt: fresh }
      }
    },
    daily_question: question,
    alerts: {
      alerts: [
        { symbol: "RKLB", name: "Rocket Lab", priceEur: 48.25, changePct: 1.9, timestamp: "2026-11-10T12:00:00Z", notified: false },
        { symbol: "TSLA", name: "Tesla", priceEur: 300, changePct: 2, timestamp: "2026-11-10T11:00:00Z", notified: false }
      ]
    },
    briefing: { summary: "Kurzer Morgen.", bullets: ["SpaceX", "Tesla", "Marvell"] },
    calendar: { events: [] },
    moonshots: { candidates: [] },
    companies: { companies: [] },
    favorites: { favorites: [] }
  }, {}, {});
  const ticks = html.match(/<section class="home-ticks"[\s\S]*?<\/section>/)[0];
  const cards = [...ticks.matchAll(/class="home-tick-go"[^>]*data-symbol="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(cards, ["SPCX", "TSLA", "MRVL"]);
  assert.equal(ticks.includes("RKLB"), false);
  assert.equal(ticks.includes("Rocket Lab"), false);
  assert.match(ticks, new RegExp(formatEUR(mrvl.priceEur).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ticks, /€/);
  const lamp = ticks.match(/<div class="mood-lamp[^"]*" data-symbol="MRVL"[\s\S]*?<\/div>\s*<\/div>/)[0];
  assert.match(lamp, /is-leer/);
  assert.match(lamp, /is-empty/);
  assert.match(lamp, /#6b7280/);
  assert.match(lamp, /noch keine Daten/);
  assert.match(lamp, /Noch keine Daten/);
  assert.equal(lamp.includes("is-gut"), false);
  assert.equal(lamp.includes("is-gemischt"), false);
  assert.equal(lamp.includes("is-stale"), false);
  const spcxMood = sentiment.symbols.SPCX.mood;
  assert.match(spcxMood, /^(gut|gemischt|schlecht)$/);
  assert.match(ticks, new RegExp(`data-symbol="SPCX"[^>]*data-mood="${spcxMood}"|mood-lamp is-${spcxMood}[^"]*" data-symbol="SPCX"`));
  assert.match(html, /class="wager-text"[^>]*>[^<]*RKLB/);
  const alerts = html.match(/<section class="card home-alerts"[\s\S]*?<\/section>/)[0];
  assert.match(alerts, />RKLB</);
  assert.match(alerts, /€/);
  assert.equal(BANNED.test(ticks), false);
  assert.equal(BANNED.test(lamp), false);
  assert.equal(BANNED.test(html), false);
});
