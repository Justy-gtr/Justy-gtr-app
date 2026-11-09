import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mergeIntradayPaths, DAYPATH_SLOTS } from "../js/daypath.js";
import {
  ALPACA_SOURCE,
  IEX_LABEL,
  MIN_MINUTE_BARS,
  assertMarketDataUrl,
  extendedPrint,
  isUsSymbol,
  loadPathPack,
  loadPricePack,
  loadQuotePack,
  minutePoints,
  parseBar,
  parseBarsPage,
  parseSnapshots,
  publicError,
  standingQuote,
  usSymbols
} from "./alpaca.mjs";
import { applyLiveUsd } from "./fetch-moonshots.mjs";
import { extendedQuote, tagSessions } from "./market.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/alpaca-iex.json", import.meta.url), "utf8"));
const KEY = "test-key-id-value";
const SECRET = "test-secret-value";
const ENV = { ALPACA_KEY_ID: KEY, ALPACA_SECRET_KEY: SECRET };
const POST = new Date("2026-11-09T21:10:00Z");
const REGULAR = new Date("2026-11-09T15:00:00Z");
const PRE = new Date("2026-11-09T12:30:00Z");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function silence(fn) {
  const lines = [];
  const original = console.log;
  console.log = (message) => lines.push(String(message));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    })
    .then((result) => ({ result, lines }));
}

test("Snapshot und Kerzen aus der IEX-Antwort", () => {
  const snapshots = parseSnapshots(fixture.snapshots);
  assert.deepEqual(Object.keys(snapshots).sort(), ["RKLB", "SPCX", "TSLA"]);
  const spcx = snapshots.SPCX;
  assert.equal(spcx.source, ALPACA_SOURCE);
  assert.equal(spcx.latest, 143.55);
  assert.equal(spcx.latestAt, "2026-11-09T21:08:43.947Z");
  assert.equal(spcx.daily.close, 141.98);
  assert.equal(spcx.daily.high, 143.4);
  assert.equal(spcx.daily.low, 136.2);
  assert.equal(spcx.prevDaily.close, 135.5);
  assert.equal(spcx.minute.c, undefined);
  assert.equal(spcx.minute.close, 143.55);
  assert.equal(parseBar(fixture.snapshots.SPCX.dailyBar).v, undefined);

  const page = parseBarsPage(fixture.barsPage1);
  assert.equal(page.next, fixture.barsPage1.next_page_token);
  assert.equal(page.bars.SPCX.length, 14);
  assert.equal(page.bars.SPCX[0].t, "2026-11-09T12:00:00.000Z");
  assert.equal(page.bars.SPCX[0].open, 135.6);
  assert.equal(parseBarsPage(fixture.barsPage2).next, null);
  assert.equal(parseBarsPage({ bars: { "TL0.DE": [{ t: "2026-11-09T12:00:00Z", c: 1 }] } }).bars["TL0.DE"], undefined);
});

test("Regulär ist der letzte Druck, danach der Tagesschluss, davor die letzte Sitzung", () => {
  const pack = {
    snapshots: parseSnapshots(fixture.snapshots),
    daily: parseBarsPage(fixture.daily).bars
  };
  const post = standingQuote("SPCX", pack, POST);
  assert.equal(post.price, 141.98);
  assert.equal(post.dayHigh, 143.4);
  assert.equal(post.dayLow, 136.2);
  assert.equal(post.previousClose, 135.5);
  assert.equal(post.source, ALPACA_SOURCE);
  assert.equal(post.currency, "USD");

  const regular = standingQuote("spcx", pack, REGULAR);
  assert.equal(regular.price, 143.55);
  assert.equal(regular.dayHigh, 143.55);
  assert.equal(regular.dayLow, 136.2);

  const pre = standingQuote("SPCX", pack, PRE);
  assert.equal(pre.price, 135.5);
  assert.equal(pre.previousClose, 130);

  const extended = extendedPrint(pack.snapshots.SPCX, POST);
  assert.equal(extended.phase, "nachhandel");
  assert.equal(extended.price, 143.55);
  assert.equal(extended.high, 143.6);
  assert.equal(extendedPrint(pack.snapshots.SPCX, REGULAR), null);
  assert.equal(extendedPrint(pack.snapshots.SPCX, PRE), null);
});

