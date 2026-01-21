import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const IDENTITY_MARKER = '[SYSTEM] Identity verified'
const IDENTITY_MAX_AGE_MS = 24 * 60 * 60 * 1000
const FUTURE_GRACE_MS = 36 * 60 * 60 * 1000

const normalizeEmail = (value: string) => value.trim().toLowerCase()

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

const isPlausibleTimestamp = (timestampMs: number, nowMs: number) => {
  if (!Number.isFinite(timestampMs)) return false
  if (timestampMs < 946684800000) return false
  return timestampMs <= nowMs + FUTURE_GRACE_MS
}

const pickBestTimestampMs = (log: any, nowMs: number) => {
  const createdMs = coerceTimestampMs(log?.createdAt)
  const loggedAtMs = extractLoggedAtMs(log)
  const createdOk = isPlausibleTimestamp(createdMs, nowMs)
  const loggedOk = isPlausibleTimestamp(loggedAtMs, nowMs)
  if (createdOk && loggedOk) {
    const drift = Math.abs(loggedAtMs - createdMs)
    if (drift <= FUTURE_GRACE_MS) return loggedAtMs
  }
  if (createdOk) return createdMs
  if (loggedOk) return loggedAtMs
  return Number.isFinite(createdMs) ? createdMs : loggedAtMs
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
    const body = await request.json().catch(() => ({}))
    const ticketId = String(body?.ticketId || '').trim()
    const email = normalizeEmail(String(body?.email || ''))
    const tier = String(body?.tier || '30').trim()
    const tzMin = Number.isFinite(Number(body?.tz))
      ? Number(body.tz)
      : Number.isFinite(Number(body?.tzMin))
      ? Number(body.tzMin)
      : 0

    if (!ticketId || !email) {
      return NextResponse.json({ error: 'Missing ticketId or email' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userEmail: email },
      include: { responses: { orderBy: { createdAt: 'desc' } } },
    })
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const identity = (ticket.responses || []).find(
      (response) =>
        response.isAdminResponse &&
        typeof response.message === 'string' &&
        response.message.startsWith(IDENTITY_MARKER),
    )
    if (!identity) {
      return NextResponse.json({ error: 'Identity not verified' }, { status: 403 })
    }
    const identityAge = Date.now() - new Date(identity.createdAt).getTime()
    if (!Number.isFinite(identityAge) || identityAge > IDENTITY_MAX_AGE_MS) {
      return NextResponse.json({ error: 'Identity check expired' }, { status: 403 })
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const priceCentsMap: Record<string, number> = {
      '10': 1000,
      '20': 2000,
      '30': 3000,
      '50': 5000,
    }
    const priceCents = priceCentsMap[tier] || 3000
    const now = new Date()

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: 'PREMIUM',
        monthlyPriceCents: priceCents,
        startDate: now,
        endDate: null,
      },
      create: {
        userId: user.id,
        plan: 'PREMIUM',
        monthlyPriceCents: priceCents,
        startDate: now,
      },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        dailyAnalysisCredits: 30,
        walletMonthlyUsedCents: 0,
        walletMonthlyResetAt: now,
        monthlySymptomAnalysisUsed: 0,
        monthlyFoodAnalysisUsed: 0,
        monthlyMedicalImageAnalysisUsed: 0,
        monthlyInteractionAnalysisUsed: 0,
        monthlyInsightsGenerationUsed: 0,
      } as any,
    })

    const logs = await prisma.foodLog.findMany({
      where: { userId: user.id },
      select: { id: true, createdAt: true, localDate: true, nutrients: true },
      orderBy: { createdAt: 'desc' },
    })

    const nowMs = Date.now()
    const updates = logs
      .map((log) => ({
        id: log.id,
        current: log.localDate || null,
        localDate: formatLocalDateFromTimestamp(pickBestTimestampMs(log, nowMs), tzMin),
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

    return NextResponse.json({
      success: true,
      subscriptionTier: priceCents,
      repairedFoodLogs: updatedIds.length,
      favoritesRestored,
      favoritesBackupFound,
    })
  } catch (error) {
    console.error('POST /api/support/account-repair error', error)
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 })
  }
}
