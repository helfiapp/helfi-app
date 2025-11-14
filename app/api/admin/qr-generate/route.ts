import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || 'helfi-admin-secret-2024'

// Store active QR tokens (in production, use Redis or database)
const activeQRTokens = new Map<string, { adminId: string; email: string; expiresAt: number }>()

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now()
  const tokensToDelete: string[] = []
  activeQRTokens.forEach((data, token) => {
    if (data.expiresAt < now) {
      tokensToDelete.push(token)
    }
  })
  tokensToDelete.forEach(token => activeQRTokens.delete(token))
}, 5 * 60 * 1000)

export async function GET(request: NextRequest) {
  try {
    // Verify admin is authenticated
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate a unique QR token (valid for 5 minutes)
    const qrToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes

    // Store token with admin info
    activeQRTokens.set(qrToken, {
      adminId: admin.adminId,
      email: admin.email,
      expiresAt
    })

    // Get app URL from request or environment
    const origin = request.headers.get('origin') || request.headers.get('host')
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (origin ? `${protocol}://${origin}` : 'https://helfi.ai')
    
    // Return QR code data URL
    const qrData = {
      token: qrToken,
      url: `${baseUrl}/admin-panel/qr-login?token=${qrToken}`,
      expiresAt
    }

    return NextResponse.json({ success: true, qrData })
  } catch (error) {
    console.error('Error generating QR code:', error)
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 })
  }
}

// Endpoint to verify QR token and get admin info
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    const qrData = activeQRTokens.get(token)
    
    if (!qrData) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if (qrData.expiresAt < Date.now()) {
      activeQRTokens.delete(token)
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Get admin user details
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: qrData.adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    })

    if (!adminUser || !adminUser.isActive) {
      return NextResponse.json({ error: 'Admin user not found or inactive' }, { status: 404 })
    }

    // Create JWT token for the mobile session
    const jwtToken = jwt.sign(
      {
        adminId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    // Remove QR token (one-time use)
    activeQRTokens.delete(token)

    // Update last login
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLogin: new Date() }
    })

    return NextResponse.json({
      success: true,
      token: jwtToken,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    })
  } catch (error) {
    console.error('Error verifying QR token:', error)
    return NextResponse.json({ error: 'Failed to verify token' }, { status: 500 })
  }
}