test("Minuten tragen Vorbörse, Handel und Nachbörse", () => {
  const points = parseBarsPage(fixture.barsPage1).bars.SPCX;
  assert.ok(points.length >= MIN_MINUTE_BARS);
  const tagged = tagSessions(points, null, { clock: true });
  assert.equal(tagged[0].session, "pre");
  assert.equal(tagged[1].session, "regular");
  assert.equal(tagged.at(-1).session, "post");
  const quote = extendedQuote(tagged, null, POST.getTime(), { clock: true });
  assert.equal(quote.phase, "nachhandel");
  assert.equal(quote.price, 142.9);
  assert.equal(extendedQuote(tagged, null, REGULAR.getTime(), { clock: true }), null);
});

test("ohne Schlüssel kein Abruf", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return jsonResponse({});
  };
  assert.equal(await loadPricePack(["SPCX", "TL0.DE"], { env: {}, fetchImpl }), null);
  assert.equal(await loadQuotePack(["TSLA"], { env: { ALPACA_KEY_ID: "   ", ALPACA_SECRET_KEY: "" }, fetchImpl }), null);
  assert.equal(await loadPathPack(["RKLB"], { env: {}, fetchImpl }), null);
  assert.equal(called, 0);
});

test("ein Aufruf je Sorte, IEX, beide Seiten, Schlüssel bleiben aus dem Log", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const parsed = new URL(url);
    assertMarketDataUrl(parsed);
    const token = parsed.searchParams.get("page_token");
    const timeframe = parsed.searchParams.get("timeframe");
    if (parsed.pathname.endsWith("/snapshots")) return jsonResponse(fixture.snapshots);
    if (timeframe === "1Min") return jsonResponse(token ? fixture.barsPage2 : fixture.barsPage1);
    if (timeframe === "1Day") return jsonResponse(fixture.daily);
    return jsonResponse({ bars: {}, next_page_token: null });
  };
  const pack = await loadPricePack(["TSLA", "TL0.DE", "SPCX", "RKLB", "EURUSD=X"], {
    env: ENV,
    now: POST,
    fetchImpl,
    delay: async () => {}
  });
  assert.equal(pack.source, ALPACA_SOURCE);
  assert.equal(pack.snapshots.TSLA.latest, 381.2);
  assert.equal(pack.daily.RKLB.length, 3);
  assert.equal(minutePoints("SPCX", pack).length, 15);
  assert.ok(minutePoints("TSLA", pack).length < MIN_MINUTE_BARS);
  const paths = calls.map((call) => call.url.pathname);
  assert.deepEqual(paths, [
    "/v2/stocks/snapshots",
    "/v2/stocks/bars",
    "/v2/stocks/bars",
    "/v2/stocks/bars",
    "/v2/stocks/bars",
    "/v2/stocks/bars"
  ]);
  for (const call of calls) {
    assert.equal(call.url.origin, "https://data.alpaca.markets");
    assert.equal(call.url.searchParams.get("feed"), "iex");
    assert.equal(call.url.searchParams.get("symbols"), "RKLB,SPCX,TSLA");
    assert.equal(call.init.headers["APCA-API-KEY-ID"], KEY);
    assert.equal(call.init.headers["APCA-API-SECRET-KEY"], SECRET);
    assert.equal(call.url.search.includes(SECRET), false);
    assert.equal(call.url.search.includes(KEY), false);
  }
  const minute = calls.filter((call) => call.url.searchParams.get("timeframe") === "1Min");
  assert.equal(minute.length, 2);
  assert.equal(minute[1].url.searchParams.get("page_token"), fixture.barsPage1.next_page_token);
  assert.equal(minute[0].url.searchParams.get("adjustment"), "raw");
  assert.match(minute[0].url.searchParams.get("start"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("ein Fehler fällt zurück und der Schlüssel steht nicht im Log", async () => {
  const { result, lines } = await silence(() => loadPricePack(["SPCX"], {
    env: ENV,
    fetchImpl: async () => {
      throw new Error(`leaked ${SECRET} and ${KEY}`);
    },
    delay: async () => {}
  }));
  assert.equal(result, null);
  const text = lines.join("\n");
  assert.match(text, /Alpaca/);
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(KEY), false);
  assert.equal(publicError(new Error(SECRET), { key: KEY, secret: SECRET }).includes(SECRET), false);
});

test("429 einmal wiederholen, Handelsrouten nie", async () => {
  let waits = 0;
  let hits = 0;
  const pack = await loadQuotePack(["SPCX"], {
    env: ENV,
    now: POST,
    delay: async () => {
      waits += 1;
    },
    fetchImpl: async (url) => {
      hits += 1;
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://data.alpaca.markets");
      if (hits === 1) return jsonResponse({}, 429);
      if (parsed.pathname.endsWith("/snapshots")) return jsonResponse(fixture.snapshots);
      return jsonResponse(fixture.daily);
    }
  });
  assert.equal(waits, 1);
  assert.equal(pack.snapshots.SPCX.daily.close, 141.98);
  assert.throws(() => assertMarketDataUrl("https://paper-api.alpaca.markets/v2/orders"), /Nur Marktdaten/);
  assert.throws(() => assertMarketDataUrl("https://data.alpaca.markets/v2/stocks/trades?feed=iex"), /Nur Kurse/);
  assert.throws(() => assertMarketDataUrl("https://data.alpaca.markets/v2/stocks/bars?feed=sip"), /Nur IEX/);
});

test("Tagespfad: IEX füllt eine Lücke und senkt kein n", async () => {
  const calls = [];
  const pack = await loadPathPack(["SPCX", "TSLA"], {
    env: ENV,
    now: POST,
    delay: async () => {},
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return jsonResponse({
        bars: {
          SPCX: [
            { t: "2026-11-09T09:30:00Z", o: 50, h: 51, l: 49, c: 50, v: 1, n: 1, vw: 50 },
            { t: "2026-11-09T11:00:00Z", o: 52, h: 53, l: 51, c: 52, v: 1, n: 1, vw: 52 }
          ]
        },
        next_page_token: null
      });
    }
  });
  assert.deepEqual(calls.map((url) => url.searchParams.get("timeframe")), ["1Hour", "30Min"]);
  assert.ok(calls.every((url) => url.searchParams.get("adjustment") === "split" && url.searchParams.get("feed") === "iex"));
  const gap = JSON.parse(fs.readFileSync(new URL("./fixtures/daypath-gap.json", import.meta.url), "utf8"));
  const base = [
    { id: "SPX.F", label: "Frankfurt", points: gap.frankfurt },
    { id: "SPX.SG", label: "Stuttgart", points: gap.stuttgart },
    { id: "SPCX", label: "US", points: gap.us }
  ];
  const iex = pack.hour.SPCX.map((point) => ({ t: point.t, eur: point.close }));
  const before = mergeIntradayPaths(base);
  const after = mergeIntradayPaths([...base, { id: "SPCX:iex", label: IEX_LABEL, points: iex }]);
  before.coverage.forEach((row, index) => {
    assert.equal(after.coverage[index].slot, row.slot);
    assert.ok(after.coverage[index].n >= row.n);
  });
  assert.equal(after.days[0].n, before.days[0].n);
  const noon = DAYPATH_SLOTS.indexOf("12:00");
  assert.equal(before.coverage[noon].n, 0);
  assert.equal(after.coverage[noon].where, IEX_LABEL);
  assert.equal(after.coverage[noon].n, 1);
  assert.equal(after.coverage[DAYPATH_SLOTS.indexOf("08:30")].where, "Stuttgart");
});

