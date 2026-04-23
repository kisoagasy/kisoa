// KISOA — Service Worker v7
const CACHE = 'kisoa-v7';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return fetch(self.registration.scope)
        .then(r => c.put(self.registration.scope, r))
        .catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(self.registration.scope));
    })
  );
});
