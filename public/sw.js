self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { id, title, body } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: id,
      icon: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('/?view=alerts', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => client.url === url);
      if (existing) await existing.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
