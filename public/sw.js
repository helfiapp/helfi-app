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
  const target = new URL(rawUrl, self.location.origin);
  if (!target.searchParams.has('notificationOpen')) {
    target.searchParams.set('notificationOpen', '1');
  }
  const targetUrl = target.href;
  const notifyOpen = () =>
    fetch('/api/notifications/notification-open', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  const sameUrl = (a, b) => {
    try {
      return new URL(a).href === new URL(b).href;
    } catch (e) {
      return false;
    }
  };

  const handleClick = async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const alreadyAtTarget = clientsArr.find((client) => client && client.url && sameUrl(client.url, targetUrl));
    if (alreadyAtTarget) {
      if ('focus' in alreadyAtTarget) {
        await alreadyAtTarget.focus();
      }
      return undefined;
    }

    const preferred =
      clientsArr.find((client) => client && client.focused) ||
      clientsArr.find((client) => client && client.visibilityState === 'visible') ||
      clientsArr[0];

    if (preferred) {
      try {
        if ('navigate' in preferred) {
          await preferred.navigate(targetUrl);
        }
      } catch (e) {
        // Ignore navigation failures
      }
      try {
        preferred.postMessage({ type: 'navigate', url: targetUrl });
      } catch (e) {
        // Ignore message failures
      }
      try {
        if ('focus' in preferred) {
          await preferred.focus();
        }
      } catch (e) {
        // Ignore focus failures
      }
      return undefined;
    }

    if (self.clients.openWindow) {
      const opened = await self.clients.openWindow(targetUrl);
      if (opened && 'focus' in opened) {
        await opened.focus();
      }
    }
    return undefined;
  };

  event.waitUntil(
    (async () => {
      try {
        await notifyOpen();
      } catch (e) {
        // Ignore notify failures
      }
      await handleClick();
    })(),
  );
});
