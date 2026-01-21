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

const formatLocalDateFromTimestamp = (timestampMs: number, tzMin: number) => {
  if (!Number.isFinite(timestampMs)) return null
  const local = new Date(timestampMs - tzMin * 60 * 1000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
    const mode = (searchParams.get('mode') || '').toLowerCase().trim()
    const fullMode = mode === 'full'
    const tzMin = Number.isFinite(parseInt(tzRaw, 10)) ? parseInt(tzRaw, 10) : 0

    const logs = await prisma.foodLog.findMany({
      where: fullMode
        ? { userId: user.id }
        : {
            userId: user.id,
            OR: [{ localDate: null }, { localDate: '' }],
          },
      select: { id: true, createdAt: true, localDate: true, nutrients: true },
      orderBy: { createdAt: 'desc' },
    })

    const updates = logs
      .filter((log) => !isValidLocalDate(log.localDate))
      .map((log) => ({
        id: log.id,
        localDate: formatLocalDateFromTimestamp(extractBestTimestampMs(log), tzMin),
      }))
      .filter((row) => row.localDate)

    const fullUpdates = fullMode
      ? logs
          .map((log) => ({
            id: log.id,
            current: log.localDate || null,
            localDate: formatLocalDateFromTimestamp(extractBestTimestampMs(log), tzMin),
          }))
          .filter((row) => row.localDate && row.localDate !== row.current)
      : []

    const updateQueue = fullMode ? fullUpdates : updates

    const updatedIds: string[] = []
    const batchSize = 200
    for (let i = 0; i < updateQueue.length; i += batchSize) {
      const batch = updateQueue.slice(i, i + batchSize)
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
      mode: fullMode ? 'full' : 'missing',
    })
  } catch (error) {
    console.error('POST /api/food-log/repair-local-date error', error)
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 })
  }
}
