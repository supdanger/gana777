self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Ignore malformed payloads. */ }
  event.waitUntil(self.registration.showNotification(message.title || 'Gana777', {
    body: message.body || 'Tenés una novedad en tu cuenta.',
    icon: '/pwa/icon-panda-192.png',
    badge: '/pwa/icon-panda-192.png',
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
