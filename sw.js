// G-Wave service worker: app shell offline, station directory network-first, streams never cached.
const VERSION = 'g-wave-v5';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'news-sources.js', 'asr-worker.js', 'manifest.webmanifest',
  'vendor/globe.gl.min.js',
  'img/earth-night.jpg', 'img/earth-blue-marble.jpg', 'img/earth-topology.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('g-radio-') || k.startsWith('g-wave-')) && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Audio streams and range requests: always straight to the network
  if (req.destination === 'audio' || req.headers.has('range')) return;

  // Station directory: network first, fall back to last copy
  if (url.hostname.endsWith('api.radio-browser.info')) {
    if (!url.pathname.startsWith('/json/stations')) return;
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION + '-api').then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Own files: cache first
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match('index.html')))
    );
    return;
  }

  // Fonts and the subtitle library from CDNs: stale-while-revalidate
  if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(
      caches.open(VERSION + '-cdn').then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
