'use client'

export type LocalMoodMediaKind = 'image' | 'audio'

export type LocalMoodMediaRecord = {
  id: string
  kind: LocalMoodMediaKind
  blob: Blob
  fileName: string
  mimeType: string
  createdAt: number
}

const DB_NAME = 'helfi-local-media'
const DB_VERSION = 1
const STORE_NAME = 'mood-media'
const ENTRY_MAP_KEY = 'helfi-mood-entry-media-map-v1'

type EntryMediaMap = Record<string, string[]>

const isBrowser = () =>
  typeof window !== 'undefined' && typeof indexedDB !== 'undefined'

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error('Local media storage is not available in this environment'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open local media database'))
  })

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    let settled = false

    const done = (value: T) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error)
    }

    tx.onerror = () => fail(tx.error || new Error('Local media transaction failed'))
    tx.onabort = () => fail(tx.error || new Error('Local media transaction aborted'))
    tx.oncomplete = () => {
      db.close()
    }

    run(store, done, fail)
  })
}

export async function saveLocalMoodMedia(record: LocalMoodMediaRecord): Promise<void> {
  await withStore<void>('readwrite', (store, done, fail) => {
    const request = store.put(record)
    request.onsuccess = () => done()
    request.onerror = () => fail(request.error || new Error('Failed to save local media'))
  })
}

export async function getLocalMoodMedia(id: string): Promise<LocalMoodMediaRecord | null> {
  return withStore<LocalMoodMediaRecord | null>('readonly', (store, done, fail) => {
    const request = store.get(id)
    request.onsuccess = () => done((request.result as LocalMoodMediaRecord) || null)
    request.onerror = () => fail(request.error || new Error('Failed to load local media'))
  })
}

export async function getLocalMoodMediaMany(ids: string[]): Promise<LocalMoodMediaRecord[]> {
  const results: LocalMoodMediaRecord[] = []
  for (const id of ids) {
    const item = await getLocalMoodMedia(id)
    if (item) results.push(item)
  }
  return results
}

export async function deleteLocalMoodMedia(id: string): Promise<void> {
  await withStore<void>('readwrite', (store, done, fail) => {
    const request = store.delete(id)
    request.onsuccess = () => done()
    request.onerror = () => fail(request.error || new Error('Failed to delete local media'))
  })
}

const readEntryMediaMap = (): EntryMediaMap => {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(ENTRY_MAP_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown] => Array.isArray((entry as any)[1]))
        .map(([key, value]) => [
          key,
          (value as unknown[])
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        ]),
    )
  } catch {
    return {}
  }
}

const writeEntryMediaMap = (map: EntryMediaMap) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ENTRY_MAP_KEY, JSON.stringify(map))
}

export function getEntryMediaIds(entryId: string): string[] {
  const map = readEntryMediaMap()
  return map[entryId] || []
}

export function setEntryMediaIds(entryId: string, mediaIds: string[]) {
  const map = readEntryMediaMap()
  const cleaned = Array.from(
    new Set(mediaIds.map((item) => String(item || '').trim()).filter(Boolean)),
  )
  if (cleaned.length === 0) {
    delete map[entryId]
  } else {
    map[entryId] = cleaned
  }
  writeEntryMediaMap(map)
}

export function removeEntryMediaIds(entryId: string) {
  const map = readEntryMediaMap()
  if (map[entryId]) {
    delete map[entryId]
    writeEntryMediaMap(map)
  }
}

export function getAllEntryMediaMap(): EntryMediaMap {
  return readEntryMediaMap()
}
