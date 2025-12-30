type CacheEntry<T> = {
  data: T
  updatedAt: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
const STORAGE_PREFIX = 'helfi.cache.'

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readClientCache<T>(key: string): CacheEntry<T> | null {
  if (!key) return null
  const mem = memoryCache.get(key)
  if (mem) return mem as CacheEntry<T>
  if (!canUseStorage()) return null

  try {
    const raw = window.localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export function writeClientCache<T>(key: string, data: T): CacheEntry<T> {
  const entry: CacheEntry<T> = { data, updatedAt: Date.now() }
  if (!key) return entry
  memoryCache.set(key, entry)
  if (!canUseStorage()) return entry
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch {}
  return entry
}

export function clearClientCache(prefix?: string) {
  if (!canUseStorage()) {
    if (!prefix) {
      memoryCache.clear()
    } else {
      for (const key of memoryCache.keys()) {
        if (key.startsWith(prefix)) memoryCache.delete(key)
      }
    }
    return
  }

  if (!prefix) {
    memoryCache.clear()
    try {
      Object.keys(window.localStorage).forEach((key) => {
        if (key.startsWith(STORAGE_PREFIX)) {
          window.localStorage.removeItem(key)
        }
      })
    } catch {}
    return
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }
  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith(STORAGE_PREFIX + prefix)) {
        window.localStorage.removeItem(key)
      }
    })
  } catch {}
}

export function isCacheFresh(entry: CacheEntry<unknown> | null, maxAgeMs: number) {
  if (!entry) return false
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false
  return Date.now() - entry.updatedAt <= maxAgeMs
}
