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

const parseClientIdTimestampMs = (clientId: string) => {
  if (!clientId) return NaN
  const parts = clientId.split('-')
  if (parts.length < 2) return NaN
  const base36 = parts[parts.length - 2]
  if (!base36) return NaN
  const ms = parseInt(base36, 36)
  return Number.isFinite(ms) ? ms : NaN
}

const coerceTimestampMs = (value: any) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : NaN
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : NaN
  }
  return NaN
}

const extractLoggedAtMs = (log: any) => {
  const nutrients = log?.nutrients || {}
  const direct =
    nutrients?.__loggedAt ||
    nutrients?.__sourceCreatedAt ||
    nutrients?.loggedAt ||
    nutrients?.logged_at
  const directMs = coerceTimestampMs(direct)
  if (Number.isFinite(directMs)) return directMs
  const clientId =
    typeof nutrients?.__clientId === 'string'
      ? nutrients.__clientId
      : typeof nutrients?.__clientID === 'string'
      ? nutrients.__clientID
      : typeof nutrients?.__client_id === 'string'
      ? nutrients.__client_id
      : ''
  const clientMs = parseClientIdTimestampMs(clientId)
  return Number.isFinite(clientMs) ? clientMs : NaN
}

const extractBestTimestampMs = (log: any) => {
  const loggedAtMs = extractLoggedAtMs(log)
  if (Number.isFinite(loggedAtMs)) return loggedAtMs
  const createdMs = coerceTimestampMs(log?.createdAt)
  if (Number.isFinite(createdMs)) return createdMs
  return NaN
}

const formatLocalDateFromTimestamp = (timestampMs: number, tzMin: number) => {
  if (!Number.isFinite(timestampMs)) return null
  const local = new Date(timestampMs - tzMin * 60 * 1000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const parseFavoritesCount = (category: string | null) => {
  if (!category) return 0
  try {
    const parsed = JSON.parse(category)
    const favs = Array.isArray(parsed?.favorites)
      ? parsed.favorites
      : Array.isArray(parsed)
      ? parsed
      : []
    return favs.length
  } catch {
    return 0
  }
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
      where: { userId: user.id },
      select: { id: true, createdAt: true, localDate: true, nutrients: true },
      orderBy: { createdAt: 'desc' },
    })

    const updates = logs
      .map((log) => ({
        id: log.id,
        current: log.localDate || null,
        localDate: formatLocalDateFromTimestamp(extractBestTimestampMs(log), tzMin),
      }))
      .filter((row) => row.localDate && row.localDate !== row.current)

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

    const favoritesGoal = await prisma.healthGoal.findFirst({
      where: { userId: user.id, name: '__FOOD_FAVORITES__' },
      orderBy: { createdAt: 'desc' },
    })
    const favoritesCount = parseFavoritesCount(favoritesGoal?.category || null)
    let favoritesRestored = false
    let favoritesBackupFound = false

    if (favoritesCount === 0) {
      const backup = await prisma.healthGoal.findFirst({
        where: {
          userId: user.id,
          name: { startsWith: '__FOOD_FAVORITES__BACKUP__' },
        },
        orderBy: { createdAt: 'desc' },
      })
      favoritesBackupFound = Boolean(backup?.category)
      if (backup?.category) {
        if (favoritesGoal?.id) {
          await prisma.healthGoal.update({
            where: { id: favoritesGoal.id },
            data: { category: backup.category, currentRating: 0 },
          })
        } else {
          await prisma.healthGoal.create({
            data: {
              userId: user.id,
              name: '__FOOD_FAVORITES__',
              category: backup.category,
              currentRating: 0,
            },
          })
        }
        favoritesRestored = true
      }
    }

    const refreshLogs = await prisma.foodLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { createdAt: true, localDate: true, nutrients: true },
    })
    let mostRecentDate: string | null = null
    let mostRecentStamp = NaN
    for (const log of refreshLogs) {
      const stamp = extractBestTimestampMs(log)
      const date = isValidLocalDate(log.localDate)
        ? log.localDate
        : formatLocalDateFromTimestamp(stamp, tzMin)
      if (!date) continue
      if (!Number.isFinite(mostRecentStamp) || (Number.isFinite(stamp) && stamp > mostRecentStamp)) {
        mostRecentStamp = stamp
        mostRecentDate = date
      }
    }
    if (!mostRecentDate && refreshLogs[0]) {
      const fallback = refreshLogs[0]
      mostRecentDate = isValidLocalDate(fallback.localDate)
        ? fallback.localDate
        : formatLocalDateFromTimestamp(coerceTimestampMs(fallback.createdAt), tzMin)
    }

    return NextResponse.json({
      success: true,
      updatedDates: updatedIds.length,
      favoritesRestored,
      favoritesBackupFound,
      mostRecentDate,
    })
  } catch (error) {
    console.error('POST /api/food-log/rescue error', error)
    return NextResponse.json({ error: 'Rescue failed' }, { status: 500 })
  }
}