test("Live-Kurs ersetzt nur den Schluss, nicht die Zählung", () => {
  const quote = {
    symbol: "NVDA",
    priceUsd: 100,
    priceEur: 90,
    previousCloseUsd: 98,
    changePct: 2,
    sparkline: [80, 90],
    history: { catalyst: { n: 8 } },
    marketSource: { title: "Yahoo Finance NVDA", url: "https://finance.yahoo.com/quote/NVDA" }
  };
  const chart = standingQuote("SPCX", {
    snapshots: parseSnapshots(fixture.snapshots),
    daily: parseBarsPage(fixture.daily).bars
  }, POST);
  chart.symbol = "NVDA";
  const next = applyLiveUsd(quote, { ...chart, price: 101, previousClose: 99 }, {
    rate: 1.1,
    points: [{ t: "2026-11-09T00:00:00.000Z", close: 1.1 }]
  });
  assert.equal(next.source, ALPACA_SOURCE);
  assert.equal(next.priceUsd, 101);
  assert.equal(next.previousCloseUsd, 99);
  assert.equal(next.history.catalyst.n, 8);
  assert.equal(quote.priceUsd, 100);
  assert.equal(quote.sparkline[1], 90);
  assert.equal(next.sparkline[1] !== 90, true);
  assert.match(next.marketSource.url, /feed=iex/);
  const far = applyLiveUsd(quote, { ...chart, price: 140 }, { rate: 1.1, points: [] });
  assert.equal(far, quote);
  assert.equal(isUsSymbol("TL0.DE"), false);
  assert.equal(isUsSymbol("SPX.F"), false);
  assert.equal(isUsSymbol("EURUSD=X"), false);
  assert.deepEqual(usSymbols(["tsla", "SPCX", "TL0.DE", "TSLA"]), ["SPCX", "TSLA"]);
});
