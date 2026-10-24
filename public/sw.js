/* RS Limiter Calculator — offline service worker.
   RS - Roey Shlomo.

   The app is a field tool: once loaded it must keep working with no network at all.
   PRECACHE is filled in at build time by scripts/build-sw.mjs. */

const VERSION = '__BUILD_VERSION__';
const CACHE = `rs-limiter-${VERSION}`;
const PRECACHE = __PRECACHE__;
const SHELL = '__BASE__index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails the whole install if any single request fails, so add individually.
      await Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('rs-limiter-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached app shell when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(SHELL)) ?? (await cache.match(request)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else: cache first, then network, keeping the cache fresh.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
          void cache.put(request, response.clone());
        }
        return response;
      } catch {
        return hit ?? Response.error();
      }
    })(),
  );
});
