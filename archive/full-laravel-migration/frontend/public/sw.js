const CACHE_NAME = 'alabiq-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match('/'))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Alabiq', body: event.data?.text() || 'You have a new update.' };
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const visible = windows.filter((client) => client.visibilityState === 'visible');
        if (visible.length > 0) {
          visible.forEach((client) =>
            client.postMessage({ type: 'SMART_ALABIQ_NOTIFICATION', payload: data })
          );
          return undefined;
        }
        return self.registration.showNotification(data.title || 'Alabiq', {
          body: data.body || 'Open Alabiq to view the update.',
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: data.tag || `alabiq-${Date.now()}`,
          renotify: true,
          data: { url: data.url || '/notifications' },
        });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const requested = new URL(event.notification.data?.url || '/notifications', self.location.origin);
      const targetUrl = requested.origin === self.location.origin ? requested.href : `${self.location.origin}/notifications`;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
