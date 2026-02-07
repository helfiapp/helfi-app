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
import { costCentsEstimateFromText } from '@/lib/cost-meter'
import {
  createWeeklyReportRecord,
  getNextDueAt,
  getWeeklyReportByPeriod,
  getWeeklyReportState,
  markWeeklyReportOnboardingComplete,
  queueWeeklyReportNotification,
  resolveWeeklyReportTimezone,
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

const MANUAL_REPORT_EMAIL = String(process.env.WEEKLY_REPORT_MANUAL_EMAIL || 'info@sonicweb.com.au').toLowerCase()
const WEEKLY_PREFLIGHT_CENTS = Number(process.env.WEEKLY_REPORT_PREFLIGHT_CENTS || 400)

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

function normalizeReportItem(item: ReportItem | null | undefined): { name: string; reason: string } {
  const name = String(item?.name || '').trim()
  const reason = String(item?.reason || '').trim()
  return { name, reason }
}

function dedupeReportSections(
  sections: Record<ReportSectionKey, ReportSectionBucket>
): Record<ReportSectionKey, ReportSectionBucket> {
  const seen = new Set<string>()
  const output = buildDefaultSections()
  for (const key of REPORT_SECTIONS) {
    const section = sections[key] || { working: [], suggested: [], avoid: [] }
    const dedupeBucket = (items: ReportItem[]) => {
      const unique: ReportItem[] = []
      for (const item of items) {
        const normalized = normalizeReportItem(item)
        const identity = `${normalized.name.toLowerCase()}|${normalized.reason.toLowerCase()}`
        if (!normalized.name && !normalized.reason) continue
        if (seen.has(identity)) continue
        seen.add(identity)
        unique.push(normalized)
      }
      return unique
    }
    output[key] = {
      working: dedupeBucket(section.working || []),
      suggested: dedupeBucket(section.suggested || []),
      avoid: dedupeBucket(section.avoid || []),
    }
  }
  return output
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

function formatLocalDate(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function formatLocalHour(date: Date, timezone: string) {
  try {
    const hourText = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(date)
    const hour = Number(hourText)
    return Number.isFinite(hour) ? hour : date.getUTCHours()
  } catch {
    return date.getUTCHours()
  }
}

function formatLocalTime(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
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
  const foodCount = new Map<string, { name: string; count: number }>()
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
    const rawName = String(f.name || '').trim()
    const key = rawName.toLowerCase()
    if (key) {
      const existing = foodCount.get(key) || { name: rawName, count: 0 }
      existing.count += 1
      foodCount.set(key, existing)
    }

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

  const topFoods = Array.from(foodCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => ({ name: item.name, count: item.count }))

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

function buildFoodHighlights(
  foodLogs: Array<{ name: string | null; createdAt: Date; localDate?: string | null }>
) {
  const overallCounts = new Map<string, { name: string; count: number }>()
  const dayCounts = new Map<string, Map<string, { name: string; count: number }>>()

  for (const log of foodLogs) {
    const name = String(log?.name || '').trim()
    if (name) {
      const key = name.toLowerCase()
      const existingOverall = overallCounts.get(key) || { name, count: 0 }
      existingOverall.count += 1
      overallCounts.set(key, existingOverall)
      const dayKey = resolveDayKey(log.localDate ?? null, log.createdAt)
      if (dayKey) {
        const existing = dayCounts.get(dayKey) || new Map()
        const existingDay = existing.get(key) || { name, count: 0 }
        existingDay.count += 1
        existing.set(key, existingDay)
        dayCounts.set(dayKey, existing)
      }
    }
  }

  const overallTopFoods = Array.from(overallCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({ name: item.name, count: item.count }))

  const dailyTopFoods = Array.from(dayCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({
      date,
      foods: Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((item) => ({ name: item.name, count: item.count })),
    }))

  return { overallTopFoods, dailyTopFoods }
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

function buildJournalSummary(
  entries: Array<{ content: string; createdAt: Date; localDate?: string | null }>,
  timezone: string
) {
  const daySet = new Set<string>()
  const highlights = entries.slice(0, 4).map((entry) => {
    const date = entry.localDate || formatLocalDate(entry.createdAt, timezone)
    daySet.add(date)
    return {
      date,
      time: formatLocalTime(entry.createdAt, timezone),
      note: clipText(entry.content || '', 180),
    }
  })
  return {
    entries: entries.length,
    daysWithNotes: daySet.size,
    highlights,
  }
}

function buildJournalDigest(
  entries: Array<{ content: string; createdAt: Date; localDate?: string | null }>,
  timezone: string
) {
  const dayMap = new Map<string, { notes: Array<{ time: string; note: string }>; total: number }>()
  const sorted = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  for (const entry of sorted) {
    const date = entry.localDate || formatLocalDate(entry.createdAt, timezone)
    const time = formatLocalTime(entry.createdAt, timezone)
    const bucket = dayMap.get(date) || { notes: [], total: 0 }
    bucket.total += 1
    if (bucket.notes.length < 3) {
      bucket.notes.push({ time, note: clipText(entry.content || '', 180) })
    }
    dayMap.set(date, bucket)
  }

  return Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({ date, notes: data.notes, count: data.total }))
}

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val))
  } catch {
    return ''
  }
}

function sliceList<T>(value: T[] | undefined | null, max: number) {
  return Array.isArray(value) ? value.slice(0, max) : value
}

function buildReportSignals(params: {
  reportContext: any
  nutritionSummary: any
  hydrationSummary: any
  exerciseSummary: any
  moodSummary: any
  symptomSummary: any
  checkinSummary: any
  mealTimingSummary: any
  timeOfDayNutrition: any
  correlationSignals: any
  trendSignals: any
  riskFlags: any
  dataFlags: any
  overlapSignals: any
  labHighlights: any
  labTrends: any
  insightCandidates: any
  talkToAiSummary: any
  journalEntries: Array<{ content: string; createdAt: Date; localDate?: string | null; time?: string | null }>
  dailyStats: any
  nutritionSignals: any
  timezone: string
}) {
  const journalHighlights = (sliceList(params.journalEntries, 2) || []).map((entry: any) => ({
    date: entry.localDate || formatLocalDate(entry.createdAt, params.timezone),
    time: entry.time || formatLocalTime(entry.createdAt, params.timezone),
    note: clipText(entry.content || '', 200),
  }))

  return {
    periodStart: params.reportContext.periodStart,
    periodEnd: params.reportContext.periodEnd,
    timezone: params.timezone,
    profile: params.reportContext.profile,
    goals: params.reportContext.goals,
    issues: params.reportContext.issues,
    healthSituations: params.reportContext.healthSituations,
    allergies: params.reportContext.allergies,
    diabetesType: params.reportContext.diabetesType,
    supplements: params.reportContext.supplements,
    medications: params.reportContext.medications,
    sectionSignals: params.reportContext.sectionSignals,
    nutritionSummary: {
      dailyAverages: params.nutritionSummary?.dailyAverages,
      daysWithLogs: params.nutritionSummary?.daysWithLogs,
      topFoods: params.nutritionSummary?.topFoods,
      dailyTotals: sliceList(params.nutritionSummary?.dailyTotals, 7),
    },
    hydrationSummary: {
      dailyAverageMl: params.hydrationSummary?.dailyAverageMl,
      daysWithLogs: params.hydrationSummary?.daysWithLogs,
      topDrinks: params.hydrationSummary?.topDrinks,
      dailyTotals: sliceList(params.hydrationSummary?.dailyTotals, 7),
    },
    foodHighlights: params.reportContext.foodHighlights,
    foodLogSample: sliceList(params.reportContext.foodLogSample, 12),
    exerciseSummary: params.exerciseSummary,
    moodSummary: params.moodSummary,
    symptomSummary: params.symptomSummary,
    checkinSummary: params.checkinSummary,
    mealTimingSummary: params.mealTimingSummary,
    timeOfDayNutrition: params.timeOfDayNutrition,
    nutritionSignals: params.nutritionSignals,
    dailyStats: sliceList(params.dailyStats, 7),
    correlationSignals: params.correlationSignals,
    trendSignals: params.trendSignals,
    riskFlags: sliceList(params.riskFlags, 6),
    dataFlags: params.dataFlags,
    overlapSignals: params.overlapSignals,
    labHighlights: params.labHighlights,
    labTrends: sliceList(params.labTrends, 6),
    journalHighlights,
    talkToAi: {
      userMessageCount: params.talkToAiSummary?.userMessageCount,
      activeDays: params.talkToAiSummary?.activeDays,
      topics: sliceList(params.talkToAiSummary?.topics, 4),
      highlights: sliceList(params.talkToAiSummary?.highlights, 2),
    },
    insightCandidates: sliceList(params.insightCandidates, 16),
  }
}

