const CACHE_NAME = 'surgical-case-log-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// Pinned-version CDN library scripts the app needs to even boot (Firebase SDK, JSZip,
// heic2any). These are cross-origin, so the regular same-origin fetch handler below
// skips them \u2014 without caching these separately, losing network before they load
// (or the browser's own HTTP cache evicting them) means the whole app fails to start,
// even though all the patient data is safely on-device in IndexedDB. Since each URL is
// version-pinned, a cached copy is always correct \u2014 no staleness risk.
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.1/index.min.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS).then(() => cache.addAll(CDN_ASSETS).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);

  // Pinned CDN library scripts: cache-first (the URL is version-locked, so a cached
  // copy is never stale), falling back to network on first visit or if not yet cached.
  if (CDN_ASSETS.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }))
    );
    return;
  }

  if (reqUrl.origin !== self.location.origin) return; // don't intercept other cross-origin requests (Firestore/Storage API calls, etc.) \u2014 let the browser handle those directly
  // Network-first: always serve the latest version when online.
  // Falls back to the cached copy only if there is no network (offline use).
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
