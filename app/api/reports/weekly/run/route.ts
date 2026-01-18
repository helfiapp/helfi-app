import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { ensureTalkToAITables } from '@/lib/talk-to-ai-chat-store'
import { decryptFieldsBatch } from '@/lib/encryption'
import {
  createWeeklyReportRecord,
  getNextDueAt,
  getWeeklyReportState,
  markWeeklyReportOnboardingComplete,
  queueWeeklyReportNotification,
  summarizeCoverage,
  updateWeeklyReportRecord,
  upsertWeeklyReportState,
} from '@/lib/weekly-health-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const REPORT_SECTIONS = [
  'overview',
  'supplements',
  'medications',
  'nutrition',
  'hydration',
  'exercise',
  'lifestyle',
  'labs',
  'mood',
  'symptoms',
] as const

type ReportSectionKey = (typeof REPORT_SECTIONS)[number]
type ReportItem = { name?: string; reason?: string }
type ReportSectionBucket = { working: ReportItem[]; suggested: ReportItem[]; avoid: ReportItem[] }

const TALK_TO_AI_TOPICS: Array<{ topic: string; section: ReportSectionKey; keywords: string[] }> = [
  { topic: 'supplements', section: 'supplements', keywords: ['supplement', 'vitamin', 'mineral', 'magnesium', 'creatine', 'omega', 'probiotic'] },
  { topic: 'medications', section: 'medications', keywords: ['medication', 'meds', 'prescription', 'dosage', 'side effect', 'interaction'] },
  { topic: 'nutrition', section: 'nutrition', keywords: ['diet', 'nutrition', 'food', 'meal', 'protein', 'carb', 'calorie', 'fiber', 'sugar'] },
  { topic: 'hydration', section: 'hydration', keywords: ['water', 'hydration', 'fluids', 'drink', 'dehydration'] },
  { topic: 'exercise', section: 'exercise', keywords: ['exercise', 'workout', 'training', 'cardio', 'strength', 'lifting', 'run', 'cycling', 'yoga'] },
  { topic: 'sleep & stress', section: 'lifestyle', keywords: ['sleep', 'insomnia', 'stress', 'cortisol', 'relax'] },
  { topic: 'mood & focus', section: 'mood', keywords: ['mood', 'focus', 'brain fog', 'motivation', 'depression', 'anxiety'] },
  { topic: 'symptoms', section: 'symptoms', keywords: ['pain', 'bloating', 'gas', 'fatigue', 'tired', 'headache', 'nausea', 'reflux', 'constipation', 'diarrhea'] },
]

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

