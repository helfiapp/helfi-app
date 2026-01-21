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

const formatLocalDateFromTimestamp = (timestampMs: number, tzMin: number) => {
  if (!Number.isFinite(timestampMs)) return null
  const local = new Date(timestampMs - tzMin * 60 * 1000)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(request: NextRequest) {
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
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, createdAt: true, localDate: true, nutrients: true },
    })

    if (logs.length === 0) {
      return NextResponse.json({ success: true, date: null })
    }

    let best: { date: string | null; stamp: number } = { date: null, stamp: NaN }
    for (const log of logs) {
      const loggedAtMs = extractLoggedAtMs(log)
      const createdMs = coerceTimestampMs(log.createdAt)
      const stamp = Number.isFinite(loggedAtMs) ? loggedAtMs : createdMs
      const date =
        isValidLocalDate(log.localDate) ? log.localDate : formatLocalDateFromTimestamp(stamp, tzMin)
      if (!date) continue
      if (!Number.isFinite(best.stamp) || (Number.isFinite(stamp) && stamp > best.stamp)) {
        best = { date, stamp }
      }
    }

    if (!best.date) {
      const fallback = logs[0]
      const fallbackDate =
        isValidLocalDate(fallback.localDate)
          ? fallback.localDate
          : formatLocalDateFromTimestamp(coerceTimestampMs(fallback.createdAt), tzMin)
      return NextResponse.json({ success: true, date: fallbackDate || null })
    }

    return NextResponse.json({ success: true, date: best.date })
  } catch (error) {
    console.error('GET /api/food-log/most-recent error', error)
    return NextResponse.json({ error: 'Failed to load most recent date' }, { status: 500 })
  }
}
