import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const raw = (url.searchParams.get('list') || '').split(',')
    const names = raw.map((s) => s.trim()).filter(Boolean)
    if (!names.length) {
      return NextResponse.json({ error: 'No issues provided' }, { status: 400 })
    }

    // Upsert special snapshot record for the current user
    await prisma.healthGoal.deleteMany({ where: { userId: session.user.id, name: '__SELECTED_ISSUES__' } })
    await prisma.healthGoal.create({
      data: {
        userId: session.user.id,
        name: '__SELECTED_ISSUES__',
        category: JSON.stringify(names),
        currentRating: 0,
      },
    })

    return NextResponse.json({ ok: true, saved: names })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}


