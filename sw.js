/* BUGFIX: the previous version of this file never wrote anything into the
   cache (no caches.open(...).put(...) anywhere), so the offline fallback
   (caches.match) could never find a match -- offline mode silently did not
   work despite the manifest advertising a standalone/installable PWA.
   This version precaches the core app shell on install and keeps caching
   responses as they're fetched, so there's actually something to fall
   back to when the network request fails. */

const CACHE_NAME = 'my-dear-diary-v5-google-redirect-login';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
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
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const cacheableHosts = new Set([
    self.location.host,
    'www.gstatic.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ]);

  // Cache only the app shell and public static libraries, never private Firebase API data.
  if (!cacheableHosts.has(url.host)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(e.request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request)
          .then((cached) => {
            if (cached) return cached;
            if (e.request.mode === 'navigate') return caches.match('./index.html');
            return Response.error();
          })
      )
  );
});
