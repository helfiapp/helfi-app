import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { ensureMoodTables } from '@/app/api/mood/_db'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import {
  createWeeklyReportRecord,
  getNextDueAt,
  getWeeklyReportState,
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
  'exercise',
  'lifestyle',
  'labs',
  'mood',
  'symptoms',
] as const

type ReportSectionKey = (typeof REPORT_SECTIONS)[number]

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

function buildDefaultSections() {
  const section = { working: [], suggested: [], avoid: [] }
  return REPORT_SECTIONS.reduce((acc, key) => {
    acc[key] = { ...section }
    return acc
  }, {} as Record<ReportSectionKey, typeof section>)
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

  return {
    summary: 'We created a basic report based on the data available. Keep logging daily so we can make this more detailed next week.',
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
    await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
      dataSummary: {
        lockedReason: 'insufficient_credits',
      },
      readyAt: now.toISOString(),
    })
    await upsertWeeklyReportState(userId, { lastStatus: 'LOCKED' })
    return NextResponse.json({ status: 'locked' })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      healthGoals: true,
      supplements: true,
      medications: true,
      foodLogs: {
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 75,
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

  const dataDays = new Set<string>()
  const stamp = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d
    if (!Number.isNaN(date.getTime())) dataDays.add(date.toISOString().slice(0, 10))
  }

  user.foodLogs?.forEach((f) => stamp(f.createdAt))
  user.healthLogs?.forEach((h) => stamp(h.createdAt))
  user.exerciseLogs?.forEach((e) => stamp(e.createdAt))
  user.exerciseEntries?.forEach((e) => stamp(e.createdAt))
  moodRows?.forEach((m) => stamp(m.timestamp))
  symptomAnalyses?.forEach((s) => stamp(s.createdAt))
  labReports?.forEach((r) => stamp(r.createdAt))

  const coverage = {
    daysActive: dataDays.size,
    totalEvents:
      (user.foodLogs?.length || 0) +
      (user.healthLogs?.length || 0) +
      (user.exerciseLogs?.length || 0) +
      (user.exerciseEntries?.length || 0) +
      (moodRows?.length || 0) +
      (symptomAnalyses?.length || 0),
    foodCount: user.foodLogs?.length || 0,
    moodCount: moodRows?.length || 0,
    checkinCount: user.healthLogs?.length || 0,
    symptomCount: symptomAnalyses?.length || 0,
    exerciseCount: (user.exerciseLogs?.length || 0) + (user.exerciseEntries?.length || 0),
    labCount: labReports?.length || 0,
  }

  const dataWarning = summarizeCoverage({
    daysActive: coverage.daysActive,
    totalEvents: coverage.totalEvents,
    foodCount: coverage.foodCount,
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
    recentFoods: (user.foodLogs || []).slice(0, 20).map((f) => ({
      name: f.name,
      createdAt: f.createdAt,
      nutrients: (f as any).nutrients || null,
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
    exerciseEntries: (user.exerciseEntries || []).slice(0, 20).map((e) => ({
      label: e.label,
      durationMinutes: e.durationMinutes,
      createdAt: e.createdAt,
    })),
    coverage,
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
  "sections": {
    "overview": { "working": [{"name": "", "reason": ""}], "suggested": [{"name": "", "reason": ""}], "avoid": [{"name": "", "reason": ""}] },
    "supplements": { "working": [], "suggested": [], "avoid": [] },
    "medications": { "working": [], "suggested": [], "avoid": [] },
    "nutrition": { "working": [], "suggested": [], "avoid": [] },
    "exercise": { "working": [], "suggested": [], "avoid": [] },
    "lifestyle": { "working": [], "suggested": [], "avoid": [] },
    "labs": { "working": [], "suggested": [], "avoid": [] },
    "mood": { "working": [], "suggested": [], "avoid": [] },
    "symptoms": { "working": [], "suggested": [], "avoid": [] }
  }
}

Rules:
- Keep each item short and specific (1-2 sentences).
- If a section has no data, leave all arrays empty.
- Only use information from the JSON. Do not invent labs or diagnoses.
- Use supportive, non-alarming language.

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

  const charged = await cm.chargeCents(costCredits)
  if (!charged) {
    await updateWeeklyReportRecord(userId, report.id, {
      status: 'LOCKED',
      summary: 'Your weekly report is ready to unlock with a subscription or top-up credits.',
      dataSummary: {
        coverage,
        dataWarning,
        lockedReason: 'insufficient_credits',
      },
      report: null,
      readyAt: now.toISOString(),
    })
    await upsertWeeklyReportState(userId, { lastStatus: 'LOCKED' })
    return NextResponse.json({ status: 'locked' })
  }

  const updated = await updateWeeklyReportRecord(userId, report.id, {
    status: 'READY',
    summary: summaryText,
    dataSummary: {
      coverage,
      dataWarning,
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

  return NextResponse.json({ status: 'ready', reportId: report.id })
}
