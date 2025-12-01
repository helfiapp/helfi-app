// Service Worker with three roles:
// 1) Keep PWA install/push notifications working.
// 2) Restore auth cookies on iOS PWA resume using stored remember token.
// 3) If cookies are gone, attach a short-lived auth header so the server can reissue cookies on the next request.

// ---------- Install/activate ----------
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------- Lightweight IndexedDB helpers for the remember token ----------
const DB_NAME = 'helfi-auth';
const DB_VERSION = 1;
const STORE = 'remember';
let memoryCache = null; // quick in-memory cache to reduce IDB reads

function openDb() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRememberToken(value) {
  memoryCache = value;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, 'token');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return false;
  }
}

async function readRememberToken() {
  if (memoryCache) return memoryCache;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('token');
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

async function clearRememberToken() {
  memoryCache = null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('token');
  } catch (err) {}
}

// ---------- Message bridge: page -> SW to cache remember token ----------
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_REMEMBER_TOKEN' && data.token) {
    saveRememberToken({ token: data.token, exp: data.exp || 0 });
  }
  if (data.type === 'CLEAR_REMEMBER_TOKEN') {
    clearRememberToken();
  }
});

// ---------- Attach auth header when cookies are missing ----------
async function withAuthHeader(request) {
  const cached = await readRememberToken();
  if (!cached || !cached.token) return request;
  const headers = new Headers(request.headers);
  headers.set('x-helfi-remember-token', cached.token);
  return new Request(request, { headers });
}

// ---------- Auth restore on navigation ----------
let lastRestoreAt = 0;
async function maybeRestoreSession() {
  const now = Date.now();
  if (now - lastRestoreAt < 5000) return; // throttle to avoid loops
  const cached = await readRememberToken();
  if (!cached || !cached.token) return;
  if (cached.exp && cached.exp < now) {
    await clearRememberToken();
    return;
  }
  lastRestoreAt = now;
  try {
    await fetch(`${self.location.origin}/api/auth/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: cached.token }),
    });
  } catch (err) {
    // ignore restore errors
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const isSameOrigin = request.url.startsWith(self.location.origin);
  const shouldTryRestore =
    request.method === 'GET' &&
    request.mode === 'navigate' &&
    isSameOrigin;

  event.respondWith(
    (async () => {
      if (shouldTryRestore) {
        await maybeRestoreSession();
      }
      if (isSameOrigin) {
        try {
          const authRequest = await withAuthHeader(request);
          return fetch(authRequest);
        } catch {
          return fetch(request);
        }
      }
      return fetch(request);
    })()
  );
});

// ---------- Push notifications ----------
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