function buildMealTimingSummary(
  foodLogs: Array<{ createdAt: Date; localDate?: string | null; meal?: string | null }>,
  timezone: string
) {
  const dayMap = new Map<
    string,
    { date: string; firstHour: number | null; lastHour: number | null; lateSnacks: number; total: number }
  >()
  const lateMealDays: string[] = []
  const lateSnackDays: string[] = []
  const lateMealLogs: Array<{ date: string; hour: number }> = []
  const earlyMealDays: string[] = []

  for (const log of foodLogs) {
    const dateKey = log.localDate || formatLocalDate(log.createdAt, timezone)
    const hour = formatLocalHour(log.createdAt, timezone)
    const entry = dayMap.get(dateKey) || {
      date: dateKey,
      firstHour: null,
      lastHour: null,
      lateSnacks: 0,
      total: 0,
    }
    entry.total += 1
    if (entry.firstHour == null || hour < entry.firstHour) entry.firstHour = hour
    if (entry.lastHour == null || hour > entry.lastHour) entry.lastHour = hour
    const mealLabel = normalizeMealLabel(log.meal ?? null)
    if (mealLabel === 'snacks' && hour >= 20) entry.lateSnacks += 1
    dayMap.set(dateKey, entry)
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  for (const day of days) {
    if (day.lastHour != null && day.lastHour >= 21) {
      lateMealDays.push(day.date)
      lateMealLogs.push({ date: day.date, hour: day.lastHour })
    }
    if (day.lateSnacks > 0) lateSnackDays.push(day.date)
    if (day.firstHour != null && day.firstHour >= 10) earlyMealDays.push(day.date)
  }

  const firstHours = days.map((d) => d.firstHour ?? 0).filter((v) => v > 0)
  const lastHours = days.map((d) => d.lastHour ?? 0).filter((v) => v > 0)
  const avgFirstHour = firstHours.length ? Math.round(firstHours.reduce((a, b) => a + b, 0) / firstHours.length) : null
  const avgLastHour = lastHours.length ? Math.round(lastHours.reduce((a, b) => a + b, 0) / lastHours.length) : null
  const eatingWindows = days
    .map((d) => (d.firstHour != null && d.lastHour != null ? d.lastHour - d.firstHour : null))
    .filter((v): v is number => v != null && v >= 0)
  const avgWindowHours = eatingWindows.length
    ? Math.round((eatingWindows.reduce((a, b) => a + b, 0) / eatingWindows.length) * 10) / 10
    : null

  return {
    daysLogged: days.length,
    avgFirstHour,
    avgLastHour,
    avgWindowHours,
    lateMealDays,
    lateSnackDays,
    lateMealLogs,
    lateStartDays: earlyMealDays,
  }
}

function buildTimeOfDayNutritionSummary(
  foodLogs: Array<{ createdAt: Date; nutrients: any }>,
  timezone: string
) {
  const buckets = {
    morning: { label: 'morning', calories: 0, entries: 0 },
    afternoon: { label: 'afternoon', calories: 0, entries: 0 },
    evening: { label: 'evening', calories: 0, entries: 0 },
    late: { label: 'late', calories: 0, entries: 0 },
  }

  for (const log of foodLogs) {
    const hour = formatLocalHour(log.createdAt, timezone)
    const n = (log && log.nutrients) || {}
    const calories = Number(n.calories ?? n.kcal ?? 0) || 0
    let key: keyof typeof buckets = 'afternoon'
    if (hour >= 5 && hour < 11) key = 'morning'
    else if (hour >= 11 && hour < 17) key = 'afternoon'
    else if (hour >= 17 && hour < 21) key = 'evening'
    else key = 'late'
    buckets[key].calories += calories
    buckets[key].entries += 1
  }

  return Object.values(buckets)
}

function buildNutritionSignals(dailyStats: Array<any>) {
  const calorieDays = dailyStats.filter((d) => Number(d.calories || 0) > 0)
  const proteinDays = dailyStats.filter((d) => Number(d.protein_g || 0) > 0)
  const fiberDays = dailyStats.filter((d) => Number(d.fiber_g || 0) > 0)
  const sugarDays = dailyStats.filter((d) => Number(d.sugar_g || 0) > 0)
  const sodiumDays = dailyStats.filter((d) => Number(d.sodium_mg || 0) > 0)

  const avg = (rows: Array<any>, key: string) => {
    if (!rows.length) return 0
    const total = rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)
    return total / rows.length
  }

  const avgCalories = Math.round(avg(calorieDays, 'calories'))
  const avgProtein = Math.round(avg(proteinDays, 'protein_g') * 10) / 10
  const avgFiber = Math.round(avg(fiberDays, 'fiber_g') * 10) / 10
  const avgSugar = Math.round(avg(sugarDays, 'sugar_g') * 10) / 10
  const avgSodium = Math.round(avg(sodiumDays, 'sodium_mg'))

  const highestCalorieDay = calorieDays.reduce(
    (best: any, day: any) => (!best || Number(day.calories || 0) > Number(best.calories || 0) ? day : best),
    null
  )
  const lowestCalorieDay = calorieDays.reduce(
    (best: any, day: any) => (!best || Number(day.calories || 0) < Number(best.calories || 0) ? day : best),
    null
  )

  return {
    avgCalories,
    avgProtein,
    avgFiber,
    avgSugar,
    avgSodium,
    highestCalorieDay,
    lowestCalorieDay,
  }
}

function intersectDays(listA: string[], listB: string[]) {
  const setA = new Set(listA)
  return listB.filter((day) => setA.has(day))
}

function averageValue(rows: Array<any>, key: string) {
  if (!rows.length) return 0
  const total = rows.reduce((sum, row) => sum + Number(row?.[key] ?? 0), 0)
  return total / rows.length
}

function buildCorrelation(
  dailyStats: Array<any>,
  metricKey: string,
  outcomeKey: string,
  options?: { minDays?: number; minDiff?: number }
) {
  const rows = dailyStats.filter((row) => {
    const metric = Number(row?.[metricKey] ?? 0)
    const outcome = row?.[outcomeKey]
    return Number.isFinite(metric) && metric > 0 && outcome != null
  })
  const minDays = options?.minDays ?? 4
  if (rows.length < minDays) return null
  const metricAvg = averageValue(rows, metricKey)
  const high = rows.filter((row) => Number(row?.[metricKey] ?? 0) >= metricAvg)
  const low = rows.filter((row) => Number(row?.[metricKey] ?? 0) < metricAvg)
  if (high.length < 2 || low.length < 2) return null
  const highAvg = averageValue(high, outcomeKey)
  const lowAvg = averageValue(low, outcomeKey)
  const diff = +(highAvg - lowAvg).toFixed(2)
  const minDiff = options?.minDiff ?? 0.3
  if (Math.abs(diff) < minDiff) return null
  return {
    metricAvg: Math.round(metricAvg * 10) / 10,
    highAvg: Math.round(highAvg * 10) / 10,
    lowAvg: Math.round(lowAvg * 10) / 10,
    diff,
    highDays: high.map((row) => row.date).filter(Boolean),
    lowDays: low.map((row) => row.date).filter(Boolean),
  }
}

function buildLateMealImpact(dailyStats: Array<any>, lateMealDays: string[]) {
  if (!lateMealDays?.length) return null
  const dayMap = new Map(dailyStats.map((row) => [row.date, row]))
  const lateRows = lateMealDays.map((day) => dayMap.get(day)).filter(Boolean)
  const otherRows = dailyStats.filter((row) => row.date && !lateMealDays.includes(row.date))
  if (lateRows.length < 2 || otherRows.length < 2) return null
  const lateMoodAvg = averageValue(lateRows, 'moodAvg')
  const otherMoodAvg = averageValue(otherRows, 'moodAvg')
  const lateSymptomAvg = averageValue(lateRows, 'symptomCount')
  const otherSymptomAvg = averageValue(otherRows, 'symptomCount')
  return {
    lateMoodAvg: Math.round(lateMoodAvg * 10) / 10,
    otherMoodAvg: Math.round(otherMoodAvg * 10) / 10,
    lateSymptomAvg: Math.round(lateSymptomAvg * 10) / 10,
    otherSymptomAvg: Math.round(otherSymptomAvg * 10) / 10,
  }
}

