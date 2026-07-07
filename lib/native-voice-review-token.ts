import crypto from 'crypto'

const REVIEW_TOKEN_VERSION = 'v1'

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
  const token = String(draft?.reviewToken || '')
  if (!token.startsWith(`${REVIEW_TOKEN_VERSION}.`)) return false
  const expected = signNativeVoiceDraft(userId, draft)
  const expectedBuffer = Buffer.from(expected)
  const tokenBuffer = Buffer.from(token)
  if (expectedBuffer.length !== tokenBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer)
}
