import crypto from 'crypto'

export type NativeDeviceOauthProvider = 'fitbit' | 'garmin'

type NativeDeviceOauthTicketPayload = {
  provider: NativeDeviceOauthProvider
  userId: string
  exp: number
  nonce: string
}

const TTL_MS = 15 * 60 * 1000

function getSecret() {
  const secret = String(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').trim()
  if (!secret) throw new Error('Auth secret is not configured')
  return secret
}

function signPayload(payloadSegment: string) {
  return crypto.createHmac('sha256', getSecret()).update(payloadSegment).digest('base64url')
}

export function createNativeDeviceOauthTicket(provider: NativeDeviceOauthProvider, userId: string) {
  const payload: NativeDeviceOauthTicketPayload = {
    provider,
    userId,
    exp: Date.now() + TTL_MS,
    nonce: crypto.randomUUID(),
  }
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadSegment}.${signPayload(payloadSegment)}`
}

export function verifyNativeDeviceOauthTicket(
  ticket: string | null | undefined,
  provider?: NativeDeviceOauthProvider,
): NativeDeviceOauthTicketPayload | null {
  const raw = String(ticket || '').trim()
  const [payloadSegment, signature] = raw.split('.')
  if (!payloadSegment || !signature) return null

  const expected = signPayload(payloadSegment)
  const expectedBytes = Buffer.from(expected)
  const signatureBytes = Buffer.from(signature)
  if (expectedBytes.length !== signatureBytes.length) return null
  if (!crypto.timingSafeEqual(expectedBytes, signatureBytes)) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as NativeDeviceOauthTicketPayload
    if (!payload?.userId || !payload.provider || !payload.exp) return null
    if (provider && payload.provider !== provider) return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
