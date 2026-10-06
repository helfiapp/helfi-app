import jwt from 'jsonwebtoken'
import { createHmac, timingSafeEqual } from 'node:crypto'

type AdminSessionAccount = {
  id: string
  email: string
  role: string
  password: string
  isActive: boolean
}

export type AdminRefreshClaims = {
  adminId: string
  email: string
  role: string
  iat: number
  exp: number
  sessionVersion?: string
}

function sessionVersion(admin: AdminSessionAccount, secret: string) {
  return createHmac('sha256', secret)
    .update(JSON.stringify([admin.id, admin.email, admin.role, admin.password]))
    .digest('hex')
}

export function issueAdminSession(admin: AdminSessionAccount, secret: string) {
  return jwt.sign({
    adminId: admin.id,
    email: admin.email,
    role: admin.role,
    sessionVersion: sessionVersion(admin, secret),
  }, secret, { algorithm: 'HS256', expiresIn: '7d' })
}

// Expired access tokens are accepted only here, to renew the remembered browser.
// Ordinary admin API authentication still checks the seven-day expiration.
export function verifyAdminRefreshClaims(token: string, secret: string): AdminRefreshClaims | null {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], ignoreExpiration: true })
    if (typeof claims === 'string' || !claims.adminId || typeof claims.adminId !== 'string' ||
      typeof claims.email !== 'string' || typeof claims.role !== 'string' ||
      typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat <= 0 ||
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= claims.iat) return null
    return claims as AdminRefreshClaims
  } catch { return null }
}

export function canRefreshAdminSession(claims: AdminRefreshClaims, admin: AdminSessionAccount, secret: string, now = Date.now()) {
  if (!admin.isActive || claims.adminId !== admin.id || claims.email !== admin.email ||
    claims.role !== admin.role || claims.iat * 1000 > now + 60_000) return false
  if (claims.sessionVersion !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(claims.sessionVersion)) return false
    return timingSafeEqual(Buffer.from(claims.sessionVersion, 'hex'), Buffer.from(sessionVersion(admin, secret), 'hex'))
  }
  // Migrate existing sessions within their previous refresh window. New remembered
  // sessions have no idle cutoff, but password/role changes or disabling revoke them.
  return now - claims.iat * 1000 <= 30 * 24 * 60 * 60 * 1000
}
