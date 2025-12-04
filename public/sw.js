// Minimal placeholder service worker for PWA install and push notifications.
// This version deliberately does NOT manage authentication or cookies.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push handler for daily check-ins and future notifications.
self.addEventListener('push', (event) => {
  try {
    const data = event.data
      ? event.data.json()
      : { title: 'Daily check-in', body: 'How were your selected health issues today? Tap to rate.' };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Helfi', {
        body: data.body || '',
        icon: '/icons/app-192.png',
        data,
      }),
    );
  } catch (e) {
    // Fallback message if payload parsing fails.
    event.waitUntil(
      self.registration.showNotification('Daily check-in', {
        body: 'How were your selected health issues today? Tap to rate.',
        icon: '/icons/app-192.png',
      }),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event.notification && event.notification.data && event.notification.data.url) || '/check-in';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        const hadWindow = clientsArr.some((w) =>
          w.url.includes(url) && 'focus' in w ? (w.focus(), true) : false,
        );
        if (!hadWindow && self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return undefined;
      }),
  );
});

