type BrowserSessionStorage = { localStorage: Storage; sessionStorage: Storage }
export type StoredAdminSession = { token: string; admin: any }

export function readStoredAdminSession(storage: BrowserSessionStorage): StoredAdminSession | null {
  // Another tab's newly signed-in session must beat this tab's stale copy.
  for (const source of [storage.localStorage, storage.sessionStorage]) {
    try {
      const token = source.getItem('adminToken')
      const user = source.getItem('adminUser')
      if (token && user) return { token, admin: JSON.parse(user) }
    } catch {}
  }
  return null
}

export function getStoredAdminToken() {
  if (typeof window === 'undefined') return ''
  return readStoredAdminSession(window)?.token || ''
}

export function writeStoredAdminSession(storage: BrowserSessionStorage, session: StoredAdminSession) {
  for (const source of [storage.localStorage, storage.sessionStorage]) {
    source.setItem('adminUser', JSON.stringify(session.admin))
    source.setItem('adminToken', session.token)
  }
}

export async function refreshStoredAdminSession(storage: BrowserSessionStorage, request: typeof fetch = fetch) {
  const current = readStoredAdminSession(storage)
  if (!current) return { session: null, invalid: false }
  try {
    const response = await request('/api/admin/refresh-token', {
      method: 'POST', headers: { Authorization: `Bearer ${current.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const latest = readStoredAdminSession(storage)
    // A delayed response must never replace/clear another tab's fresh login/logout.
    if (latest?.token !== current.token) return { session: latest, invalid: false }
    if (response.status === 401 || response.status === 403) return { session: null, invalid: true }
    if (!response.ok) return { session: current, invalid: false }
    const data = await response.json()
    if (readStoredAdminSession(storage)?.token !== current.token) {
      return { session: readStoredAdminSession(storage), invalid: false }
    }
    if (typeof data?.token !== 'string' || !data.token || !data?.admin) return { session: current, invalid: false }
    const next = { token: data.token, admin: data.admin }
    writeStoredAdminSession(storage, next)
    return { session: next, invalid: false }
  } catch {
    // Network/server trouble is not evidence the owner signed out.
    return { session: readStoredAdminSession(storage), invalid: false }
  }
}
