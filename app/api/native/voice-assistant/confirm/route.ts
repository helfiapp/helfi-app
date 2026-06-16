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
import { ensureHealthJournalSchema } from '@/lib/health-journal-db'
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

const SELF_HARM_RISK_PATTERN =
  /\b(kill myself|hurt myself|hurting myself|harm myself|harming myself|end my life|suicide|suicidal|self[-\s]?harm|do not want to live|don't want to live|want to die|wish i was dead|can't go on|cant go on)\b/i

function hasSelfHarmRisk(value: unknown) {
  return SELF_HARM_RISK_PATTERN.test(String(value || ''))
}

function mealTargetFromText(value: unknown) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim()
  const match = normalized.match(/\b(?:to|for|as|into|in)\s+(?:my\s+)?(breakfast|lunch|dinner|snacks?|snack)\b/)
  if (!match?.[1]) return ''
  return match[1].startsWith('snack') ? 'snacks' : match[1]
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function makeManualDeviceId() {
  return `voice:${crypto.randomUUID()}`
}

function normalizeWaterUnit(value: unknown): 'ml' | 'l' | 'oz' {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'l' || raw.includes('litre') || raw.includes('liter')) return 'l'
  if (raw === 'oz' || raw.includes('ounce')) return 'oz'
  return 'ml'
}

function waterAmountToMl(amount: number, unit: 'ml' | 'l' | 'oz') {
  if (unit === 'l') return Math.round(amount * 1000 * 10) / 10
  if (unit === 'oz') return Math.round(amount * 29.5735 * 10) / 10
  return Math.round(amount * 10) / 10
}

function sweetenerMacros(sweetener: any) {
  const type = String(sweetener?.type || '').toLowerCase()
  if (type !== 'sugar' && type !== 'honey') return { calories: 0, carbs: 0, sugar: 0 }
  const grams = Number(sweetener?.grams)
  const safeGrams = Number.isFinite(grams) && grams > 0 ? grams : 0
  if (type === 'honey') {
    const scale = safeGrams / 21
    return {
      calories: Math.round(64 * scale),
      carbs: Math.round(17.3 * scale * 10) / 10,
      sugar: Math.round(17.2 * scale * 10) / 10,
    }
  }
  return {
    calories: Math.round(safeGrams * 4),
    carbs: Math.round(safeGrams * 10) / 10,
    sugar: Math.round(safeGrams * 10) / 10,
  }
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
  void deleteNotificationsByType(userId, ['mood_reminder']).catch(() => {})
  void deleteSmartCoachNotificationsByCategories(userId, ['mood']).catch(() => {})
  return { kind: 'mood', id, message: 'Mood saved.' }
}

async function saveJournal(userId: string, draft: any) {
  const journal = draft?.journal || {}
  const title = cleanText(journal.title || 'Voice journal note', 120)
  const content = cleanText(journal.content || draft?.transcript, 20000)
  const journalType = String(journal.journalType || journal.type || '').toLowerCase() === 'health' || /\bhealth journal\b/i.test(String(draft?.transcript || ''))
    ? 'health'
    : 'mood'
  const tags = Array.isArray(journal.tags)
    ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 12)
    : []
  const date = localDate(draft?.localDate)
  const id = crypto.randomUUID()

  if (!title && !content) throw new Error('Journal entry is empty')
  if (journalType === 'health') {
    await ensureHealthJournalSchema()
    const entry = await prisma.healthJournalEntry.create({
      data: {
        userId,
        content,
        localDate: date,
      },
      select: { id: true },
    })
    void deleteSmartCoachNotificationsByCategories(userId, ['journal']).catch(() => {})
    return { kind: 'health_journal', id: entry.id, message: 'Health journal note saved.' }
  }

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

