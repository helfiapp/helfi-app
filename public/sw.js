// Service Worker with three roles:
// 1) Keep PWA install/push notifications working.
// 2) Hold a long-lived refresh token in IndexedDB (survives iOS PWA resume better than cookies).
// 3) Before navigations or when asked by the page, exchange that refresh token for fresh HttpOnly session cookies.

// ---------- Install/activate ----------
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------- Lightweight IndexedDB helpers for the refresh token ----------
const DB_NAME = 'helfi-auth';
const DB_VERSION = 2;
const STORE = 'refresh';
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

async function saveRefreshToken(value) {
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

async function readRefreshToken() {
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

async function clearRefreshToken() {
  memoryCache = null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('token');
  } catch (err) {}
}

// ---------- Message bridge: page -> SW to cache refresh token ----------
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if ((data.type === 'SET_REFRESH_TOKEN' || data.type === 'SET_REMEMBER_TOKEN') && data.token) {
    saveRefreshToken({ token: data.token, exp: data.exp || 0 });
  }
  if (data.type === 'CLEAR_REFRESH_TOKEN' || data.type === 'CLEAR_REMEMBER_TOKEN') {
    clearRefreshToken();
  }
  if (data.type === 'REFRESH_SESSION_NOW') {
    refreshSession();
  }
});

// ---------- Auth restore on navigation or explicit request ----------
let lastRestoreAt = 0;
async function refreshSession() {
  const now = Date.now();
  if (now - lastRestoreAt < 5000) return; // throttle to avoid loops
  const cached = await readRefreshToken();
  if (!cached || !cached.token) return;
  if (cached.exp && cached.exp * 1000 < now) {
    await clearRefreshToken();
    return;
  }
  lastRestoreAt = now;
  try {
    await fetch(`${self.location.origin}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-helfi-refresh-token': cached.token },
      credentials: 'include',
      body: JSON.stringify({ token: cached.token }),
    });
  } catch (err) {
    // ignore refresh errors
  }
}

// ---------- Attach auth header so middleware can reissue if needed ----------
async function withAuthHeader(request) {
  const cached = await readRefreshToken();
  if (!cached || !cached.token) return request;
  if (cached.exp && cached.exp * 1000 < Date.now()) {
    await clearRefreshToken();
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set('x-helfi-refresh-token', cached.token);
  return new Request(request, { headers });
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
        await refreshSession();
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
