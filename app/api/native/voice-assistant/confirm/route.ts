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
import { beginVoiceActionTrace, finishVoiceActionTrace } from '@/lib/native-voice-action-observability'
import { executeNativeVoiceRecordAction } from '@/lib/native-voice-record-actions'
import { executeVoicePreferenceAction } from '@/lib/native-voice-preference-actions'
import { executeVoiceNotificationAction } from '@/lib/native-voice-notification-actions'
import { ensureSupplementCatalogSchema } from '@/lib/supplement-catalog-db'
import { ensureMedicationCatalogSchema } from '@/lib/medication-catalog-db'
import { applyNativeVoiceRecipeMetadata } from '@/lib/native-voice-recipe-metadata'
import { executeVoiceRecipeUrlImport } from '@/lib/native-voice-recipe-url-import'
import { executeVoiceSupportAction } from '@/lib/native-voice-support-actions'
import { executeVoiceReportAction, executeVoiceReportPdfAction, refreshVoiceReportPdfAccess } from '@/lib/native-voice-report-actions'
import { executeVoiceAdditionalAction } from '@/lib/native-voice-additional-actions'
import { executeVoiceHistoryAction } from '@/lib/native-voice-history-actions'
import { authorizeNativeVoiceDeviceAction } from '@/lib/native-voice-device-actions'
import { saveNativeVoiceMood } from '@/lib/native-voice-mood-context'
import { nativeVoiceFoodCopyVersion, nativeVoiceFoodCopyWaterVersion, nativeVoiceFoodCopyWaterId, relinkNativeVoiceCopiedDrink } from '@/lib/native-voice-food-copy'

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
const REVIEW_RESULT_CHUNK_IDENTIFIER_PREFIX = 'native-voice-review-chunk'
const REVIEW_RESULT_CHUNK_CHARS = 1024
const REVIEW_RESULT_MAX_CHUNKS = 10000
const USED_REVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function usedReviewTokenIdentifier(userId: string) {
  return `${USED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}`
}

function usedReviewTokenDigest(token: unknown) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url')
}

function reviewResultChunkPrefix(userId: string, digest?: string) {
  const owner = usedReviewTokenDigest(userId)
  return `${REVIEW_RESULT_CHUNK_IDENTIFIER_PREFIX}:${owner}:${digest ? `${digest}:` : ''}`
}

function reviewResultChunkToken(userId: string, digest: string, index: number) {
  return usedReviewTokenDigest(JSON.stringify(['native-voice-result-chunk-v1', userId, digest, index]))
}