async function saveWater(userId: string, draft: any) {
  const water = draft?.water || {}
  const amount = Number(water.amount)
  const unit = normalizeWaterUnit(water.unit)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    throw new Error('Water amount is missing')
  }

  const date = localDate(draft?.localDate)
  const amountMl = Number.isFinite(Number(water.amountMl)) && Number(water.amountMl) > 0
    ? Math.round(Number(water.amountMl) * 10) / 10
    : waterAmountToMl(amount, unit)
  const label = cleanText(water.label || water.drinkType || `${amount} ${unit}`, 48)
  const category = cleanText(water.category || 'other', 40).toLowerCase() || 'other'
  const drinkType = cleanText(water.drinkType || label, 48)

  const created = await prisma.waterLog.create({
    data: {
      userId,
      amount,
      unit,
      amountMl,
      label,
      category,
      localDate: date,
    },
  })

  const sweetener = water.sweetener && typeof water.sweetener === 'object' ? water.sweetener : null
  const shouldCreateFoodDrink = drinkType && drinkType.toLowerCase() !== 'water' && sweetener
  let foodId: string | null = null
  if (shouldCreateFoodDrink) {
    const macros = sweetenerMacros(sweetener)
    const nutrition = {
      calories: macros.calories,
      calories_kcal: macros.calories,
      protein: 0,
      protein_g: 0,
      carbs: macros.carbs,
      carbs_g: macros.carbs,
      fat: 0,
      fat_g: 0,
      fiber: 0,
      fiber_g: 0,
      sugar: macros.sugar,
      sugar_g: macros.sugar,
      __drinkType: drinkType,
      __drinkAmount: amount,
      __drinkUnit: unit,
      __drinkAmountMl: amountMl,
      __waterLogId: created.id,
      __sweetenerType: sweetener.type || 'free',
      __sweetenerAmount: sweetener.amount ?? null,
      __sweetenerUnit: sweetener.unit ?? null,
    }
    const food = await prisma.foodLog.create({
      data: {
        userId,
        name: label,
        description: label,
        imageUrl: null,
        nutrients: nutrition,
        items: [
          {
            name: label,
            calories: macros.calories,
            calories_kcal: macros.calories,
            protein_g: 0,
            carbs_g: macros.carbs,
            fat_g: 0,
            fiber_g: 0,
            sugar_g: macros.sugar,
            waterLogId: created.id,
          },
        ],
        localDate: date,
        meal: category === 'other' ? 'uncategorized' : category,
        category: category === 'other' ? 'uncategorized' : category,
      },
    })
    foodId = food.id
    void triggerBackgroundRegeneration({
      userId,
      changeType: 'food',
      timestamp: new Date(),
    }).catch(() => {})
    void deleteSmartCoachNotificationsByCategories(userId, ['meal', 'macro']).catch(() => {})
  }

  void deleteSmartCoachNotificationsByCategories(userId, ['hydration']).catch(() => {})
  return {
    kind: 'water',
    id: created.id,
    foodId,
    message: `${label} saved.`,
  }
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
  void deleteSmartCoachNotificationsByCategories(userId, ['meal', 'macro']).catch(() => {})

  return {
    kind: 'food',
    ids: createdIds,
    message: `Copied ${createdIds.length} food item${createdIds.length === 1 ? '' : 's'}.`,
  }
}

async function touchStoredFavorite(userId: string, favoriteId: string) {
  if (!favoriteId) return
  const stored = await prisma.healthGoal.findFirst({
    where: { userId, name: '__FOOD_FAVORITES__' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, category: true },
  })
  if (!stored?.id || !stored.category) return
  let parsed: any
  try {
    parsed = JSON.parse(stored.category)
  } catch {
    return
  }
  const favorites = Array.isArray(parsed?.favorites) ? parsed.favorites : Array.isArray(parsed) ? parsed : []
  if (!Array.isArray(favorites) || favorites.length === 0) return
  let changed = false
  const lastUsedAt = Date.now()
  const next = favorites.map((favorite: any) => {
    if (String(favorite?.id || '').trim() !== favoriteId) return favorite
    changed = true
    return { ...favorite, lastUsedAt }
  })
  if (!changed) return
  await prisma.healthGoal.update({
    where: { id: stored.id },
    data: { category: JSON.stringify({ favorites: next }), currentRating: 0 },
  })
}

