import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'helfi-admin-secret-2024'

export interface AdminTokenPayload {
  adminId: string
  email: string
  role: string
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminTokenPayload
    return decoded
  } catch (error) {
    return null
  }
}

export function extractAdminFromHeaders(authHeader: string | null): AdminTokenPayload | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  return verifyAdminToken(token)
} 