import crypto from 'crypto'

const REVIEW_TOKEN_VERSION = 'v1'
export const NATIVE_VOICE_REVIEW_MAX_AGE_MS = 30 * 60 * 1000
const REVIEW_TOKEN_FUTURE_ALLOWANCE_MS = 60 * 1000

function reviewTokenSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Native voice review token secret is not configured.')
  }
  return 'helfi-native-voice-review-token-local'
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== 'reviewToken')
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

function reviewPayload(userId: string, draft: any) {
  return JSON.stringify({
    userId,
    draft: stableValue(draft || {}),
  })
}

export function signNativeVoiceDraft(userId: string, draft: any) {
  const digest = crypto
    .createHmac('sha256', reviewTokenSecret())
    .update(reviewPayload(userId, draft))
    .digest('base64url')
  return `${REVIEW_TOKEN_VERSION}.${digest}`
}

export function verifyNativeVoiceDraft(userId: string, draft: any) {
  const issuedAt = draft?.reviewIssuedAt
  const now = Date.now()
  if (
    typeof issuedAt !== 'number' ||
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    now - issuedAt > NATIVE_VOICE_REVIEW_MAX_AGE_MS ||
    issuedAt - now > REVIEW_TOKEN_FUTURE_ALLOWANCE_MS
  ) return false
  const token = String(draft?.reviewToken || '')
  if (!token.startsWith(`${REVIEW_TOKEN_VERSION}.`)) return false
  const expected = signNativeVoiceDraft(userId, draft)
  const expectedBuffer = Buffer.from(expected)
  const tokenBuffer = Buffer.from(token)
  if (expectedBuffer.length !== tokenBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer)
}
