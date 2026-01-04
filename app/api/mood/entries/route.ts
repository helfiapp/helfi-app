import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { deleteNotifications } from '@/lib/notification-inbox'

export const dynamic = 'force-dynamic'

const MOOD_MIN = 1
const MOOD_MAX = 7

function clampInt(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const uniq = new Set<string>()
  for (const raw of value) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const cleaned = t.slice(0, 24)
    uniq.add(cleaned)
    if (uniq.size >= 12) break
  }
  return Array.from(uniq)
}

function normalizeNote(value: unknown): string {
  const note = String(value ?? '').trim()
  return note.length > 600 ? note.slice(0, 600) : note
}

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function dateFromLocalDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`)
}

function pickContextFields(value: any) {
  const energyLevel = clampInt(value?.energyLevel, 1, 5)
  const sleepQuality = clampInt(value?.sleepQuality, 1, 5)
  const nutrition = clampInt(value?.nutrition, 1, 5)
  const supplements = clampInt(value?.supplements, 1, 5)
  const physicalActivity = clampInt(value?.physicalActivity, 1, 5)
  const localHour = clampInt(value?.localHour, 0, 23)
  const intensityPercent = clampInt(value?.intensityPercent, 0, 100)
  const feelings = normalizeTags(value?.feelings)
  return {
    ...(energyLevel == null ? {} : { energyLevel }),
    ...(sleepQuality == null ? {} : { sleepQuality }),
    ...(nutrition == null ? {} : { nutrition }),
    ...(supplements == null ? {} : { supplements }),
    ...(physicalActivity == null ? {} : { physicalActivity }),
    ...(localHour == null ? {} : { localHour }),
    ...(intensityPercent == null ? {} : { intensityPercent }),
    ...(feelings.length > 0 ? { feelings } : {}),
  }
}

async function getPassiveContext(userId: string, localDate: string) {
  const mealsTodayCount = await prisma.foodLog.count({
    where: { userId, localDate },
  }).catch(() => 0)

  const lastMeal = await prisma.foodLog.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true, meal: true },
  }).catch(() => null)

  const supplementsCount = await prisma.supplement.count({
    where: { userId },
  }).catch(() => 0)

  const exerciseToday = await prisma.exerciseEntry.aggregate({
    where: { userId, localDate },
    _sum: { durationMinutes: true, calories: true },
  }).catch(() => ({ _sum: { durationMinutes: null, calories: null } }))

  const stepsToday = await prisma.fitbitData.findUnique({
    where: { userId_date_dataType: { userId, date: dateFromLocalDate(localDate), dataType: 'steps' } },
    select: { value: true },
  }).catch(() => null)

  const sleepRecent = await prisma.fitbitData.findFirst({
    where: {
      userId,
      dataType: 'sleep',
      date: { gte: dateFromLocalDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)) },
    },
    orderBy: { date: 'desc' },
    select: { date: true, value: true },
  }).catch(() => null)

  const stepsCount = (() => {
    const raw = (stepsToday as any)?.value
    if (!raw) return null
    if (typeof raw === 'number') return clampInt(raw, 0, 500_000)
    if (typeof raw === 'object' && raw && 'steps' in raw) return clampInt((raw as any).steps, 0, 500_000)
    return null
  })()

  const sleepMinutes = (() => {
    const raw = (sleepRecent as any)?.value
    if (!raw) return null
    if (typeof raw === 'number') return clampInt(raw, 0, 24 * 60)
    if (typeof raw === 'object' && raw) {
      const maybe = (raw as any).minutes ?? (raw as any).totalMinutesAsleep ?? (raw as any).sleepMinutes
      return clampInt(maybe, 0, 24 * 60)
    }
    return null
  })()

  return {
    mealsTodayCount,
    lastMeal: lastMeal
      ? { id: lastMeal.id, name: lastMeal.name, meal: lastMeal.meal, at: lastMeal.createdAt }
      : null,
    supplementsCount,
    stepsToday: stepsCount,
    exerciseMinutesToday: clampInt(exerciseToday._sum.durationMinutes, 0, 24 * 60),
    exerciseCaloriesToday: clampInt(exerciseToday._sum.calories, 0, 50_000),
    sleepMinutes,
    sleepDate: sleepRecent?.date ?? null,
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const period = (searchParams.get('period') || '').toLowerCase()

  const today = new Date().toISOString().slice(0, 10)
  let startLocalDate = asLocalDate(start) ?? null
  let endLocalDate = asLocalDate(end) ?? null

  if (!startLocalDate || !endLocalDate) {
    if (period === 'today') {
      startLocalDate = today
      endLocalDate = today
    } else if (period === 'week') {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      startLocalDate = d.toISOString().slice(0, 10)
      endLocalDate = today
    } else if (period === 'month') {
      const d = new Date()
      d.setDate(d.getDate() - 29)
      startLocalDate = d.toISOString().slice(0, 10)
      endLocalDate = today
    } else {
      startLocalDate = '1970-01-01'
      endLocalDate = today
    }
  }

  try {
    await ensureMoodTables()
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, localDate, timestamp, mood, tags, note, context
       FROM MoodEntries
       WHERE userId = $1 AND localDate BETWEEN $2 AND $3
       ORDER BY timestamp DESC`,
      user.id,
      startLocalDate,
      endLocalDate,
    )
    return NextResponse.json({ range: { start: startLocalDate, end: endLocalDate }, entries: rows })
  } catch (e) {
    console.error('mood entries get error', e)
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  const mood = clampInt(body?.mood, MOOD_MIN, MOOD_MAX)
  if (mood == null) return NextResponse.json({ error: 'Mood is required' }, { status: 400 })

  const localDate = asLocalDate(body?.localDate) ?? new Date().toISOString().slice(0, 10)
  const tags = normalizeTags(body?.tags)
  const note = normalizeNote(body?.note)
  const notificationId = typeof body?.notificationId === 'string' ? body.notificationId.trim() : ''

  const id = crypto.randomUUID()

  try {
    await ensureMoodTables()

    const passive = await getPassiveContext(user.id, localDate)
    const context = {
      ...passive,
      ...pickContextFields(body?.context),
    }

    await prisma.$queryRawUnsafe(
      `INSERT INTO MoodEntries (id, userId, localDate, mood, tags, note, context)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
      id,
      user.id,
      localDate,
      mood,
      JSON.stringify(tags),
      note,
      JSON.stringify(context),
    )

    if (notificationId) {
      await deleteNotifications(user.id, [notificationId]).catch(() => {})
    }

    return NextResponse.json({ success: true, id })
  } catch (e) {
    console.error('mood entry save error', e)
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
  }
}
