import { createSignedBlobToken, SignedBlobScope } from '@/lib/signed-blob'
import { extractBlobPathWithPrefixes, normalizeBlobPath } from '@/lib/blob-paths'

const BLOB_SCOPE_PREFIXES: Record<SignedBlobScope, string[]> = {
  'food-photo': ['food-photos/'],
  'support': ['support/', 'support/inquiry/'],
  'mood-journal': ['mood-journal/'],
}

export const isPathAllowedForScope = (path: string, scope: SignedBlobScope) =>
  BLOB_SCOPE_PREFIXES[scope].some((prefix) => path.startsWith(prefix))

export const extractScopedBlobPath = (
  value: string | null | undefined,
  scope: SignedBlobScope,
) => extractBlobPathWithPrefixes(value, BLOB_SCOPE_PREFIXES[scope])

export const buildSignedBlobUrl = (
  path: string,
  scope: SignedBlobScope,
  expiresInSeconds = 900,
): string | null => {
  const normalized = normalizeBlobPath(path)
  if (!isPathAllowedForScope(normalized, scope)) return null
  const token = createSignedBlobToken({ path: normalized, scope }, expiresInSeconds)
  return `/api/blob?path=${encodeURIComponent(normalized)}&token=${encodeURIComponent(token)}`
}

export const mapToSignedBlobUrl = (
  value: string | null | undefined,
  scope: SignedBlobScope,
  expiresInSeconds = 900,
): string | null => {
  const path = extractScopedBlobPath(value, scope)
  if (!path) return null
  return buildSignedBlobUrl(path, scope, expiresInSeconds)
}

export { BLOB_SCOPE_PREFIXES, normalizeBlobPath }
