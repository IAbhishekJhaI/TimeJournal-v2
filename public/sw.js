/*
 * TimeJournal service worker — offline app shell + installability.
 *
 * Cache-update strategy (see README / notes):
 *  - Bump CACHE_VERSION on any change to this file's caching behaviour. On
 *    activate, every cache whose name doesn't match the current version is
 *    deleted, so stale entries can never accumulate across deploys.
 *  - Build assets under /_next/static/ are content-hashed and immutable, so
 *    they're served CACHE-FIRST — a new deploy ships new filenames, which are
 *    simply cache misses that get fetched and cached fresh. Old hashes fall
 *    away when their cache version is cleaned up.
 *  - HTML navigations are NETWORK-FIRST: an online user always gets the newest
 *    document (pointing at the newest asset hashes); the cached copy is only a
 *    fallback when offline. This is what prevents "stuck on an old version".
 *  - /api/* is never cached — user data goes through the app's own TanStack
 *    Query + IndexedDB layer, not the SW.
 *  - We deliberately do NOT call skipWaiting(): an updated worker waits until
 *    all tabs are closed before activating, so assets are never swapped out
 *    from under a running session (which would cause chunk-load errors).
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `tj-static-${CACHE_VERSION}`;
const PAGES_CACHE = `tj-pages-${CACHE_VERSION}`;
const CURRENT = new Set([STATIC_CACHE, PAGES_CACHE]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !CURRENT.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim(); // control already-open tabs on first install
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone
  if (url.pathname.startsWith("/api/")) return; // never cache user data

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|ico|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(cacheFirst(request));
  }
});

// HTML: try the network, fall back to the last cached page (or a minimal shell).
async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match("/"));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<title>Offline</title><body style='font-family:system-ui;padding:2rem;color:#1c1917'>" +
        "<h1>You're offline</h1><p>Reconnect to load TimeJournal.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

// Immutable static assets: serve from cache, populate on first fetch.
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}
