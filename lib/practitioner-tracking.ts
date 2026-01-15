import { createHmac, timingSafeEqual } from 'crypto'

const TRACKING_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getTrackingSecret(): string | null {
  const secret = (process.env.PRACTITIONER_TRACKING_SECRET || process.env.SCHEDULER_SECRET || '').trim()
  return secret || null
}

export function createTrackingToken(listingId: string): string | null {
  const secret = getTrackingSecret()
  if (!secret) return null
  const expiresAt = Date.now() + TRACKING_TTL_MS
  const payload = `${listingId}.${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}

export function verifyTrackingToken(listingId: string, token: string): boolean {
  const secret = getTrackingSecret()
  if (!secret || !token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [tokenListingId, expiresAtRaw, signature] = parts
  if (tokenListingId !== listingId) return false
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false
  const payload = `${tokenListingId}.${expiresAt}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
