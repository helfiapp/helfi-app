import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeHydrationGoal } from '@/lib/hydration-goal'

export const dynamic = 'force-dynamic'

const GOAL_NAME = '__HYDRATION_GOAL__'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  oz: 29.5735,
}

function normalizeUnit(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'ml' || raw === 'milliliter' || raw === 'milliliters') return 'ml'
  if (raw === 'l' || raw === 'liter' || raw === 'liters') return 'l'
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces') return 'oz'
  return null
}

function normalizeAmount(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function normalizeLocalDate(input: string | null) {
  const trimmed = (input || '').trim()
  if (!DATE_RE.test(trimmed)) return null
  return trimmed
}

function toMl(amount: number, unit: string): number {
  const factor = UNIT_TO_ML[unit] || 1
  return Math.round(amount * factor)
}

function readGoalCategory(user: any, name: string) {
  const goal = (user?.healthGoals || []).find((g: any) => g?.name === name)
  if (!goal?.category) return null
  try {
    return JSON.parse(goal.category)
  } catch {
    return null
  }
}

function parseDietTypes(user: any): string[] {
  const parsed = readGoalCategory(user, '__DIET_PREFERENCE__')
  const raw = Array.isArray(parsed?.dietTypes) ? parsed.dietTypes : parsed?.dietType
  if (Array.isArray(raw)) return raw.filter((v: any) => typeof v === 'string' && v.trim())
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

function parseDiabetesType(user: any): string {
  const parsed = readGoalCategory(user, '__ALLERGIES_DATA__')
  return typeof parsed?.diabetesType === 'string' ? parsed.diabetesType : ''
}

function parseBirthdate(user: any): string {
  const parsed = readGoalCategory(user, '__PROFILE_INFO_DATA__')
  return typeof parsed?.dateOfBirth === 'string' ? parsed.dateOfBirth : ''
}

function parsePrimaryGoal(user: any) {
  const parsed = readGoalCategory(user, '__PRIMARY_GOAL__')
  return {
    goalChoice: typeof parsed?.goalChoice === 'string' ? parsed.goalChoice : '',
    goalIntensity: typeof parsed?.goalIntensity === 'string' ? parsed.goalIntensity : '',
  }
}

function getCustomGoal(user: any): { targetMl: number; updatedAt?: string | null } | null {
  const parsed = readGoalCategory(user, GOAL_NAME)
  const targetMl = Number(parsed?.targetMl)
  if (!Number.isFinite(targetMl) || targetMl <= 0) return null
  return {
    targetMl: Math.round(targetMl),
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
  }
}

async function getExerciseOverrideFrequency(userId: string, localDate: string | null) {
  if (!localDate) return null
  const entries = await prisma.exerciseEntry.findMany({
    where: { userId, localDate },
    select: { durationMinutes: true, calories: true },
  })
  if (entries.length === 0) return null

  const totalMinutes = entries.reduce((sum, entry) => sum + (Number(entry.durationMinutes) || 0), 0)
  const totalCalories = entries.reduce((sum, entry) => sum + (Number(entry.calories) || 0), 0)

  if (totalMinutes >= 45) return '5'
  if (totalMinutes >= 20) return '3'
  if (totalMinutes > 0) return '1'
  if (totalCalories >= 600) return '5'
  if (totalCalories >= 300) return '3'
  if (totalCalories > 0) return '1'
  return null
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { healthGoals: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const dietTypes = parseDietTypes(user)
  const diabetesType = parseDiabetesType(user)
  const birthdate = parseBirthdate(user)
  const primaryGoal = parsePrimaryGoal(user)
  const localDate = normalizeLocalDate(_req.nextUrl.searchParams.get('date'))
  const exerciseOverride = await getExerciseOverrideFrequency(user.id, localDate)
  const recommended = computeHydrationGoal({
    weightKg: typeof user.weight === 'number' ? user.weight : null,
    heightCm: typeof user.height === 'number' ? user.height : null,
    gender: (user as any)?.gender ?? null,
    bodyType: (user as any)?.bodyType ?? null,
    exerciseFrequency: exerciseOverride ?? user.exerciseFrequency || '',
    exerciseTypes: user.exerciseTypes || [],
    dietTypes,
    diabetesType,
    goalChoice: primaryGoal.goalChoice,
    goalIntensity: primaryGoal.goalIntensity,
    birthdate,
  })

  const custom = getCustomGoal(user)
  const targetMl = custom?.targetMl ?? recommended.targetMl
  const source = custom ? 'custom' : 'auto'

  return NextResponse.json({
    targetMl,
    recommendedMl: recommended.targetMl,
    source,
    updatedAt: custom?.updatedAt ?? null,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { healthGoals: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))
  let targetMl: number | null = null
  if (body?.targetMl != null) {
    const n = Number(body.targetMl)
    if (Number.isFinite(n) && n > 0) targetMl = Math.round(n)
  } else {
    const amount = normalizeAmount(body?.amount)
    const unit = normalizeUnit(body?.unit)
    if (amount != null && unit) {
      targetMl = toMl(amount, unit)
    }
  }

  if (!targetMl) {
    return NextResponse.json({ error: 'Invalid goal amount' }, { status: 400 })
  }

  const payload = {
    targetMl,
    updatedAt: new Date().toISOString(),
  }

  const existing = (user.healthGoals || []).find((g: any) => g?.name === GOAL_NAME)
  if (existing) {
    await prisma.healthGoal.update({
      where: { id: existing.id },
      data: { category: JSON.stringify(payload), currentRating: 0 },
    })
  } else {
    await prisma.healthGoal.create({
      data: {
        userId: user.id,
        name: GOAL_NAME,
        category: JSON.stringify(payload),
        currentRating: 0,
      },
    })
  }

  return NextResponse.json({ ok: true, targetMl })
}

export async function DELETE(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await prisma.healthGoal.deleteMany({ where: { userId: user.id, name: GOAL_NAME } })
  return NextResponse.json({ ok: true })
}
