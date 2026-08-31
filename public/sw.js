// Minimal service worker: lets "Add to Home Screen" installs open as a
// real standalone app window, and keeps the last successfully-fetched
// version of each asset available offline. Network-first (not cache-first)
// so an online player always gets the current build; only falls back to
// the cache when the network request fails. Bump CACHE_NAME on a future
// change here to evict everything from the previous version.
const CACHE_NAME = 'terminal-harvest-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })
  );
});