function buildTrendSignals(dailyStats: Array<any>) {
  const sorted = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 4) return []
  const mid = Math.floor(sorted.length / 2)
  const first = sorted.slice(0, mid)
  const second = sorted.slice(mid)
  const signals: Array<{
    metric: string
    firstAvg: number
    secondAvg: number
    diff: number
    direction: 'up' | 'down' | 'flat'
    unit: string
    improvesWhenUp: boolean | null
  }> = []

  const pushSignal = (key: string, metric: string, minDiff: number, unit: string, improvesWhenUp: boolean | null) => {
    const firstAvg = averageValue(first, key)
    const secondAvg = averageValue(second, key)
    if (!Number.isFinite(firstAvg) || !Number.isFinite(secondAvg)) return
    const diff = +(secondAvg - firstAvg).toFixed(1)
    if (Math.abs(diff) < minDiff) return
    const direction = diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down'
    signals.push({
      metric,
      firstAvg: Math.round(firstAvg * 10) / 10,
      secondAvg: Math.round(secondAvg * 10) / 10,
      diff,
      direction,
      unit,
      improvesWhenUp,
    })
  }

  pushSignal('waterMl', 'Hydration', 350, 'ml', true)
  pushSignal('exerciseMinutes', 'Exercise', 8, 'min', true)
  pushSignal('moodAvg', 'Mood', 0.4, '', true)
  pushSignal('symptomCount', 'Symptoms', 1, '', false)
  pushSignal('calories', 'Calories', 200, 'kcal', null)
  pushSignal('protein_g', 'Protein', 12, 'g', true)

  return signals
}

function buildRiskFlags(params: {
  dailyStats: Array<any>
  dataFlags: any
  mealTimingSummary: any
}) {
  const flags: Array<{ name: string; reason: string }> = []
  const dataFlags = params.dataFlags || {}
  const mealTimingSummary = params.mealTimingSummary || {}

  if ((dataFlags.lowHydrationDays || []).length >= 3) {
    const days = dataFlags.lowHydrationDays.map((d: any) => d.date).slice(0, 3).join(', ')
    flags.push({
      name: 'Repeated low hydration days',
      reason: `Lower water intake shows up on ${days}. This can affect energy and focus.`,
    })
  }
  if ((dataFlags.lowActivityDays || []).length >= 3) {
    const days = dataFlags.lowActivityDays.map((d: any) => d.date).slice(0, 3).join(', ')
    flags.push({
      name: 'Low movement streak',
      reason: `Very little movement shows up on ${days}. This can slow recovery and mood.`,
    })
  }
  if ((mealTimingSummary.lateMealDays || []).length >= 3) {
    const days = mealTimingSummary.lateMealDays.slice(0, 3).join(', ')
    flags.push({
      name: 'Late meals pattern',
      reason: `Late dinners show up on ${days}. This can affect digestion and next-day energy.`,
    })
  }
  if ((dataFlags.symptomHeavyDays || []).length >= 2) {
    const days = dataFlags.symptomHeavyDays.map((d: any) => d.date).slice(0, 3).join(', ')
    flags.push({
      name: 'Symptom flare days',
      reason: `Symptoms spiked on ${days}. These are good days to review triggers.`,
    })
  }

  const moodValues = params.dailyStats
    .map((row) => row.moodAvg)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (moodValues.length >= 3) {
    const min = Math.min(...moodValues)
    const max = Math.max(...moodValues)
    const range = Math.round((max - min) * 10) / 10
    if (range >= 1.5) {
      flags.push({
        name: 'Mood swings',
        reason: `Mood ranged by about ${range} points across the week.`,
      })
    }
  }

  return flags
}

