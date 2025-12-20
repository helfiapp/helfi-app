import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureMoodTables } from '@/app/api/mood/_db'

export const dynamic = 'force-dynamic'

function clampInt(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

function asLocalDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

function dateFromLocalDate(localDate: string): Date {
  // Date-only columns in Postgres + Prisma map cleanly from a Date instance at UTC midnight.
  return new Date(`${localDate}T00:00:00.000Z`)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const localDate = asLocalDate(searchParams.get('localDate')) ?? new Date().toISOString().slice(0, 10)

  try {
    await ensureMoodTables().catch(() => {})

    const mealsTodayCount = await prisma.foodLog.count({
      where: { userId: user.id, localDate },
    }).catch(() => 0)

    const lastMeal = await prisma.foodLog.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, meal: true },
    }).catch(() => null)

    const supplementsCount = await prisma.supplement.count({
      where: { userId: user.id },
    }).catch(() => 0)

    const exerciseToday = await prisma.exerciseEntry.aggregate({
      where: { userId: user.id, localDate },
      _sum: { durationMinutes: true, calories: true },
    }).catch(() => ({ _sum: { durationMinutes: null, calories: null } }))

    const stepsToday = await prisma.fitbitData.findUnique({
      where: { userId_date_dataType: { userId: user.id, date: dateFromLocalDate(localDate), dataType: 'steps' } },
      select: { value: true },
    }).catch(() => null)

    const sleepRecent = await prisma.fitbitData.findFirst({
      where: {
        userId: user.id,
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

    return NextResponse.json({
      localDate,
      meals: {
        todayCount: mealsTodayCount,
        last: lastMeal
          ? {
              id: lastMeal.id,
              name: lastMeal.name,
              meal: lastMeal.meal,
              at: lastMeal.createdAt,
            }
          : null,
      },
      supplements: { count: supplementsCount },
      activity: {
        stepsToday: stepsCount,
        exerciseMinutesToday: clampInt(exerciseToday._sum.durationMinutes, 0, 24 * 60),
        exerciseCaloriesToday: clampInt(exerciseToday._sum.calories, 0, 50_000),
      },
      sleep: {
        minutes: sleepMinutes,
        date: sleepRecent?.date ?? null,
      },
    })
  } catch (e) {
    console.error('mood context error', e)
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 })
  }
}

