// Minimal service worker — makes ChurchOpsHub installable as a PWA.
// Network-first for everything so Firebase real-time data is never stale.
const CACHE = 'churchopshub-shell-v1';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only intercept same-origin GET requests; let Firebase/Stripe pass through.
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(request)
      .then(res => {
        // Cache successful responses for the shell assets.
        if (res.ok && SHELL.includes(url.pathname)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
