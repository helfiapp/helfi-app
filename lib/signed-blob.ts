import jwt from 'jsonwebtoken'

const SIGNING_SECRET = (() => {
  const secret =
    process.env.FILE_URL_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET

  if (!secret) {
    throw new Error('FILE_URL_SIGNING_SECRET or NEXTAUTH_SECRET is required')
  }

  return secret
})()

export type SignedBlobScope = 'food-photo' | 'support' | 'mood-journal'

export type SignedBlobPayload = {
  path: string
  scope: SignedBlobScope
}

export function createSignedBlobToken(
  payload: SignedBlobPayload,
  expiresInSeconds = 900,
): string {
  return jwt.sign(payload, SIGNING_SECRET, { expiresIn: expiresInSeconds })
}

export function verifySignedBlobToken(token: string): SignedBlobPayload | null {
  try {
    const decoded = jwt.verify(token, SIGNING_SECRET) as SignedBlobPayload
    if (!decoded?.path || !decoded?.scope) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}