function isReviewResult(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof value.kind === 'string' && typeof value.message === 'string'
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
          { identifier: { startsWith: reviewResultChunkPrefix(userId) } },
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

async function completeReviewToken(userId: string, draft: any, result: any, db?: Prisma.TransactionClient) {
  if (!isReviewResult(result)) throw new Error('The action did not return a complete result receipt.')
  const payload = Buffer.from(JSON.stringify(result), 'utf8')
  const encoded = payload.toString('base64')
  const count = Math.ceil(encoded.length / REVIEW_RESULT_CHUNK_CHARS)
  if (!count || count > REVIEW_RESULT_MAX_CHUNKS) throw new Error('This result is too large to store safely. Please check the app before retrying.')
  const digest = usedReviewTokenDigest(draft.reviewToken)
  const prefix = reviewResultChunkPrefix(userId, digest)
  const marker = { receiptVersion: 2, count, bytes: payload.length, sha256: crypto.createHash('sha256').update(payload).digest('hex') }
  const persist = async (tx: Prisma.TransactionClient) => {
    const claim = await tx.verificationToken.findUnique({ where: { token: digest } })
    if (!claim || claim.identifier !== usedReviewTokenIdentifier(userId) || claim.expires.getTime() <= Date.now()) throw new Error('This save no longer has an active result claim. Please check the app before retrying.')
    // Both VerificationToken string fields are indexed. Never store the whole
    // recipe/result in either one: each new ASCII index value stays bounded.
    const written = await tx.verificationToken.createMany({ data: Array.from({ length: count }, (_, index) => ({
      token: reviewResultChunkToken(userId, digest, index),
      identifier: `${prefix}${index}:${encoded.slice(index * REVIEW_RESULT_CHUNK_CHARS, (index + 1) * REVIEW_RESULT_CHUNK_CHARS)}`,
      expires: claim.expires,
    })) })
    if (written.count !== count) throw new Error('The result receipt was not stored completely. Please check the app before retrying.')
    await tx.verificationToken.update({ where: { token: digest }, data: { identifier: `${COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}:${JSON.stringify(marker)}` } })
    if (!await completedReviewResult(userId, draft, tx)) throw new Error('The stored result receipt could not be verified. Please check the app before retrying.')
  }
  // Food saves already supply their atomic transaction. Other actions have
  // happened through their normal handlers; publish their receipt atomically.
  if (db) await persist(db)
  else await prisma.$transaction(persist, { maxWait: 5000, timeout: 15000 })
}

async function completedReviewResult(userId: string, draft: any, db: Prisma.TransactionClient = prisma) {
  const digest = usedReviewTokenDigest(draft.reviewToken)
  const row = await db.verificationToken.findUnique({ where: { token: digest } })
  const prefix = `${COMPLETED_REVIEW_TOKEN_IDENTIFIER_PREFIX}:${userId}:`
  if (!row?.identifier.startsWith(prefix) || row.expires.getTime() <= Date.now()) return null
  try {
    const marker = JSON.parse(row.identifier.slice(prefix.length))
    // Keep replay compatibility with receipts written before chunk storage.
    if (isReviewResult(marker)) return marker
    if (marker?.receiptVersion !== 2 || !Number.isInteger(marker.count) || marker.count < 1 || marker.count > REVIEW_RESULT_MAX_CHUNKS
      || !Number.isInteger(marker.bytes) || marker.bytes < 1 || marker.bytes > REVIEW_RESULT_MAX_CHUNKS * REVIEW_RESULT_CHUNK_CHARS * 3 / 4
      || typeof marker.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(marker.sha256)) return null
    const chunkPrefix = reviewResultChunkPrefix(userId, digest)
    const chunks = await db.verificationToken.findMany({ where: { identifier: { startsWith: chunkPrefix }, expires: { gt: new Date() } },
      select: { identifier: true, token: true } })
    if (chunks.length !== marker.count) return null
    const parts = new Map<number, string>()
    for (const chunk of chunks) {
      const match = chunk.identifier.slice(chunkPrefix.length).match(/^(0|[1-9]\d*):([A-Za-z0-9+/]+={0,2})$/)
      if (!match) return null
      const index = Number(match[1])
      const data = match[2]
      if (index >= marker.count || parts.has(index) || data.length > REVIEW_RESULT_CHUNK_CHARS || (index < marker.count - 1 && data.length !== REVIEW_RESULT_CHUNK_CHARS)
        || chunk.token !== reviewResultChunkToken(userId, digest, index)) return null
      parts.set(index, data)
    }
    const encoded = Array.from({ length: marker.count }, (_, index) => parts.get(index)).join('')
    const payload = Buffer.from(encoded, 'base64')
    if (payload.toString('base64') !== encoded || payload.length !== marker.bytes || crypto.createHash('sha256').update(payload).digest('hex') !== marker.sha256) return null
    const result = JSON.parse(payload.toString('utf8'))
    return isReviewResult(result) ? result : null
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
      startTime: reviewedTimestamp(draft) || null,
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
        ...(spokenCalories !== null ? { caloriesOverride: spokenCalories } : {}),
        estimatedCaloriesKcal: estimatedCalories,
      },
    },
  })

  return { kind: 'exercise', id: entry.id, message: 'Exercise saved.' }
}

async function saveMood(request: NextRequest, userId: string, draft: any) {
  return saveNativeVoiceMood(request,userId,draft)
}

function assertJournalSymptomTiming(draft: any, symptom = false) {
  if (draft?.localTime !== undefined && draft.localTime !== null && draft.localTime !== '') throw new Error('Please review this note without a chosen clock time; that time cannot be saved.')
  if (!symptom) return
  let today: string
  if (draft?.timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: draft.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
      const part = (type: string) => parts.find(value => value.type === type)?.value
      today = `${part('year')}-${part('month')}-${part('day')}`
    } catch { throw new Error('Please review your current local date before saving this symptom note.') }
  } else {
    const offset = draft?.tzOffsetMin ?? 0
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < -840 || offset > 840) throw new Error('Please review your current local date before saving this symptom note.')
    today = new Date(Date.now() - offset * 60 * 1000).toISOString().slice(0, 10)
  }
  if (localDate(draft?.localDate) !== today) throw new Error('Symptom Notes cannot save a note under another date. Please review it for today and include when symptoms happened in the note.')
}