function buildInsightCandidates(params: {
  nutritionSignals: any
  mealTimingSummary: any
  timeOfDayNutrition: Array<any>
  dataFlags: any
  correlationSignals: any
  lateMealImpact: any
  checkinSummary: any
  labHighlights: Array<any>
  labTrends: Array<any>
  moodRange: number | null
  dailyStats: Array<any>
  journalEntries: Array<{ content: string; createdAt: Date; localDate?: string | null }>
  timezone: string
}) {
  const candidates: Array<{
    section: ReportSectionKey
    bucket: 'working' | 'suggested' | 'avoid'
    title: string
    evidence: string
    action: string
  }> = []
  const seen = new Set<string>()
  const add = (candidate: {
    section: ReportSectionKey
    bucket: 'working' | 'suggested' | 'avoid'
    title: string
    evidence: string
    action: string
  }) => {
    const key = `${candidate.section}:${candidate.title}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(candidate)
  }

  const nutritionSignals = params.nutritionSignals || {}
  const mealTimingSummary = params.mealTimingSummary || {}
  const timeOfDayNutrition = Array.isArray(params.timeOfDayNutrition) ? params.timeOfDayNutrition : []
  const dataFlags = params.dataFlags || {}
  const correlationSignals = params.correlationSignals || {}
  const lateMealImpact = params.lateMealImpact || null
  const journalEntries = Array.isArray(params.journalEntries) ? params.journalEntries : []
  const timezone = params.timezone || 'UTC'
  const dailyStats = Array.isArray(params.dailyStats) ? params.dailyStats : []
  const dailyMap = new Map(dailyStats.map((row) => [row.date, row]))

  if (nutritionSignals.avgProtein && nutritionSignals.avgProtein < 70) {
    add({
      section: 'nutrition',
      bucket: 'suggested',
      title: 'Protein looks light',
      evidence: `Average protein was about ${nutritionSignals.avgProtein}g per day.`,
      action: 'Add a clear protein source at breakfast or lunch and watch energy and hunger.',
    })
  }
  if (nutritionSignals.avgFiber && nutritionSignals.avgFiber < 20) {
    add({
      section: 'nutrition',
      bucket: 'suggested',
      title: 'Fiber is low',
      evidence: `Average fiber was about ${nutritionSignals.avgFiber}g per day.`,
      action: 'Add beans, oats, berries, or vegetables to steady digestion.',
    })
  }
  if ((dataFlags.sugarSpikes || []).length) {
    const days = dataFlags.sugarSpikes.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'nutrition',
      bucket: 'avoid',
      title: 'Sugar spikes',
      evidence: `Sugar was highest on ${days}.`,
      action: 'Swap the biggest sweet item for protein + fiber and see if energy stays steadier.',
    })
  }
  if ((dataFlags.sodiumSpikes || []).length) {
    const days = dataFlags.sodiumSpikes.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'nutrition',
      bucket: 'avoid',
      title: 'High sodium days',
      evidence: `Sodium was highest on ${days}.`,
      action: 'Balance salty meals with water and potassium-rich foods.',
    })
  }

  if ((dataFlags.lowHydrationDays || []).length) {
    const days = dataFlags.lowHydrationDays.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'hydration',
      bucket: 'suggested',
      title: 'Low hydration days',
      evidence: `Lower intake shows on ${days}.`,
      action: 'Add a bottle earlier in the day and track how you feel.',
    })
  }
  if (correlationSignals.hydrationMood && correlationSignals.hydrationMood.diff > 0) {
    add({
      section: 'hydration',
      bucket: 'working',
      title: 'Hydration lines up with mood',
      evidence: `Mood averaged ${correlationSignals.hydrationMood.highAvg} on higher-water days vs ${correlationSignals.hydrationMood.lowAvg} on lower-water days.`,
      action: 'Aim for water closer to the higher days and see if mood stays steadier.',
    })
  }

  if ((dataFlags.lowActivityDays || []).length) {
    const days = dataFlags.lowActivityDays.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'exercise',
      bucket: 'suggested',
      title: 'Low activity days',
      evidence: `Movement dropped on ${days}.`,
      action: 'Add a short walk or quick session on those days.',
    })
  }
  if (correlationSignals.exerciseMood && correlationSignals.exerciseMood.diff > 0) {
    add({
      section: 'exercise',
      bucket: 'working',
      title: 'Movement lines up with mood',
      evidence: `Mood averaged ${correlationSignals.exerciseMood.highAvg} on higher-movement days vs ${correlationSignals.exerciseMood.lowAvg} on lower-movement days.`,
      action: 'Keep a short session on low-energy days to protect mood.',
    })
  }

  if ((dataFlags.lowMoodDays || []).length) {
    const days = dataFlags.lowMoodDays.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'mood',
      bucket: 'suggested',
      title: 'Lower mood days',
      evidence: `Mood dipped on ${days}.`,
      action: 'Add a short note on those days so we can link triggers.',
    })
  }
  if (params.moodRange != null && params.moodRange >= 1.5) {
    add({
      section: 'mood',
      bucket: 'suggested',
      title: 'Mood swings',
      evidence: `Mood ranged by about ${params.moodRange} points this week.`,
      action: 'Look at food timing, hydration, and stress on the lowest days.',
    })
  }

  if ((dataFlags.symptomHeavyDays || []).length) {
    const days = dataFlags.symptomHeavyDays.map((d: any) => d.date).slice(0, 3).join(', ')
    add({
      section: 'symptoms',
      bucket: 'suggested',
      title: 'Symptom flare days',
      evidence: `Symptoms were heavier on ${days}.`,
      action: 'Review those days for food timing, sugar, and stress shifts.',
    })
  }
  if (correlationSignals.sugarSymptoms && correlationSignals.sugarSymptoms.diff > 0) {
    add({
      section: 'symptoms',
      bucket: 'avoid',
      title: 'Sugar days line up with more symptoms',
      evidence: `Symptoms averaged ${correlationSignals.sugarSymptoms.highAvg} on higher-sugar days vs ${correlationSignals.sugarSymptoms.lowAvg} on lower-sugar days.`,
      action: 'Reduce added sugar on those days and see if symptoms ease.',
    })
  }
  if (lateMealImpact && lateMealImpact.lateMoodAvg < lateMealImpact.otherMoodAvg - 0.3) {
    add({
      section: 'lifestyle',
      bucket: 'avoid',
      title: 'Late meals link to lower mood',
      evidence: `Mood averaged ${lateMealImpact.lateMoodAvg} on late-meal days vs ${lateMealImpact.otherMoodAvg} on other days.`,
      action: 'Try an earlier dinner for a week and compare.',
    })
  }
  if (lateMealImpact && lateMealImpact.lateSymptomAvg > lateMealImpact.otherSymptomAvg + 1) {
    add({
      section: 'lifestyle',
      bucket: 'avoid',
      title: 'Late meals link to more symptoms',
      evidence: `Symptoms averaged ${lateMealImpact.lateSymptomAvg} on late-meal days vs ${lateMealImpact.otherSymptomAvg} on other days.`,
      action: 'Shift the last meal earlier and watch symptoms.',
    })
  }

  if ((mealTimingSummary.lateMealDays || []).length) {
    const days = mealTimingSummary.lateMealDays.slice(0, 3).join(', ')
    add({
      section: 'lifestyle',
      bucket: 'avoid',
      title: 'Late meals',
      evidence: `Late meals showed up on ${days}.`,
      action: 'Move the last meal earlier and see if mornings feel better.',
    })
  }
  if ((mealTimingSummary.lateSnackDays || []).length) {
    const days = mealTimingSummary.lateSnackDays.slice(0, 3).join(', ')
    add({
      section: 'lifestyle',
      bucket: 'avoid',
      title: 'Late snacks',
      evidence: `Late snacks showed up on ${days}.`,
      action: 'If you need one, keep it light and protein-based.',
    })
  }
  if (timeOfDayNutrition.length) {
    const totalCalories = timeOfDayNutrition.reduce((sum: number, bucket: any) => sum + Number(bucket.calories || 0), 0)
    const lateBucket = timeOfDayNutrition.find((bucket: any) => bucket.label === 'late')
    if (totalCalories > 0 && lateBucket?.calories && lateBucket.calories / totalCalories >= 0.35) {
      add({
        section: 'nutrition',
        bucket: 'suggested',
        title: 'Most calories land late',
        evidence: `Roughly ${Math.round((lateBucket.calories / totalCalories) * 100)}% of calories landed late at night.`,
        action: 'Shift one meal earlier and see if energy improves.',
      })
    }
  }

  if (params.checkinSummary?.goals?.length) {
    const improving = params.checkinSummary.goals.filter((g: any) => g.trend != null && g.trend > 0.4)
    const declining = params.checkinSummary.goals.filter((g: any) => g.trend != null && g.trend < -0.4)
    if (improving.length) {
      const names = improving.map((g: any) => g.goal).slice(0, 2).join(', ')
      add({
        section: 'overview',
        bucket: 'working',
        title: 'Goal scores improved',
        evidence: `Your check-in scores improved for ${names}.`,
        action: 'Keep the same habits that showed up on those better days.',
      })
    }
    if (declining.length) {
      const names = declining.map((g: any) => g.goal).slice(0, 2).join(', ')
      add({
        section: 'overview',
        bucket: 'suggested',
        title: 'Goal scores dipped',
        evidence: `Your check-in scores dipped for ${names}.`,
        action: 'Review those days for food timing, hydration, or stress shifts.',
      })
    }
  }

  if (journalEntries.length) {
    const highlights = [...journalEntries]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 2)
    highlights.forEach((entry) => {
      const date = entry.localDate || formatLocalDate(entry.createdAt, timezone)
      const time = formatLocalTime(entry.createdAt, timezone)
      const dayStats = dailyMap.get(date)
      const dayDetails: string[] = []
      const topFoods = Array.isArray(dayStats?.topFoods)
        ? dayStats.topFoods
            .map((item: any) => String(item?.name || '').trim())
            .filter(Boolean)
            .map((name: string) => name.replace(/\b\w/g, (match) => match.toUpperCase()))
        : []
      if (dayStats?.foodEntries) dayDetails.push(`${dayStats.foodEntries} food entries`)
      if (dayStats?.waterMl) dayDetails.push(`${Math.round(dayStats.waterMl)} ml fluids`)
      if (dayStats?.exerciseMinutes) dayDetails.push(`${dayStats.exerciseMinutes} minutes of movement`)
      if (dayStats?.moodAvg != null) dayDetails.push(`mood ${dayStats.moodAvg}`)
      if (dayStats?.symptomCount) dayDetails.push(`${dayStats.symptomCount} symptoms`)
      if (topFoods.length) dayDetails.push(`top foods: ${topFoods.slice(0, 3).join(', ')}`)
      const detailText = dayDetails.length
        ? `That day included ${dayDetails.join(', ')}.`
        : 'That day has logged data we can compare.'
      add({
        section: 'overview',
        bucket: 'suggested',
        title: `Journal note on ${date}`,
        evidence: `At ${time} you wrote: \"${clipText(entry.content || '', 140)}\". ${detailText}`,
        action: "If this happens again, compare it with that day's foods and fluids to spot a repeat pattern.",
      })
    })
  }

  const outOfRange = (params.labHighlights || []).filter((h: any) => h?.status === 'above' || h?.status === 'below')
  if (outOfRange.length) {
    const names = outOfRange.map((h: any) => h.name).slice(0, 2).join(', ')
    add({
      section: 'labs',
      bucket: 'suggested',
      title: 'Lab markers outside range',
      evidence: `Out-of-range markers include ${names}.`,
      action: 'Discuss these with a clinician before changing supplements or medications.',
    })
  } else if ((params.labTrends || []).length) {
    const first = params.labTrends[0]
    add({
      section: 'labs',
      bucket: 'working',
      title: 'Lab movement tracked',
      evidence: `${first.name} moved ${first.direction} vs the prior result.`,
      action: 'Keep labs updated so trends stay clear.',
    })
  }

  return candidates
}

