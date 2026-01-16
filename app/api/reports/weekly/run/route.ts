import { NextRequest, NextResponse } from 'next/server'
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

function buildNutritionSummary(foodLogs: Array<{ name: string | null; nutrients: any; createdAt: Date }>) {
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
  }

  const topFoods = Object.entries(foodCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

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
    topFoods,
  }
}

function buildHydrationSummary(
  waterLogs: Array<{ amountMl: number | null; label?: string | null; localDate?: string | null; createdAt: Date }>
) {
  let totalMl = 0
  const daySet = new Set<string>()
  const labelCounts = new Map<string, { label: string; count: number }>()

  for (const log of waterLogs) {
    const ml = Number(log?.amountMl ?? 0) || 0
    totalMl += ml
    const day = log?.localDate || (log?.createdAt ? log.createdAt.toISOString().slice(0, 10) : '')
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

function buildFallbackReport(context: any) {
  const sections = buildDefaultSections()
  const supplementItems = Array.isArray(context?.supplements)
    ? context.supplements.slice(0, 8).map((s: any) => ({
      name: s.name,
      reason: 'Already part of your current routine.',
    }))
    : []
  const medicationItems = Array.isArray(context?.medications)
    ? context.medications.slice(0, 8).map((m: any) => ({
      name: m.name,
      reason: 'Already part of your current routine.',
    }))
    : []

  sections.supplements.working = supplementItems
  sections.medications.working = medicationItems

  const wins: Array<{ name: string; reason: string }> = []
  const gaps: Array<{ name: string; reason: string }> = []
  const coverage = context?.coverage || {}
  if ((coverage.daysActive || 0) >= 4) {
    wins.push({
      name: 'Consistent tracking',
      reason: `You logged data on ${coverage.daysActive} days this week, which makes trends clearer.`,
    })
  }
  if ((coverage.foodCount || 0) >= 4) {
    wins.push({
      name: 'Food logging streak',
      reason: 'Multiple food entries were captured, giving the report real nutrition context.',
    })
  }
  if ((coverage.checkinCount || 0) >= 3) {
    wins.push({
      name: 'Check-in momentum',
      reason: 'You kept up with check-ins, so we can connect how you feel to your goals.',
    })
  }
  if ((coverage.daysActive || 0) <= 2) {
    gaps.push({
      name: 'Low tracking frequency',
      reason: 'There were only a few active days, so insights will be lighter than usual.',
    })
  }
  if ((coverage.labCount || 0) === 0) {
    gaps.push({
      name: 'No lab updates',
      reason: 'Upload lab results when you have them so we can track markers over time.',
    })
  }
  if ((coverage.exerciseCount || 0) === 0) {
    gaps.push({
      name: 'Exercise not captured',
      reason: 'Add workouts to help us understand how activity affects your focus areas.',
    })
  }
  if ((coverage.waterCount || 0) >= 4) {
    wins.push({
      name: 'Hydration tracked',
      reason: 'Water entries were logged multiple times this week, which helps hydration trends.',
    })
  }
  if ((coverage.waterCount || 0) === 0) {
    gaps.push({
      name: 'Hydration not logged',
      reason: 'Add water, tea, or coffee entries so hydration patterns show up in your report.',
    })
  }

  const hydrationSummary = context?.hydrationSummary
  if (hydrationSummary?.entries) {
    sections.hydration.working.push({
      name: 'Hydration logged',
      reason: `${hydrationSummary.entries} drink entries across ${hydrationSummary.daysWithLogs || 0} days.`,
    })
  }

  const talkToAi = context?.talkToAi
  if (talkToAi?.userMessageCount) {
    const topicLabels = Array.isArray(talkToAi.topics)
      ? talkToAi.topics.map((t: any) => t.topic).slice(0, 3)
      : []
    const topicText = topicLabels.length ? `Recent AI chats focused on ${topicLabels.join(', ')}.` : 'You chatted with the AI this week.'
    sections.overview.working.unshift({
      name: 'AI chat focus',
      reason: `${topicText} Keep logging so we can connect these questions to your trends.`,
    })
  }

  return {
    summary: 'We created a basic report based on the data available. Keep logging daily so we can make this more detailed next week.',
    wins,
    gaps,
    sections,
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const now = new Date()
  const state = await getWeeklyReportState(userId)
  if (!state?.nextReportDueAt) {
    return NextResponse.json({ status: 'skipped', reason: 'no_schedule' })
  }

  const dueAt = new Date(state.nextReportDueAt)
  if (dueAt.getTime() > now.getTime()) {
    return NextResponse.json({ status: 'skipped', reason: 'not_due' })
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      healthGoals: { orderBy: { updatedAt: 'desc' } },
      supplements: true,
      medications: true,
      foodLogs: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 75,
      },
      waterLogs: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 120,
      },
      healthLogs: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { goal: true },
      },
      exerciseLogs: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      exerciseEntries: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!user) {
    await updateWeeklyReportRecord(userId, report.id, {
      status: 'FAILED',
      error: 'User not found',
    })
    await upsertWeeklyReportState(userId, { lastStatus: 'FAILED' })
    return NextResponse.json({ status: 'failed', reason: 'user_missing' }, { status: 404 })
  }

  await ensureMoodTables()
  const moodRows: Array<{ mood: number; timestamp: Date }> = await prisma.$queryRawUnsafe(
    'SELECT mood, timestamp FROM MoodEntries WHERE userId = $1 AND timestamp >= $2 ORDER BY timestamp DESC LIMIT 50',
    userId,
    periodStart
  )

  const symptomAnalyses = await prisma.symptomAnalysis.findMany({
    where: { userId, createdAt: { gte: periodStart } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { summary: true, analysisText: true, createdAt: true, symptoms: true },
  })

  const labReports = await prisma.report.findMany({
    where: { userId, createdAt: { gte: periodStart } },
    select: { id: true, createdAt: true },
    take: 20,
  })

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
  try {
    const trendWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const labResults = await prisma.labResult.findMany({
      where: { report: { userId, createdAt: { gte: trendWindowStart } } },
      include: { report: { select: { createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 120,
    })

    const analyteMap = new Map<string, Array<{ value: number; unit: string | null; date: Date }>>()
    for (const result of labResults) {
      const encryptedFields: Record<string, string> = {
        analyteName: result.analyteNameEncrypted,
        value: result.valueEncrypted,
      }
      if (result.unitEncrypted) encryptedFields.unit = result.unitEncrypted
      if (result.collectionDateEncrypted) encryptedFields.collectionDate = result.collectionDateEncrypted
      const decrypted = await decryptFieldsBatch(encryptedFields, result.dataKeyEncrypted)
      const name = String(decrypted.analyteName || '').trim()
      if (!name) continue
      const rawValue = String(decrypted.value || '').trim()
      const match = rawValue.match(/-?\d+(\.\d+)?/)
      const numeric = match ? Number(match[0]) : NaN
      if (!Number.isFinite(numeric)) continue
      const unit = decrypted.unit ? String(decrypted.unit).trim() : null
      const date = decrypted.collectionDate ? new Date(decrypted.collectionDate) : result.report?.createdAt || result.createdAt
      if (Number.isNaN(date.getTime())) continue
      const existing = analyteMap.get(name) || []
      existing.push({ value: numeric, unit, date })
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
  } catch (error) {
    console.warn('[weekly-report] Failed to build lab trends', error)
  }

  await ensureTalkToAITables()
  const talkToAiMessages = await prisma.$queryRawUnsafe<
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
    ).catch(() => [])
  const talkToAiSummary = buildTalkToAiSummary(talkToAiMessages)

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

  const nutritionSummary = buildNutritionSummary(
    (user.foodLogs || []).map((f) => ({
      name: f.name,
      nutrients: (f as any).nutrients || null,
      createdAt: f.createdAt,
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

  const avgMood = moodRows.length
    ? +(moodRows.reduce((sum, row) => sum + Number(row.mood || 0), 0) / moodRows.length).toFixed(1)
    : null

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
    moodSummary: {
      averageMood: avgMood,
      entries: moodRows.length,
    },
    symptoms: symptomAnalyses.map((s) => ({
      summary: s.summary || null,
      analysis: s.analysisText || null,
      symptoms: s.symptoms || null,
      createdAt: s.createdAt,
    })),
    labs: { count: labReports.length },
    labTrends,
    exerciseEntries: (user.exerciseEntries || []).slice(0, 20).map((e) => ({
      label: e.label,
      durationMinutes: e.durationMinutes,
      createdAt: e.createdAt,
    })),
    coverage,
    talkToAi: talkToAiSummary,
  }

  const model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini'
  const llmEnabledRaw = (process.env.ENABLE_INSIGHTS_LLM || '').toLowerCase().trim()
  const llmEnabled = llmEnabledRaw === 'true' || llmEnabledRaw === '1' || llmEnabledRaw === 'yes'
  let reportPayload: any = null
  let summaryText = ''

  if (llmEnabled && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const prompt = `You are a careful, data-driven health coach. Use ONLY the JSON data provided.

Generate a 7-day health report in plain language with this exact JSON shape:
{
  "summary": "2-4 sentences that explain the main patterns and key wins",
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
- Keep each item short and specific (1-2 sentences).
- Use real signals from the JSON data. No generic advice.
- If a section has no data, leave all arrays empty.
- If you cannot support a win or gap with data, leave that list empty.
- Only use information from the JSON. Do not invent labs or diagnoses.
- If talkToAi data exists, connect it to logged data in the relevant sections and summary.
- Use supportive, non-alarming language.
- If data is thin, say that clearly and suggest exactly what to track next week (specific to missing areas).
- Avoid filler phrases. Every sentence must reference a data point or a clear pattern.
- If labTrends are present, describe movement (up/down/flat) without claiming good or bad.

JSON data:
${JSON.stringify(reportContext)}
`

      const { completion } = await chatCompletionWithCost(openai, {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      } as any)

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

  if (!reportPayload) {
    reportPayload = buildFallbackReport(reportContext)
    summaryText = reportPayload.summary
  }

  const sections = buildDefaultSections()
  const wins = Array.isArray(reportPayload?.wins) ? reportPayload.wins : []
  const gaps = Array.isArray(reportPayload?.gaps) ? reportPayload.gaps : []
  const incomingSections = reportPayload.sections || {}
  REPORT_SECTIONS.forEach((key) => {
    if (incomingSections[key]) {
      sections[key] = {
        working: Array.isArray(incomingSections[key].working) ? incomingSections[key].working : [],
        suggested: Array.isArray(incomingSections[key].suggested) ? incomingSections[key].suggested : [],
        avoid: Array.isArray(incomingSections[key].avoid) ? incomingSections[key].avoid : [],
      }
    }
  })

  reportPayload.sections = sections
  reportPayload.wins = wins
  reportPayload.gaps = gaps

  const charged = await cm.chargeCents(costCredits)
  if (!charged) {
    const lockedReport = await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
      dataSummary: {
        coverage,
        dataWarning,
        talkToAiSummary,
        hydrationSummary,
        labTrends,
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
      labTrends,
    },
    report: reportPayload,
    model,
    creditsCharged: costCredits,
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
}
