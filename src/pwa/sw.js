self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('gana777-static-') && key !== STATIC_CACHE).map(key => caches.delete(key)))));
});

// Cache immutable, same-origin build assets only. Never intercept HTML, Auth,
// Supabase, API responses, receipts, or attachments containing private data.
const STATIC_CACHE = 'gana777-static-v1';
const MAX_ASSETS = 64;
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search
    || !/^\/assets\/[\w.-]+-[\w-]{8,}\.(?:js|css|png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname)
    || request.headers.has('range')) return;
  event.respondWith((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      const stored = await cache.match(request);
      if (stored) return stored;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' && !response.headers.get('content-type')?.includes('text/html')
        && Number(response.headers.get('content-length') || 0) <= 3 * 1024 * 1024) {
        const copy = response.clone();
        event.waitUntil(cache.put(request, copy).then(async () => {
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map(key => cache.delete(key)));
        }).catch(() => {}));
      }
      return response;
    } catch { return fetch(request); }
  })());
});

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Ignore malformed payloads. */ }
  event.waitUntil(self.registration.showNotification(message.title || 'Gana777', {
    body: message.body || 'Tenés una novedad en tu cuenta.',
    icon: '/pwa/icon-panda-192.png?v=violet-1',
    badge: '/pwa/icon-panda-192.png?v=violet-1',
    tag: message.tag || `gana777-${message.requestId || 'notice'}`,
    data: { url: message.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); existing.postMessage({ type: 'notification-navigate', url: target }); return; }
    await self.clients.openWindow(target);
  }));
});
