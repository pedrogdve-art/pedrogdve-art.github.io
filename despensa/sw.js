// Freshkito service worker: funciona sin conexión (stale-while-revalidate)
const VERSION = 'freshkito-v2';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json', './icons/icon.svg',
  './js/app.js', './js/store.js', './js/foods.js', './js/recipes.js', './js/scanner.js',
  './js/cloud.js', './js/firebase-config.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.host.includes('fonts.g') || url.pathname.startsWith('/firebasejs/');
  if (!cacheable) return; // APIs (Firestore, Open Food Facts...) van siempre a la red

  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
