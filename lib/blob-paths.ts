const BLOB_HOST = 'blob.vercel-storage.com'
const BLOB_PROXY_PATH = '/api/blob'

const normalizeBlobPath = (path: string) => path.replace(/^\/+/, '')

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value)

const extractFromProxyUrl = (value: string): string | null => {
  if (!value.startsWith(BLOB_PROXY_PATH)) return null
  try {
    const parsed = new URL(value, 'http://localhost')
    const path = parsed.searchParams.get('path')
    if (!path) return null
    return normalizeBlobPath(path)
  } catch {
    return null
  }
}

const extractFromBlobUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value)
    if (!parsed.hostname.includes(BLOB_HOST)) return null
    return normalizeBlobPath(parsed.pathname)
  } catch {
    return null
  }
}

export const extractBlobPath = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith(BLOB_PROXY_PATH)) {
    return extractFromProxyUrl(trimmed)
  }

  if (looksLikeUrl(trimmed)) {
    return extractFromBlobUrl(trimmed)
  }

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null

  return normalizeBlobPath(trimmed)
}

export const extractBlobPathWithPrefixes = (
  value: string | null | undefined,
  prefixes: string[],
): string | null => {
  const path = extractBlobPath(value)
  if (!path) return null
  if (!prefixes.some((prefix) => path.startsWith(prefix))) return null
  return path
}

export const isBlobPath = (value: string | null | undefined, prefixes: string[]) =>
  Boolean(extractBlobPathWithPrefixes(value, prefixes))

export { normalizeBlobPath }