async function saveFavoriteFood(userId: string, draft: any) {
  const food = draft?.food || {}
  const favorite = food?.favorite || {}
  const label = cleanText(favorite.label || favorite.name || food.entries?.[0]?.name || draft?.summary, 160)
  if (!label) throw new Error('Favorite food is missing')

  const targetDate = localDate(draft?.localDate)
  const meal = cleanText(mealTargetFromText(draft?.transcript) || food.meal || favorite.meal || 'uncategorized', 40).toLowerCase() || 'uncategorized'
  const favoriteId = cleanText(favorite.id, 120)
  const baseNutrition =
    favorite.nutrition && typeof favorite.nutrition === 'object'
      ? { ...favorite.nutrition }
      : favorite.total && typeof favorite.total === 'object'
      ? { ...favorite.total }
      : null
  const nutrition = baseNutrition
    ? {
        ...baseNutrition,
        ...(favoriteId ? { __favoriteId: favoriteId, __favoriteManualEdit: false } : {}),
      }
    : favoriteId
    ? { __favoriteId: favoriteId, __favoriteManualEdit: false }
    : null
  const items = Array.isArray(favorite.items) ? favorite.items : Prisma.JsonNull

  const created = await prisma.foodLog.create({
    data: {
      userId,
      name: label,
      description: cleanText(favorite.description || label, 500) || label,
      imageUrl: null,
      nutrients: nutrition ?? Prisma.JsonNull,
      items,
      localDate: targetDate,
      meal,
      category: meal,
    },
  })

  if (favoriteId) {
    void touchStoredFavorite(userId, favoriteId).catch(() => {})
  }
  void triggerBackgroundRegeneration({
    userId,
    changeType: 'food',
    timestamp: new Date(),
  }).catch(() => {})
  void deleteSmartCoachNotificationsByCategories(userId, ['meal', 'macro']).catch(() => {})

  return {
    kind: 'food',
    ids: [created.id],
    message: `${label} added to ${meal}.`,
  }
}

