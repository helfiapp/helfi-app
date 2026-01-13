import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const meta = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__HEALTH_SETUP_META__' },
      orderBy: { updatedAt: 'desc' },
      select: { category: true, updatedAt: true },
    })

    let healthSetupUpdatedAt = 0
    if (meta?.category) {
      try {
        const parsed = JSON.parse(meta.category)
        const parsedUpdatedAt = Number(parsed?.updatedAt)
        if (Number.isFinite(parsedUpdatedAt) && parsedUpdatedAt > 0) {
          healthSetupUpdatedAt = parsedUpdatedAt
        }
      } catch {
        healthSetupUpdatedAt = 0
      }
    }

    if (!healthSetupUpdatedAt && meta?.updatedAt) {
      healthSetupUpdatedAt = new Date(meta.updatedAt).getTime()
    }

    return NextResponse.json({ healthSetupUpdatedAt, serverTime: Date.now() })
  } catch (error) {
    console.error('Error in GET /api/health-setup-meta:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
