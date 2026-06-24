/* BUGFIX: the previous version of this file never wrote anything into the
   cache (no caches.open(...).put(...) anywhere), so the offline fallback
   (caches.match) could never find a match -- offline mode silently did not
   work despite the manifest advertising a standalone/installable PWA.
   This version precaches the core app shell on install and keeps caching
   responses as they're fetched, so there's actually something to fall
   back to when the network request fails. */

const CACHE_NAME = 'my-dear-diary-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // don't block install if a core asset is briefly unreachable
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle simple GETs -- never intercept POST/PUT (e.g. Firebase calls)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(e.request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(e.request)
          .then((cached) => cached || caches.match('./index.html'))
      )
  );
});
