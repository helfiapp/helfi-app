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
import { estimateVoiceExerciseDurationMinutes } from '@/lib/exercise/voice-duration'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { ensureHealthJournalSchema } from '@/lib/health-journal-db'
import { deleteNotificationsByType, deleteSmartCoachNotificationsByCategories } from '@/lib/notification-inbox'
import { triggerBackgroundRegeneration } from '@/lib/insights/regeneration-service'
import { verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'
import { ensureSupplementCatalogSchema } from '@/lib/supplement-catalog-db'
import { ensureMedicationCatalogSchema } from '@/lib/medication-catalog-db'

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Review date is missing or invalid.')
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Review date is missing or invalid.')
  }
  return text
}

function reviewedTimestamp(draft: any): Date | undefined {
  if (draft?.localTime === undefined || draft.localTime === null || draft.localTime === '') return undefined
  const time = draft.localTime
  if (typeof time !== 'string') throw new Error('Please review the meal or drink time before saving.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Please review the meal or drink time before saving.')
  const offset = draft?.tzOffsetMin
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < -840 || offset > 840) {
    throw new Error('Please review the time zone before saving this time.')
  }
  const [year, month, day] = localDate(draft.localDate).split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  // JS getTimezoneOffset is UTC minus local time (Melbourne summer is -660).
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + offset * 60 * 1000)
}

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isPlaceholderName(value: unknown) {
  const safe = cleanText(value, 120).toLowerCase()
  return new Set([
    'unknown',
    'unknown supplement',
    'unknown medication',
    'analysis error',
    'supplement label',
    'medication label',
    'bottle label',
  ]).has(safe)
}

function splitSupplementName(rawName: string) {
  const cleaned = cleanText(rawName, 160)
  if (!cleaned) return { brand: null as string | null, product: null as string | null }
  const parts = cleaned.split(' - ').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { brand: parts[0] || null, product: parts.slice(1).join(' - ').trim() || null }
  return { brand: null, product: cleaned }
}

function splitMedicationName(rawName: string) {
  const cleaned = cleanText(rawName, 160)
  if (!cleaned) return { brand: null as string | null, product: null as string | null }
  const parenthetical = cleaned.match(/^(.+?)\s*\((.+?)\)$/)
  if (parenthetical) return { brand: parenthetical[1].trim() || null, product: parenthetical[2].trim() || null }
  const parts = cleaned.split(' - ').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { brand: parts[0] || null, product: parts.slice(1).join(' - ').trim() || null }
  return { brand: null, product: cleaned }
}

function normalizeHealthIntakeSaveItem(raw: any, fallbackType?: 'supplement' | 'medication') {
  const type = cleanText(raw?.type || raw?.itemType || raw?.category || fallbackType, 24).toLowerCase()
  if (type !== 'supplement' && type !== 'medication') return null
  const name = cleanText(raw?.name || raw?.productName || raw?.product || raw?.label, 160)
  if (!name || isPlaceholderName(name)) return null
  const timing = Array.isArray(raw?.timing)
    ? raw.timing.map((item: any) => cleanText(item, 80)).filter(Boolean).slice(0, 8)
    : cleanText(raw?.timing, 80)
    ? [cleanText(raw.timing, 80)]
    : []
  return {
    type,
    name,
    dosage: cleanText(raw?.dosage || raw?.dose || raw?.strength || '', 80),
    timing,
    imageUrl: cleanText(raw?.imageUrl, 400) || null,
    method: cleanText(raw?.method, 24).toLowerCase() === 'photo' ? 'photo' : 'voice',
  }
}