function toDateOnly(input: Date) {
  return input.toISOString().slice(0, 10)
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function buildDefaultSections(): Record<ReportSectionKey, ReportSectionBucket> {
  const section: ReportSectionBucket = { working: [], suggested: [], avoid: [] }
  return REPORT_SECTIONS.reduce((acc, key) => {
    acc[key] = { ...section }
    return acc
  }, {} as Record<ReportSectionKey, ReportSectionBucket>)
}

function resolveDayKey(localDate?: string | null, createdAt?: Date | string | null) {
  const local = String(localDate || '').trim()
  if (local) return local
  if (!createdAt) return ''
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function normalizeMealLabel(input?: string | null) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return 'other'
  if (raw.includes('breakfast')) return 'breakfast'
  if (raw.includes('lunch')) return 'lunch'
  if (raw.includes('dinner')) return 'dinner'
  if (raw.includes('snack')) return 'snacks'
  return raw
}

function buildNutritionSummary(
  foodLogs: Array<{ name: string | null; nutrients: any; createdAt: Date; localDate?: string | null; meal?: string | null }>
) {
  const totals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  }
  let counted = 0
  const foodCount: Record<string, number> = {}
  const dayTotals = new Map<
    string,
    {
      date: string
      entries: number
      calories: number
      protein_g: number
      carbs_g: number
      fat_g: number
      fiber_g: number
      sugar_g: number
      sodium_mg: number
      meals: Record<string, number>
    }
  >()

  for (const f of foodLogs) {
    const n = (f && f.nutrients) || {}
    const cals = Number(n.calories ?? n.kcal ?? 0) || 0
    const protein = Number(n.protein_g ?? n.protein ?? 0) || 0
    const carbs = Number(n.carbs_g ?? n.carbohydrates_g ?? n.carbohydrates ?? 0) || 0
    const fat = Number(n.fat_g ?? n.total_fat_g ?? 0) || 0
    const fiber = Number(n.fiber_g ?? n.dietary_fiber_g ?? 0) || 0
    const sugar = Number(n.sugar_g ?? n.sugars_g ?? 0) || 0
    const sodium = Number(n.sodium_mg ?? n.salt_mg ?? 0) || 0
    if (cals || protein || carbs || fat || fiber || sugar || sodium) {
      totals.calories += cals
      totals.protein_g += protein
      totals.carbs_g += carbs
      totals.fat_g += fat
      totals.fiber_g += fiber
      totals.sugar_g += sugar
      totals.sodium_mg += sodium
      counted += 1
    }
    const key = String(f.name || '').trim().toLowerCase()
    if (key) foodCount[key] = (foodCount[key] || 0) + 1

    const dayKey = resolveDayKey(f.localDate ?? null, f.createdAt)
    if (dayKey) {
      const existing = dayTotals.get(dayKey) || {
        date: dayKey,
        entries: 0,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
        meals: {},
      }
      existing.entries += 1
      existing.calories += cals
      existing.protein_g += protein
      existing.carbs_g += carbs
      existing.fat_g += fat
      existing.fiber_g += fiber
      existing.sugar_g += sugar
      existing.sodium_mg += sodium
      const mealKey = normalizeMealLabel(f.meal ?? null)
      existing.meals[mealKey] = (existing.meals[mealKey] || 0) + 1
      dayTotals.set(dayKey, existing)
    }
  }

  const topFoods = Object.entries(foodCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const dailyTotals = Array.from(dayTotals.values()).sort((a, b) => a.date.localeCompare(b.date))

  return {
    entriesWithNutrients: counted,
    totals,
    dailyAverages: {
      calories: counted ? Math.round(totals.calories / 7) : 0,
      protein_g: counted ? +(totals.protein_g / 7).toFixed(1) : 0,
      carbs_g: counted ? +(totals.carbs_g / 7).toFixed(1) : 0,
      fat_g: counted ? +(totals.fat_g / 7).toFixed(1) : 0,
      fiber_g: counted ? +(totals.fiber_g / 7).toFixed(1) : 0,
      sugar_g: counted ? +(totals.sugar_g / 7).toFixed(1) : 0,
      sodium_mg: counted ? Math.round(totals.sodium_mg / 7) : 0,
    },
    daysWithLogs: dayTotals.size,
    dailyTotals,
    topFoods,
  }
}

function buildHydrationSummary(
  waterLogs: Array<{ amountMl: number | null; label?: string | null; localDate?: string | null; createdAt: Date }>
) {
  let totalMl = 0
  const daySet = new Set<string>()
  const labelCounts = new Map<string, { label: string; count: number }>()
  const dayTotals = new Map<string, { date: string; entries: number; totalMl: number }>()

  for (const log of waterLogs) {
    const ml = Number(log?.amountMl ?? 0) || 0
    totalMl += ml
    const day = resolveDayKey(log?.localDate ?? null, log?.createdAt ?? null)
    if (day) daySet.add(day)
    const rawLabel = String(log?.label || '').trim()
    const key = rawLabel.toLowerCase()
    if (key) {
      const existing = labelCounts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        labelCounts.set(key, { label: rawLabel, count: 1 })
      }
    }
    if (day) {
      const existing = dayTotals.get(day) || { date: day, entries: 0, totalMl: 0 }
      existing.entries += 1
      existing.totalMl += ml
      dayTotals.set(day, existing)
    }
  }

  const topDrinks = Array.from(labelCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const roundedTotal = Math.round(totalMl * 10) / 10
  return {
    entries: waterLogs.length,
    totalMl: roundedTotal,
    dailyAverageMl: Math.round((roundedTotal / 7) * 10) / 10,
    daysWithLogs: daySet.size,
    topDrinks,
    dailyTotals: Array.from(dayTotals.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

function clipText(value: string, max = 220) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 3)).trim()}...`
}

function buildTalkToAiSummary(
  messages: Array<{ role: string; content: string; createdAt: Date }>
) {
  if (!messages.length) {
    return {
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      activeDays: 0,
      lastMessageAt: null,
      topics: [],
      highlights: [],
    }
  }

  const sorted = [...messages].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const userMessages = sorted.filter((m) => m.role === 'user')
  const assistantMessages = sorted.filter((m) => m.role === 'assistant')
  const days = new Set<string>()
  sorted.forEach((m) => days.add(m.createdAt.toISOString().slice(0, 10)))

  const topicCounts = new Map<string, { topic: string; section: ReportSectionKey; count: number }>()
  userMessages.forEach((m) => {
    const lower = String(m.content || '').toLowerCase()
    TALK_TO_AI_TOPICS.forEach((topic) => {
      if (topic.keywords.some((k) => lower.includes(k))) {
        const existing = topicCounts.get(topic.topic) || { ...topic, count: 0 }
        existing.count += 1
        topicCounts.set(topic.topic, existing)
      }
    })
  })

  const topics = Array.from(topicCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(({ topic, section, count }) => ({ topic, section, count }))

  const highlights = userMessages
    .slice(0, 10)
    .map((m) => ({
      role: 'user',
      createdAt: m.createdAt.toISOString(),
      content: clipText(m.content, 240),
    }))
    .reverse()

  return {
    messageCount: sorted.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    activeDays: days.size,
    lastMessageAt: sorted[0]?.createdAt?.toISOString() || null,
    topics,
    highlights,
  }
}

function toStringArray(input: unknown): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean)
      }
    } catch {
      return trimmed.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function buildSymptomSummary(
  analyses: Array<{ createdAt: Date; symptoms: any }>
) {
  const symptomCounts = new Map<string, number>()
  const daySet = new Set<string>()
  for (const analysis of analyses) {
    const dayKey = resolveDayKey(null, analysis.createdAt)
    if (dayKey) daySet.add(dayKey)
    const symptoms = toStringArray(analysis.symptoms)
    symptoms.forEach((symptom) => {
      const key = symptom.toLowerCase()
      symptomCounts.set(key, (symptomCounts.get(key) || 0) + 1)
    })
  }
  const topSymptoms = Array.from(symptomCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))
  return {
    entries: analyses.length,
    daysWithLogs: daySet.size,
    uniqueSymptoms: symptomCounts.size,
    topSymptoms,
  }
}

function buildExerciseSummary(
  exerciseLogs: Array<{ type: string; duration: number; createdAt: Date; intensity?: string | null; notes?: string | null }>,
  exerciseEntries: Array<{ label: string; durationMinutes: number; distanceKm?: number | null; localDate?: string | null; createdAt: Date }>
) {
  const activityCounts = new Map<string, number>()
  const daySet = new Set<string>()
  let totalMinutes = 0
  let totalSessions = 0
  let totalDistanceKm = 0

  for (const log of exerciseLogs) {
    totalSessions += 1
    totalMinutes += Number(log.duration || 0) || 0
    const dayKey = resolveDayKey(null, log.createdAt)
    if (dayKey) daySet.add(dayKey)
    const label = String(log.type || '').trim()
    if (label) {
      const key = label.toLowerCase()
      activityCounts.set(key, (activityCounts.get(key) || 0) + 1)
    }
  }

  for (const entry of exerciseEntries) {
    totalSessions += 1
    totalMinutes += Number(entry.durationMinutes || 0) || 0
    totalDistanceKm += Number(entry.distanceKm || 0) || 0
    const dayKey = resolveDayKey(entry.localDate ?? null, entry.createdAt)
    if (dayKey) daySet.add(dayKey)
    const label = String(entry.label || '').trim()
    if (label) {
      const key = label.toLowerCase()
      activityCounts.set(key, (activityCounts.get(key) || 0) + 1)
    }
  }

  const topActivities = Array.from(activityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))

  return {
    sessions: totalSessions,
    totalMinutes: Math.round(totalMinutes),
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    daysActive: daySet.size,
    topActivities,
  }
}

function buildMoodSummary(
  moodRows: Array<{ mood: number; timestamp: Date; localDate?: string | null; localdate?: string | null; tags?: any; note?: string | null }>
) {
  let total = 0
  let count = 0
  const dayMap = new Map<string, { date: string; total: number; count: number }>()
  const tagCounts = new Map<string, number>()
  const notes: Array<{ content: string; createdAt: string }> = []

  for (const row of moodRows) {
    const moodValue = Number(row.mood || 0) || 0
    total += moodValue
    count += 1
    const dayKey = resolveDayKey(row.localDate ?? (row as any).localdate ?? null, row.timestamp)
    if (dayKey) {
      const existing = dayMap.get(dayKey) || { date: dayKey, total: 0, count: 0 }
      existing.total += moodValue
      existing.count += 1
      dayMap.set(dayKey, existing)
    }
    const tags = toStringArray(row.tags)
    tags.forEach((tag) => {
      const key = tag.toLowerCase()
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1)
    })
    const note = String(row.note || '').trim()
    if (note) {
      notes.push({ content: clipText(note, 180), createdAt: row.timestamp.toISOString() })
    }
  }

  const dailyAverages = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      avgMood: day.count ? +(day.total / day.count).toFixed(1) : null,
      entries: day.count,
    }))

  let trend: { direction: 'up' | 'down' | 'flat'; change: number } | null = null
  if (dailyAverages.length >= 2) {
    const window = Math.min(3, dailyAverages.length)
    const first = dailyAverages.slice(0, window)
    const last = dailyAverages.slice(-window)
    const firstAvg =
      first.reduce((sum, item) => sum + Number(item.avgMood || 0), 0) / Math.max(1, first.length)
    const lastAvg =
      last.reduce((sum, item) => sum + Number(item.avgMood || 0), 0) / Math.max(1, last.length)
    const change = +(lastAvg - firstAvg).toFixed(2)
    const direction = change > 0.3 ? 'up' : change < -0.3 ? 'down' : 'flat'
    trend = { direction, change }
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))

  return {
    averageMood: count ? +(total / count).toFixed(1) : null,
    entries: count,
    daysWithLogs: dayMap.size,
    dailyAverages,
    trend,
    topTags,
    notes: notes.slice(-3),
  }
}

function buildCheckinSummary(
  healthLogs: Array<{ rating: number; createdAt: Date; notes?: string | null; goal?: { name?: string | null } | null }>
) {
  const goalMap = new Map<
    string,
    {
      goal: string
      total: number
      count: number
      firstRating: number | null
      lastRating: number | null
      firstAt: Date | null
      lastAt: Date | null
    }
  >()
  const notes: Array<{ content: string; createdAt: string; goal: string }> = []

  const sorted = [...healthLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const log of sorted) {
    const goalName = String(log.goal?.name || 'General')
    if (goalName.startsWith('__')) continue
    const rating = Number(log.rating || 0) || 0
    const existing = goalMap.get(goalName) || {
      goal: goalName,
      total: 0,
      count: 0,
      firstRating: null,
      lastRating: null,
      firstAt: null,
      lastAt: null,
    }
    existing.total += rating
    existing.count += 1
    if (!existing.firstAt || log.createdAt < existing.firstAt) {
      existing.firstAt = log.createdAt
      existing.firstRating = rating
    }
    if (!existing.lastAt || log.createdAt > existing.lastAt) {
      existing.lastAt = log.createdAt
      existing.lastRating = rating
    }
    goalMap.set(goalName, existing)

    const note = String(log.notes || '').trim()
    if (note) {
      notes.push({ content: clipText(note, 180), createdAt: log.createdAt.toISOString(), goal: goalName })
    }
  }

  const goals = Array.from(goalMap.values())
    .map((goal) => ({
      goal: goal.goal,
      avgRating: goal.count ? +(goal.total / goal.count).toFixed(1) : null,
      entries: goal.count,
      trend: goal.firstRating != null && goal.lastRating != null ? +(goal.lastRating - goal.firstRating).toFixed(1) : null,
    }))
    .sort((a, b) => (b.entries || 0) - (a.entries || 0))

  const overallAvg =
    goals.length > 0
      ? +(goals.reduce((sum, goal) => sum + Number(goal.avgRating || 0), 0) / goals.length).toFixed(1)
      : null

  return {
    totalEntries: healthLogs.length,
    overallAvg,
    goals,
    notes: notes.slice(-4),
  }
}

type DailyStat = {
  date: string
  foodEntries: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  waterMl: number
  hydrationEntries: number
  exerciseMinutes: number
  exerciseCount: number
  moodTotal: number
  moodCount: number
  symptomEntries: number
  symptomCount: number
  checkinCount: number
  talkToAiCount: number
  foodNames: Record<string, number>
}

function buildDailyStats(params: {
  foodLogs: Array<{ name: string; nutrients: any; createdAt: Date; localDate?: string | null }>
  waterLogs: Array<{ amountMl: number; createdAt: Date; localDate?: string | null }>
  healthLogs: Array<{ createdAt: Date }>
  exerciseLogs: Array<{ duration: number; createdAt: Date }>
  exerciseEntries: Array<{ durationMinutes: number; createdAt: Date; localDate?: string | null }>
  moodRows: Array<{ mood: number; timestamp: Date; localDate?: string | null }>
  symptomAnalyses: Array<{ createdAt: Date; symptoms: any }>
  talkToAiMessages: Array<{ createdAt: Date; role: string }>
}) {
  const dayMap = new Map<string, DailyStat>()
  const ensureDay = (dayKey: string) => {
    if (!dayKey) return null
    const existing = dayMap.get(dayKey)
    if (existing) return existing
    const created: DailyStat = {
      date: dayKey,
      foodEntries: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      waterMl: 0,
      hydrationEntries: 0,
      exerciseMinutes: 0,
      exerciseCount: 0,
      moodTotal: 0,
      moodCount: 0,
      symptomEntries: 0,
      symptomCount: 0,
      checkinCount: 0,
      talkToAiCount: 0,
      foodNames: {},
    }
    dayMap.set(dayKey, created)
    return created
  }

  for (const log of params.foodLogs) {
    const dayKey = resolveDayKey(log.localDate ?? null, log.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.foodEntries += 1
    const n = (log && log.nutrients) || {}
    day.calories += Number(n.calories ?? n.kcal ?? 0) || 0
    day.protein_g += Number(n.protein_g ?? n.protein ?? 0) || 0
    day.carbs_g += Number(n.carbs_g ?? n.carbohydrates_g ?? n.carbohydrates ?? 0) || 0
    day.fat_g += Number(n.fat_g ?? n.total_fat_g ?? 0) || 0
    day.fiber_g += Number(n.fiber_g ?? n.dietary_fiber_g ?? 0) || 0
    day.sugar_g += Number(n.sugar_g ?? n.sugars_g ?? 0) || 0
    day.sodium_mg += Number(n.sodium_mg ?? n.salt_mg ?? 0) || 0
    const name = String(log.name || '').trim().toLowerCase()
    if (name) day.foodNames[name] = (day.foodNames[name] || 0) + 1
  }

  for (const log of params.waterLogs) {
    const dayKey = resolveDayKey(log.localDate ?? null, log.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.hydrationEntries += 1
    day.waterMl += Number(log.amountMl || 0) || 0
  }

  for (const log of params.healthLogs) {
    const dayKey = resolveDayKey(null, log.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.checkinCount += 1
  }

  for (const log of params.exerciseLogs) {
    const dayKey = resolveDayKey(null, log.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.exerciseCount += 1
    day.exerciseMinutes += Number(log.duration || 0) || 0
  }

  for (const entry of params.exerciseEntries) {
    const dayKey = resolveDayKey(entry.localDate ?? null, entry.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.exerciseCount += 1
    day.exerciseMinutes += Number(entry.durationMinutes || 0) || 0
  }

  for (const row of params.moodRows) {
    const dayKey = resolveDayKey(row.localDate ?? null, row.timestamp)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.moodCount += 1
    day.moodTotal += Number(row.mood || 0) || 0
  }

  for (const analysis of params.symptomAnalyses) {
    const dayKey = resolveDayKey(null, analysis.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.symptomEntries += 1
    const symptoms = toStringArray(analysis.symptoms)
    day.symptomCount += symptoms.length || 1
  }

  for (const msg of params.talkToAiMessages) {
    if (msg.role !== 'user') continue
    const dayKey = resolveDayKey(null, msg.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.talkToAiCount += 1
  }

  const dailyStats = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const topFoods = Object.entries(day.foodNames)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }))
      return {
        date: day.date,
        foodEntries: day.foodEntries,
        calories: Math.round(day.calories),
        protein_g: +day.protein_g.toFixed(1),
        carbs_g: +day.carbs_g.toFixed(1),
        fat_g: +day.fat_g.toFixed(1),
        fiber_g: +day.fiber_g.toFixed(1),
        sugar_g: +day.sugar_g.toFixed(1),
        sodium_mg: Math.round(day.sodium_mg),
        waterMl: Math.round(day.waterMl),
        hydrationEntries: day.hydrationEntries,
        exerciseMinutes: Math.round(day.exerciseMinutes),
        exerciseCount: day.exerciseCount,
        moodAvg: day.moodCount ? +(day.moodTotal / day.moodCount).toFixed(1) : null,
        moodEntries: day.moodCount,
        symptomEntries: day.symptomEntries,
        symptomCount: day.symptomCount,
        checkinCount: day.checkinCount,
        talkToAiCount: day.talkToAiCount,
        topFoods,
      }
    })

  return dailyStats
}

function averageFromDays(days: Array<{ value: number }>) {
  const values = days.map((d) => Number(d.value || 0)).filter((v) => Number.isFinite(v) && v > 0)
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function pickSpikeDays(
  days: Array<{ date: string; value: number }>,
  multiplier = 1.5
) {
  const avg = averageFromDays(days)
  if (!avg) return []
  return days.filter((day) => day.value >= avg * multiplier)
}

function pickLowDays(
  days: Array<{ date: string; value: number }>,
  multiplier = 0.5
) {
  const avg = averageFromDays(days)
  if (!avg) return []
  return days.filter((day) => day.value <= avg * multiplier)
}

function buildDataFlags(dailyStats: Array<any>) {
  const sugarDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.sugar_g || 0) }))
  const sodiumDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.sodium_mg || 0) }))
  const calorieDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.calories || 0) }))
  const waterDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.waterMl || 0) }))
  const moodDays = dailyStats
    .filter((day) => day.moodAvg != null)
    .map((day) => ({ date: day.date, value: Number(day.moodAvg || 0) }))
  const symptomDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.symptomCount || 0) }))
  const exerciseDays = dailyStats.map((day) => ({ date: day.date, value: Number(day.exerciseMinutes || 0) }))

  return {
    sugarSpikes: pickSpikeDays(sugarDays, 1.5).slice(0, 3),
    sodiumSpikes: pickSpikeDays(sodiumDays, 1.5).slice(0, 3),
    calorieSpikes: pickSpikeDays(calorieDays, 1.5).slice(0, 3),
    lowHydrationDays: pickLowDays(waterDays, 0.5).slice(0, 3),
    lowActivityDays: pickLowDays(exerciseDays, 0.5).slice(0, 3),
    lowMoodDays: pickLowDays(moodDays, 0.8).slice(0, 3),
    symptomHeavyDays: pickSpikeDays(symptomDays, 1.5).slice(0, 3),
  }
}

function parseReferenceRange(input: string) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[–—]/g, '-')
  const rangeMatch = cleaned.match(/(-?\d+(\.\d+)?)\s*-\s*(-?\d+(\.\d+)?)/)
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[3]) }
  }
  const lteMatch = cleaned.match(/<=?\s*(-?\d+(\.\d+)?)/)
  if (lteMatch) {
    return { min: null, max: Number(lteMatch[1]) }
  }
  const gteMatch = cleaned.match(/>=?\s*(-?\d+(\.\d+)?)/)
  if (gteMatch) {
    return { min: Number(gteMatch[1]), max: null }
  }
  return null
}

function readGoalSnapshot(healthGoals: Array<{ name?: string | null; category?: string | null }>, key: string) {
  const record = healthGoals.find((goal) => goal?.name === key)
  if (!record?.category) return null
  try {
    return JSON.parse(record.category)
  } catch {
    return null
  }
}

function buildFallbackReport(context: any) {
  const sections = buildDefaultSections()
  const wins: Array<{ name: string; reason: string }> = []
  const gaps: Array<{ name: string; reason: string }> = []
  const coverage = context?.coverage || {}
  const nutritionSummary = context?.nutritionSummary || {}
  const hydrationSummary = context?.hydrationSummary || {}
  const exerciseSummary = context?.exerciseSummary || {}
  const moodSummary = context?.moodSummary || {}
  const symptomSummary = context?.symptomSummary || {}
  const checkinSummary = context?.checkinSummary || {}
  const dataFlags = context?.dataFlags || {}
  const talkToAi = context?.talkToAi || {}
  const issues = Array.isArray(context?.issues) ? context.issues : []
  const goals = Array.isArray(context?.goals) ? context.goals : []
  const labTrends = Array.isArray(context?.labTrends) ? context.labTrends : []
  const labHighlights = Array.isArray(context?.labs?.highlights) ? context.labs.highlights : []
  const dailyNutrition = Array.isArray(nutritionSummary?.dailyTotals) ? nutritionSummary.dailyTotals : []
  const dailyHydration = Array.isArray(hydrationSummary?.dailyTotals) ? hydrationSummary.dailyTotals : []
  const highestCalorieDay = dailyNutrition.reduce(
    (best: any, day: any) => (!best || Number(day.calories || 0) > Number(best.calories || 0) ? day : best),
    null
  )
  const highestHydrationDay = dailyHydration.reduce(
    (best: any, day: any) => (!best || Number(day.totalMl || 0) > Number(best.totalMl || 0) ? day : best),
    null
  )

  if ((coverage.daysActive || 0) >= 4) {
    wins.push({
      name: 'Consistent tracking',
      reason: `You logged data on ${coverage.daysActive} days this week, which makes trends clearer. Keep a short daily log so next week's report is even sharper.`,
    })
  }
  if ((coverage.foodCount || 0) >= 4) {
    wins.push({
      name: 'Food logging',
      reason: `${coverage.foodCount} food entries were captured, giving this report real nutrition detail. Keep logging meals and snacks so we can link food to how you feel.`,
    })
  }
  if ((coverage.checkinCount || 0) >= 3) {
    wins.push({
      name: 'Check-ins completed',
      reason: `${coverage.checkinCount} check-ins were logged, so we can link how you feel to your goals. Add a short note on tough days so the report can explain why.`,
    })
  }
  if ((coverage.daysActive || 0) <= 2) {
    gaps.push({
      name: 'Low tracking frequency',
      reason: 'Only a few active days were logged, so insights will be lighter than usual. Try to log at least one thing each day.',
    })
  }
  if ((coverage.labCount || 0) === 0) {
    gaps.push({
      name: 'No lab updates',
      reason: 'No lab updates were logged this week. Upload lab results when you have them so trends can be tracked over time.',
    })
  }
  if ((coverage.exerciseCount || 0) === 0) {
    gaps.push({
      name: 'Exercise not captured',
      reason: 'No workouts were logged, so activity trends are missing. Add even short walks so we can connect movement to your goals.',
    })
  }
  if ((coverage.waterCount || 0) === 0) {
    gaps.push({
      name: 'Hydration not logged',
      reason: 'No drinks were logged, so hydration patterns are missing. Log water, tea, or coffee so this section is real next week.',
    })
  }

  const issueList = issues.map((item: any) => String(item || '').trim()).filter(Boolean)
  if (issueList.length) {
    sections.overview.working.push({
      name: 'Focus areas logged',
      reason: `Your selected focus areas include ${issueList.slice(0, 3).join(', ')}. Keep logging so we can link these to what you eat, drink, and do each day.`,
    })
  }
  const goalList = goals.map((g: any) => String(g?.name || '').trim()).filter(Boolean)
  if (goalList.length) {
    sections.overview.working.push({
      name: 'Goals tracked',
      reason: `Goals logged this week include ${goalList.slice(0, 3).join(', ')}. We use these goals to decide what to highlight each week.`,
    })
  }
  if (talkToAi?.userMessageCount) {
    const topicLabels = Array.isArray(talkToAi.topics)
      ? talkToAi.topics.map((t: any) => t.topic).slice(0, 3)
      : []
    const topicText = topicLabels.length ? `Recent AI chats focused on ${topicLabels.join(', ')}.` : 'You chatted with the AI this week.'
    sections.overview.working.push({
      name: 'AI chat focus',
      reason: topicText,
    })
  }

  const supplementItems = Array.isArray(context?.supplements)
    ? context.supplements.slice(0, 6).map((s: any) => ({
      name: s.name,
      reason: 'Logged as part of your current routine.',
    }))
    : []
  const medicationItems = Array.isArray(context?.medications)
    ? context.medications.slice(0, 6).map((m: any) => ({
      name: m.name,
      reason: 'Logged as part of your current routine.',
    }))
    : []

  if (supplementItems.length) sections.supplements.working = supplementItems
  if (medicationItems.length) sections.medications.working = medicationItems

  if (nutritionSummary?.entriesWithNutrients) {
    sections.nutrition.working.push({
      name: 'Nutrition logged',
      reason: `Food was logged on ${nutritionSummary.daysWithLogs || 0} days. Avg per day: ${nutritionSummary.dailyAverages?.calories || 0} kcal and ${nutritionSummary.dailyAverages?.protein_g || 0}g protein. This gives a clear base for trends.`,
    })
  }
  if (Array.isArray(nutritionSummary?.topFoods) && nutritionSummary.topFoods.length) {
    const topFoodList = nutritionSummary.topFoods.map((f: any) => f.name).filter(Boolean).slice(0, 3)
    if (topFoodList.length) {
      sections.nutrition.working.push({
        name: 'Top foods',
        reason: `Most logged foods: ${topFoodList.join(', ')}. These are driving your weekly totals.`,
      })
    }
  }
  if (highestCalorieDay?.calories) {
    sections.nutrition.suggested.push({
      name: 'Highest calorie day',
      reason: `${highestCalorieDay.date} was your highest calorie day (${Math.round(highestCalorieDay.calories)} kcal). Review what made that day higher.`,
    })
  }
  if (dataFlags?.sugarSpikes?.length) {
    const days = dataFlags.sugarSpikes.map((d: any) => d.date).join(', ')
    sections.nutrition.avoid.push({
      name: 'Sugar spikes',
      reason: `Sugar was highest on ${days}. Review what was eaten on those days.`,
    })
  }
  if (dataFlags?.sodiumSpikes?.length) {
    const days = dataFlags.sodiumSpikes.map((d: any) => d.date).join(', ')
    sections.nutrition.avoid.push({
      name: 'Sodium spikes',
      reason: `Sodium was highest on ${days}. Review meals logged on those days.`,
    })
  }

  if (hydrationSummary?.entries) {
    sections.hydration.working.push({
      name: 'Hydration logged',
      reason: `${hydrationSummary.entries} drinks across ${hydrationSummary.daysWithLogs || 0} days. Avg ${hydrationSummary.dailyAverageMl || 0} ml per day. This shows a clear hydration pattern.`,
    })
  }
  if (highestHydrationDay?.totalMl) {
    sections.hydration.suggested.push({
      name: 'Best hydration day',
      reason: `${highestHydrationDay.date} was your highest intake (${Math.round(highestHydrationDay.totalMl)} ml). Try to repeat that on lower days.`,
    })
  }
  if (dataFlags?.lowHydrationDays?.length) {
    const days = dataFlags.lowHydrationDays.map((d: any) => d.date).join(', ')
    sections.hydration.suggested.push({
      name: 'Low hydration days',
      reason: `Lower intake on ${days}. Add a drink entry on those days.`,
    })
  }

  if (exerciseSummary?.sessions) {
    const topActivities = Array.isArray(exerciseSummary.topActivities)
      ? exerciseSummary.topActivities.map((a: any) => a.name).filter(Boolean).slice(0, 3)
      : []
    sections.exercise.working.push({
      name: 'Activity logged',
      reason: `${exerciseSummary.sessions} sessions, ${exerciseSummary.totalMinutes || 0} total minutes across ${exerciseSummary.daysActive || 0} days. ${topActivities.length ? `Top: ${topActivities.join(', ')}.` : ''}`.trim(),
    })
  }
  if (dataFlags?.lowActivityDays?.length) {
    const days = dataFlags.lowActivityDays.map((d: any) => d.date).join(', ')
    sections.exercise.suggested.push({
      name: 'Low activity days',
      reason: `Little activity logged on ${days}. Add a short session on those days.`,
    })
  }

  if (moodSummary?.entries) {
    const trendText = moodSummary?.trend?.direction ? `Trend: ${moodSummary.trend.direction}.` : ''
    sections.mood.working.push({
      name: 'Mood check-ins logged',
      reason: `Avg mood ${moodSummary.averageMood ?? 'n/a'} across ${moodSummary.entries} entries on ${moodSummary.daysWithLogs || 0} days. ${trendText}`.trim(),
    })
  }
  if (dataFlags?.lowMoodDays?.length) {
    const days = dataFlags.lowMoodDays.map((d: any) => d.date).join(', ')
    sections.mood.suggested.push({
      name: 'Lower mood days',
      reason: `Mood dipped on ${days}. Add notes to capture what changed.`,
    })
  }

  if (symptomSummary?.entries) {
    const topSymptoms = Array.isArray(symptomSummary.topSymptoms)
      ? symptomSummary.topSymptoms.map((s: any) => s.name).filter(Boolean).slice(0, 3)
      : []
    sections.symptoms.working.push({
      name: 'Symptoms logged',
      reason: `${symptomSummary.entries} symptom entries across ${symptomSummary.daysWithLogs || 0} days. Most common: ${topSymptoms.join(', ') || 'logged symptoms'}.`,
    })
  }
  if (dataFlags?.symptomHeavyDays?.length) {
    const days = dataFlags.symptomHeavyDays.map((d: any) => d.date).join(', ')
    sections.symptoms.suggested.push({
      name: 'Symptom-heavy days',
      reason: `More symptoms were logged on ${days}. Check for triggers on those days.`,
    })
  }

  if (labTrends.length || labHighlights.length) {
    const first = labTrends[0]
    const label = first ? `${first.name} moved ${first.direction}` : 'Lab results updated'
    sections.labs.working.push({
      name: 'Lab movement',
      reason: labTrends.length ? label : 'Recent lab values were logged.',
    })
  }

  if (checkinSummary?.goals?.length) {
    const topGoals = checkinSummary.goals.map((g: any) => g.goal).filter(Boolean).slice(0, 2)
    sections.lifestyle.working.push({
      name: 'Goal check-ins',
      reason: `Check-ins were logged for ${topGoals.join(', ')}.`,
    })
  }

  const summaryParts: string[] = []
  if (coverage.daysActive) summaryParts.push(`Active days: ${coverage.daysActive}`)
  if (coverage.totalEvents) summaryParts.push(`Total entries: ${coverage.totalEvents}`)
  if (nutritionSummary?.daysWithLogs) summaryParts.push(`Food logged on ${nutritionSummary.daysWithLogs} days`)
  if (hydrationSummary?.daysWithLogs) summaryParts.push(`Hydration logged on ${hydrationSummary.daysWithLogs} days`)
  if (exerciseSummary?.sessions) summaryParts.push(`Exercise sessions: ${exerciseSummary.sessions}`)
  if (moodSummary?.entries) summaryParts.push(`Mood check-ins: ${moodSummary.entries}`)
  if (symptomSummary?.entries) summaryParts.push(`Symptom entries: ${symptomSummary.entries}`)

  return {
    summary: summaryParts.length
      ? `This report uses your last 7 days of data. ${summaryParts.join(' • ')}. The sections below explain what changed, why it matters, and what to do next.`
      : 'This report is based on the data available in the last 7 days. The sections below explain what changed and what to do next.',
    wins,
    gaps,
    sections,
  }
}