async function saveBuiltMeal(userId: string, draft: any) {
  const food = draft?.food || {}
  const targetDate = localDate(draft?.localDate)
  const meal = cleanText(food.meal || 'uncategorized', 40).toLowerCase() || 'uncategorized'
  const items = Array.isArray(food.items) ? food.items : []
  if (items.length === 0) throw new Error('Meal ingredients are missing')

  const entries = Array.isArray(food.entries) ? food.entries : []
  const normalizedItems = items.map((item: any, index: number) => {
    const matchingEntry = entries[index] || {}
    const requestedName = cleanText(
      matchingEntry?.name || item?.requestedName || item?.label || item?.name || `Ingredient ${index + 1}`,
      160,
    )
    const serving = cleanText(
      item?.serving_size || item?.serving || item?.unit || matchingEntry?.amount || item?.requestedAmount || '1 serving',
      120,
    ) || '1 serving'
    return {
      ...(item && typeof item === 'object' ? item : {}),
      id: item?.id || `voice-meal:${crypto.randomUUID()}`,
      name: requestedName,
      label: requestedName,
      serving_size: serving,
      servings: Number.isFinite(Number(item?.servings)) && Number(item.servings) > 0 ? Number(item.servings) : 1,
      calories: Math.max(0, Math.round(Number(item?.calories ?? item?.calories_kcal) || 0)),
      calories_kcal: Math.max(0, Math.round(Number(item?.calories ?? item?.calories_kcal) || 0)),
      protein_g: Math.max(0, Number(item?.protein_g ?? item?.protein) || 0),
      carbs_g: Math.max(0, Number(item?.carbs_g ?? item?.carbs) || 0),
      fat_g: Math.max(0, Number(item?.fat_g ?? item?.fat) || 0),
      fiber_g: Math.max(0, Number(item?.fiber_g ?? item?.fiber) || 0),
      sugar_g: Math.max(0, Number(item?.sugar_g ?? item?.sugar) || 0),
      __voicePlainIngredient: true,
    }
  })
  const isSingleIngredient = normalizedItems.length === 1
  const firstItemLabel = isSingleIngredient
    ? cleanText(entries[0]?.name || normalizedItems[0]?.requestedName || normalizedItems[0]?.label || normalizedItems[0]?.name, 160)
    : ''
  const label =
    (isSingleIngredient
      ? firstItemLabel
      : cleanText(food.mealName || food.name || food.label || draft?.summary || `${meal} meal`, 160)) ||
    `${meal} meal`
  const totals = normalizedItems.reduce(
    (acc: any, item: any) => {
      const servings = Number.isFinite(Number(item?.servings)) && Number(item.servings) > 0 ? Number(item.servings) : 1
      acc.calories += Math.max(0, Number(item?.calories ?? item?.calories_kcal) || 0) * servings
      acc.protein += Math.max(0, Number(item?.protein_g ?? item?.protein) || 0) * servings
      acc.carbs += Math.max(0, Number(item?.carbs_g ?? item?.carbs) || 0) * servings
      acc.fat += Math.max(0, Number(item?.fat_g ?? item?.fat) || 0) * servings
      acc.fiber += Math.max(0, Number(item?.fiber_g ?? item?.fiber) || 0) * servings
      acc.sugar += Math.max(0, Number(item?.sugar_g ?? item?.sugar) || 0) * servings
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
  )
  const nutrition = {
    calories: Math.max(0, Math.round(Number(totals.calories) || 0)),
    calories_kcal: Math.max(0, Math.round(Number(totals.calories) || 0)),
    protein: Math.max(0, Number(totals.protein) || 0),
    protein_g: Math.max(0, Number(totals.protein) || 0),
    carbs: Math.max(0, Number(totals.carbs) || 0),
    carbs_g: Math.max(0, Number(totals.carbs) || 0),
    fat: Math.max(0, Number(totals.fat) || 0),
    fat_g: Math.max(0, Number(totals.fat) || 0),
    fiber: Math.max(0, Number(totals.fiber) || 0),
    fiber_g: Math.max(0, Number(totals.fiber) || 0),
    sugar: Math.max(0, Number(totals.sugar) || 0),
    sugar_g: Math.max(0, Number(totals.sugar) || 0),
    ...(isSingleIngredient
      ? { __voiceSingleIngredient: true, method: 'single-ingredient' }
      : { __voiceBuiltMeal: true, customMeal: true, method: 'meal-builder' }),
  }

  const created = await prisma.foodLog.create({
    data: {
      userId,
      name: label,
      description: normalizedItems.map((item: any) => item.name).join(', '),
      imageUrl: null,
      nutrients: nutrition,
      items: normalizedItems,
      localDate: targetDate,
      meal,
      category: meal,
    },
  })

  void triggerBackgroundRegeneration({
    userId,
    changeType: 'food',
    timestamp: new Date(),
  }).catch(() => {})
  void deleteSmartCoachNotificationsByCategories(userId, ['meal', 'macro']).catch(() => {})

  return {
    kind: 'food',
    ids: [created.id],
    message: `${label} added to ${meal}.`,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as any))
    const draft = body?.draft || body
    if (hasSelfHarmRisk(draft?.transcript) || hasSelfHarmRisk(draft?.mood?.note) || hasSelfHarmRisk(draft?.journal?.content)) {
      return NextResponse.json({ error: 'This cannot be saved as a normal log. Please contact urgent support if you might hurt yourself.' }, { status: 400 })
    }
    if (!draft?.canConfirm) {
      return NextResponse.json({ error: 'This draft cannot be saved.' }, { status: 400 })
    }

    let result: any
    if (draft.action === 'exercise') result = await saveExercise(user.id, draft)
    else if (draft.action === 'mood') result = await saveMood(user.id, draft)
    else if (draft.action === 'journal') result = await saveJournal(user.id, draft)
    else if (draft.action === 'water') result = await saveWater(user.id, draft)
    else if (draft.action === 'food_copy_previous') result = await copyPreviousFood(user.id, draft)
    else if (draft.action === 'food_favorite') result = await saveFavoriteFood(user.id, draft)
    else if (draft.action === 'food_build_meal') result = await saveBuiltMeal(user.id, draft)
    else return NextResponse.json({ error: 'This action is not supported yet.' }, { status: 400 })

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('[native voice assistant] confirm failed', error)
    return NextResponse.json({ error: error?.message || 'Could not save this voice action' }, { status: 500 })
  }
}
