import { sendOwnerErrorAlertEmail } from '@/lib/admin-alerts'

type ErrorReportOptions = {
  source: string
  error: unknown
  userId?: string
  userEmail?: string
  details?: Record<string, unknown>
}

type ErrorReportCacheEntry = {
  lastSentAt: number
  count: number
}

const REPORT_THROTTLE_MS = 60 * 60 * 1000
const MAX_DETAILS_LENGTH = 2000

const globalForErrorReporter = globalThis as typeof globalThis & {
  __helfiErrorReportCache?: Map<string, ErrorReportCacheEntry>
}

const cache = globalForErrorReporter.__helfiErrorReportCache ?? new Map<string, ErrorReportCacheEntry>()
if (!globalForErrorReporter.__helfiErrorReportCache) {
  globalForErrorReporter.__helfiErrorReportCache = cache
}

function normalizeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || '',
    }
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: error, stack: '' }
  }
  return { name: 'Error', message: 'Unknown error', stack: '' }
}

function buildFingerprint(source: string, message: string): string {
  const trimmed = (message || 'Unknown error').slice(0, 140)
  return `${source}::${trimmed}`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value || '')
  }
}

export async function reportCriticalError(options: ErrorReportOptions): Promise<void> {
  try {
    const normalized = normalizeError(options.error)
    const fingerprint = buildFingerprint(options.source, normalized.message)
    const now = Date.now()
    const entry = cache.get(fingerprint)

    if (entry && now - entry.lastSentAt < REPORT_THROTTLE_MS) {
      entry.count += 1
      cache.set(fingerprint, entry)
      return
    }

    const count = (entry?.count ?? 0) + 1
    cache.set(fingerprint, { lastSentAt: now, count })

    const detailsPayload = {
      ...options.details,
      errorName: normalized.name,
      errorMessage: normalized.message,
      errorStack: normalized.stack,
    }
    const details = safeStringify(detailsPayload).slice(0, MAX_DETAILS_LENGTH)

    await sendOwnerErrorAlertEmail({
      source: options.source,
      message: normalized.message,
      userId: options.userId,
      userEmail: options.userEmail,
      count,
      details,
    })
  } catch (error) {
    console.error('❌ [ERROR REPORTER] Failed to report error:', error)
  }
}
