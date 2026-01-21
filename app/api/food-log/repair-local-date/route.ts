import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const isValidLocalDate = (value: string | null) => {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const formatLocalDateFromCreatedAt = (createdAt: Date, tzMin: number) => {
  const createdMs = createdAt?.getTime()
  if (!Number.isFinite(createdMs)) return null
  const local = new Date(createdMs - tzMin * 60 * 1000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function POST(request: NextRequest) {
  try {
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null

    if (!userEmail) {
      try {
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
        }
      } catch {
        // ignore
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const tzRaw = searchParams.get('tz') || '0'
    const tzMin = Number.isFinite(parseInt(tzRaw, 10)) ? parseInt(tzRaw, 10) : 0

    const logs = await prisma.foodLog.findMany({
      where: {
        userId: user.id,
        OR: [{ localDate: null }, { localDate: '' }],
      },
      select: { id: true, createdAt: true, localDate: true },
      orderBy: { createdAt: 'desc' },
    })

    const updates = logs
      .filter((log) => !isValidLocalDate(log.localDate))
      .map((log) => ({
        id: log.id,
        localDate: formatLocalDateFromCreatedAt(log.createdAt, tzMin),
      }))
      .filter((row) => row.localDate)

    const updatedIds: string[] = []
    const batchSize = 200
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      await prisma.$transaction(
        batch.map((row) =>
          prisma.foodLog.update({
            where: { id: row.id },
            data: { localDate: row.localDate as string },
          }),
        ),
      )
      updatedIds.push(...batch.map((row) => row.id))
    }

    return NextResponse.json({
      success: true,
      scanned: logs.length,
      updated: updatedIds.length,
    })
  } catch (error) {
    console.error('POST /api/food-log/repair-local-date error', error)
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 })
  }
}
