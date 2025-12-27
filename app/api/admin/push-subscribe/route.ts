import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { mergeSubscriptionList, normalizeSubscriptionList } from '@/lib/push-subscriptions'

async function ensurePushSubscriptionsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PushSubscriptions (
      userId TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE PushSubscriptions ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP NOT NULL DEFAULT NOW()`
  ).catch(() => {})
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmail = admin.email.toLowerCase()

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
    await ensurePushSubscriptionsTable()
    const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )
    const merged = mergeSubscriptionList(rows[0]?.subscription, subscription)
    if (rows.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE PushSubscriptions SET subscription = $2::jsonb, updatedAt = NOW() WHERE userId = $1`,
        user.id,
        JSON.stringify(merged)
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO PushSubscriptions (userId, subscription, updatedAt) VALUES ($1, $2::jsonb, NOW())`,
        user.id,
        JSON.stringify(merged)
      )
    }

    return NextResponse.json({ success: true, subscriptionCount: merged.length })
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
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmail = admin.email.toLowerCase()

    // Find User account for admin
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ hasSubscription: false })
    }

    // Check for push subscription
    await ensurePushSubscriptionsTable()
    
    const rows: Array<{ subscription: any; updatedAt: Date | null }> = await prisma.$queryRawUnsafe(
      `SELECT subscription, updatedAt FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )
    const subscriptionCount = rows.length ? normalizeSubscriptionList(rows[0].subscription).length : 0

    return NextResponse.json({
      hasSubscription: subscriptionCount > 0,
      lastUpdated: rows[0]?.updatedAt ?? null,
      subscriptionCount
    })
  } catch (e) {
    console.error('admin push status error', e)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmail = admin.email.toLowerCase()

    // Find User account for admin
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ success: true }) // nothing to delete
    }

    // Ensure table and delete subscription
    await ensurePushSubscriptionsTable()
    await prisma.$executeRawUnsafe(
      `DELETE FROM PushSubscriptions WHERE userId = $1`,
      user.id
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin push unsubscribe error', e)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
