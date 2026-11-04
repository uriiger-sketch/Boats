'use strict';
// Offline support for the installed web app: precache everything, then
// serve from cache and refresh in the background (stale-while-revalidate).
const CACHE = 'broadside-v3';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'js/util.js', 'js/font.js', 'js/audio.js', 'js/art.js', 'js/world.js', 'js/input.js', 'js/game.js', 'js/ui.js', 'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      return res || (await cache.match('index.html')) || Response.error();
    })
  );
});