async function saveJournal(userId: string, draft: any) {
  assertJournalSymptomTiming(draft)
  const journal = draft?.journal || {}
  const title = cleanText(journal.title || 'Voice journal note', 120)
  const content = cleanText(journal.content, 20000)
  const explicitJournalType = String(journal.journalType || journal.type || '').toLowerCase()
  const journalType = explicitJournalType === 'mood' ? 'mood' : explicitJournalType === 'health' || /\bhealth journal\b/i.test(String(draft?.transcript || ''))
    ? 'health'
    : 'mood'
  const tags = Array.isArray(journal.tags)
    ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 12)
    : []
  const date = localDate(draft?.localDate)
  const id = crypto.randomUUID()

  if (!title && !content) throw new Error('Journal entry is empty')
  if (!content) throw new Error('Journal text is missing. Please review the note before saving.')
  if (journalType === 'health') {
    if (journal.title || Array.isArray(journal.tags) && journal.tags.length) throw new Error('Please review this health journal note as text and date only. Titles and tags cannot be saved in the health journal.')
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
  assertJournalSymptomTiming(draft, true)
  const symptom = draft?.symptom && typeof draft.symptom === 'object' ? draft.symptom : {}
  const symptoms = Array.isArray(symptom.symptoms)
    ? symptom.symptoms.map((item: any) => cleanText(item, 80)).filter(Boolean).slice(0, 12)
    : []
  const safeSymptoms = symptoms
  if (!safeSymptoms.length) throw new Error('Symptom note is empty')

  const duration = cleanText(symptom.duration, 120) || null
  const notes = cleanText(symptom.notes ?? '', 1200) || null
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

function reviewedDrinkSweetenerMetadata(draft: any) {
  const sweetener = draft?.water?.sweetener
  const items = Array.isArray(draft?.food?.items) ? draft.food.items : []
  const added = items.filter((item: any) => {
    const name = String(item?.__voiceSourceFood?.name || item?.name || '')
    return !/\bmilk\b/i.test(name) && /^(?:sugars?\b|honey\b|(?:white|brown|raw|granulated|caster|powdered|turbinado|coconut|maple)\s+.*\bsugar\b)/i.test(name.trim())
  })
  if (!added.length) {
    if (sweetener && sweetener.type !== 'free') throw new Error('Please resolve the added sweetener from its food source before saving.')
    return { __sweetenerChoice: 'free', __sweetenerType: null, __sweetenerAmount: null, __sweetenerUnit: null,
      __sweetenerGrams: 0, __sweetenerCalories: 0, __sweetenerCarbs: 0, __sweetenerSugar: 0 }
  }
  if (added.length !== 1 || !sweetener || !['sugar', 'honey'].includes(sweetener.type)) throw new Error('Please review one source-resolved added sweetener before saving.')
  const item = added[0], source = item.__voiceSourceFood
  const amount = sweetener.amount, unit = sweetener.unit, grams = sweetener.grams
  const serving = String(item.serving_size || '').match(/^(\d+(?:\.\d+)?)\s*g(?:rams?)?$/i)
  const servings = item.servings ?? 1
  const measuredGrams = amount * (unit === 'g' ? 1 : sweetener.type === 'honey' ? unit === 'tbsp' ? 21 : 7 : unit === 'tbsp' ? 12 : 4)
  if (!source?.id || typeof source.name !== 'string' || !source.name.trim() || item.nutritionCoversServing !== true || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
    !['g', 'tsp', 'tbsp'].includes(unit) || typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0 || !serving ||
    typeof servings !== 'number' || !Number.isFinite(servings) || servings <= 0 || Math.abs(Number(serving[1]) * servings - grams) > 0.00001 || Math.abs(measuredGrams - grams) > 0.00001 ||
    (/\bhoney\b/i.test(source.name) ? 'honey' : 'sugar') !== sweetener.type) throw new Error('Please review the added sweetener amount and food source before saving.')
  const calories = reviewedNutrient(item, ['calories', 'calories_kcal'], true)!
  const carbs = reviewedNutrient(item, ['carbs_g', 'carbs'], true)!
  const sugar = reviewedNutrient(item, ['sugar_g', 'sugar'], false)
  const sourceCalories = reviewedNutrient(source, ['calories', 'calories_kcal'], true)!
  if (sourceCalories <= 0) throw new Error('Please review the sweetener food source before saving.')
  const ratio = calories / sourceCalories
  for (const [names, optional] of [[['protein_g', 'protein'], false], [['carbs_g', 'carbs'], false], [['fat_g', 'fat'], false], [['fiber_g', 'fiber'], true], [['sugar_g', 'sugar'], true]] as const) {
    const actual = reviewedNutrient(item, [...names], !optional), basis = reviewedNutrient(source, [...names], !optional)
    if ((actual === null) !== (basis === null) || (actual !== null && basis !== null && Math.abs(actual - basis * ratio) > 0.002)) throw new Error('The added sweetener nutrition does not match its reviewed food source.')
  }
  return { __sweetenerChoice: 'with', __sweetenerType: sweetener.type, __sweetenerAmount: amount, __sweetenerUnit: unit,
    __sweetenerGrams: grams, __sweetenerCalories: calories * servings, __sweetenerCarbs: carbs * servings, __sweetenerSugar: sugar === null ? null : sugar * servings }
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
  const sweetenerMetadata = needsFood ? reviewedDrinkSweetenerMetadata(draft) : {}

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
          ...sweetenerMetadata,
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
  const ids = food.sourceLogIds
  const targetDate = localDate(draft?.localDate)
  const sourceDate=localDate(food.sourceDate)
  const createdAt = reviewedTimestamp(draft)
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error('Please review the complete source meal before copying.')
  const versions=food.sourceVersions,waterVersions=food.sourceWaterVersions
  const validVersions=(values:any)=>Array.isArray(values)&&values.every(value=>value&&typeof value.id==='string'&&typeof value.version==='string'&&/^[a-f0-9]{64}$/.test(value.version))&&new Set(values.map(value=>value.id)).size===values.length
  if(!validVersions(versions)||versions.length!==ids.length||versions.some((value:any)=>!ids.includes(value.id))||!validVersions(waterVersions))throw new Error('The meal needs a fresh review before copying. Nothing has been copied.')

  const sourceRows = await db.foodLog.findMany({
    where: { id: { in: ids }, userId,localDate:sourceDate },
    orderBy: { createdAt: 'asc' },
  })
  if(sourceRows.length!==ids.length||new Set(sourceRows.map(row=>row.id)).size!==ids.length||sourceRows.some(row=>row.userId!==userId||row.localDate!==sourceDate||!ids.includes(row.id)||versions.find((value:any)=>value.id===row.id)?.version!==nativeVoiceFoodCopyVersion(row)))throw new Error('The source meal changed after review. Please review the complete meal again; nothing has been copied.')
  const sourceWaterIds=sourceRows.map(nativeVoiceFoodCopyWaterId).filter((id):id is string=>Boolean(id))
  if(new Set(sourceWaterIds).size!==sourceWaterIds.length||waterVersions.length!==sourceWaterIds.length||waterVersions.some((value:any)=>!sourceWaterIds.includes(value.id)))throw new Error('The source drink links changed or are ambiguous. Please review this meal again.')
  const sourceWaters=sourceWaterIds.length?await db.waterLog.findMany({where:{id:{in:sourceWaterIds},userId,localDate:sourceDate}}):[]
  if(sourceWaters.length!==sourceWaterIds.length||new Set(sourceWaters.map(row=>row.id)).size!==sourceWaters.length||sourceWaters.some(row=>row.userId!==userId||row.localDate!==sourceDate||waterVersions.find((value:any)=>value.id===row.id)?.version!==nativeVoiceFoodCopyWaterVersion(row)))throw new Error('A source drink changed or lost its hydration entry. Please review that drink before copying; nothing has been copied.')

  const createdIds: string[] = []
  const expectedFoods:any[]=[],expectedWaters:any[]=[]
  const copyTime=createdAt||new Date()
  const allocated=new Set<string>([...ids,...sourceWaterIds])
  const newId=()=>{const id=crypto.randomUUID();if(allocated.has(id))throw new Error('Please prepare the meal copy again.');allocated.add(id);return id}
  for (const row of sourceRows) {
    let nutrients:any=row.nutrients??null,items:any=row.items??null
    const waterId=nativeVoiceFoodCopyWaterId(row),water=waterId?sourceWaters.find(value=>value.id===waterId):null
    if(water){
      const copiedWaterId=newId()
      expectedWaters.push({id:copiedWaterId,userId,amount:water.amount,unit:water.unit,amountMl:water.amountMl,label:water.label,category:water.category,localDate:targetDate,createdAt:copyTime})
      nutrients=relinkNativeVoiceCopiedDrink(nutrients,water.id,copiedWaterId);items=relinkNativeVoiceCopiedDrink(items,water.id,copiedWaterId)
      if(nutrients&&typeof nutrients==='object'&&!Array.isArray(nutrients))Object.assign(nutrients,{__waterLogId:copiedWaterId,__drinkAmount:water.amount,__drinkUnit:water.unit,__drinkAmountMl:water.amountMl})
    }
    const id=newId()
    createdIds.push(id)
    expectedFoods.push({id,userId,name:row.name,description:row.description,imageUrl:row.imageUrl,nutrients,items,localDate:targetDate,createdAt:copyTime,meal:row.meal,category:row.category})
  }
  // A meal needs a constant number of database round trips, including drinks.
  // Batch counts and full readback are required inside the caller's transaction.
  if(expectedWaters.length){const written=await db.waterLog.createMany({data:expectedWaters});if(written.count!==expectedWaters.length)throw new Error('The app did not confirm every copied hydration entry.')}
  const written=await db.foodLog.createMany({data:expectedFoods.map(row=>({...row,nutrients:row.nutrients??Prisma.JsonNull,items:row.items??Prisma.JsonNull}))})
  if(written.count!==expectedFoods.length)throw new Error('The app did not confirm every copied food entry.')
  const savedFoods=await db.foodLog.findMany({where:{id:{in:createdIds},userId}})
  if(savedFoods.length!==expectedFoods.length||new Set(savedFoods.map(row=>row.id)).size!==expectedFoods.length||expectedFoods.some(expected=>{const actual=savedFoods.find(row=>row.id===expected.id);return !actual||nativeVoiceFoodCopyVersion(actual)!==nativeVoiceFoodCopyVersion(expected)}))throw new Error('The app could not verify every copied food entry. Please check your diary before retrying.')
  if(expectedWaters.length){
    const savedWaters=await db.waterLog.findMany({where:{id:{in:expectedWaters.map(row=>row.id)},userId}})
    if(savedWaters.length!==expectedWaters.length||new Set(savedWaters.map(row=>row.id)).size!==expectedWaters.length||expectedWaters.some(expected=>{const actual=savedWaters.find(row=>row.id===expected.id);return !actual||nativeVoiceFoodCopyWaterVersion(actual)!==nativeVoiceFoodCopyWaterVersion(expected)}))throw new Error('The app could not verify every copied hydration entry. Please check your diary before retrying.')
  }

  return {
    kind: 'food',
    ids: createdIds,
    ...(expectedWaters.length?{waterIds:expectedWaters.map(row=>row.id)}:{}),
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
  let nutrition: Record<string, any> = {
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
    ...(!food.nutrition?.__waterLogId && (!isSingleIngredient || food.nutrition?.__importRecipe) ? { __origin: 'meal-builder' } : {}),
    ...(typeof food.nutrition?.__waterLogId === 'string' ? {
      __drinkType: food.nutrition.__drinkType,
      __drinkAmount: food.nutrition.__drinkAmount,
      __drinkUnit: food.nutrition.__drinkUnit,
      __drinkAmountMl: food.nutrition.__drinkAmountMl,
      __waterLogId: food.nutrition.__waterLogId,
      ...Object.fromEntries(['__sweetenerChoice', '__sweetenerType', '__sweetenerAmount', '__sweetenerUnit', '__sweetenerGrams', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar']
        .filter(key => Object.prototype.hasOwnProperty.call(food.nutrition, key)).map(key => [key, food.nutrition[key]])),
    } : {}),
    ...(isSingleIngredient
      ? { __voiceSingleIngredient: true, method: 'single-ingredient' }
      : { __voiceBuiltMeal: true, customMeal: true, method: 'meal-builder' }),
  }

  if (food.nutrition?.__importRecipe) {
    nutrition = applyNativeVoiceRecipeMetadata({ items: normalizedItems, nutrition }, food.nutrition.__importRecipe, {
      servingsEaten: food.nutrition.__nativeRecipeServingsEaten,
      portionControlEnabled: food.nutrition.__portionControlEnabled,
    }).nutrition
  }

  const created = await db.foodLog.create({
    data: {
      userId,
      name: label,
      description: label,
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
      console.error('[native voice assistant] supplement catalog save skipped')
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
      console.error('[native voice assistant] medication catalog save skipped')
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
  const trace = beginVoiceActionTrace(request, 'save')
  return finishVoiceActionTrace(await confirmVoiceAction(request, trace), trace)
}

async function confirmVoiceAction(request: NextRequest, trace?: { userId?: string; action?: string }) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (trace) trace.userId = user.id

    const body = await request.json().catch(() => ({} as any))
    const draft = body?.draft || body
    if (trace && ['exercise', 'mood', 'journal', 'water', 'symptom_note', 'health_intake_items', 'food_copy_previous', 'food_favorite', 'food_build_meal', 'record_action', 'preference_action', 'local_preference_action', 'notification_action', 'recipe_import_url', 'support_action', 'report_action', 'additional_action', 'device_action'].includes(draft?.action)) trace.action = draft.action
    // A completed receipt is an authenticated, read-only recovery by opaque
    // token. Its own 24-hour expiry applies even after the shorter review ends.
    // Return only stored data; edited client payload fields never execute here.
    if (typeof draft?.reviewToken === 'string' && /^v1\.[A-Za-z0-9_-]{43}$/.test(draft.reviewToken)) {
      const completed = await completedReviewResult(user.id, { reviewToken: draft.reviewToken })
      if (completed?.action === 'reports.weekly.export_pdf') return NextResponse.json({ success: true, idempotentReplay: true, result: completed, reportPdfAccess: await refreshVoiceReportPdfAccess(request, user.id, completed) })
      if (completed) return NextResponse.json({ success: true, idempotentReplay: true, result: completed })
    }
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
    let reportPdfAccess: any
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
      || draft.action === 'record_action'
      || draft.action === 'preference_action'
      || draft.action === 'local_preference_action'
      || draft.action === 'notification_action'
      || draft.action === 'recipe_import_url'
      || draft.action === 'support_action'
      || draft.action === 'report_action'
      || draft.action === 'additional_action'
      || draft.action === 'device_action'
    if (!supportedAction) return NextResponse.json({ error: 'This action is not supported yet.' }, { status: 400 })
    if (draft.action === 'device_action') return NextResponse.json(await authorizeNativeVoiceDeviceAction(request, user.id, draft))
    if (draft.action === 'local_preference_action') {
      const pref = draft.localPreference
      const valid = pref && (['darkMode', 'hapticsEnabled', 'dataAnalytics'].includes(pref.key) ? typeof pref.value === 'boolean' : pref.key === 'profileVisibility' && ['private', 'public', 'friends'].includes(pref.value))
      if (!valid) return NextResponse.json({ error: 'Please review a supported device setting.', code: 'device_preference_invalid' }, { status: 400 })
      return NextResponse.json({ success: true, localPreferenceAuthorized: true, authorizedPreference: { key: pref.key, value: pref.value } })
    }
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
        if (draft.action === 'recipe_import_url') {
          result = await executeVoiceRecipeUrlImport(request, user.id, draft, { receiptClaimed: true, actionId: usedReviewTokenDigest(draft.reviewToken) })
          // Resolve the imported recipe through the normal authenticated review
          // route. Its source quantities are rechecked; importing never logs food.
          const nextTranscript = draft.recipeImport.destination === 'library' ? 'Save this recipe to my recipes' : `Log this recipe for ${draft.recipeImport.meal || 'dinner'}`
          const headers = new Headers(request.headers)
          headers.set('content-type', 'application/json')
          headers.delete('content-length')
          const nextRequest = new NextRequest(new URL('/api/native/voice-assistant', request.url), { method: 'POST', headers, body: JSON.stringify({ transcript: nextTranscript, localDate: draft.localDate, followUpDraft: result.nextRecipeDraft, aiConsentGranted: true, voiceReply: false }) })
          try {
            const response = await (await import('@/app/api/native/voice-assistant/route')).POST(nextRequest)
            const body = await response.json()
            if (response.ok && body?.draft) result.nextRecipeDraft = body.draft.canConfirm ? body.draft : { ...body.draft, action: 'recipe', canConfirm: false, recipe: body.draft.recipe || result.nextRecipeDraft.recipe }
          } catch {
            // Keep the full imported recipe for a later review. Never retry the
            // charged import automatically if normal food lookup is unavailable.
          }
        } else if (draft.action === 'support_action') {
          result = await executeVoiceSupportAction(request, user.id, draft, { receiptClaimed: true, actionId: usedReviewTokenDigest(draft.reviewToken) })
        } else if (draft.action === 'report_action') {
          if (draft.reportAction?.action === 'reports.weekly.export_pdf') {
            const exported = await executeVoiceReportPdfAction(request, user.id, draft, { receiptClaimed: true, actionId: usedReviewTokenDigest(draft.reviewToken) })
            result = exported.result
            reportPdfAccess = exported.reportPdfAccess
          } else result = await executeVoiceReportAction(request, user.id, draft, { receiptClaimed: true, actionId: usedReviewTokenDigest(draft.reviewToken) })
        } else if (draft.action === 'additional_action') {
          const execute = ['coach_history.delete', 'checkin_history.delete'].includes(draft.additionalAction?.action) ? executeVoiceHistoryAction : executeVoiceAdditionalAction
          result = await execute(request, user.id, draft, { receiptClaimed: true, actionId: usedReviewTokenDigest(draft.reviewToken) })
        } else if (draft.action === 'record_action') {
          const saved = await executeNativeVoiceRecordAction(request, user.id, draft.recordAction)
          result = { ...saved, kind: 'record_action', entity: draft.recordAction.entity }
        } else if (draft.action === 'preference_action') {
          const saved = await executeVoicePreferenceAction(request, user.id, draft.preferenceAction)
          if (!saved.saved) return NextResponse.json({ error: saved.message, code: `preference_${saved.status}` }, { status: 409 })
          result = { ...saved, kind: 'preference_action', id: draft.preferenceAction.action, operation: 'update', entity: 'preferences' }
        } else if (draft.action === 'notification_action') {
          const saved = await executeVoiceNotificationAction(request, user.id, draft.notificationAction)
          if (!saved.saved) return NextResponse.json({ error: saved.message, code: `notification_${saved.status}` }, { status: 409 })
          result = { ...saved, kind: 'notification_action', id: draft.notificationAction.action }
        } else if (draft.action === 'exercise') result = await saveExercise(user.id, draft)
        else if (draft.action === 'mood') result = await saveMood(request, user.id, draft)
        else if (draft.action === 'journal') result = await saveJournal(user.id, draft)
        else if (draft.action === 'symptom_note') result = await saveSymptomNote(user.id, draft)
        else if (draft.action === 'health_intake_items') result = await saveHealthIntakeItems(user.id, draft)
        await completeReviewToken(user.id, draft, result)
      }
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const saved = await completedReviewResult(user.id, draft)
        if (saved?.action === 'reports.weekly.export_pdf') return NextResponse.json({ success: true, idempotentReplay: true, result: saved, reportPdfAccess: await refreshVoiceReportPdfAccess(request, user.id, saved) })
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

    return NextResponse.json({ success: true, result, ...(reportPdfAccess ? { reportPdfAccess } : {}) })
  } catch (error: any) {
    const databaseCode = /^P\d{4}$/.test(String(error?.code || '')) ? String(error.code) : null
    const reasonCode = databaseCode === 'P2028' ? 'voice_transaction_timeout' : /^[a-z_]{1,80}$/.test(String(error?.code || '')) ? String(error.code) : 'voice_action_failed'
    console.error('[native voice assistant] confirm failed', { reasonCode, databaseCode })
    const message = databaseCode ? 'The save could not be completed. Please check your history before trying again.' : error?.message || 'Could not save this voice action'
    return NextResponse.json({ error: message, code: reasonCode }, { status: 500 })
  }
}
