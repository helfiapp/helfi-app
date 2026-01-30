import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET

async function resolveAdminInfo(authHeader: string | null) {
  const admin = extractAdminFromHeaders(authHeader)
  if (admin) {
    return { adminId: admin.adminId, email: admin.email.toLowerCase() }
  }
  return null
}

// Ensure QR tokens table exists
async function ensureQRTokensTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS QRTokens (
      token TEXT PRIMARY KEY,
      adminId TEXT NOT NULL,
      email TEXT NOT NULL,
      expiresAt BIGINT NOT NULL,
      createdAt TIMESTAMP DEFAULT NOW()
    )
  `)
}

// Clean up expired tokens (run on each request to avoid stale data)
async function cleanupExpiredTokens() {
  const now = Date.now()
  await prisma.$executeRawUnsafe(
    `DELETE FROM QRTokens WHERE expiresAt < $1`,
    now
  )
}

export async function GET(request: NextRequest) {
  try {
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Admin login secret not configured' }, { status: 500 })
    }
    // Verify admin is authenticated (support legacy desktop token)
    const authHeader = request.headers.get('authorization')
    console.log('[QR-GEN] Received request with auth header:', authHeader ? 'Bearer ***' : 'none')
    
    const adminInfo = await resolveAdminInfo(authHeader)
    
    if (!adminInfo) {
      console.error('[QR-GEN] Failed to resolve admin info')
      return NextResponse.json({ 
        error: 'Unauthorized - Could not identify admin user. Make sure OWNER_EMAIL is set correctly.' 
      }, { status: 401 })
    }
    
    console.log('[QR-GEN] Resolved admin info:', { adminId: adminInfo.adminId, email: adminInfo.email })

    // Ensure table exists and clean up expired tokens
    await ensureQRTokensTable()
    await cleanupExpiredTokens()

    // Generate a unique QR token (valid for 5 minutes)
    const qrToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes

    // Store token in database
    await prisma.$executeRawUnsafe(
      `INSERT INTO QRTokens (token, adminId, email, expiresAt) VALUES ($1, $2, $3, $4)`,
      qrToken,
      adminInfo.adminId,
      adminInfo.email,
      expiresAt
    )

    // Verify insert (debug)
    try {
      const verifyRows: Array<{ token: string }> = await prisma.$queryRawUnsafe(
        `SELECT token FROM QRTokens WHERE token = $1`,
        qrToken
      )
      console.log('[QR-GEN] Insert verify for token prefix:', qrToken.substring(0, 20), 'found:', verifyRows.length)
    } catch (e) {
      console.log('[QR-GEN] Insert verification query failed')
    }

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
  } catch (error: any) {
    console.error('[QR-GEN] Error generating QR code:', error)
    return NextResponse.json({ 
      error: `Failed to generate QR code: ${error?.message || 'Unknown error'}` 
    }, { status: 500 })
  }
}

// Endpoint to verify QR token and get admin info
export async function POST(request: NextRequest) {
  try {
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Admin login secret not configured' }, { status: 500 })
    }
    const body = await request.json()
    const token = typeof body?.token === 'string' ? body.token.trim() : ''

    console.log('[QR-VERIFY] Received token:', token ? `${token.substring(0, 20)}... (length: ${token.length})` : 'null')

    if (!token) {
      console.error('[QR-VERIFY] No token provided')
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    // Ensure table exists and clean up expired tokens
    await ensureQRTokensTable()
    await cleanupExpiredTokens()

    // Check how many tokens exist in database (for debugging)
    const allTokens: Array<{ token: string }> = await prisma.$queryRawUnsafe(`SELECT token FROM QRTokens`)
    console.log('[QR-VERIFY] Total tokens in database:', allTokens.length)

    // Look up token in database with explicit aliases to preserve casing of keys
    const rows: Array<{ adminId: string; email: string; expiresAt: any }> = await prisma.$queryRawUnsafe(
      `SELECT adminId AS "adminId", email AS "email", expiresAt AS "expiresAt" FROM QRTokens WHERE token = $1`,
      token
    )

    console.log('[QR-VERIFY] Token lookup result:', rows.length > 0 ? 'Found' : 'Not found')

    if (!rows.length) {
      console.log('[QR-VERIFY] Token not found in database:', token.substring(0, 20))
      // Log first few tokens in DB for comparison
      if (allTokens.length > 0) {
        console.log('[QR-VERIFY] Sample tokens in DB:', allTokens.slice(0, 3).map(t => t.token.substring(0, 20)))
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const qrData = rows[0]
    // Normalize BIGINT from Postgres to Number before comparing
    const expiresAtMs =
      typeof (qrData as any).expiresAt === 'bigint'
        ? Number((qrData as any).expiresAt)
        : Number((qrData as any).expiresAt)

    if (Number.isNaN(expiresAtMs)) {
      console.error('[QR-VERIFY] Invalid expiresAt value for token prefix:', token.substring(0, 20))
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    if (expiresAtMs < Date.now()) {
      // Delete expired token
      await prisma.$executeRawUnsafe(`DELETE FROM QRTokens WHERE token = $1`, token)
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Get admin user details
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: qrData.adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    })

    if (!adminUser || (adminUser as any).isActive === false) {
      return NextResponse.json({ error: 'Admin user not found or inactive' }, { status: 404 })
    }

    // Create JWT token for the mobile session - extended to 7 days
    const jwtToken = jwt.sign(
      {
        adminId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Remove QR token (one-time use)
    await prisma.$executeRawUnsafe(`DELETE FROM QRTokens WHERE token = $1`, token)

    // Update last login (only if AdminUser exists, not for regular User accounts)
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
