/* Anweisungen – Service Worker (App-Shell Offline-Cache). Keine .beak-Projekte cachen.
   v2.24: Neuer SW wartet auf SKIP_WAITING vom Client (nur Startbildschirm ohne offene Datei).
   Solange eine Datei offen ist, bleibt der alte SW Controller – kein Asset-Bruch.
   v2.25: BEAK-Punkt + Memory; Navigations-Cache nur für App-Hülle (/ und /index.html), nicht für spiel/*. */
const CACHE = 'anweisungen-shell-v2.25';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=2.25',
  './app.js?v=2.25',
  './punkt.css?v=2.25',
  './punkt.js?v=2.25',
  './spiel/memory.html',
  './fonts/Aeonis.subset.ttf',
  './fonts/Constantia-Bold.subset.ttf',
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

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  if (request.destination && request.destination !== '') return false;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function isServiceWorkerScript(url) {
  return /\/sw\.js$/i.test(url.pathname || '');
}

function isCodeAsset(url) {
  return /\.(m?js|css|webmanifest)$/i.test(url.pathname || '');
}

function isProjectLike(url) {
  const u = (url.pathname || '').toLowerCase();
  return u.endsWith('.beak') || u.endsWith('.plan') || u.endsWith('.beakplan') ||
    u.includes('project.json') || u.includes('/photos/');
}

function matchCache(request) {
  return caches.match(request, { ignoreSearch: true });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (!res.ok) return;
            await cache.put(url, res);
          } catch (_) {}
        })
      );
      /* v2.24: kein skipWaiting hier – Client sendet SKIP_WAITING erst auf dem Startbildschirm */
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  if (isProjectLike(url)) return;

  if (isNavigationRequest(req) || isServiceWorkerScript(url)) {
    const path = url.pathname || '';
    const basis = new URL('./', self.location.href).pathname;
    const istHuelle = path === basis || path === basis + 'index.html';
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && isNavigationRequest(req)) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => {
              /* v2.25: nur App-Hülle als index.html speichern – sonst überschreibt das Spiel-iframe die Startseite */
              if (istHuelle) {
                cache.put('./index.html', clone.clone());
                cache.put('./', clone);
              } else {
                cache.put(req, clone);
              }
            }).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          if (isNavigationRequest(req)) {
            if (istHuelle) {
              const shell = (await matchCache('./index.html')) || (await matchCache('./'));
              if (shell) return shell;
            } else {
              const hit = await matchCache(req);
              if (hit) return hit;
            }
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  if (isCodeAsset(url)) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => (await matchCache(req)) || new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  event.respondWith(
    matchCache(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
