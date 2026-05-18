const CACHE_VERSION = 'fotoexpress-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  let data = { title: 'FotoExpress', body: 'Você tem novidades!' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: data.url || '/',
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || '/';
  event.waitUntil(clients.openWindow(target));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear API ou downloads de fotos compradas.
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/download')) {
    return;
  }

  // Network-first para HTML (navegação), cache-first para assets estáticos.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
