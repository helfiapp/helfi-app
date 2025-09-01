import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Fetch logs for a specific date (YYYY-MM-DD)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date') // YYYY-MM-DD
    if (!dateStr) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const start = new Date(dateStr + 'T00:00:00.000Z')
    const end = new Date(dateStr + 'T23:59:59.999Z')

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

    return NextResponse.json({ success: true, id: created.id })
  } catch (error) {
    console.error('POST /api/food-log error', error)
    return NextResponse.json({ error: 'Failed to save log' }, { status: 500 })
  }
}


