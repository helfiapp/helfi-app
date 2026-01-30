import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'
import { verifyAdminToken } from '@/lib/admin-auth'

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
    const decoded = verifyAdminToken(token)

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Verify admin user still exists and is active
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: decoded.adminId },
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