export async function POST(request: NextRequest) {
  try {
  const body = await request.json().catch(() => ({}))
  const triggerSource = typeof body?.triggerSource === 'string' ? body.triggerSource : ''
  const isManualTrigger = triggerSource === 'manual'
  const hasSchedulerAuth = isAuthorized(request)
  let allowManual = false
  let userId = typeof body?.userId === 'string' ? body.userId : ''
  if (isManualTrigger) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!userId) {
      userId = session.user.id
    }
    if (userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    allowManual = true
  } else if (!hasSchedulerAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSchedulerAuth && !allowManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const now = new Date()
  let state = await getWeeklyReportState(userId)
  if (!state?.nextReportDueAt) {
    if (isManualTrigger) {
      await markWeeklyReportOnboardingComplete(userId)
      state = await getWeeklyReportState(userId)
    } else {
      return NextResponse.json({ status: 'skipped', reason: 'no_schedule' })
    }
  }

  if (!isManualTrigger && state?.nextReportDueAt) {
    const dueAt = new Date(state.nextReportDueAt)
    if (dueAt.getTime() > now.getTime()) {
      return NextResponse.json({ status: 'skipped', reason: 'not_due' })
    }
  }

  await upsertWeeklyReportState(userId, {
    lastAttemptAt: now.toISOString(),
    lastStatus: 'RUNNING',
  })

  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const periodEnd = now
  const periodStartDate = toDateOnly(periodStart)
  const periodEndDate = toDateOnly(periodEnd)

  const report = await createWeeklyReportRecord({
    userId,
    periodStart: periodStartDate,
    periodEnd: periodEndDate,
    status: 'RUNNING',
  })

  if (!report) {
    await upsertWeeklyReportState(userId, { lastStatus: 'FAILED' })
    return NextResponse.json({ status: 'failed', reason: 'report_create_failed' }, { status: 500 })
  }

  const cm = new CreditManager(userId)
  const wallet = await cm.getWalletStatus().catch(() => null)
  const costCredits = CREDIT_COSTS.INSIGHTS_GENERATION
  const hasCredits = wallet?.totalAvailableCents != null && wallet.totalAvailableCents >= costCredits

  if (!hasCredits) {
    const lockedReport = await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
      dataSummary: {
        lockedReason: 'insufficient_credits',
      },
      readyAt: now.toISOString(),
    })
    await upsertWeeklyReportState(userId, {
      lastReportAt: now.toISOString(),
      nextReportDueAt: getNextDueAt(now).toISOString(),
      lastStatus: 'LOCKED',
    })
    await queueWeeklyReportNotification(lockedReport).catch(() => {})
    return NextResponse.json({ status: 'locked' })
  }

  const userBase = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gender: true,
      weight: true,
      height: true,
      bodyType: true,
      exerciseFrequency: true,
      exerciseTypes: true,
    },
  })

  if (!userBase) {
    await updateWeeklyReportRecord(userId, report.id, {
      status: 'FAILED',
      error: 'User not found',
    })
    await upsertWeeklyReportState(userId, { lastStatus: 'FAILED' })
    return NextResponse.json({ status: 'failed', reason: 'user_missing' }, { status: 404 })
  }

  const [
    healthGoals,
    supplements,
    medications,
    foodLogs,
    waterLogs,
    healthLogs,
    exerciseLogs,
    exerciseEntries,
  ] = await Promise.all([
    prisma.healthGoal
      .findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load health goals', error)
        return []
      }),
    prisma.supplement.findMany({ where: { userId } }).catch((error) => {
      console.warn('[weekly-report] Failed to load supplements', error)
      return []
    }),
    prisma.medication.findMany({ where: { userId } }).catch((error) => {
      console.warn('[weekly-report] Failed to load medications', error)
      return []
    }),
    prisma.foodLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 75,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load food logs', error)
        return []
      }),
    prisma.waterLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 120,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load water logs', error)
        return []
      }),
    prisma.healthLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { goal: { select: { name: true } } },
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load health logs', error)
        return []
      }),
    prisma.exerciseLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load exercise logs', error)
        return []
      }),
    prisma.exerciseEntry
      .findMany({
        where: { userId, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load exercise entries', error)
        return []
      }),
  ])

  const user = {
    ...userBase,
    healthGoals,
    supplements,
    medications,
    foodLogs,
    waterLogs,
    healthLogs,
    exerciseLogs,
    exerciseEntries,
  }

  const selectedIssues = readGoalSnapshot(healthGoals, '__SELECTED_ISSUES__')
  const healthSituations = readGoalSnapshot(healthGoals, '__HEALTH_SITUATIONS_DATA__')
  const allergySnapshot = readGoalSnapshot(healthGoals, '__ALLERGIES_DATA__')
  const allergies = Array.isArray(allergySnapshot?.allergies)
    ? allergySnapshot.allergies.map((item: any) => String(item || '').trim()).filter(Boolean)
    : []
  const diabetesType = typeof allergySnapshot?.diabetesType === 'string'
    ? allergySnapshot.diabetesType.trim()
    : ''

  let moodRows: Array<{ mood: number; timestamp: Date; localdate?: string; localDate?: string; tags?: any; note?: string }> = []
  try {
    await ensureMoodTables()
    moodRows = await prisma.$queryRawUnsafe(
      'SELECT mood, timestamp, localDate, tags, note FROM MoodEntries WHERE userId = $1 AND timestamp >= $2 ORDER BY timestamp DESC LIMIT 120',
      userId,
      periodStart
    )
  } catch (error) {
    console.warn('[weekly-report] Failed to load mood entries', error)
    moodRows = []
  }

  let symptomAnalyses: Array<{ summary: string | null; analysisText: string | null; createdAt: Date; symptoms: any }> = []
  try {
    symptomAnalyses = await prisma.symptomAnalysis.findMany({
      where: { userId, createdAt: { gte: periodStart } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { summary: true, analysisText: true, createdAt: true, symptoms: true },
    })
  } catch (error) {
    console.warn('[weekly-report] Failed to load symptom analyses', error)
    symptomAnalyses = []
  }

  let labReports: Array<{ id: string; createdAt: Date }> = []
  try {
    labReports = await prisma.report.findMany({
      where: { userId, createdAt: { gte: periodStart } },
      select: { id: true, createdAt: true },
      take: 20,
    })
  } catch (error) {
    console.warn('[weekly-report] Failed to load lab reports', error)
    labReports = []
  }

  let labTrends: Array<{
    name: string
    latestValue: number
    previousValue: number
    unit: string | null
    change: number
    direction: 'up' | 'down' | 'flat'
    latestDate: string
    previousDate: string
  }> = []
  let labHighlights: Array<{
    name: string
    value: number
    unit: string | null
    referenceRange: string | null
    status: 'above' | 'below' | 'within' | 'unknown'
    latestDate: string
  }> = []
  try {
    const trendWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const labResults = await prisma.labResult.findMany({
      where: { report: { userId, createdAt: { gte: trendWindowStart } } },
      include: { report: { select: { createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 120,
    })

    const analyteMap = new Map<string, Array<{ value: number; unit: string | null; date: Date; range: string | null }>>()
    for (const result of labResults) {
      const encryptedFields: Record<string, string> = {
        analyteName: result.analyteNameEncrypted,
        value: result.valueEncrypted,
      }
      if (result.unitEncrypted) encryptedFields.unit = result.unitEncrypted
      if (result.collectionDateEncrypted) encryptedFields.collectionDate = result.collectionDateEncrypted
      if (result.referenceRangeEncrypted) encryptedFields.referenceRange = result.referenceRangeEncrypted
      const decrypted = await decryptFieldsBatch(encryptedFields, result.dataKeyEncrypted)
      const name = String(decrypted.analyteName || '').trim()
      if (!name) continue
      const rawValue = String(decrypted.value || '').trim()
      const match = rawValue.match(/-?\d+(\.\d+)?/)
      const numeric = match ? Number(match[0]) : NaN
      if (!Number.isFinite(numeric)) continue
      const unit = decrypted.unit ? String(decrypted.unit).trim() : null
      const referenceRange = decrypted.referenceRange ? String(decrypted.referenceRange).trim() : null
      const date = decrypted.collectionDate ? new Date(decrypted.collectionDate) : result.report?.createdAt || result.createdAt
      if (Number.isNaN(date.getTime())) continue
      const existing = analyteMap.get(name) || []
      existing.push({ value: numeric, unit, date, range: referenceRange })
      analyteMap.set(name, existing)
    }

    analyteMap.forEach((entries, name) => {
      const sorted = entries.sort((a, b) => b.date.getTime() - a.date.getTime())
      if (sorted.length < 2) return
      const latest = sorted[0]
      const previous = sorted[1]
      const change = +(latest.value - previous.value).toFixed(2)
      const direction = change === 0 ? 'flat' : change > 0 ? 'up' : 'down'
      labTrends.push({
        name,
        latestValue: latest.value,
        previousValue: previous.value,
        unit: latest.unit || previous.unit || null,
        change,
        direction,
        latestDate: latest.date.toISOString(),
        previousDate: previous.date.toISOString(),
      })
    })
    labTrends = labTrends.slice(0, 8)

    const latestResults = Array.from(analyteMap.entries())
      .map(([name, entries]) => {
        const sorted = entries.sort((a, b) => b.date.getTime() - a.date.getTime())
        const latest = sorted[0]
        return { name, latest }
      })
      .filter((item) => item.latest)
      .slice(0, 10)

    labHighlights = latestResults.map(({ name, latest }) => {
      const rangeInfo = latest.range ? parseReferenceRange(latest.range) : null
      let status: 'above' | 'below' | 'within' | 'unknown' = 'unknown'
      if (rangeInfo && Number.isFinite(latest.value)) {
        if (rangeInfo.min != null && latest.value < rangeInfo.min) status = 'below'
        else if (rangeInfo.max != null && latest.value > rangeInfo.max) status = 'above'
        else status = 'within'
      }
      return {
        name,
        value: latest.value,
        unit: latest.unit || null,
        referenceRange: latest.range || null,
        status,
        latestDate: latest.date.toISOString(),
      }
    })
  } catch (error) {
    console.warn('[weekly-report] Failed to build lab trends', error)
  }

  let talkToAiMessages: Array<{ role: string; content: string; createdAt: Date }> = []
  try {
    await ensureTalkToAITables()
    talkToAiMessages = await prisma.$queryRawUnsafe<
      Array<{ role: string; content: string; createdAt: Date }>
    >(
        `SELECT m."role", m."content", m."createdAt"
         FROM "TalkToAIChatMessage" m
         JOIN "TalkToAIChatThread" t ON t."id" = m."threadId"
         WHERE t."userId" = $1 AND m."createdAt" >= $2 AND m."createdAt" <= $3
         ORDER BY m."createdAt" DESC
         LIMIT 120`,
        userId,
        periodStart,
        periodEnd
      )
  } catch (error) {
    console.warn('[weekly-report] Failed to load AI chat history', error)
    talkToAiMessages = []
  }
  const talkToAiSummary = buildTalkToAiSummary(talkToAiMessages)

  const nutritionSummary = buildNutritionSummary(
    (user.foodLogs || []).map((f) => ({
      name: f.name,
      nutrients: (f as any).nutrients || null,
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
      meal: (f as any).meal ?? null,
    }))
  )

  const hydrationSummary = buildHydrationSummary(
    (user.waterLogs || []).map((w) => ({
      amountMl: (w as any).amountMl ?? null,
      label: (w as any).label ?? null,
      localDate: (w as any).localDate ?? null,
      createdAt: w.createdAt,
    }))
  )

  const checkinSummary = buildCheckinSummary(user.healthLogs || [])
  const exerciseSummary = buildExerciseSummary(user.exerciseLogs || [], user.exerciseEntries || [])
  const moodSummary = buildMoodSummary(moodRows || [])
  const symptomSummary = buildSymptomSummary(symptomAnalyses || [])

  const dataDays = new Set<string>()
  const stamp = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d
    if (!Number.isNaN(date.getTime())) dataDays.add(date.toISOString().slice(0, 10))
  }

  user.foodLogs?.forEach((f) => stamp(f.createdAt))
  user.waterLogs?.forEach((w) => stamp(w.createdAt))
  user.healthLogs?.forEach((h) => stamp(h.createdAt))
  user.exerciseLogs?.forEach((e) => stamp(e.createdAt))
  user.exerciseEntries?.forEach((e) => stamp(e.createdAt))
  moodRows?.forEach((m) => stamp(m.timestamp))
  symptomAnalyses?.forEach((s) => stamp(s.createdAt))
  labReports?.forEach((r) => stamp(r.createdAt))
  talkToAiMessages?.forEach((m) => stamp(m.createdAt))

  const coverage = {
    daysActive: dataDays.size,
    totalEvents:
      (user.foodLogs?.length || 0) +
      (user.waterLogs?.length || 0) +
      (user.healthLogs?.length || 0) +
      (user.exerciseLogs?.length || 0) +
      (user.exerciseEntries?.length || 0) +
      (moodRows?.length || 0) +
      (symptomAnalyses?.length || 0) +
      (talkToAiMessages?.length || 0),
    foodCount: user.foodLogs?.length || 0,
    waterCount: user.waterLogs?.length || 0,
    moodCount: moodRows?.length || 0,
    checkinCount: user.healthLogs?.length || 0,
    symptomCount: symptomAnalyses?.length || 0,
    exerciseCount: (user.exerciseLogs?.length || 0) + (user.exerciseEntries?.length || 0),
    labCount: labReports?.length || 0,
    talkToAiCount: talkToAiMessages?.length || 0,
    talkToAiUserCount: talkToAiSummary.userMessageCount,
    talkToAiDays: talkToAiSummary.activeDays,
  }

  const dataWarning = summarizeCoverage({
    daysActive: coverage.daysActive,
    totalEvents: coverage.totalEvents,
    foodCount: coverage.foodCount,
    waterCount: coverage.waterCount,
    moodCount: coverage.moodCount,
    checkinCount: coverage.checkinCount,
    symptomCount: coverage.symptomCount,
  })

  const goalRatings: Array<{ goal: string; avgRating: number | null; entries: number }> = []
  const ratingMap = new Map<string, { total: number; count: number }>()
  for (const log of user.healthLogs || []) {
    const name = log.goal?.name || 'General'
    const entry = ratingMap.get(name) || { total: 0, count: 0 }
    entry.total += Number(log.rating || 0)
    entry.count += 1
    ratingMap.set(name, entry)
  }
  ratingMap.forEach((value, key) => {
    goalRatings.push({
      goal: key,
      avgRating: value.count ? +(value.total / value.count).toFixed(1) : null,
      entries: value.count,
    })
  })
  const dailyStats = buildDailyStats({
    foodLogs: (user.foodLogs || []).map((f) => ({
      name: f.name,
      nutrients: (f as any).nutrients || null,
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
    })),
    waterLogs: (user.waterLogs || []).map((w) => ({
      amountMl: (w as any).amountMl ?? 0,
      createdAt: w.createdAt,
      localDate: (w as any).localDate ?? null,
    })),
    healthLogs: (user.healthLogs || []).map((log) => ({ createdAt: log.createdAt })),
    exerciseLogs: (user.exerciseLogs || []).map((log) => ({ duration: log.duration, createdAt: log.createdAt })),
    exerciseEntries: (user.exerciseEntries || []).map((entry) => ({
      durationMinutes: entry.durationMinutes,
      createdAt: entry.createdAt,
      localDate: (entry as any).localDate ?? null,
    })),
    moodRows: (moodRows || []).map((row) => ({
      mood: row.mood,
      timestamp: row.timestamp,
      localDate: row.localDate ?? (row as any).localdate ?? null,
    })),
    symptomAnalyses: (symptomAnalyses || []).map((row) => ({
      createdAt: row.createdAt,
      symptoms: row.symptoms || [],
    })),
    talkToAiMessages: (talkToAiMessages || []).map((msg) => ({
      createdAt: msg.createdAt,
      role: msg.role,
    })),
  })

  const dataFlags = buildDataFlags(dailyStats)

  const reportContext = {
    periodStart: periodStartDate,
    periodEnd: periodEndDate,
    profile: {
      gender: user.gender,
      weight: user.weight,
      height: user.height,
      bodyType: user.bodyType,
      exerciseFrequency: user.exerciseFrequency,
      exerciseTypes: user.exerciseTypes,
    },
    goals: (user.healthGoals || [])
      .filter((g) => !g.name?.startsWith('__'))
      .map((g) => ({ name: g.name, rating: g.currentRating })),
    issues: Array.isArray(selectedIssues) ? selectedIssues : [],
    healthSituations: healthSituations || null,
    allergies,
    diabetesType,
    supplements: (user.supplements || []).map((s) => ({
      name: s.name,
      dosage: s.dosage,
      timing: s.timing,
    })),
    medications: (user.medications || []).map((m) => ({
      name: m.name,
      dosage: m.dosage,
      timing: m.timing,
    })),
    nutritionSummary,
    hydrationSummary,
    recentFoods: (user.foodLogs || []).slice(0, 20).map((f) => ({
      name: f.name,
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
      meal: (f as any).meal ?? null,
      description: (f as any).description ?? null,
      nutrients: (f as any).nutrients || null,
    })),
    recentWaterLogs: (user.waterLogs || []).slice(0, 20).map((w) => ({
      label: (w as any).label ?? null,
      amountMl: (w as any).amountMl ?? null,
      amount: (w as any).amount ?? null,
      unit: (w as any).unit ?? null,
      createdAt: w.createdAt,
    })),
    checkins: goalRatings,
    checkinSummary,
    moodSummary,
    symptoms: symptomAnalyses.map((s) => ({
      summary: s.summary || null,
      analysis: s.analysisText || null,
      symptoms: s.symptoms || null,
      createdAt: s.createdAt,
    })),
    symptomSummary,
    labs: { count: labReports.length, highlights: labHighlights },
    labTrends,
    dailyStats,
    dataFlags,
    exerciseEntries: (user.exerciseEntries || []).slice(0, 20).map((e) => ({
      label: e.label,
      durationMinutes: e.durationMinutes,
      createdAt: e.createdAt,
    })),
    exerciseSummary,
    coverage,
    talkToAi: talkToAiSummary,
    sectionSignals: {
      supplements: (user.supplements || []).length,
      medications: (user.medications || []).length,
      nutrition: { entries: coverage.foodCount, days: nutritionSummary.daysWithLogs || 0 },
      hydration: { entries: coverage.waterCount, days: hydrationSummary.daysWithLogs || 0 },
      exercise: { sessions: exerciseSummary.sessions, days: exerciseSummary.daysActive },
      mood: { entries: moodSummary.entries, days: moodSummary.daysWithLogs },
      symptoms: { entries: symptomSummary.entries, unique: symptomSummary.uniqueSymptoms },
      labs: { reports: coverage.labCount, trends: labTrends.length, highlights: labHighlights.length },
      talkToAi: { userMessages: talkToAiSummary.userMessageCount, days: talkToAiSummary.activeDays },
    },
  }

  const rawModel = String(process.env.OPENAI_WEEKLY_REPORT_MODEL || '').trim()
  const model = rawModel.toLowerCase().includes('gpt-5.2') ? rawModel : 'gpt-5.2-chat-latest'
  const weeklyLlmRaw = (process.env.ENABLE_WEEKLY_REPORT_LLM || '').toLowerCase().trim()
  const llmEnabled = weeklyLlmRaw ? weeklyLlmRaw === 'true' || weeklyLlmRaw === '1' || weeklyLlmRaw === 'yes' : true
  let reportPayload: any = null
  let summaryText = ''
  let llmUsage: { promptTokens: number; completionTokens: number; costCents: number; model: string } | null = null

  if (llmEnabled && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const prompt = `You are a careful, data-driven health coach. Use ONLY the JSON data provided.

Generate a 7-day health report in plain language with this exact JSON shape:
{
  "summary": "4-7 sentences that explain the main patterns, key wins, and the biggest gaps",
  "wins": [{"name": "", "reason": ""}],
  "gaps": [{"name": "", "reason": ""}],
  "sections": {
    "overview": { "working": [{"name": "", "reason": ""}], "suggested": [{"name": "", "reason": ""}], "avoid": [{"name": "", "reason": ""}] },
    "supplements": { "working": [], "suggested": [], "avoid": [] },
    "medications": { "working": [], "suggested": [], "avoid": [] },
    "nutrition": { "working": [], "suggested": [], "avoid": [] },
    "hydration": { "working": [], "suggested": [], "avoid": [] },
    "exercise": { "working": [], "suggested": [], "avoid": [] },
    "lifestyle": { "working": [], "suggested": [], "avoid": [] },
    "labs": { "working": [], "suggested": [], "avoid": [] },
    "mood": { "working": [], "suggested": [], "avoid": [] },
    "symptoms": { "working": [], "suggested": [], "avoid": [] }
  }
}

Rules:
- Write in simple, everyday English. No medical jargon.
- Every sentence must reference a specific data point (numbers, dates, logged items, or named goals/issues).
- Each item should be 2-3 short sentences: what happened, why it matters, and a clear next step.
- Use real signals from the JSON data. No generic advice.
- If sectionSignals show data for a section, include 2-3 items in "working" or "suggested" when there is enough data; otherwise include at least 1.
- Only include "avoid" items when dataFlags show spikes/low days or symptom-heavy days.
- If a section truly has no data, leave its arrays empty.
- If you cannot support a win or gap with data, leave that list empty.
- Only use information from the JSON. Do not invent labs, diagnoses, or missing logs.
- Tie insights to goals, issues, and healthSituations when available.
- If talkToAi data exists, connect it to logged data in the relevant sections and summary.
- Use supportive, non-alarming language.
- If data is thin, say that clearly and suggest exactly what to track next week (specific to missing areas).
- Avoid filler phrases. Every sentence must reference a data point or a clear pattern.
- If labTrends or lab highlights are present, describe movement (up/down/flat) without labeling good or bad.
- If you suggest supplements, diet changes, or possible medications based on labs, check against current medications and allergies. If unsure, say to check with a clinician.

JSON data:
${JSON.stringify(reportContext)}
`

      const { completion, costCents, promptTokens, completionTokens } = await chatCompletionWithCost(openai, {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      } as any)

      llmUsage = {
        promptTokens,
        completionTokens,
        costCents,
        model,
      }

      const content = completion.choices?.[0]?.message?.content || ''
      const parsed = safeJsonParse(content)
      if (parsed && parsed.sections) {
        reportPayload = parsed
        summaryText = typeof parsed.summary === 'string' ? parsed.summary : ''
      }
    } catch (error) {
      console.warn('[weekly-report] LLM generation failed', error)
    }
  }

  const fallbackPayload = buildFallbackReport(reportContext)
  if (!reportPayload) {
    reportPayload = fallbackPayload
    summaryText = reportPayload.summary
  }

  const sections = buildDefaultSections()
  const wins = Array.isArray(reportPayload?.wins) && reportPayload.wins.length ? reportPayload.wins : fallbackPayload.wins
  const gaps = Array.isArray(reportPayload?.gaps) && reportPayload.gaps.length ? reportPayload.gaps : fallbackPayload.gaps
  const incomingSections = reportPayload.sections || {}
  const fallbackSections = fallbackPayload.sections || {}
  REPORT_SECTIONS.forEach((key) => {
    const incoming = incomingSections[key] || {}
    const fallback = fallbackSections[key] || {}
    sections[key] = {
      working:
        Array.isArray(incoming.working) && incoming.working.length
          ? incoming.working
          : Array.isArray(fallback.working)
            ? fallback.working
            : [],
      suggested:
        Array.isArray(incoming.suggested) && incoming.suggested.length
          ? incoming.suggested
          : Array.isArray(fallback.suggested)
            ? fallback.suggested
            : [],
      avoid:
        Array.isArray(incoming.avoid) && incoming.avoid.length
          ? incoming.avoid
          : Array.isArray(fallback.avoid)
            ? fallback.avoid
            : [],
    }
  })

  reportPayload.sections = sections
  reportPayload.wins = wins
  reportPayload.gaps = gaps
  if (!summaryText) {
    summaryText = typeof reportPayload.summary === 'string' ? reportPayload.summary : fallbackPayload.summary
  }

  let charged = false
  let chargeFailed = false
  try {
    charged = await cm.chargeCents(costCredits)
  } catch (error) {
    chargeFailed = true
    console.warn('[weekly-report] Credit charge failed', error)
  }
  if (!charged && !chargeFailed) {
    const lockedReport = await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
    dataSummary: {
      coverage,
      dataWarning,
      talkToAiSummary,
      hydrationSummary,
      nutritionSummary,
      moodSummary,
      symptomSummary,
      exerciseSummary,
      checkinSummary,
      dailyStats,
      labTrends,
      labHighlights,
      llmUsage,
      lockedReason: 'insufficient_credits',
    },
      report: null,
      readyAt: now.toISOString(),
    })
    await upsertWeeklyReportState(userId, {
      lastReportAt: now.toISOString(),
      nextReportDueAt: getNextDueAt(now).toISOString(),
      lastStatus: 'LOCKED',
    })
    await queueWeeklyReportNotification(lockedReport).catch(() => {})
    return NextResponse.json({ status: 'locked' })
  }

  const updated = await updateWeeklyReportRecord(userId, report.id, {
    status: 'READY',
    summary: summaryText,
    dataSummary: {
      coverage,
      dataWarning,
      talkToAiSummary,
      hydrationSummary,
      nutritionSummary,
      moodSummary,
      symptomSummary,
      exerciseSummary,
      checkinSummary,
      dailyStats,
      labTrends,
      labHighlights,
      llmUsage,
      ...(chargeFailed ? { chargeSkipped: true } : {}),
    },
    report: reportPayload,
    model,
    creditsCharged: charged ? costCredits : 0,
    readyAt: now.toISOString(),
  })

  if (!updated) {
    await upsertWeeklyReportState(userId, { lastStatus: 'FAILED' })
    return NextResponse.json({ status: 'failed' }, { status: 500 })
  }

  await upsertWeeklyReportState(userId, {
    lastReportAt: now.toISOString(),
    nextReportDueAt: getNextDueAt(now).toISOString(),
    lastStatus: 'READY',
  })
  await queueWeeklyReportNotification(updated).catch(() => {})

  return NextResponse.json({ status: 'ready', reportId: report.id })
  } catch (error: any) {
    console.error('[weekly-report] Failed to generate report', error)
    return NextResponse.json({ error: 'report_failed' }, { status: 500 })
  }
}
