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
  const rawUrl =
    (event.notification && event.notification.data && event.notification.data.url) || '/check-in';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientsArr) => {
        let navigated = false;
        if (clientsArr.length) {
          await Promise.all(
            clientsArr.map(async (client) => {
              try {
                client.postMessage({ type: 'navigate', url: targetUrl });
              } catch (e) {
                // Ignore postMessage failures
              }
              if ('navigate' in client) {
                try {
                  await client.navigate(targetUrl);
                  navigated = true;
                } catch (e) {
                  // Ignore navigation failures
                }
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
