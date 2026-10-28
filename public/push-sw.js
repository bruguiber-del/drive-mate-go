// Service worker mínimo, solo para notificaciones push — no cachea nada ni
// interfiere con el resto de la app (no es un service worker de PWA
// offline, sería un cambio mucho más grande y no es lo que hace falta
// aquí).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'VIMATCH', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'VIMATCH', {
      body: payload.body,
      icon: '/favicon.ico',
      tag: payload.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
        return;
      }
      return self.clients.openWindow('/');
    }),
  );
});
