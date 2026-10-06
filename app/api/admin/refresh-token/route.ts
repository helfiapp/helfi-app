import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issueAdminSession, verifyAdminRefreshClaims, canRefreshAdminSession } from '@/lib/admin-session'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

/**
 * Renew a signed, active, credential-bound remembered admin session.
 * Expired access alone does not force a new password/authenticator login.
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
    const decoded = verifyAdminRefreshClaims(token, JWT_SECRET)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid admin session' }, { status: 401 })
    }

    // Verify admin user still exists and is active
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: String(decoded.adminId || '') },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        password: true
      }
    })

    if (!adminUser || !canRefreshAdminSession(decoded, adminUser, JWT_SECRET)) {
      return NextResponse.json({ error: 'Admin user not found or inactive' }, { status: 401 })
    }

    const newToken = issueAdminSession(adminUser, JWT_SECRET)

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
