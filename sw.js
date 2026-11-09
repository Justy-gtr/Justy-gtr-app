const CACHE = "jgtr-v26";
const CORE = [
  "",
  "index.html",
  "css/app.css",
  "css/analyse.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/logic.js",
  "js/data.js",
  "js/chart.js",
  "js/analysis.js",
  "js/candles.js",
  "js/analyse.js",
  "js/candle-chart.js",
  "js/analyse-view.js",
  "js/seasonality.js",
  "js/nav.js",
  "js/views.js",
  "js/eggs.js",
  "js/motion.js",
  "js/knockout.js",
  "js/knockout-ui.js",
  "js/pull.js",
  "icons/logo.svg",
  "icons/favicon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "data/meta.json",
  "data/prices.json",
  "data/seasonality.json",
  "data/calendar.json",
  "data/posts.json",
  "data/favorites.json",
  "data/crowd.json",
  "data/promises.json",
  "data/production.json",
  "data/insiders.json",
  "data/briefing.json",
  "data/weekly.json",
  "data/daily_question.json",
  "data/glossary.json",
  "data/track_record.json",
  "data/alerts.json",
  "data/scenarios.json",
  "data/companies.json",
  "data/moonshots.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async (path) => {
      try {
        await cache.add(new URL(path, self.registration.scope));
      } catch {
        /* Eine fehlende Datei soll die ganze App nicht offline unbrauchbar machen. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.destination === "audio" || request.destination === "video") return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

function shellUrl() {
  return new URL("index.html", self.registration.scope);
}

function isAppShell(url) {
  const base = new URL(self.registration.scope).pathname.replace(/\/$/, "");
  const path = url.pathname.replace(/\/$/, "");
  return path === base || path === `${base}/index.html`;
}

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const shell = await cache.match(shellUrl());
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && isAppShell(url)) return response;
    if (shell) return shell;
    return response;
  } catch {
    if (shell) return shell;
    return new Response("offline", { status: 504, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function dataCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.href, { method: "GET" });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = dataCacheKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-JGTR-Cache", "hit");
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response("offline", { status: 504, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("offline", { status: 504, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