function clipText(value: string, max = 220) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 3)).trim()}...`
}

function buildModelInput(reportSignals: any) {
  const sliceList = (list: any, max: number) => (Array.isArray(list) ? list.slice(0, max) : [])
  const trimTopFoods = (foods: any, max: number) =>
    sliceList(foods, max).map((item: any) => ({ name: clipText(item?.name || '', 60), count: item?.count ?? item?.value ?? null }))
  const trimDailyStats = (daily: any[]) =>
    sliceList(daily, 7).map((day: any) => ({
      date: day?.date,
      calories: day?.calories,
      protein_g: day?.protein_g,
      carbs_g: day?.carbs_g,
      fat_g: day?.fat_g,
      fiber_g: day?.fiber_g,
      sugar_g: day?.sugar_g,
      sodium_mg: day?.sodium_mg,
      waterMl: day?.waterMl,
      hydrationEntries: day?.hydrationEntries,
      exerciseMinutes: day?.exerciseMinutes,
      exerciseCount: day?.exerciseCount,
      moodAvg: day?.moodAvg,
      moodEntries: day?.moodEntries,
      symptomCount: day?.symptomCount,
      checkinCount: day?.checkinCount,
      journalCount: day?.journalCount,
      topFoods: trimTopFoods(day?.topFoods || [], 2),
    }))
  const trimFoodHighlights = (highlights: any) => {
    if (!highlights) return null
    return {
      overallTopFoods: trimTopFoods(highlights.overallTopFoods || [], 6),
      dailyTopFoods: sliceList(highlights.dailyTopFoods, 5).map((day: any) => ({
        date: day?.date,
        foods: trimTopFoods(day?.foods || [], 2),
      })),
    }
  }
  const trimFoodLogSample = (logs: any[]) =>
    sliceList(logs, 10).map((item: any) => ({
      name: clipText(item?.name || '', 60),
      localDate: item?.localDate ?? null,
      meal: item?.meal ? clipText(item.meal, 40) : null,
      time: item?.time ?? null,
    }))

  return {
    periodStart: reportSignals.periodStart,
    periodEnd: reportSignals.periodEnd,
    timezone: reportSignals.timezone,
    profile: reportSignals.profile,
    goals: sliceList(reportSignals.goals, 8),
    issues: sliceList(reportSignals.issues, 8),
    healthSituations: clipText(reportSignals.healthSituations || '', 400),
    allergies: sliceList(reportSignals.allergies, 6),
    diabetesType: reportSignals.diabetesType,
    supplements: sliceList(reportSignals.supplements, 10),
    medications: sliceList(reportSignals.medications, 10),
    sectionSignals: reportSignals.sectionSignals,
    nutritionSummary: reportSignals.nutritionSummary
      ? {
          dailyAverages: reportSignals.nutritionSummary.dailyAverages,
          daysWithLogs: reportSignals.nutritionSummary.daysWithLogs,
          topFoods: trimTopFoods(reportSignals.nutritionSummary.topFoods || [], 5),
          dailyTotals: trimDailyStats(reportSignals.nutritionSummary.dailyTotals || []),
        }
      : null,
    hydrationSummary: reportSignals.hydrationSummary
      ? {
          dailyAverageMl: reportSignals.hydrationSummary.dailyAverageMl,
          daysWithLogs: reportSignals.hydrationSummary.daysWithLogs,
          topDrinks: trimTopFoods(reportSignals.hydrationSummary.topDrinks || [], 5),
          dailyTotals: sliceList(reportSignals.hydrationSummary.dailyTotals, 7),
        }
      : null,
    foodHighlights: trimFoodHighlights(reportSignals.foodHighlights),
    foodLogSample: trimFoodLogSample(reportSignals.foodLogSample || []),
    exerciseSummary: reportSignals.exerciseSummary,
    moodSummary: reportSignals.moodSummary,
    symptomSummary: reportSignals.symptomSummary,
    checkinSummary: reportSignals.checkinSummary
      ? {
          ...reportSignals.checkinSummary,
          goals: sliceList(reportSignals.checkinSummary.goals, 6),
          notes: sliceList(reportSignals.checkinSummary.notes, 3),
        }
      : null,
    dailyStats: trimDailyStats(reportSignals.dailyStats || []),
    correlationSignals: reportSignals.correlationSignals,
    trendSignals: sliceList(reportSignals.trendSignals, 6),
    riskFlags: sliceList(reportSignals.riskFlags, 6),
    dataFlags: reportSignals.dataFlags,
    overlapSignals: reportSignals.overlapSignals,
    labHighlights: sliceList(reportSignals.labHighlights, 8),
    labTrends: sliceList(reportSignals.labTrends, 6),
    journalHighlights: sliceList(reportSignals.journalHighlights, 4),
    talkToAi: reportSignals.talkToAi
      ? {
          userMessageCount: reportSignals.talkToAi.userMessageCount,
          activeDays: reportSignals.talkToAi.activeDays,
          topics: sliceList(reportSignals.talkToAi.topics, 3),
          highlights: sliceList(reportSignals.talkToAi.highlights, 2),
        }
      : null,
    insightCandidates: sliceList(reportSignals.insightCandidates, 18),
    coverage: reportSignals.coverage,
  }
}

function shrinkModelPayload(payload: any, maxChars: number) {
  const limit = (list: any, max: number) => (Array.isArray(list) ? list.slice(0, max) : [])
  const json = safeJsonStringify(payload)
  if (json.length <= maxChars) return { payload, json, size: json.length }

  const slimmed = {
    ...payload,
    dailyStats: limit(payload.dailyStats, 5),
    insightCandidates: limit(payload.insightCandidates, 12),
    trendSignals: limit(payload.trendSignals, 4),
    riskFlags: limit(payload.riskFlags, 4),
    labTrends: limit(payload.labTrends, 4),
    labHighlights: limit(payload.labHighlights, 6),
    journalHighlights: limit(payload.journalHighlights, 2),
    talkToAi: payload.talkToAi
      ? {
          userMessageCount: payload.talkToAi.userMessageCount,
          activeDays: payload.talkToAi.activeDays,
          topics: limit(payload.talkToAi.topics, 2),
          highlights: [],
        }
      : null,
  }

  const slimJson = safeJsonStringify(slimmed)
  return { payload: slimmed, json: slimJson, size: slimJson.length }
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
    .slice(0, 6)
    .map((m) => ({
      role: 'user',
      createdAt: m.createdAt.toISOString(),
      content: clipText(m.content, 160),
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
  ratings: Array<{
    name?: string | null
    value?: number | null
    isna?: boolean | null
    isNa?: boolean | null
    timestamp: Date
    note?: string | null
  }>
) {
  const goalMap = new Map<
    string,
    {
      goal: string
      total: number
      count: number
      firstValue: number | null
      lastValue: number | null
      firstAt: Date | null
      lastAt: Date | null
    }
  >()
  const notes: Array<{ content: string; createdAt: string; goal: string }> = []
  let totalValues = 0
  let valueCount = 0

  const sorted = [...ratings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  for (const row of sorted) {
    const goalName = String(row.name || 'General')
    if (goalName.startsWith('__')) continue
    const isNa = Boolean((row as any).isNa ?? (row as any).isna)
    const value = Number(row.value ?? 0)
    const hasValue = Number.isFinite(value) && !isNa
    const existing = goalMap.get(goalName) || {
      goal: goalName,
      total: 0,
      count: 0,
      firstValue: null,
      lastValue: null,
      firstAt: null,
      lastAt: null,
    }
    if (hasValue) {
      existing.total += value
      existing.count += 1
      totalValues += value
      valueCount += 1
      if (!existing.firstAt || row.timestamp < existing.firstAt) {
        existing.firstAt = row.timestamp
        existing.firstValue = value
      }
      if (!existing.lastAt || row.timestamp > existing.lastAt) {
        existing.lastAt = row.timestamp
        existing.lastValue = value
      }
    }
    goalMap.set(goalName, existing)

    const note = String(row.note || '').trim()
    if (note) {
      notes.push({ content: clipText(note, 180), createdAt: row.timestamp.toISOString(), goal: goalName })
    }
  }

  const goals = Array.from(goalMap.values())
    .map((goal) => ({
      goal: goal.goal,
      avgRating: goal.count ? +(goal.total / goal.count).toFixed(1) : null,
      entries: goal.count,
      trend: goal.firstValue != null && goal.lastValue != null ? +(goal.lastValue - goal.firstValue).toFixed(1) : null,
    }))
    .sort((a, b) => (b.entries || 0) - (a.entries || 0))

  const overallAvg = valueCount ? +(totalValues / valueCount).toFixed(1) : null

  return {
    totalEntries: ratings.length,
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
  journalCount: number
  foodNames: Record<string, number>
}

function buildDailyStats(params: {
  foodLogs: Array<{ name: string; nutrients: any; createdAt: Date; localDate?: string | null }>
  waterLogs: Array<{ amountMl: number; createdAt: Date; localDate?: string | null }>
  checkinRatings: Array<{ timestamp: Date }>
  exerciseLogs: Array<{ duration: number; createdAt: Date }>
  exerciseEntries: Array<{ durationMinutes: number; createdAt: Date; localDate?: string | null }>
  moodRows: Array<{ mood: number; timestamp: Date; localDate?: string | null }>
  symptomAnalyses: Array<{ createdAt: Date; symptoms: any }>
  talkToAiMessages: Array<{ createdAt: Date; role: string }>
  journalEntries: Array<{ createdAt: Date; localDate?: string | null }>
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
      journalCount: 0,
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

  for (const log of params.checkinRatings) {
    const dayKey = resolveDayKey(null, log.timestamp)
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

  for (const entry of params.journalEntries) {
    const dayKey = resolveDayKey(entry.localDate ?? null, entry.createdAt)
    const day = ensureDay(dayKey)
    if (!day) continue
    day.journalCount += 1
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
        journalCount: day.journalCount,
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
  const candidates = Array.isArray(context?.insightCandidates) ? context.insightCandidates : []
  const riskFlags = Array.isArray(context?.riskFlags) ? context.riskFlags : []
  const nutritionSummary = context?.nutritionSummary || {}
  const hydrationSummary = context?.hydrationSummary || {}
  const exerciseSummary = context?.exerciseSummary || {}
  const moodSummary = context?.moodSummary || {}
  const symptomSummary = context?.symptomSummary || {}
  const checkinSummary = context?.checkinSummary || {}
  const labHighlights = Array.isArray(context?.labs?.highlights) ? context.labs.highlights : []
  const labTrends = Array.isArray(context?.labTrends) ? context.labTrends : []
  const supplements = Array.isArray(context?.supplements) ? context.supplements : []
  const medications = Array.isArray(context?.medications) ? context.medications : []
  const journalSummary = context?.journalSummary || {}

  const addItem = (
    section: ReportSectionKey,
    bucket: 'working' | 'suggested' | 'avoid',
    name: string,
    reason: string
  ) => {
    if (!name && !reason) return
    sections[section][bucket].push({ name: name || 'Insight', reason: reason || '' })
  }

  for (const candidate of candidates) {
    const section = candidate.section as ReportSectionKey
    if (!REPORT_SECTIONS.includes(section)) continue
    const evidence = String(candidate.evidence || '').trim()
    const action = String(candidate.action || '').trim()
    const reason = [evidence, action].filter(Boolean).join('\n')
    addItem(section, candidate.bucket, candidate.title, reason)
  }

  const working = candidates.filter((c: any) => c.bucket === 'working').slice(0, 3)
  const focus = candidates.filter((c: any) => c.bucket !== 'working').slice(0, 3)
  working.forEach((item: any) => wins.push({ name: item.title, reason: [item.evidence, item.action].filter(Boolean).join('\n') }))
  focus.forEach((item: any) => gaps.push({ name: item.title, reason: [item.evidence, item.action].filter(Boolean).join('\n') }))
  if (gaps.length < 3 && riskFlags.length) {
    riskFlags.slice(0, 3 - gaps.length).forEach((flag: any) => gaps.push(flag))
  }

  if (!sections.nutrition.working.length && nutritionSummary?.dailyAverages?.calories) {
    sections.nutrition.working.push({
      name: 'Daily nutrition baseline',
      reason: `Average intake was about ${nutritionSummary.dailyAverages.calories} kcal and ${nutritionSummary.dailyAverages.protein_g}g protein per day.`,
    })
  }
  if (!sections.nutrition.working.length && Array.isArray(nutritionSummary?.topFoods) && nutritionSummary.topFoods.length) {
    const topFoods = nutritionSummary.topFoods.map((food: any) => food.name).filter(Boolean).slice(0, 4)
    if (topFoods.length) {
      sections.nutrition.working.push({
        name: 'Most logged foods',
        reason: `Top foods this week: ${topFoods.join(', ')}.`,
      })
    }
  }
  if (!sections.hydration.working.length && hydrationSummary?.dailyAverageMl) {
    sections.hydration.working.push({
      name: 'Daily hydration baseline',
      reason: `Average water was about ${hydrationSummary.dailyAverageMl} ml per day.`,
    })
  }
  if (!sections.exercise.working.length && exerciseSummary?.totalMinutes) {
    sections.exercise.working.push({
      name: 'Weekly movement total',
      reason: `You moved about ${exerciseSummary.totalMinutes} minutes across the week.`,
    })
  }
  if (!sections.mood.working.length && moodSummary?.averageMood != null) {
    sections.mood.working.push({
      name: 'Mood baseline',
      reason: `Average mood was about ${moodSummary.averageMood} this week.`,
    })
  }
  if (!sections.symptoms.working.length && symptomSummary?.topSymptoms?.length) {
    const topSymptoms = symptomSummary.topSymptoms.map((s: any) => s.name).filter(Boolean).slice(0, 3)
    sections.symptoms.working.push({
      name: 'Most common symptoms',
      reason: `Most common symptoms: ${topSymptoms.join(', ')}.`,
    })
  }
  if (!sections.labs.working.length && (labHighlights.length || labTrends.length)) {
    const first = labTrends[0]
    sections.labs.working.push({
      name: 'Lab movement',
      reason: first ? `${first.name} moved ${first.direction} vs the prior result.` : 'Recent lab values were updated.',
    })
  }
  if (supplements.length && !sections.supplements.working.length) {
    sections.supplements.working = supplements.slice(0, 6).map((s: any) => ({
      name: s.name,
      reason: 'Listed in your current routine.',
    }))
  }
  if (medications.length && !sections.medications.working.length) {
    sections.medications.working = medications.slice(0, 6).map((m: any) => ({
      name: m.name,
      reason: 'Listed in your current routine.',
    }))
  }
  if (!sections.overview.working.length && checkinSummary?.goals?.length) {
    const topGoals = checkinSummary.goals.map((g: any) => g.goal).filter(Boolean).slice(0, 2)
    sections.overview.working.push({
      name: 'Check-ins cover key goals',
      reason: `Recent check-ins focused on ${topGoals.join(', ')}.`,
    })
  }
  if (Array.isArray(journalSummary?.highlights) && journalSummary.highlights.length) {
    const highlight = journalSummary.highlights[0]
    if (highlight?.date && highlight?.time && highlight?.note) {
      sections.overview.working.push({
        name: 'Health journal note',
        reason: `On ${highlight.date} at ${highlight.time} you wrote: \"${highlight.note}\". This gets compared with that day's food, fluids, and activity.`,
      })
    }
  }

  const summarySentences: string[] = []
  if (working[0]) {
    summarySentences.push(`${working[0].title}. ${working[0].evidence}`)
  }
  if (focus[0]) {
    summarySentences.push(`${focus[0].title}. ${focus[0].evidence}`)
  }
  if (riskFlags[0]) {
    summarySentences.push(`${riskFlags[0].name}. ${riskFlags[0].reason}`)
  }
  if (Array.isArray(journalSummary?.highlights) && journalSummary.highlights.length) {
    const highlight = journalSummary.highlights[0]
    if (highlight?.date && highlight?.time && highlight?.note) {
      summarySentences.push(`Journal note on ${highlight.date} at ${highlight.time}: \"${highlight.note}\".`)
    }
  }
  if (nutritionSummary?.dailyAverages?.calories) {
    summarySentences.push(
      `Average daily calories were about ${nutritionSummary.dailyAverages.calories} kcal with ${nutritionSummary.dailyAverages.protein_g}g protein.`
    )
  }
  if (hydrationSummary?.dailyAverageMl) {
    summarySentences.push(`Average water was about ${hydrationSummary.dailyAverageMl} ml per day.`)
  }
  if (!summarySentences.length) {
    summarySentences.push('This report is based on the data available in the last 7 days.')
  }

  return {
    summary: summarySentences.join(' '),
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
    const sessionEmail = String(session.user.email || '').toLowerCase()
    if (!sessionEmail || sessionEmail !== MANUAL_REPORT_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
  if (!state?.reportsEnabled) {
    return NextResponse.json({ status: 'disabled', reason: 'reports_disabled' }, { status: 400 })
  }
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

  const existingReport = await getWeeklyReportByPeriod(userId, periodStartDate, periodEndDate)
  if (existingReport && existingReport.status !== 'FAILED') {
    const statusText = existingReport.status === 'READY'
      ? 'ready'
      : existingReport.status === 'RUNNING'
        ? 'running'
        : existingReport.status === 'LOCKED'
          ? 'locked'
          : 'skipped'
    return NextResponse.json({ status: statusText, reportId: existingReport.id })
  }

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
  const preflightCostCents = Number.isFinite(WEEKLY_PREFLIGHT_CENTS) && WEEKLY_PREFLIGHT_CENTS > 0 ? WEEKLY_PREFLIGHT_CENTS : CREDIT_COSTS.INSIGHTS_GENERATION
  const hasCredits = wallet?.totalAvailableCents != null && wallet.totalAvailableCents >= preflightCostCents

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
    healthJournalEntries,
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
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { createdAt: 'desc' },
        take: 75,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load food logs', error)
        return []
      }),
    prisma.waterLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { createdAt: 'desc' },
        take: 120,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load water logs', error)
        return []
      }),
    prisma.healthLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { goal: { select: { name: true } } },
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load health logs', error)
        return []
      }),
    prisma.healthJournalEntry
      .findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { createdAt: 'desc' },
        take: 120,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load health journal entries', error)
        return []
      }),
    prisma.exerciseLog
      .findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .catch((error) => {
        console.warn('[weekly-report] Failed to load exercise logs', error)
        return []
      }),
    prisma.exerciseEntry
      .findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
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
    healthJournalEntries,
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
      'SELECT mood, timestamp, localDate, tags, note FROM MoodEntries WHERE userId = $1 AND timestamp >= $2 AND timestamp <= $3 ORDER BY timestamp DESC LIMIT 120',
      userId,
      periodStart,
      periodEnd
    )
  } catch (error) {
    console.warn('[weekly-report] Failed to load mood entries', error)
    moodRows = []
  }

  let checkinRatings: Array<{
    id: string
    date: string
    timestamp: Date
    value: number | null
    note: string | null
    isNa: boolean | null
    name: string
    polarity: string | null
  }> = []
  try {
    checkinRatings = await prisma.$queryRawUnsafe(
      `SELECT r.id,
              r.date,
              r.date::timestamptz AS timestamp,
              r.value,
              r.note,
              r.isna,
              i.name,
              i.polarity
       FROM checkinratings r
       JOIN checkinissues i ON i.id = r.issueid
       WHERE r.userid = $1
         AND r.date BETWEEN $2 AND $3
       ORDER BY r.date DESC
       LIMIT 200`,
      userId,
      periodStartDate,
      periodEndDate
    )
  } catch (error) {
    console.warn('[weekly-report] Failed to load check-in ratings', error)
    checkinRatings = []
  }
  const legacyCheckins =
    (user.healthLogs || []).map((log: any) => ({
      name: log.goal?.name || null,
      value: Number(log.rating ?? 0),
      isNa: false,
      timestamp: log.createdAt,
      note: log.notes ?? null,
    })) || []
  const checkinRows = checkinRatings.length ? checkinRatings : legacyCheckins

  let symptomAnalyses: Array<{ summary: string | null; analysisText: string | null; createdAt: Date; symptoms: any }> = []
  try {
    symptomAnalyses = await prisma.symptomAnalysis.findMany({
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
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
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
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

  const timezone = await resolveWeeklyReportTimezone(userId)

  const nutritionSummary = buildNutritionSummary(
    (user.foodLogs || []).map((f) => ({
      name: f.name,
      nutrients: (f as any).nutrients || null,
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
      meal: (f as any).meal ?? null,
    }))
  )

  const foodHighlights = buildFoodHighlights(
    (user.foodLogs || []).map((f) => ({
      name: f.name,
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
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
  const journalSummary = buildJournalSummary(
    (user.healthJournalEntries || []).map((entry: any) => ({
      content: entry.content || '',
      createdAt: entry.createdAt,
      localDate: entry.localDate || null,
    })),
    timezone
  )

  const journalDigest = buildJournalDigest(
    (user.healthJournalEntries || []).map((entry: any) => ({
      content: entry.content || '',
      createdAt: entry.createdAt,
      localDate: entry.localDate || null,
    })),
    timezone
  )

  const checkinSummary = buildCheckinSummary(checkinRows || [])
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
  checkinRows?.forEach((r) => stamp(r.timestamp))
  user.healthJournalEntries?.forEach((entry) => stamp(entry.createdAt))
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
      (checkinRows?.length || 0) +
      (user.healthJournalEntries?.length || 0) +
      (user.exerciseLogs?.length || 0) +
      (user.exerciseEntries?.length || 0) +
      (moodRows?.length || 0) +
      (symptomAnalyses?.length || 0) +
      (talkToAiMessages?.length || 0),
    foodCount: user.foodLogs?.length || 0,
    waterCount: user.waterLogs?.length || 0,
    moodCount: moodRows?.length || 0,
    checkinCount: checkinRows?.length || 0,
    journalCount: user.healthJournalEntries?.length || 0,
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

  const goalRatings = Array.isArray(checkinSummary?.goals) ? checkinSummary.goals : []
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
    checkinRatings: (checkinRows || []).map((log) => ({ timestamp: log.timestamp })),
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
    journalEntries: (user.healthJournalEntries || []).map((entry) => ({
      createdAt: entry.createdAt,
      localDate: entry.localDate ?? null,
    })),
  })

  const compactDailyStats = dailyStats.map((day) => ({
    date: day.date,
    calories: day.calories,
    protein_g: day.protein_g,
    carbs_g: day.carbs_g,
    fat_g: day.fat_g,
    fiber_g: day.fiber_g,
    sugar_g: day.sugar_g,
    sodium_mg: day.sodium_mg,
    waterMl: day.waterMl,
    hydrationEntries: day.hydrationEntries,
    exerciseMinutes: day.exerciseMinutes,
    exerciseCount: day.exerciseCount,
    moodAvg: day.moodAvg,
    moodEntries: day.moodEntries,
    symptomCount: day.symptomCount,
    checkinCount: day.checkinCount,
    journalCount: day.journalCount,
    topFoods: day.topFoods,
  }))

  const dataFlags = buildDataFlags(dailyStats)
  const nutritionSignals = buildNutritionSignals(dailyStats)
  const mealTimingSummary = buildMealTimingSummary(
    (user.foodLogs || []).map((f) => ({
      createdAt: f.createdAt,
      localDate: (f as any).localDate ?? null,
      meal: (f as any).meal ?? null,
    })),
    timezone
  )
  const timeOfDayNutrition = buildTimeOfDayNutritionSummary(
    (user.foodLogs || []).map((f) => ({
      createdAt: f.createdAt,
      nutrients: (f as any).nutrients || null,
    })),
    timezone
  )
  const correlationSignals = {
    hydrationMood: buildCorrelation(dailyStats, 'waterMl', 'moodAvg', { minDays: 4, minDiff: 0.3 }),
    exerciseMood: buildCorrelation(dailyStats, 'exerciseMinutes', 'moodAvg', { minDays: 4, minDiff: 0.3 }),
    sugarSymptoms: buildCorrelation(dailyStats, 'sugar_g', 'symptomCount', { minDays: 4, minDiff: 0.6 }),
  }
  const lateMealImpact = buildLateMealImpact(dailyStats, mealTimingSummary.lateMealDays || [])
  const trendSignals = buildTrendSignals(dailyStats)
  const moodValues = dailyStats.flatMap((row) => {
    const value = row.moodAvg
    return typeof value === 'number' && Number.isFinite(value) ? [value] : []
  })
  const moodRange =
    moodValues.length >= 3 ? Math.round((Math.max(...moodValues) - Math.min(...moodValues)) * 10) / 10 : null
  const symptomLateMealOverlap = intersectDays(
    (dataFlags?.symptomHeavyDays || []).map((d: any) => d.date),
    mealTimingSummary.lateMealDays || []
  )
  const symptomHighSugarOverlap = intersectDays(
    (dataFlags?.symptomHeavyDays || []).map((d: any) => d.date),
    (dataFlags?.sugarSpikes || []).map((d: any) => d.date)
  )
  const riskFlags = buildRiskFlags({ dailyStats, dataFlags, mealTimingSummary })
  const insightCandidates = buildInsightCandidates({
    nutritionSignals,
    mealTimingSummary,
    timeOfDayNutrition,
    dataFlags,
    correlationSignals,
    lateMealImpact,
    checkinSummary,
    labHighlights,
    labTrends,
    moodRange,
    dailyStats,
    journalEntries: user.healthJournalEntries || [],
    timezone,
  })

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
    foodHighlights,
    foodLogSample: (user.foodLogs || []).slice(0, 15).map((f) => ({
      name: f.name,
      localDate: (f as any).localDate ?? null,
      meal: (f as any).meal ?? null,
      time: formatLocalTime(f.createdAt, timezone),
    })),
    checkins: goalRatings,
    checkinSummary,
    moodSummary,
    symptoms: symptomAnalyses.map((s) => ({
      summary: s.summary || null,
      symptoms: toStringArray(s.symptoms).slice(0, 8),
      createdAt: s.createdAt,
    })),
    symptomSummary,
    labs: { count: labReports.length, highlights: labHighlights },
    labTrends,
    dailyStats,
    dataFlags,
    correlationSignals,
    trendSignals,
    riskFlags,
    insightCandidates,
    lateMealImpact,
    moodRange,
    exerciseEntries: (user.exerciseEntries || []).slice(0, 20).map((e) => ({
      label: e.label,
      durationMinutes: e.durationMinutes,
      createdAt: e.createdAt,
    })),
    exerciseSummary,
    coverage,
    talkToAi: talkToAiSummary,
    journalSummary,
    journalDigest,
    journalEntries: (user.healthJournalEntries || []).slice(0, 20).map((entry) => ({
      content: clipText(entry.content || '', 200),
      createdAt: entry.createdAt,
      localDate: entry.localDate,
      time: formatLocalTime(entry.createdAt, timezone),
    })),
    timezone,
    nutritionSignals,
    mealTimingSummary,
    timeOfDayNutrition,
    overlapSignals: {
      symptomLateMealDays: symptomLateMealOverlap,
      symptomHighSugarDays: symptomHighSugarOverlap,
    },
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
      journal: { entries: journalSummary.entries, days: journalSummary.daysWithNotes },
    },
  }

  const healthSituationsText = healthSituations
    ? clipText(typeof healthSituations === 'string' ? healthSituations : JSON.stringify(healthSituations), 600)
    : null

  const reportSignals = buildReportSignals({
    reportContext: {
      ...reportContext,
      healthSituations: healthSituationsText,
    },
    nutritionSummary,
    hydrationSummary,
    exerciseSummary,
    moodSummary,
    symptomSummary,
    checkinSummary,
    mealTimingSummary,
    timeOfDayNutrition,
    correlationSignals,
    trendSignals,
    riskFlags,
    dataFlags,
    overlapSignals: reportContext.overlapSignals,
    labHighlights,
    labTrends,
    insightCandidates,
    talkToAiSummary,
    journalEntries: reportContext.journalEntries,
    dailyStats: compactDailyStats,
    nutritionSignals,
    timezone,
  })
  const MAX_LLM_CONTEXT_CHARS = 120000
  const modelInput = buildModelInput({ ...reportSignals, coverage })
  const modelPayload = shrinkModelPayload(modelInput, MAX_LLM_CONTEXT_CHARS)
  const llmPayloadJson = modelPayload.json
  const llmPayloadSize = modelPayload.size

  const rawModel = String(process.env.OPENAI_WEEKLY_REPORT_MODEL || '').trim()
  const model = rawModel.toLowerCase().includes('gpt-5.2') ? rawModel : 'gpt-5.2-chat-latest'
  const weeklyLlmRaw = (process.env.ENABLE_WEEKLY_REPORT_LLM || '').toLowerCase().trim()
  const llmEnabled = weeklyLlmRaw ? weeklyLlmRaw === 'true' || weeklyLlmRaw === '1' || weeklyLlmRaw === 'yes' : true
  let reportPayload: any = null
  let summaryText = ''
  let llmUsage: { promptTokens: number; completionTokens: number; costCents: number; model: string } | null = null
  let chargeCents = preflightCostCents

  const llmPayloadReady = Boolean(llmPayloadJson) && llmPayloadSize <= MAX_LLM_CONTEXT_CHARS
  let llmStatus: 'ok' | 'disabled' | 'missing_key' | 'payload_too_large' | 'error' = 'disabled'
  if (!llmEnabled) {
    llmStatus = 'disabled'
  } else if (!process.env.OPENAI_API_KEY) {
    llmStatus = 'missing_key'
  } else if (!llmPayloadReady) {
    llmStatus = 'payload_too_large'
  } else {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const prompt = `You are a careful, data-driven health coach. Use ONLY the JSON data provided.

Generate a 7-day health report in plain language with this exact JSON shape:
{
  "summary": "6-10 short bullet points separated by new lines",
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
- When you mention a day or event, include the date or time from the data.
- Each item should be two short lines: line 1 = what happened and why it matters, line 2 = clear next step.
- Use real signals from the JSON data. No generic advice.
- Do not claim you can measure “sleep consistency” unless the JSON includes real sleep tracking data. If sleep data is missing, do not mention sleep consistency at all.
- Supplements section rules:
  - If the JSON includes 6+ supplements, include at least 6 supplement items across supplements.working + supplements.suggested (unless the JSON is missing supplement names).
  - For each supplement item you include: use the exact supplement name from JSON, mention dosage/timing if provided, and tie it to at least one named goal/issue from JSON when possible.
  - If a supplement name is unclear (brand blend / unknown ingredients), say you can’t connect it confidently yet and avoid guessing ingredients.
- Use insightCandidates, correlationSignals, trendSignals, and riskFlags as your primary signals when available.
- Use nutritionSummary.topFoods, foodHighlights, and dailyStats.topFoods to name actual foods (not just calories).
- Do not ask the user what they ate or to log meals. Use the foods already in the data.
- If journalEntries exist, include at least 2 items that quote the note with date/time and link it to the same day's foods, fluids, exercise, mood, symptoms, or check-ins.
- If check-in data exists, include at least 1 item that names the goal and ties it to a specific date range or change.
- Do not list raw log counts or repeat "you logged X entries" unless it directly supports a pattern or gap.
- Avoid telling the user to "keep logging" unless a section has no usable data.
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
- Do not tell the user how to navigate the app or where to find logs.
- Do not repeat the same insight in more than one section.

JSON data:
${llmPayloadJson}
`

      const isGpt5 = model.toLowerCase().includes('gpt-5')
      const request: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2600,
        response_format: { type: 'json_object' },
      }
      if (!isGpt5) {
        request.temperature = 0.2
      }

      const { completion, costCents, promptTokens, completionTokens } = await chatCompletionWithCost(openai, request)

      llmUsage = {
        promptTokens,
        completionTokens,
        costCents,
        model,
      }
      llmStatus = 'ok'

      const content = completion.choices?.[0]?.message?.content || ''
      const parsed = safeJsonParse(content)
      if (parsed && parsed.sections) {
        reportPayload = parsed
        summaryText = typeof parsed.summary === 'string' ? parsed.summary : ''
      }
    } catch (error) {
      console.warn('[weekly-report] LLM generation failed', error)
      llmStatus = 'error'
    }
  }
  if (llmEnabled && !llmPayloadReady) {
    console.warn('[weekly-report] LLM payload too large', {
      size: llmPayloadSize,
      max: MAX_LLM_CONTEXT_CHARS,
    })
  }

  const estimatedCostCents = costCentsEstimateFromText(model, llmPayloadJson, 2600 * 4)
  chargeCents = Math.max(1, llmUsage?.costCents ?? estimatedCostCents ?? preflightCostCents)

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

  reportPayload.sections = dedupeReportSections(sections)
  reportPayload.wins = wins
  reportPayload.gaps = gaps
  if (!summaryText) {
    summaryText = typeof reportPayload.summary === 'string' ? reportPayload.summary : fallbackPayload.summary
  }

  let charged = false
  let chargeFailed = false
  try {
    charged = await cm.chargeCents(chargeCents)
  } catch (error) {
    chargeFailed = true
    console.warn('[weekly-report] Credit charge failed', error)
  }
  if (!charged && !chargeFailed) {
    const lockedReport = await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
      dataSummary: {
        supplements: reportContext.supplements,
        medications: reportContext.medications,
        coverage,
        dataWarning,
        talkToAiSummary,
        hydrationSummary,
        nutritionSummary,
        journalSummary,
        moodSummary,
        symptomSummary,
        exerciseSummary,
        checkinSummary,
        dailyStats,
        labTrends,
        labHighlights,
        llmUsage,
        llmStatus,
        llmChargeCents: chargeCents,
        llmPayloadSize,
        llmPayloadMax: MAX_LLM_CONTEXT_CHARS,
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
      supplements: reportContext.supplements,
      medications: reportContext.medications,
      coverage,
      dataWarning,
      talkToAiSummary,
      hydrationSummary,
      nutritionSummary,
      journalSummary,
      moodSummary,
      symptomSummary,
      exerciseSummary,
      checkinSummary,
      dailyStats,
      labTrends,
      labHighlights,
      llmUsage,
      llmStatus,
      llmChargeCents: chargeCents,
      llmPayloadSize,
      llmPayloadMax: MAX_LLM_CONTEXT_CHARS,
      ...(chargeFailed ? { chargeSkipped: true } : {}),
    },
    report: reportPayload,
    model,
    creditsCharged: charged ? chargeCents : 0,
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
