// Minimal placeholder service worker for PWA install and future push
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push handler (no-op placeholder until backend sends real payloads)
self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : { title: 'Daily check-in', body: 'How were your selected health issues today? Tap to rate.' };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Helfi', {
        body: data.body || '',
        icon: '/logo.svg',
        data: data,
      })
    );
  } catch (e) {
    // Fallback
    event.waitUntil(
      self.registration.showNotification('Daily check-in', {
        body: 'How were your selected health issues today? Tap to rate.',
        icon: '/logo.svg'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/check-in';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindow = clientsArr.some((w) => w.url.includes(url) && 'focus' in w ? (w.focus(), true) : false);
      if (!hadWindow && self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});


