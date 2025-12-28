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

export type SignedFilePayload = {
  fileId: string
  userId: string
  usage: 'MEDICAL_IMAGE' | 'LAB_REPORT'
}

export function createSignedFileToken(payload: SignedFilePayload, expiresInSeconds = 600): string {
  return jwt.sign(payload, SIGNING_SECRET, { expiresIn: expiresInSeconds })
}

export function verifySignedFileToken(token: string): SignedFilePayload | null {
  try {
    const decoded = jwt.verify(token, SIGNING_SECRET) as SignedFilePayload
    if (!decoded?.fileId || !decoded?.userId || !decoded?.usage) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}
