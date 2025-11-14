import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

function getFallbackAdminEmail(authHeader: string | null) {
  if (authHeader && authHeader.includes('temp-admin-token')) {
    return (process.env.OWNER_EMAIL || 'admin@helfi.ai').toLowerCase()
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const fallbackEmail = getFallbackAdminEmail(authHeader)
    
    if (!admin && !fallbackEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmail = (admin?.email || fallbackEmail!).toLowerCase()

    const { subscription } = await req.json()
    if (!subscription) {
      return NextResponse.json({ error: 'Missing subscription' }, { status: 400 })
    }

    // Find or create User account for admin (push subscriptions use User table)
    let user = await prisma.user.findUnique({
      where: { email: adminEmail }
    })

    if (!user) {
      // Create a User account for the admin (for push notifications)
      user = await prisma.user.create({
        data: {
          email: adminEmail,
          name: adminEmail.split('@')[0],
          emailVerified: new Date() // Auto-verify admin accounts
        }
      })
    }

    // Save push subscription
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)
    
    await prisma.$executeRawUnsafe(
      `INSERT INTO PushSubscriptions (userId, subscription) VALUES ($1, $2::jsonb)
       ON CONFLICT (userId) DO UPDATE SET subscription=EXCLUDED.subscription`,
      user.id, JSON.stringify(subscription)
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin push subscribe save error', e)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    const fallbackEmail = getFallbackAdminEmail(authHeader)
    
    if (!admin && !fallbackEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmail = (admin?.email || fallbackEmail!).toLowerCase()

    // Find User account for admin
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ hasSubscription: false })
    }

    // Check for push subscription
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)
    
    const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )

    return NextResponse.json({ hasSubscription: rows.length > 0 })
  } catch (e) {
    console.error('admin push status error', e)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}

