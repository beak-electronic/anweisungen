/* Anweisungen – Service Worker (App-Shell Offline-Cache). Keine .beak-Projekte cachen. */
const CACHE = 'anweisungen-shell-v2.10';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=2.10',
  './app.js?v=2.10',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './favicon-16.png',
  './favicon-32.png',
  './favicon-48.png',
  './apple-touch-icon.png',
  './apple-touch-icon-120.png',
  './apple-touch-icon-152.png',
  './apple-touch-icon-167.png',
  './apple-touch-icon-precomposed.png',
  './icon-512.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './vendor/jszip.min.js',
  './vendor/pdf-lib.min.js',
  './vendor/pdf.min.mjs?v=2.03',
  './vendor/pdf.worker.min.mjs?v=2.03',
  './vendor/pdf.legacy.iife.js?v=2.03',
  './vendor/pdf.worker.legacy.iife.js?v=2.03',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isProjectLike(url) {
  const u = url.pathname.toLowerCase();
  return u.endsWith('.beak') || u.endsWith('.plan') || u.endsWith('.beakplan') ||
    u.includes('project.json') || u.includes('/photos/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isProjectLike(url)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
