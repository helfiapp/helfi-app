import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

/**
 * Refresh admin token - extends expiration if token is still valid
 * This allows admins to stay logged in without re-authenticating
 */
export async function POST(request: NextRequest) {
  try {
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Admin login secret not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    // Important: admins reported "refresh token" doesn't work once the JWT is expired.
    // We allow refreshing an expired token if it is still correctly signed, and not too old.
    let decoded: any = null
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true })
    } catch {
      decoded = null
    }

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Safety: don't allow refreshing indefinitely if someone stole an old token.
    // If the token was originally issued more than 30 days ago, require re-login.
    const iatSeconds = typeof decoded.iat === 'number' ? decoded.iat : null
    if (iatSeconds) {
      const ageMs = Date.now() - iatSeconds * 1000
      const maxAgeMs = 30 * 24 * 60 * 60 * 1000
      if (ageMs > maxAgeMs) {
        return NextResponse.json({ error: 'Token too old. Please log in again.' }, { status: 401 })
      }
    }

    // Verify admin user still exists and is active
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: String(decoded.adminId || '') },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    })

    if (!adminUser || !adminUser.isActive) {
      return NextResponse.json({ error: 'Admin user not found or inactive' }, { status: 401 })
    }

    // Create new token with extended expiration (7 days)
    const newToken = jwt.sign(
      {
        adminId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      success: true,
      token: newToken,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    })
  } catch (error) {
    console.error('Error refreshing admin token:', error)
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 })
  }
}
