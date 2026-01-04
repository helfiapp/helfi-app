// Minimal placeholder service worker for PWA install and push notifications.
// This version deliberately does NOT manage authentication or cookies.
// GUARD RAIL: Notification routing is locked. Do not change without owner approval.

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
  const rawUrl =
    (event.notification && event.notification.data && event.notification.data.url) || '/check-in';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  const sameUrl = (a, b) => {
    try {
      return new URL(a).href === new URL(b).href;
    } catch (e) {
      return false;
    }
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientsArr) => {
        let navigated = false;
        if (clientsArr.length) {
          navigated = true;
          await Promise.all(
            clientsArr.map(async (client) => {
              if (client && client.url && sameUrl(client.url, targetUrl)) {
                if ('focus' in client) {
                  client.focus();
                }
                return;
              }
              try {
                client.postMessage({ type: 'navigate', url: targetUrl });
              } catch (e) {
                // Ignore postMessage failures
              }
              if ('focus' in client) {
                client.focus();
              }
            }),
          );
        }
        if (!navigated && self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