function dedupeHealthIntakeSaveItems(items: Array<{ name: string; dosage: string; timing: string[]; imageUrl: string | null; method?: string }>) {
  const seen = new Set<string>()
  const result: typeof items = []
  items.forEach((item) => {
    const key = [
      item.name.toLowerCase(),
      item.dosage.toLowerCase(),
      item.timing.map((time) => time.toLowerCase()).join('|'),
      item.imageUrl || '',
    ].join('::')
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

function healthIntakeNameKey(value: unknown) {
  return cleanText(value, 160).toLowerCase()
}

function healthIntakeTimingKey(value: unknown) {
  const timing = Array.isArray(value) ? value : []
  return timing.map((item) => cleanText(item, 80).toLowerCase()).filter(Boolean).sort().join('|')
}

function findExistingHealthIntakeItem<T extends { id: string; name: string; dosage: string; timing: string[]; imageUrl: string | null }>(
  existing: T[],
  item: { name: string; dosage: string; timing: string[]; imageUrl: string | null },
) {
  const nameKey = healthIntakeNameKey(item.name)
  const dosageKey = cleanText(item.dosage, 80).toLowerCase()
  const timingKey = healthIntakeTimingKey(item.timing)
  const sameName = existing.filter((row) => healthIntakeNameKey(row.name) === nameKey)
  if (!sameName.length) return null

  const exact = sameName.find((row) => {
    return cleanText(row.dosage, 80).toLowerCase() === dosageKey && healthIntakeTimingKey(row.timing) === timingKey
  })
  if (exact) return exact

  return sameName.find((row) => {
    const existingDosage = cleanText(row.dosage, 80).toLowerCase()
    const existingTiming = healthIntakeTimingKey(row.timing)
    const dosageCompatible = !dosageKey || !existingDosage || dosageKey === existingDosage
    const timingCompatible = !timingKey || !existingTiming || timingKey === existingTiming
    return dosageCompatible && timingCompatible
  }) || null
}

function buildHealthIntakeExistingUpdate(
  existing: { dosage: string; timing: string[]; imageUrl: string | null },
  item: { dosage: string; timing: string[]; imageUrl: string | null },
) {
  const data: { dosage?: string; timing?: string[]; imageUrl?: string | null } = {}
  if (item.dosage && !cleanText(existing.dosage, 80)) data.dosage = item.dosage
  if (item.timing.length && !healthIntakeTimingKey(existing.timing)) data.timing = item.timing
  if (item.imageUrl && !existing.imageUrl) data.imageUrl = item.imageUrl
  return Object.keys(data).length ? data : null
}

function buildSupplementCatalogRows(supplements: any[], userId: string) {
  return supplements.map((supp) => {
    const { brand, product } = splitSupplementName(supp.name)
    return {
      userId,
      brand,
      product,
      fullName: supp.name,
      dosage: supp.dosage || '',
      source: supp.method === 'photo' || supp.imageUrl ? 'photo' : 'manual',
    }
  }).filter((row) => row.fullName && !isPlaceholderName(row.fullName))
}

function buildMedicationCatalogRows(medications: any[], userId: string) {
  return medications.map((med) => {
    const { brand, product } = splitMedicationName(med.name)
    return {
      userId,
      brand,
      product,
      fullName: med.name,
      dosage: med.dosage || '',
      source: med.method === 'photo' || med.imageUrl ? 'photo' : 'manual',
    }
  }).filter((row) => row.fullName && !isPlaceholderName(row.fullName))
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

function cleanPositiveNumber(value: unknown, max: number) {
  const n = Number(String(value ?? '').replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(max, Math.round(n))
}

function makeManualDeviceId() {
  return `voice:${crypto.randomUUID()}`
}

const USED_REVIEW_TOKEN_IDENTIFIER_PREFIX = 'native-voice-review-used'
const COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX = 'native-voice-review-result'
const USED_REVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function usedReviewTokenIdentifier(userId: string) {
  return `${USED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}`
}

function usedReviewTokenDigest(token: unknown) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url')
}

async function markReviewTokenUsed(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const token = String(draft?.reviewToken || '')
  if (!token) throw new Error('Review token is missing.')
  const identifier = usedReviewTokenIdentifier(userId)
  await db.verificationToken
    .deleteMany({
      where: {
        OR: [
          { identifier },
          { identifier: { startsWith: `${COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}:` } },
        ],
        expires: { lt: new Date() },
      },
    })

  await db.verificationToken.create({
    data: {
      identifier,
      token: usedReviewTokenDigest(token),
      expires: new Date(Date.now() + USED_REVIEW_TOKEN_TTL_MS),
    },
  })
}

async function completeReviewToken(userId: string, draft: any, result: any, db: Prisma.TransactionClient = prisma) {
  await db.verificationToken.update({
    where: { token: usedReviewTokenDigest(draft.reviewToken) },
    data: { identifier: `${COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}:${JSON.stringify(result)}` },
  })
}

async function completedReviewResult(userId: string, draft: any) {
  const row = await prisma.verificationToken.findUnique({ where: { token: usedReviewTokenDigest(draft.reviewToken) } })
  const prefix = `${COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}:`
  if (!row?.identifier.startsWith(prefix)) return null
  try {
    const result = JSON.parse(row.identifier.slice(prefix.length))
    if (typeof result?.kind !== 'string' || typeof result?.message !== 'string') return null
    return result
  } catch { return null }
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


async function saveExercise(userId: string, draft: any) {
  const exercise = draft?.exercise || {}
  const exerciseTypeId = Number(exercise.exerciseTypeId)
  const durationRaw = Number(exercise.durationMinutes)
  const estimatedFallbackDuration = estimateVoiceExerciseDurationMinutes({
    exerciseName: exercise.exerciseName,
    steps: exercise.steps,
    caloriesKcal: exercise.caloriesKcal ?? exercise.calories,
  })
  if ((!Number.isFinite(durationRaw) || durationRaw < 1) && !estimatedFallbackDuration) {
    throw new Error('Exercise duration is missing. Continue talking and tell Helfi how long it took before saving.')
  }
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw >= 1
    ? Math.min(24 * 60, Math.round(durationRaw))
    : estimatedFallbackDuration as number
  const distanceRaw = Number(exercise.distanceKm)
  const speedRaw = Number(exercise.speedKph)
  const speedKph = Number.isFinite(speedRaw) && speedRaw > 0 ? Math.round(speedRaw * 10) / 10 : null
  const distanceKm = Number.isFinite(distanceRaw) && distanceRaw > 0
    ? distanceRaw
    : null
  const steps = cleanPositiveNumber(exercise.steps, 500000)
  const spokenCalories = cleanPositiveNumber(exercise.caloriesKcal ?? exercise.calories, 10000)
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

  const estimatedCalories = calculateExerciseCalories({
    met: inferred.met,
    weightKg: health.weightKg,
    durationMinutes: inferred.durationMinutes,
  })
  const calories = spokenCalories ?? estimatedCalories

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
        estimatedDuration: Boolean(exercise.estimatedDuration || (!Number.isFinite(durationRaw) && estimatedFallbackDuration)),
        steps,
        speedKph,
        spokenCaloriesKcal: spokenCalories,
        estimatedCaloriesKcal: estimatedCalories,
      },
    },
  })

  return { kind: 'exercise', id: entry.id, message: 'Exercise saved.' }
}

async function saveMood(userId: string, draft: any) {
  const moodDraft = draft?.mood || {}
  const moodRaw = Number(moodDraft.mood)
  if (!Number.isFinite(moodRaw) || moodRaw < 1 || moodRaw > 7) {
    throw new Error('Mood value is missing. Continue talking and tell Helfi how you are feeling before saving.')
  }
  const mood = Math.round(moodRaw)
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
  const content = cleanText(journal.content, 20000)
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

async function saveSymptomNote(userId: string, draft: any) {
  const symptom = draft?.symptom && typeof draft.symptom === 'object' ? draft.symptom : {}
  const symptoms = Array.isArray(symptom.symptoms)
    ? symptom.symptoms.map((item: any) => cleanText(item, 80)).filter(Boolean).slice(0, 12)
    : []
  const safeSymptoms = symptoms
  if (!safeSymptoms.length) throw new Error('Symptom note is empty')

  const duration = cleanText(symptom.duration, 120) || null
  const notes = cleanText(symptom.notes || draft?.transcript, 1200) || null
  const summary = `Symptom note saved: ${safeSymptoms.slice(0, 3).join(', ')}.`
  const analysisData = {
    summary,
    possibleCauses: [],
    redFlags: ['Seek urgent care if symptoms feel severe, sudden, rapidly worsening, or worrying.'],
    nextSteps: ['Track when symptoms started, what changed, and questions to discuss with a qualified healthcare professional.'],
    disclaimer: 'This is not medical advice. If you are concerned, speak with a qualified healthcare professional or call emergency services.',
  }

  const created = await prisma.symptomAnalysis.create({
    data: {
      userId,
      symptoms: safeSymptoms,
      duration,
      notes,
      summary,
      analysisText: null,
      analysisData,
    },
    select: { id: true },
  })

  return { kind: 'symptom_note', id: created.id, message: 'Symptom note saved.' }
}

async function saveWater(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const water = draft?.water || {}
  const amount = Number(water.amount)
  const unit = normalizeWaterUnit(water.unit)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Water amount is missing')
  const date = localDate(draft?.localDate)
  const createdAt = reviewedTimestamp(draft)
  const amountMl = Number.isFinite(Number(water.amountMl)) && Number(water.amountMl) > 0
    ? Math.round(Number(water.amountMl) * 10) / 10
    : waterAmountToMl(amount, unit)
  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 10000) {
    throw new Error('Water amount is outside the safe logging range')
  }
  const label = cleanText(water.label || water.drinkType || `${amount} ${unit}`, 48)
  const category = cleanText(water.category || 'other', 40).toLowerCase() || 'other'
  const drinkType = cleanText(water.drinkType || label, 48)
  const hasIngredientAdditions = Array.isArray(water.ingredients) && water.ingredients.some((item: any) => {
    const name = cleanText(item?.name, 120).toLowerCase()
    return name && !/^(?:(?:plain|tap|mineral|sparkling|still|filtered|bottled)\s+)?water$/.test(name)
  })
  const hasSweetener = water.sweetener && water.sweetener.type !== 'free'
  const mentionsAdditions = /\b(?:with|plus|and)\s+(?!no\b|without\b)(?:[^.,;]{0,60}\s+)?(?:sugar|honey|milk|lemon|lime|syrup|juice)\b/i.test(String(draft?.transcript || ''))
  const needsFood = drinkType.toLowerCase() !== 'water' || draft?.food != null || hasIngredientAdditions || hasSweetener || mentionsAdditions
  // Nutrition must already cover the actual drink and every milk/sugar addition.
  // Reject legacy sweetener-only drafts; they cannot represent the drink itself.
  if (needsFood && (!Array.isArray(draft?.food?.items) || !draft.food.items.length || !draft?.food?.nutrition)) {
    throw new Error('Please review the drink and its complete nutrition before saving.')
  }

  const created = await db.waterLog.create({
    data: { userId, amount, unit, amountMl, label, category, localDate: date, ...(createdAt ? { createdAt } : {}) },
  })
  let foodId: string | null = null
  if (needsFood) {
    const foodResult = await saveBuiltMeal(userId, {
      ...draft,
      food: {
        ...draft.food,
        mealName: label,
        meal: draft.food.meal || (category === 'other' ? 'uncategorized' : category),
        nutrition: {
          ...draft.food.nutrition,
          __drinkType: drinkType,
          __drinkAmount: amount,
          __drinkUnit: unit,
          __drinkAmountMl: amountMl,
          __waterLogId: created.id,
        },
      },
    }, db)
    foodId = foodResult.ids[0]
  }
  return { kind: 'water', id: created.id, foodId, message: `${label} saved.` }
}

async function copyPreviousFood(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const food = draft?.food || {}
  const ids = Array.isArray(food.sourceLogIds) ? food.sourceLogIds.map((id: any) => String(id || '').trim()).filter(Boolean) : []
  const targetDate = localDate(draft?.localDate)
  const createdAt = reviewedTimestamp(draft)
  if (ids.length === 0) throw new Error('No food entries to copy')

  const sourceRows = await db.foodLog.findMany({
    where: { id: { in: ids }, userId },
    orderBy: { createdAt: 'asc' },
  })
  if (sourceRows.length === 0) throw new Error('No matching food entries found')

  const createdIds: string[] = []
  for (const row of sourceRows) {
    const created = await db.foodLog.create({
      data: {
        userId,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        nutrients: row.nutrients ?? Prisma.JsonNull,
        items: row.items ?? Prisma.JsonNull,
        localDate: targetDate,
        ...(createdAt ? { createdAt } : {}),
        meal: row.meal,
        category: row.category,
      },
    })
    createdIds.push(created.id)
  }

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

async function saveFavoriteFood(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const food = draft?.food || {}
  const favorite = food?.favorite || {}
  const label = cleanText(favorite.label || favorite.name || food.entries?.[0]?.name || draft?.summary, 160)
  if (!label) throw new Error('Favorite food is missing')

  const targetDate = localDate(draft?.localDate)
  const createdAt = reviewedTimestamp(draft)
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

  const created = await db.foodLog.create({
    data: {
      userId,
      name: label,
      description: cleanText(favorite.description || label, 500) || label,
      imageUrl: null,
      nutrients: nutrition ?? Prisma.JsonNull,
      items,
      localDate: targetDate,
      ...(createdAt ? { createdAt } : {}),
      meal,
      category: meal,
    },
  })

  return {
    kind: 'food',
    ids: [created.id],
    message: `${label} added to ${meal}.`,
  }
}

function reviewedNutrient(item: any, keys: string[], required: boolean): number | null {
  let raw: unknown
  for (const key of keys) {
    if (item?.[key] !== undefined) { raw = item[key]; break }
  }
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    if (required) throw new Error('Meal nutrition is incomplete. Please review each food before saving.')
    return null
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error('Meal nutrition is invalid. Please review each food before saving.')
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error('Meal nutrition is invalid. Please review each food before saving.')
  return value
}

async function saveBuiltMeal(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const food = draft?.food || {}
  const targetDate = localDate(draft?.localDate)
  const createdAt = reviewedTimestamp(draft)
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
    const servings = item?.servings === undefined || item.servings === null ? 1 : Number(item.servings)
    if (!Number.isFinite(servings) || servings <= 0) throw new Error('Please review the food amount before saving.')
    const calories = reviewedNutrient(item, ['calories', 'calories_kcal'], true)
    const fiber = reviewedNutrient(item, ['fiber_g', 'fiber'], false)
    const sugar = reviewedNutrient(item, ['sugar_g', 'sugar'], false)
    return {
      ...(item && typeof item === 'object' ? item : {}),
      id: item?.id || `voice-meal:${crypto.randomUUID()}`,
      name: requestedName,
      label: requestedName,
      serving_size: serving,
      servings,
      calories,
      calories_kcal: calories,
      protein_g: reviewedNutrient(item, ['protein_g', 'protein'], true),
      carbs_g: reviewedNutrient(item, ['carbs_g', 'carbs'], true),
      fat_g: reviewedNutrient(item, ['fat_g', 'fat'], true),
      fiber,
      fiber_g: fiber,
      sugar,
      sugar_g: sugar,
      __voicePlainIngredient: true,
    }
  })
  const isSingleIngredient = normalizedItems.length === 1
  const firstItemLabel = isSingleIngredient
    ? cleanText(entries[0]?.name || normalizedItems[0]?.requestedName || normalizedItems[0]?.label || normalizedItems[0]?.name, 160)
    : ''
  const label = cleanText(food.mealName || food.name || food.label, 160) ||
    (isSingleIngredient ? firstItemLabel : cleanText(draft?.summary || `${meal} meal`, 160)) ||
    `${meal} meal`
  const totals = normalizedItems.reduce(
    (acc: any, item: any) => {
      const servings = Number.isFinite(Number(item?.servings)) && Number(item.servings) > 0 ? Number(item.servings) : 1
      acc.calories += Math.max(0, Number(item?.calories ?? item?.calories_kcal) || 0) * servings
      acc.protein += Math.max(0, Number(item?.protein_g ?? item?.protein) || 0) * servings
      acc.carbs += Math.max(0, Number(item?.carbs_g ?? item?.carbs) || 0) * servings
      acc.fat += Math.max(0, Number(item?.fat_g ?? item?.fat) || 0) * servings
      acc.fiber = acc.fiber === null || item.fiber_g === null ? null : acc.fiber + item.fiber_g * servings
      acc.sugar = acc.sugar === null || item.sugar_g === null ? null : acc.sugar + item.sugar_g * servings
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
    fiber: totals.fiber,
    fiber_g: totals.fiber,
    sugar: totals.sugar,
    sugar_g: totals.sugar,
    ...(typeof food.nutrition?.__waterLogId === 'string' ? {
      __drinkType: food.nutrition.__drinkType,
      __drinkAmount: food.nutrition.__drinkAmount,
      __drinkUnit: food.nutrition.__drinkUnit,
      __drinkAmountMl: food.nutrition.__drinkAmountMl,
      __waterLogId: food.nutrition.__waterLogId,
    } : {}),
    ...(isSingleIngredient
      ? { __voiceSingleIngredient: true, method: 'single-ingredient' }
      : { __voiceBuiltMeal: true, customMeal: true, method: 'meal-builder' }),
  }

  const created = await db.foodLog.create({
    data: {
      userId,
      name: label,
      description: normalizedItems.map((item: any) => item.name).join(', '),
      imageUrl: null,
      nutrients: nutrition,
      items: normalizedItems,
      localDate: targetDate,
      ...(createdAt ? { createdAt } : {}),
      meal,
      category: meal,
    },
  })

  return {
    kind: 'food',
    ids: [created.id],
    message: `${label} added to ${meal}.`,
  }
}

async function saveHealthIntakeItems(userId: string, draft: any) {
  const rawItems = Array.isArray(draft?.healthIntake?.items) ? draft.healthIntake.items : []
  const parsedItems = rawItems.map((item: any) => normalizeHealthIntakeSaveItem(item)).filter(Boolean) as Array<{
    type: 'supplement' | 'medication'
    name: string
    dosage: string
    timing: string[]
    imageUrl: string | null
    method?: string
  }>
  if (!parsedItems.length) throw new Error('No medications or supplements to save.')

  const supplementAdds = dedupeHealthIntakeSaveItems(parsedItems.filter((item) => item.type === 'supplement'))
  const medicationAdds = dedupeHealthIntakeSaveItems(parsedItems.filter((item) => item.type === 'medication'))
  const changedTypes: Array<'supplements' | 'medications'> = []
  let savedSupplements = 0
  let savedMedications = 0

  if (supplementAdds.length) {
    const existing = await prisma.supplement.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    const creates: typeof supplementAdds = []
    const updates: Array<ReturnType<typeof prisma.supplement.update>> = []

    for (const item of supplementAdds) {
      const match = findExistingHealthIntakeItem(existing, item)
      if (!match) {
        creates.push(item)
        continue
      }
      const data = buildHealthIntakeExistingUpdate(match, item)
      if (data) updates.push(prisma.supplement.update({ where: { id: match.id }, data }))
    }

    const transaction = [
      ...updates,
      ...(creates.length
        ? [
            prisma.supplement.createMany({
              data: creates.map((item) => ({
                userId,
                name: item.name,
                dosage: item.dosage || '',
                timing: item.timing || [],
                imageUrl: item.imageUrl || null,
              })),
            }),
          ]
        : []),
    ]

    if (transaction.length) {
      await prisma.$transaction(transaction)
      savedSupplements = creates.length + updates.length
    }

    try {
      const catalogRows = buildSupplementCatalogRows(creates, userId)
      if (catalogRows.length) {
        await ensureSupplementCatalogSchema()
        await prisma.supplementCatalog.createMany({ data: catalogRows, skipDuplicates: true })
      }
    } catch (error) {
      console.error('[native voice assistant] supplement catalog save skipped', error)
    }
    if (savedSupplements > 0) changedTypes.push('supplements')
  }

  if (medicationAdds.length) {
    const existing = await prisma.medication.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    const creates: typeof medicationAdds = []
    const updates: Array<ReturnType<typeof prisma.medication.update>> = []

    for (const item of medicationAdds) {
      const match = findExistingHealthIntakeItem(existing, item)
      if (!match) {
        creates.push(item)
        continue
      }
      const data = buildHealthIntakeExistingUpdate(match, item)
      if (data) updates.push(prisma.medication.update({ where: { id: match.id }, data }))
    }

    const transaction = [
      ...updates,
      ...(creates.length
        ? [
            prisma.medication.createMany({
              data: creates.map((item) => ({
                userId,
                name: item.name,
                dosage: item.dosage || '',
                timing: item.timing || [],
                imageUrl: item.imageUrl || null,
              })),
            }),
          ]
        : []),
    ]

    if (transaction.length) {
      await prisma.$transaction(transaction)
      savedMedications = creates.length + updates.length
    }

    try {
      await ensureMedicationCatalogSchema()
      const catalogRows = buildMedicationCatalogRows(creates, userId)
      for (const row of catalogRows) {
        await prisma.$executeRawUnsafe(
          `
          INSERT INTO "MedicationCatalog" ("id", "userId", "brand", "product", "fullName", "dosage", "source", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("userId", "fullName", "dosage", "source") DO NOTHING
        `,
          `med-cat-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          row.userId || null,
          row.brand || null,
          row.product || null,
          row.fullName,
          row.dosage || '',
          row.source,
        )
      }
    } catch (error) {
      console.error('[native voice assistant] medication catalog save skipped', error)
    }
    if (savedMedications > 0) changedTypes.push('medications')
  }

  changedTypes.forEach((changeType) => {
    void triggerBackgroundRegeneration({
      userId,
      changeType,
      timestamp: new Date(),
    }).catch(() => {})
  })

  const count = savedSupplements + savedMedications
  const path = supplementAdds.length ? '/onboarding?step=6' : '/onboarding?step=7'
  return {
    kind: 'health_intake',
    path,
    counts: {
      supplements: savedSupplements,
      medications: savedMedications,
    },
    message: count > 0
      ? `Saved ${count} Health Intake item${count === 1 ? '' : 's'}. Please review them in Health Intake.`
      : 'Those Health Intake items were already saved. Please review them in Health Intake.',
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
    if (!verifyNativeVoiceDraft(user.id, draft)) {
      return NextResponse.json({ error: 'Please review this in Talk to Helfi before saving.' }, { status: 400 })
    }

    let result: any
    const supportedAction =
      draft.action === 'exercise' ||
      draft.action === 'mood' ||
      draft.action === 'journal' ||
      draft.action === 'water' ||
      draft.action === 'symptom_note' ||
      draft.action === 'health_intake_items' ||
      draft.action === 'food_copy_previous' ||
      draft.action === 'food_favorite' ||
      draft.action === 'food_build_meal'
    if (!supportedAction) return NextResponse.json({ error: 'This action is not supported yet.' }, { status: 400 })
    try {
      const atomicFoodAction = ['water', 'food_copy_previous', 'food_favorite', 'food_build_meal'].includes(draft.action)
      if (atomicFoodAction) {
        result = await prisma.$transaction(async (tx) => {
          await markReviewTokenUsed(user.id, draft, tx)
          let saved: any
          if (draft.action === 'water') saved = await saveWater(user.id, draft, tx)
          else if (draft.action === 'food_copy_previous') saved = await copyPreviousFood(user.id, draft, tx)
          else if (draft.action === 'food_favorite') saved = await saveFavoriteFood(user.id, draft, tx)
          else saved = await saveBuiltMeal(user.id, draft, tx)
          await completeReviewToken(user.id, draft, saved, tx)
          return saved
        }, { maxWait: 5000, timeout: 15000 })
      } else {
        // Existing non-food handlers retain their own schema/catalog behavior.
        // An interrupted claim stays pending, never evidence of a completed save.
        await markReviewTokenUsed(user.id, draft)
        if (draft.action === 'exercise') result = await saveExercise(user.id, draft)
        else if (draft.action === 'mood') result = await saveMood(user.id, draft)
        else if (draft.action === 'journal') result = await saveJournal(user.id, draft)
        else if (draft.action === 'symptom_note') result = await saveSymptomNote(user.id, draft)
        else if (draft.action === 'health_intake_items') result = await saveHealthIntakeItems(user.id, draft)
        await completeReviewToken(user.id, draft, result)
      }
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const saved = await completedReviewResult(user.id, draft)
        if (saved) return NextResponse.json({ success: true, idempotentReplay: true, result: saved })
        return NextResponse.json({
          error: 'The earlier save has no confirmed result yet. Please check your history before trying again.',
          code: 'voice_save_result_unconfirmed',
        }, { status: 409 })
      }
      throw error
    }

    if (result.kind === 'food' || (result.kind === 'water' && result.foodId)) {
      void triggerBackgroundRegeneration({ userId: user.id, changeType: 'food', timestamp: new Date() }).catch(() => {})
      void deleteSmartCoachNotificationsByCategories(user.id, ['meal', 'macro']).catch(() => {})
    }
    if (result.kind === 'water') {
      void deleteSmartCoachNotificationsByCategories(user.id, ['hydration']).catch(() => {})
    }
    if (draft.action === 'food_favorite') {
      const favoriteId = cleanText(draft.food?.favorite?.id, 120)
      if (favoriteId) void touchStoredFavorite(user.id, favoriteId).catch(() => {})
    }

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('[native voice assistant] confirm failed', error)
    return NextResponse.json({ error: error?.message || 'Could not save this voice action' }, { status: 500 })
  }
}
