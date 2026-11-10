import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { markTabSeen, pendingDailyQuestion, tabSignals, unreadTabs } from "../js/logic.js";
import { dailyWager } from "../js/views.js";

function question(id, extra = {}) {
  return {
    id,
    question: extra.question || "Kommt der Start im ersten Fenster?",
    outcome: extra.outcome ?? null
  };
}

test("Tagesfrage steht, bis Ja oder Nein gewählt ist", () => {
  const data = { daily_question: { current: question("q1") } };
  const store = { answers: {} };
  assert.equal(pendingDailyQuestion(data, store).id, "q1");
  const html = dailyWager(data, store);
  assert.match(html, /Kommt der Start im ersten Fenster\?/);
  assert.match(html, />Ja</);
  assert.match(html, />Nein</);
  assert.equal(html.includes("card"), false);
  assert.equal(/kaufen|verkaufen/i.test(html), false);
});

test("Dieselbe beantwortete Frage bleibt am nächsten Morgen verborgen", () => {
  const data = { daily_question: { current: question("2026-11-08-ussf627") } };
  const store = {
    answers: { "2026-11-08-ussf627": { answer: "ja", at: "2026-11-08T21:04:00.000Z" } }
  };
  assert.equal(pendingDailyQuestion(data, store), null);
  assert.equal(dailyWager(data, store), "");
  assert.equal(pendingDailyQuestion(data, store), null);
  data.daily_question.current = question("2026-11-09-neu", { question: "Neue Frage am nächsten Tag?" });
  assert.equal(pendingDailyQuestion(data, store).id, "2026-11-09-neu");
  assert.match(dailyWager(data, store), /Neue Frage am nächsten Tag\?/);
});

test("Eine Frage mit Ergebnis ist keine Wette mehr", () => {
  const data = { daily_question: { current: question("q1", { outcome: "nein" }) } };
  assert.equal(pendingDailyQuestion(data, { answers: {} }), null);
});

test("Heute-Punkt nur für eine neue unbeantwortete Tagesfrage", () => {
  const data = { daily_question: { current: question("q1") } };
  const store = { answers: {} };
  assert.equal(unreadTabs(data, store).heute.length, 1);
  markTabSeen(store, data, "heute");
  assert.deepEqual(unreadTabs(data, store).heute, []);
  assert.ok(pendingDailyQuestion(data, store));
  store.answers.q1 = { answer: "nein", at: "2026-11-08T12:00:00.000Z" };
  assert.equal(pendingDailyQuestion(data, store), null);
  assert.deepEqual(unreadTabs(data, store).heute, []);
  data.daily_question.current = question("q2");
  assert.equal(unreadTabs(data, store).heute.length, 1);
  const kept = JSON.parse(JSON.stringify(store));
  assert.equal(unreadTabs(data, kept).heute.length, 1);
  markTabSeen(kept, data, "heute");
  assert.deepEqual(unreadTabs(data, JSON.parse(JSON.stringify(kept))).heute, []);
});

test("Neue Posts, geänderte Termine und Schwarm-Einträge setzen einen Punkt", () => {
  const data = {
    posts: { posts: [{ id: "post-alt" }] },
    calendar: {
      events: [{ id: "e1", date: "2026-11-13", time: "23:45", probabilityPct: 65, title: "Flight 15", reasoning: "Alter Text" }]
    },
    favorites: {
      favorites: [{ id: "fav-tsm", score: 7, vsSwarm: "skeptischer", swarmStance: "kauf", karlStance: "halten", karlTake: "Die Fabrik", priceEur: 350 }]
    },
    crowd: {
      investors: [{ id: "inv-a", hitRatePct: null, tickers: [{ symbol: "TSLA", mentions: 3, stance: "halten" }] }],
      comparison: { summary: "Karl bleibt bei der Fabrik.", swarmHitRatePct: null, karlHitRatePct: null }
    },
    prices: { tickers: [{ symbol: "SPCX", priceEur: 120, changePct: 1.2 }] }
  };
  const store = {};
  for (const tab of ["posts", "kalender", "schwarm", "mehr"]) markTabSeen(store, data, tab);
  assert.deepEqual(unreadTabs(data, store).posts, []);
  assert.deepEqual(unreadTabs(data, store).kalender, []);
  assert.deepEqual(unreadTabs(data, store).schwarm, []);
  assert.deepEqual(unreadTabs(data, store).mehr, []);

  data.posts.posts.push({ id: "post-neu" });
  assert.equal(unreadTabs(data, store).posts.length, 1);
  markTabSeen(store, data, "posts");
  assert.deepEqual(unreadTabs(JSON.parse(JSON.stringify({ posts: data.posts })), store).posts, []);

  data.calendar.events[0].reasoning = "Stand Mo 09:00: nur der Forschungsvermerk ist neu.";
  assert.deepEqual(unreadTabs(data, store).kalender, []);
  data.calendar.events[0].probabilityPct = 70;
  assert.equal(unreadTabs(data, store).kalender.length, 1);
  data.calendar.events.push({ id: "e2", date: "2026-11-14", time: null, probabilityPct: 40, title: "Neuer Termin" });
  assert.equal(unreadTabs(data, store).kalender.length, 2);

  data.favorites.favorites[0].priceEur = 10;
  data.prices.tickers[0].priceEur = 4;
  data.prices.tickers[0].changePct = -6;
  assert.deepEqual(unreadTabs(data, store).schwarm, []);
  assert.equal(Object.hasOwn(tabSignals(data, store), "charts"), false);
  data.crowd.investors[0].tickers[0].mentions = 8;
  assert.equal(unreadTabs(data, store).schwarm.length, 1);
  markTabSeen(store, data, "schwarm");
  data.crowd.investors.push({ id: "inv-b", tickers: [], hitRatePct: null });
  assert.equal(unreadTabs(data, store).schwarm.length, 1);
});

test("Echte Daten: Charts bleiben ohne Punkt, wenn sich nur der Kurs bewegt", () => {
  const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
  const data = {
    daily_question: read("daily_question"),
    posts: read("posts"),
    calendar: read("calendar"),
    crowd: read("crowd"),
    favorites: read("favorites"),
    prices: read("prices"),
    moonshots: read("moonshots")
  };
  const store = { answers: {} };
  const before = tabSignals(data, store);
  assert.equal(Object.hasOwn(before, "charts"), false);
  assert.ok(before.mehr.length >= 1);
  assert.equal(before.heute.length, 1);
  assert.ok(before.posts.length > 0);
  assert.ok(before.kalender.length > 0);
  assert.ok(before.schwarm.length > 0);
  data.prices.tickers[0].priceEur = 1;
  data.prices.tickers[0].changePct = -3;
  data.moonshots.candidates[0].priceEur = 1;
  data.moonshots.candidates[0].changePct = -4;
  const after = tabSignals(data, store);
  assert.equal(Object.hasOwn(after, "charts"), false);
  assert.deepEqual(after.mehr, before.mehr);
  assert.deepEqual(after.posts, before.posts);
  assert.deepEqual(after.kalender, before.kalender);
  assert.deepEqual(after.schwarm, before.schwarm);
  assert.equal(unreadTabs(data, {}).analyse, undefined);
});
