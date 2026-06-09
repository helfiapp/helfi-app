import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { calculateExerciseCalories } from '@/lib/exercise/calories'
import { getHealthProfileForUser } from '@/lib/exercise/health-profile'
import { inferMetAndLabel } from '@/lib/exercise/met'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { deleteNotificationsByType, deleteSmartCoachNotificationsByCategories } from '@/lib/notification-inbox'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveUser(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const nativeUserId = sessionUserId ? null : await getUserIdFromNativeAuth(request)
  const userId = sessionUserId || nativeUserId
  if (!userId) return null
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
}

function localDate(value: unknown) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10)
}

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function makeManualDeviceId() {
  return `voice:${crypto.randomUUID()}`
}

async function saveExercise(userId: string, draft: any) {
  const exercise = draft?.exercise || {}
  const exerciseTypeId = Number(exercise.exerciseTypeId)
  const durationMinutes = clampInt(exercise.durationMinutes, 1, 24 * 60, 30)
  const distanceRaw = Number(exercise.distanceKm)
  const distanceKm = Number.isFinite(distanceRaw) && distanceRaw > 0 ? distanceRaw : null
  const date = localDate(draft?.localDate)

  if (!Number.isFinite(exerciseTypeId) || exerciseTypeId <= 0) {
    throw new Error('Exercise type is missing')
  }

  const type = await prisma.exerciseType.findUnique({ where: { id: exerciseTypeId } })
  if (!type) throw new Error('Exercise type not found')

  const inferred = inferMetAndLabel({
    exerciseName: type.name,
    baseMet: type.met,
    durationMinutes,
    distanceKm,
  })
  const health = await getHealthProfileForUser(userId)
  if (!health.weightKg) throw new Error('Please update your weight in Health Setup before saving exercise.')

  const calories = calculateExerciseCalories({
    met: inferred.met,
    weightKg: health.weightKg,
    durationMinutes: inferred.durationMinutes,
  })

  const entry = await prisma.exerciseEntry.create({
    data: {
      deviceId: makeManualDeviceId(),
      userId,
      localDate: date,
      startTime: null,
      durationMinutes: inferred.durationMinutes,
      distanceKm,
      source: 'MANUAL',
      exerciseTypeId: type.id,
      label: inferred.label,
      met: inferred.met,
      calories,
      rawPayload: {
        source: 'native_voice_assistant',
        transcript: cleanText(draft?.transcript, 500),
        estimatedDuration: Boolean(exercise.estimatedDuration),
      },
    },
  })

  return { kind: 'exercise', id: entry.id, message: 'Exercise saved.' }
}

async function saveMood(userId: string, draft: any) {
  const moodDraft = draft?.mood || {}
  const mood = clampInt(moodDraft.mood, 1, 7, 4)
  const tags = Array.isArray(moodDraft.tags)
    ? moodDraft.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 12)
    : []
  const note = cleanText(moodDraft.note || draft?.transcript, 600)
  const date = localDate(draft?.localDate)
  const id = crypto.randomUUID()

  await ensureMoodTables()
  await prisma.$queryRawUnsafe(
    `INSERT INTO MoodEntries (id, userId, localDate, mood, tags, note, context)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
    id,
    userId,
    date,
    mood,
    JSON.stringify(tags),
    note,
    JSON.stringify({ source: 'native_voice_assistant' }),
  )
  await deleteNotificationsByType(userId, ['mood_reminder']).catch(() => {})
  await deleteSmartCoachNotificationsByCategories(userId, ['mood']).catch(() => {})
  return { kind: 'mood', id, message: 'Mood saved.' }
}

async function saveJournal(userId: string, draft: any) {
  const journal = draft?.journal || {}
  const title = cleanText(journal.title || 'Voice journal note', 120)
  const content = cleanText(journal.content || draft?.transcript, 20000)
  const tags = Array.isArray(journal.tags)
    ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 12)
    : []
  const date = localDate(draft?.localDate)
  const id = crypto.randomUUID()

  if (!title && !content) throw new Error('Journal entry is empty')

  await ensureMoodTables()
  await prisma.$queryRawUnsafe(
    `INSERT INTO MoodJournalEntries (id, userId, localDate, title, content, images, tags, audio, prompt, template)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
    id,
    userId,
    date,
    title,
    content,
    JSON.stringify([]),
    JSON.stringify(tags),
    JSON.stringify([]),
    'Native voice assistant',
    'voice',
  )
  return { kind: 'journal', id, message: 'Journal note saved.' }
}

async function copyPreviousFood(userId: string, draft: any) {
  const food = draft?.food || {}
  const ids = Array.isArray(food.sourceLogIds) ? food.sourceLogIds.map((id: any) => String(id || '').trim()).filter(Boolean) : []
  const targetDate = localDate(draft?.localDate)
  if (ids.length === 0) throw new Error('No food entries to copy')

  const sourceRows = await prisma.foodLog.findMany({
    where: { id: { in: ids }, userId },
    orderBy: { createdAt: 'asc' },
  })
  if (sourceRows.length === 0) throw new Error('No matching food entries found')

  const createdIds: string[] = []
  for (const row of sourceRows) {
    const created = await prisma.foodLog.create({
      data: {
        userId,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        nutrients: row.nutrients ?? Prisma.JsonNull,
        items: row.items ?? Prisma.JsonNull,
        localDate: targetDate,
        meal: row.meal,
        category: row.category,
      },
    })
    createdIds.push(created.id)
  }

  triggerBackgroundRegeneration({
    userId,
    changeType: 'food',
    timestamp: new Date(),
  }).catch(() => {})
  await deleteSmartCoachNotificationsByCategories(userId, ['meal', 'macro']).catch(() => {})

  return {
    kind: 'food',
    ids: createdIds,
    message: `Copied ${createdIds.length} food item${createdIds.length === 1 ? '' : 's'}.`,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as any))
    const draft = body?.draft || body
    if (!draft?.canConfirm) {
      return NextResponse.json({ error: 'This draft cannot be saved.' }, { status: 400 })
    }

    let result: any
    if (draft.action === 'exercise') result = await saveExercise(user.id, draft)
    else if (draft.action === 'mood') result = await saveMood(user.id, draft)
    else if (draft.action === 'journal') result = await saveJournal(user.id, draft)
    else if (draft.action === 'food_copy_previous') result = await copyPreviousFood(user.id, draft)
    else return NextResponse.json({ error: 'This action is not supported yet.' }, { status: 400 })

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('[native voice assistant] confirm failed', error)
    return NextResponse.json({ error: error?.message || 'Could not save this voice action' }, { status: 500 })
  }
}

