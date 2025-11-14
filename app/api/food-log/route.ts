import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

// Fetch logs for a specific date (YYYY-MM-DD)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') // YYYY-MM-DD (local date)
    const tzOffsetMinRaw = searchParams.get('tz') // minutes: same as new Date().getTimezoneOffset()
    if (!dateStr) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build a UTC window that corresponds to the user's local day
    // If tz is supplied (minutes difference between UTC and local), shift window by -tz
    const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
    const tzMin = Number.isFinite(parseInt(tzOffsetMinRaw || '')) ? parseInt(tzOffsetMinRaw || '0', 10) : 0
    const startUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) - tzMin * 60 * 1000
    const endUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999) - tzMin * 60 * 1000
    const start = new Date(startUtcMs)
    const end = new Date(endUtcMs)

    const logs = await prisma.foodLog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, logs })
  } catch (error) {
    console.error('GET /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 })
  }
}

// Append a log entry (non-blocking usage recommended)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { description, nutrition, imageUrl } = body || {}
    const name = (description || '')
      .toString()
      .split('\n')[0]
      .split('Calories:')[0]
      .split(',')[0]
      .split('.')[0]
      .trim() || 'Food item'

    const created = await prisma.foodLog.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        imageUrl: imageUrl || null,
        nutrients: nutrition || null,
      },
    })

    // Trigger background regeneration of nutrition insights
    // This happens asynchronously - user doesn't wait
    triggerBackgroundRegeneration({
      userId: user.id,
      changeType: 'food',
      timestamp: new Date(),
    }).catch((error) => {
      console.warn('⚠️ Failed to trigger nutrition insights regeneration', error)
    })

    console.log('🔄 Triggered background regeneration for nutrition insights')

    return NextResponse.json({ success: true, id: created.id })
  } catch (error) {
    console.error('POST /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to save log' }, { status: 500 })
  }
}

// Legacy DELETE handler kept for compatibility with older clients
// Newer clients can use POST /api/food-log/delete, but both share the same logic.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const id = String((body as any)?.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Ensure the log belongs to the user
    const existing = await prisma.foodLog.findUnique({ where: { id: id as any } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.foodLog.delete({ where: { id: id as any } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}

