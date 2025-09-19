import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

export type IssueSectionKey = 'overview' | 'exercise' | 'supplements' | 'interactions' | 'labs' | 'nutrition' | 'lifestyle'

export const ISSUE_SECTION_ORDER: IssueSectionKey[] = ['overview', 'exercise', 'supplements', 'interactions', 'labs', 'nutrition', 'lifestyle']

export interface IssueSummary {
  id: string
  slug: string
  name: string
  polarity: 'positive' | 'negative'
  severityLabel: string
  severityScore: number | null
  currentRating: number | null
  ratingScaleMax: number | null
  trend: 'improving' | 'declining' | 'stable' | 'inconclusive'
  trendDelta: number | null
  lastUpdated: string | null
  highlight: string
  blockers: string[]
}

export type ReportMode = 'latest' | 'daily' | 'weekly' | 'custom'

export interface IssueSectionResult {
  issue: IssueSummary
  section: IssueSectionKey
  generatedAt: string
  confidence: number
  summary: string
  highlights: SectionHighlight[]
  dataPoints: SectionDatum[]
  recommendations: SectionRecommendation[]
  mode: ReportMode
  range?: { from?: string; to?: string }
}

// Base shape that individual section builders return. The final IssueSectionResult
// is assembled by attaching mode/range in buildIssueSectionWithContext.
type BaseSectionResult = Omit<IssueSectionResult, 'mode' | 'range'>

export interface SectionHighlight {
  title: string
  detail: string
  tone: 'positive' | 'neutral' | 'warning'
}

export interface SectionDatum {
  label: string
  value: string
  context?: string
}

export interface SectionRecommendation {
  title: string
  description: string
  actions: string[]
  priority: 'now' | 'soon' | 'monitor'
}

interface UserInsightContext {
  userId: string
  issues: Array<{ id: string; name: string; polarity: 'positive' | 'negative'; slug: string }>
  healthGoals: Record<string, HealthGoalWithLogs>
  supplements: Array<{ name: string; dosage: string; timing: string[] }>
  medications: Array<{ name: string; dosage: string; timing: string[] }>
  exerciseLogs: Array<{ type: string; duration: number; intensity: string | null; createdAt: Date }>
  foodLogs: Array<{ name: string; description: string | null; createdAt: Date }>
  todaysFoods: Array<{ name?: string; meal?: string; calories?: number }>
  bloodResults: BloodResultsData | null
  profile: {
    gender?: string | null
    weight?: number | null
    height?: number | null
    bodyType?: string | null
    exerciseFrequency?: string | null
  }
  onboardingComplete: boolean
}

interface HealthGoalWithLogs {
  id: string
  name: string
  currentRating: number | null
  createdAt: Date
  updatedAt: Date
  healthLogs: Array<{ rating: number; notes: string | null; createdAt: Date }>
}

interface BloodResultsData {
  uploadMethod: string
  documents: Array<{ id?: string; name?: string; url?: string; uploadedAt?: string }>
  images: Array<{ id?: string; url?: string; uploadedAt?: string }>
  notes: string
  skipped: boolean
  markers?: Array<{ name: string; value?: number; unit?: string; reference?: string }>
}

const RATING_SCALE_DEFAULT = 6

const ISSUE_KNOWLEDGE_BASE: Record<string, {
  aliases?: string[]
  helpfulSupplements?: Array<{ pattern: RegExp; why: string }>
  gapSupplements?: Array<{ title: string; why: string; suggested?: string }>
  supportiveExercises?: Array<{ title: string; detail: string }>
  nutritionFocus?: Array<{ title: string; detail: string }>
  lifestyleFocus?: Array<{ title: string; detail: string }>
  keyLabs?: Array<{ marker: string; optimal: string; cadence: string; note?: string }>
}> = {
  libido: {
    aliases: ['low libido', 'sexual health', 'erectile function'],
    helpfulSupplements: [
      { pattern: /ashwagandha/i, why: 'may improve sexual performance and stress resilience' },
      { pattern: /tongkat|longjack/i, why: 'can support testosterone and libido metrics' },
      { pattern: /tribulus/i, why: 'traditionally used for libido and androgen support' },
      { pattern: /zinc/i, why: 'supports hormonal balance when levels are low' },
      { pattern: /l[-\s]?arginine/i, why: 'can aid nitric oxide availability for circulation' },
    ],
    gapSupplements: [
      { title: 'Consider adaptogens for stress-linked libido dips', why: 'Chronic stress suppresses libido; ashwagandha or rhodiola can moderate cortisol', suggested: 'Ashwagandha 600mg/day (divided)' },
      { title: 'Evaluate zinc status', why: 'Low zinc impairs testosterone conversion and sexual health', suggested: 'Zinc bisglycinate 15–30mg with food' },
    ],
    supportiveExercises: [
      { title: 'Progressive resistance training 3x/week', detail: 'Supports testosterone, strength, and confidence metrics' },
      { title: 'Short HIIT blocks', detail: 'Improves endothelial function and nitric oxide availability' },
    ],
    nutritionFocus: [
      { title: 'Prioritise omega-3 rich meals', detail: 'Cardiovascular health underpins libido; aim for 2 oily fish servings/week' },
      { title: 'Stabilise blood sugar', detail: 'Balanced carbs + protein prevent insulin spikes that can blunt hormone signalling' },
    ],
    lifestyleFocus: [
      { title: 'Sleep 7.5–8 h with consistent wake time', detail: 'Testosterone release peaks during deep sleep; maintain routine' },
      { title: 'Stress decompression window', detail: 'Daily wind-down (breathwork, light stretching) reduces sympathetic dominance' },
    ],
    keyLabs: [
      { marker: 'Total & Free Testosterone', optimal: 'Total 550–900 ng/dL, Free 15–25 pg/mL', cadence: 'Retest every 6–12 weeks if adjusting therapy', note: 'Draw between 7–10am and ensure 48h without intense training' },
      { marker: 'SHBG & DHEA-S', optimal: 'SHBG 20–60 nmol/L, DHEA-S age-adjusted mid-range', cadence: 'Assess annually or with symptom shifts' },
      { marker: 'Vitamin D', optimal: '40–60 ng/mL', cadence: 'Every 6 months if supplementing' },
    ],
  },
  energy: {
    aliases: ['fatigue', 'low energy'],
    helpfulSupplements: [
      { pattern: /b12|methylcobalamin/i, why: 'supports methylation and energy when levels are low' },
      { pattern: /coq10|ubiquinol/i, why: 'assists mitochondrial ATP output, especially if on statins' },
      { pattern: /magnesium/i, why: 'involved in ATP production and sleep quality' },
      { pattern: /adaptogen|rhodiola|ginseng/i, why: 'modulates stress response and perceived fatigue' },
    ],
    gapSupplements: [
      { title: 'B-complex for cellular energy', why: 'Supports mitochondrial pathways if intake is low', suggested: 'Methylated B-complex with breakfast' },
    ],
    supportiveExercises: [
      { title: 'Zone 2 cardio 2–3x/week', detail: 'Builds mitochondrial density without draining reserves' },
      { title: 'Mobility days', detail: 'Maintains circulation and reduces stiffness-related fatigue' },
    ],
    nutritionFocus: [
      { title: 'Anchor each meal with 25g protein', detail: 'Prevents post-prandial crashes and supports recovery' },
      { title: 'Strategic caffeine window', detail: 'Keep caffeine before 2pm to protect sleep architecture' },
    ],
    lifestyleFocus: [
      { title: 'Light exposure within 30 min of waking', detail: 'Entrains circadian rhythm for daytime energy' },
      { title: 'Evening digital sunset', detail: 'Reduce blue light to support melatonin release' },
    ],
    keyLabs: [
      { marker: 'CBC & Ferritin', optimal: 'Ferritin 70–120 ng/mL', cadence: 'Every 6 months if symptomatic' },
      { marker: 'Thyroid Panel', optimal: 'TSH 0.8–2.0 µIU/mL, Free T3 upper half', cadence: '6–12 months' },
    ],
  },
}

const INTERACTION_RULES: Array<{
  id: string
  condition: (params: { supplements: string[]; medications: string[] }) => boolean
  message: string
  rationale: string
  priority: 'now' | 'soon' | 'monitor'
}> = [
  {
    id: 'iron-calcium-spacing',
    condition: ({ supplements }) => hasMatch(supplements, /iron/) && hasMatch(supplements, /calcium/),
    message: 'Separate iron and calcium',
    rationale: 'Calcium blocks iron absorption; a 2-hour gap preserves efficacy.',
    priority: 'now',
  },
  {
    id: 'magnesium-thyroid-spacing',
    condition: ({ supplements, medications }) => hasMatch(supplements, /magnesium/) && hasMatch(medications, /thyroxine|levothyroxine|eltroxin/i),
    message: 'Space magnesium from thyroid medication',
    rationale: 'Minerals reduce levothyroxine absorption; take thyroid dosing on empty stomach, magnesium later in the day.',
    priority: 'now',
  },
  {
    id: 'omega-anticoagulant-monitor',
    condition: ({ supplements, medications }) => hasMatch(supplements, /(omega|fish oil|epa|dha)/i) && hasMatch(medications, /warfarin|xarelto|eliquis|apixaban|dabigatran|clopidogrel/i),
    message: 'Check omega-3 with anticoagulants',
    rationale: 'High-dose omega-3 can enhance anticoagulant effect; coordinate with prescribing clinician.',
    priority: 'soon',
  },
]

function hasMatch(items: string[], pattern: RegExp) {
  return items.some(item => pattern.test(item))
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function inferPolarityFromName(name: string): 'positive' | 'negative' {
  const lowered = name.toLowerCase()
  if (/(pain|ache|injury|flare|anxiety|depress|stress|insomnia|fatigue|low\s|lack|poor|bloat|nausea|migraine|cramp|brain fog|libido|bp|blood pressure|cholesterol)/i.test(lowered)) {
    return 'negative'
  }
  if (/(gain|build|improve|increase|optimi[sz]e|boost|support|focus|goal|performance|endurance|strength|muscle|energy)/i.test(lowered)) {
    return 'positive'
  }
  return 'negative'
}

function normaliseRating(rating: number | null | undefined, polarity: 'positive' | 'negative') {
  if (rating === null || rating === undefined) return { score: null, label: 'No rating yet' }
  const scaleMax = RATING_SCALE_DEFAULT
  const bounded = Math.max(0, Math.min(scaleMax, rating))
  const percentage = (bounded / scaleMax) * 100
  if (polarity === 'negative') {
    if (percentage >= 70) return { score: percentage, label: 'Severe' }
    if (percentage >= 40) return { score: percentage, label: 'Moderate' }
    if (percentage > 0) return { score: percentage, label: 'Mild' }
    return { score: percentage, label: 'Resolved' }
  }
  if (percentage >= 80) return { score: percentage, label: 'Excellent progress' }
  if (percentage >= 55) return { score: percentage, label: 'On track' }
  if (percentage >= 30) return { score: percentage, label: 'Needs support' }
  return { score: percentage, label: 'Off track' }
}

function calculateTrend(logs: Array<{ rating: number; createdAt: Date }>, polarity: 'positive' | 'negative') {
  if (!logs || logs.length < 2) return { trend: 'inconclusive' as const, delta: null }
  const sorted = [...logs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const latest = sorted.slice(-3)
  const previous = sorted.slice(-6, -3)
  const avg = (items: typeof sorted) => (items.length ? items.reduce((sum, it) => sum + it.rating, 0) / items.length : null)
  const latestAvg = avg(latest)
  const prevAvg = avg(previous)
  if (latestAvg === null || prevAvg === null) return { trend: 'inconclusive' as const, delta: null }
  const delta = latestAvg - prevAvg
  if (Math.abs(delta) < 0.25) return { trend: 'stable' as const, delta }
  if (polarity === 'negative') {
    if (delta < 0) return { trend: 'improving' as const, delta }
    return { trend: 'declining' as const, delta }
  }
  if (delta > 0) return { trend: 'improving' as const, delta }
  return { trend: 'declining' as const, delta }
}

function pickKnowledgeKey(issueName: string) {
  const key = issueName.toLowerCase()
  if (ISSUE_KNOWLEDGE_BASE[key]) return key
  for (const [baseKey, value] of Object.entries(ISSUE_KNOWLEDGE_BASE)) {
    if (value.aliases?.some(alias => alias.toLowerCase() === key)) return baseKey
  }
  return null
}

export async function getIssueSummariesForCurrentUser() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return []
  return getIssueSummaries(userId)
}

export async function getIssueSummaries(userId: string): Promise<IssueSummary[]> {
  const context = await buildUserInsightContext(userId)
  return context.issues.map((issue) => enrichIssueSummary(issue, context))
}

type SectionOptions = {
  mode: ReportMode
  range?: { from?: string; to?: string }
}

export async function getIssueSection(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  options: Partial<SectionOptions> & { force?: boolean } = {}
): Promise<IssueSectionResult | null> {
  const mode = options.mode ?? 'latest'
  const rangeKey = encodeRange(options.range)

  if (options.force) {
    const context = await loadUserInsightContext(userId)
    return buildIssueSectionWithContext(context, slug, section, { mode, range: options.range })
  }

  return computeIssueSection(userId, slug, section, mode, rangeKey)
}

export async function getIssueLandingPayload(userId: string) {
  const context = await buildUserInsightContext(userId)
  const summaries = context.issues.map((issue) => enrichIssueSummary(issue, context))
  return {
    issues: summaries,
    generatedAt: new Date().toISOString(),
    onboardingComplete: context.onboardingComplete,
  }
}

const loadUserInsightContext = cache(async (userId: string): Promise<UserInsightContext> => {
  const [issuesRows, user] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ id: string; name: string; polarity: string }>>(
      'SELECT id, name, polarity FROM "CheckinIssues" WHERE "userId" = $1',
      userId
    ).catch(() => []),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        height: true,
        weight: true,
        bodyType: true,
        exerciseFrequency: true,
        healthGoals: {
          select: {
            id: true,
            name: true,
            category: true,
            currentRating: true,
            createdAt: true,
            updatedAt: true,
            healthLogs: {
              select: {
                rating: true,
                notes: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 12,
            },
          },
        },
        supplements: {
          select: {
            name: true,
            dosage: true,
            timing: true,
          },
        },
        medications: {
          select: {
            name: true,
            dosage: true,
            timing: true,
          },
        },
        exerciseLogs: {
          select: {
            type: true,
            duration: true,
            intensity: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 16,
        },
        foodLogs: {
          select: {
            name: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 16,
        },
      },
    }),
  ])

  if (!user) {
    return {
      userId,
      issues: [],
      healthGoals: {},
      supplements: [],
      medications: [],
      exerciseLogs: [],
      foodLogs: [],
      todaysFoods: [],
      bloodResults: null,
      profile: {},
      onboardingComplete: false,
    }
  }

  const healthGoals: Record<string, HealthGoalWithLogs> = {}
  const visibleGoals: HealthGoalWithLogs[] = []
  const todaysFoods: Array<{ name?: string; meal?: string; calories?: number }> = []
  let bloodResults: BloodResultsData | null = null

  for (const goal of user.healthGoals) {
    if (goal.name.startsWith('__')) {
      if (goal.name === '__BLOOD_RESULTS_DATA__') {
        try {
          const parsed = JSON.parse(goal.category ?? '{}')
          bloodResults = {
            uploadMethod: parsed.uploadMethod || 'documents',
            documents: Array.isArray(parsed.documents) ? parsed.documents : [],
            images: Array.isArray(parsed.images) ? parsed.images : [],
            notes: parsed.notes || '',
            skipped: !!parsed.skipped,
            markers: Array.isArray(parsed.markers) ? parsed.markers : undefined,
          }
        } catch {
          bloodResults = bloodResults || null
        }
      }
      if (goal.name === '__TODAYS_FOODS_DATA__') {
        try {
          const parsed = JSON.parse(goal.category ?? '{}')
          if (Array.isArray(parsed.foods)) {
            todaysFoods.push(...parsed.foods)
          }
        } catch {
          // ignore
        }
      }
      continue
    }

    const logsAsc = (goal.healthLogs || []).slice().reverse()
    healthGoals[goal.name.toLowerCase()] = {
      id: goal.id,
      name: goal.name,
      currentRating: goal.currentRating,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      healthLogs: logsAsc.map(log => ({
        rating: log.rating,
        notes: log.notes,
        createdAt: log.createdAt,
      })),
    }
    visibleGoals.push(healthGoals[goal.name.toLowerCase()])
  }

  let issues = issuesRows.map((row) => {
    const normalisedPolarity: 'positive' | 'negative' =
      row.polarity === 'positive' || row.polarity === 'negative'
        ? (row.polarity as 'positive' | 'negative')
        : inferPolarityFromName(row.name)
    return {
      id: row.id,
      name: row.name,
      slug: slugify(row.name),
      polarity: normalisedPolarity,
    }
  })

  if (issues.length === 0) {
    issues = visibleGoals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      slug: slugify(goal.name),
      polarity: inferPolarityFromName(goal.name),
    }))
  }

  const onboardingComplete = visibleGoals.length > 0

  return {
    userId,
    issues,
    healthGoals,
    supplements: user.supplements.map((supp) => ({
      name: supp.name,
      dosage: supp.dosage,
      timing: supp.timing ?? [],
    })),
    medications: user.medications.map((med) => ({
      name: med.name,
      dosage: med.dosage,
      timing: med.timing ?? [],
    })),
    exerciseLogs: user.exerciseLogs.map((log) => ({
      type: log.type,
      duration: log.duration,
      intensity: log.intensity,
      createdAt: log.createdAt,
    })),
    foodLogs: user.foodLogs.map((log) => ({
      name: log.name,
      description: log.description,
      createdAt: log.createdAt,
    })),
    todaysFoods,
    bloodResults,
    profile: {
      gender: user.gender ?? null,
      weight: user.weight ?? null,
      height: user.height ?? null,
      bodyType: user.bodyType ?? null,
      exerciseFrequency: user.exerciseFrequency ?? null,
    },
    onboardingComplete,
  }
})

async function buildUserInsightContext(userId: string): Promise<UserInsightContext> {
  return loadUserInsightContext(userId)
}

// Encodes an optional date range to a simple cache key
function encodeRange(range?: { from?: string; to?: string }) {
  if (!range) return ''
  const from = range.from ? new Date(range.from).toISOString().slice(0, 10) : ''
  const to = range.to ? new Date(range.to).toISOString().slice(0, 10) : ''
  if (!from && !to) return ''
  return `${from}..${to}`
}

// Builds a section with an already loaded context and attaches mode/range
async function buildIssueSectionWithContext(
  context: UserInsightContext,
  slug: string,
  section: IssueSectionKey,
  options: { mode: ReportMode; range?: { from?: string; to?: string } }
): Promise<IssueSectionResult | null> {
  const issueRecord = context.issues.find(issue => issue.slug === slug)
  if (!issueRecord) return null
  const summary = enrichIssueSummary(issueRecord, context)

  let base: BaseSectionResult | null = null
  switch (section) {
    case 'overview':
      base = buildOverviewSection(summary, context)
      break
    case 'exercise':
      base = buildExerciseSection(summary, context)
      break
    case 'supplements':
      base = buildSupplementsSection(summary, context)
      break
    case 'interactions':
      base = buildInteractionsSection(summary, context)
      break
    case 'labs':
      base = buildLabsSection(summary, context)
      break
    case 'nutrition':
      base = buildNutritionSection(summary, context)
      break
    case 'lifestyle':
      base = buildLifestyleSection(summary, context)
      break
    default:
      base = null
  }
  if (!base) return null
  return { ...base, mode: options.mode, range: options.range }
}

// Placeholder that can be upgraded to add caching based on (mode, rangeKey)
async function computeIssueSection(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  mode: ReportMode,
  _rangeKey: string
): Promise<IssueSectionResult | null> {
  const context = await loadUserInsightContext(userId)
  return buildIssueSectionWithContext(context, slug, section, { mode, range: undefined })
}

function enrichIssueSummary(issue: { id: string; name: string; polarity: 'positive' | 'negative'; slug: string }, context: UserInsightContext): IssueSummary {
  const goal = context.healthGoals[issue.name.toLowerCase()]
  const normalised = normaliseRating(goal?.currentRating ?? null, issue.polarity)
  const { trend, delta } = calculateTrend(goal?.healthLogs ?? [], issue.polarity)
  const lastLog = goal?.healthLogs?.slice(-1)[0]
  const highlight = buildIssueHighlight(issue, normalised.label, trend)
  const blockers = buildIssueBlockers(issue, context)

  return {
    id: issue.id,
    slug: issue.slug,
    name: issue.name,
    polarity: issue.polarity,
    severityLabel: normalised.label,
    severityScore: normalised.score,
    currentRating: goal?.currentRating ?? null,
    ratingScaleMax: RATING_SCALE_DEFAULT,
    trend,
    trendDelta: delta,
    lastUpdated: lastLog ? lastLog.createdAt.toISOString() : goal?.updatedAt?.toISOString() ?? null,
    highlight,
    blockers,
  }
}

function buildIssueHighlight(issue: { name: string; polarity: 'positive' | 'negative' }, severity: string, trend: IssueSummary['trend']) {
  const trendText =
    trend === 'improving' ? 'Improvements logged recently' : trend === 'declining' ? 'Recent data shows regression' : trend === 'stable' ? 'Holding steady' : 'Needs more data'
  if (issue.polarity === 'negative') {
    return `${severity} concern • ${trendText}`
  }
  return `${severity} goal • ${trendText}`
}

function buildIssueBlockers(issue: { name: string; polarity: 'positive' | 'negative' }, context: UserInsightContext) {
  const blockers: string[] = []
  const key = pickKnowledgeKey(issue.name.toLowerCase())
  if (key === 'libido') {
    if (!hasMatch(context.supplements.map(s => s.name), /zinc|ashwagandha|tongkat|tribulus|magnesium/i)) {
      blockers.push('No libido-supportive supplements logged')
    }
    if (!context.exerciseLogs.some(log => /strength|resistance|weights/i.test(log.type))) {
      blockers.push('Strength training frequency not captured')
    }
    if (!context.bloodResults?.markers?.some(marker => /testosterone/i.test(marker.name || ''))) {
      blockers.push('Latest testosterone labs missing')
    }
  }
  if (!context.foodLogs.length && !context.todaysFoods.length) {
    blockers.push('No recent food logs to analyse')
  }
  return blockers.slice(0, 3)
}

function buildOverviewSummary(issue: IssueSummary) {
  const ratingText = issue.currentRating !== null ? `${issue.currentRating}/${issue.ratingScaleMax ?? RATING_SCALE_DEFAULT}` : 'No rating recorded yet'
  if (issue.polarity === 'negative') {
    return `${issue.name}: ${issue.severityLabel}. Current rating ${ratingText}.`
  }
  return `${issue.name}: ${issue.severityLabel}. Current progress ${ratingText}.`
}

function buildOverviewHighlights(issue: IssueSummary, context: UserInsightContext): SectionHighlight[] {
  const highlights: SectionHighlight[] = []
  highlights.push({
    title: issue.highlight,
    detail: issue.blockers.length ? `Focus: ${issue.blockers[0]}.` : 'Continue tracking key signals each week.',
    tone: issue.trend === 'declining' ? 'warning' : 'neutral',
  })
  if (issue.blockers.length > 1) {
    highlights.push({
      title: 'Additional blockers',
      detail: issue.blockers.slice(1).join('; '),
      tone: 'warning',
    })
  }
  if (context.supplements.length) {
    highlights.push({
      title: 'Supplements logged',
      detail: context.supplements.map(supp => supp.name).join(', '),
      tone: 'neutral',
    })
  }
  return highlights
}

function buildOverviewDataPoints(issue: IssueSummary, context: UserInsightContext): SectionDatum[] {
  const data: SectionDatum[] = []
  if (issue.currentRating !== null) {
    data.push({
      label: 'Current rating',
      value: `${issue.currentRating}/${issue.ratingScaleMax ?? RATING_SCALE_DEFAULT}`,
      context: issue.trendDelta !== null ? `Recent shift ${issue.trendDelta.toFixed(1)}` : undefined,
    })
  }
  if (context.exerciseLogs.length) {
    const lastExercise = context.exerciseLogs[0]
    data.push({
      label: 'Last exercise',
      value: `${lastExercise.type} • ${lastExercise.duration} min`,
      context: relativeDays(lastExercise.createdAt),
    })
  }
  if (context.foodLogs.length) {
    const lastMeal = context.foodLogs[0]
    data.push({
      label: 'Last food log',
      value: lastMeal.name,
      context: relativeDays(lastMeal.createdAt),
    })
  }
  return data
}

function relativeDays(date: Date) {
  const diff = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return 'Today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

function buildOverviewRecommendations(issue: IssueSummary, context: UserInsightContext): SectionRecommendation[] {
  const recs: SectionRecommendation[] = []
  if (issue.blockers.includes('No libido-supportive supplements logged')) {
    recs.push({
      title: 'Introduce libido-supportive nutraceuticals',
      description: 'Add evidence-backed supplements to support hormone balance.',
      actions: ['Discuss ashwagandha 600mg/day or Tongkat Ali with clinician', 'Pair zinc (15–30mg) with evening meal if labs show low levels'],
      priority: 'soon',
    })
  }
  if (!context.bloodResults?.documents?.length) {
    recs.push({
      title: 'Upload recent labs',
      description: 'Provide testosterone, thyroid, and metabolic labs to personalise insights.',
      actions: ['Upload PDF or photo of recent bloodwork', 'Flag markers to monitor (testosterone, SHBG, fasting glucose)'],
      priority: 'soon',
    })
  }
  if (!context.exerciseLogs.some(log => /strength|resistance|weights/i.test(log.type))) {
    recs.push({
      title: 'Schedule structured resistance training',
      description: 'Strength work 3x/week underpins libido, insulin sensitivity, and confidence.',
      actions: ['Book two 45-min resistance sessions', 'Track perceived exertion to ensure progressive overload'],
      priority: 'now',
    })
  }
  if (!recs.length) {
    recs.push({
      title: 'Keep logging data weekly',
      description: 'Consistent tracking sharpens AI insights and trend detection.',
      actions: ['Log symptoms twice per week', 'Capture meals or supplements changes'],
      priority: 'monitor',
    })
  }
  return recs
}

function buildOverviewSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  return {
    issue,
    section: 'overview',
    generatedAt: now,
    confidence: 0.72,
    summary: buildOverviewSummary(issue),
    highlights: buildOverviewHighlights(issue, context),
    dataPoints: buildOverviewDataPoints(issue, context),
    recommendations: buildOverviewRecommendations(issue, context),
  }
}

function summariseExerciseFrequency(exerciseLogs: UserInsightContext['exerciseLogs']) {
  if (!exerciseLogs.length) return { sessionsPerWeek: 0, summary: 'No exercise logs captured yet.' }
  const now = Date.now()
  const weeks = new Map<number, number>()
  for (const log of exerciseLogs) {
    const diffWeeks = Math.floor((now - log.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 7))
    const weekKey = diffWeeks
    weeks.set(weekKey, (weeks.get(weekKey) ?? 0) + 1)
  }
  const weeksArray = Array.from(weeks.values())
  const considered = weeksArray.slice(0, 4)
  const avg = considered.length ? considered.reduce((sum, count) => sum + count, 0) / considered.length : exerciseLogs.length
  const summary = avg >= 3 ? 'Consistent training frequency' : avg >= 1.5 ? 'Some activity logged' : 'Training cadence is light'
  return { sessionsPerWeek: Math.round(avg * 10) / 10, summary }
}

function buildExerciseSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const knowledgeKey = pickKnowledgeKey(issue.name.toLowerCase())
  const supportive = knowledgeKey ? ISSUE_KNOWLEDGE_BASE[knowledgeKey].supportiveExercises ?? [] : []
  const frequency = summariseExerciseFrequency(context.exerciseLogs)
  const relevantLogs = context.exerciseLogs.filter((log) => /strength|resistance|weights|cardio|hiit|yoga|pilates/i.test(log.type))
  const highlights: SectionHighlight[] = []
  if (relevantLogs.length) {
    highlights.push({
      title: `Last session • ${relativeDays(relevantLogs[0].createdAt)}`,
      detail: `${relevantLogs[0].type} ${relevantLogs[0].duration} min` + (relevantLogs[0].intensity ? ` • ${relevantLogs[0].intensity}` : ''),
      tone: 'positive',
    })
  } else {
    highlights.push({
      title: 'No structured sessions logged yet',
      detail: 'Add workouts to see recovery and symptom response trends.',
      tone: 'neutral',
    })
  }
  highlights.push({
    title: 'Weekly cadence',
    detail: `${frequency.sessionsPerWeek} sessions/week (avg last 4 weeks)`,
    tone: frequency.sessionsPerWeek >= 3 ? 'positive' : frequency.sessionsPerWeek >= 1.5 ? 'neutral' : 'warning',
  })

  const recommendations: SectionRecommendation[] = []
  if (supportive.length) {
    recommendations.push({
      title: 'Anchor issue-specific training',
      description: supportive.map(item => `${item.title}: ${item.detail}`).join(' '),
      actions: ['Plan sessions for next 7 days in calendar', 'Log RPE (1–10) after each workout to track recovery'],
      priority: frequency.sessionsPerWeek >= 2 ? 'soon' : 'now',
    })
  }
  if (frequency.sessionsPerWeek < 2) {
    recommendations.push({
      title: 'Increase consistency',
      description: 'Aim for 3 structured sessions weekly to yield noticeable changes.',
      actions: ['Block 45-minute sessions on Monday, Wednesday, Friday', 'Pair resistance training with mobility finisher'],
      priority: 'now',
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Maintain progress',
      description: 'Keep current training schedule; ensure deload every 6–8 weeks.',
      actions: ['Review loading patterns monthly', 'Add HRV or readiness tracking if available'],
      priority: 'monitor',
    })
  }

  return {
    issue,
    section: 'exercise',
    generatedAt: now,
    confidence: 0.68,
    summary: frequency.summary,
    highlights,
    dataPoints: context.exerciseLogs.slice(0, 5).map((log) => ({
      label: log.type,
      value: `${log.duration} min`,
      context: relativeDays(log.createdAt),
    })),
    recommendations,
  }
}

function buildSupplementsSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const supplements = context.supplements
  const key = pickKnowledgeKey(issue.name.toLowerCase())
  const helpfulPatterns = key ? ISSUE_KNOWLEDGE_BASE[key].helpfulSupplements ?? [] : []
  const helpful: SectionHighlight[] = []
  const neutral: SectionHighlight[] = []

  if (!supplements.length) {
    neutral.push({
      title: 'No supplements logged',
      detail: 'Add current regimen to evaluate effectiveness and gaps.',
      tone: 'warning',
    })
  }

  supplements.forEach((supp) => {
    const match = helpfulPatterns.find(pattern => pattern.pattern.test(supp.name))
    if (match) {
      helpful.push({
        title: supp.name,
        detail: match.why,
        tone: 'positive',
      })
    } else {
      neutral.push({
        title: supp.name,
        detail: supp.dosage ? `Dose: ${supp.dosage}` : 'Logged without dosage details',
        tone: 'neutral',
      })
    }
  })

  const recommendations: SectionRecommendation[] = []
  if (key && ISSUE_KNOWLEDGE_BASE[key].gapSupplements) {
    ISSUE_KNOWLEDGE_BASE[key].gapSupplements!.forEach((gap) => {
      const alreadyCovered = supplements.some(supp => gap.suggested && new RegExp(gap.suggested.split(' ')[0], 'i').test(supp.name))
      if (!alreadyCovered) {
        recommendations.push({
          title: gap.title,
          description: gap.why,
          actions: gap.suggested ? [`Discuss ${gap.suggested} with clinician`, 'Log response after 4–6 weeks'] : ['Review options with clinician'],
          priority: 'soon',
        })
      }
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Review dosing and timing',
      description: 'Confirm current regimen matches clinical guidance and is spaced from medications.',
      actions: ['Double-check dosing with practitioner', 'Log perceived effect weekly'],
      priority: 'monitor',
    })
  }

  return {
    issue,
    section: 'supplements',
    generatedAt: now,
    confidence: 0.7,
    summary: supplements.length ? `Tracking ${supplements.length} supplements.` : 'No supplements logged yet.',
    highlights: [...helpful, ...neutral].slice(0, 6),
    dataPoints: supplements.map((supp) => ({
      label: supp.name,
      value: supp.dosage || 'Dose not set',
      context: supp.timing?.length ? supp.timing.join(', ') : 'Timing not logged',
    })),
    recommendations,
  }
}

function buildInteractionsSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const supplementNames = context.supplements.map((supp) => supp.name)
  const medicationNames = context.medications.map((med) => med.name)
  const flags = INTERACTION_RULES.filter(rule => rule.condition({ supplements: supplementNames, medications: medicationNames }))
  const highlights: SectionHighlight[] = []

  if (flags.length) {
    flags.forEach(flag => {
      highlights.push({
        title: flag.message,
        detail: flag.rationale,
        tone: 'warning',
      })
    })
  } else if (!supplementNames.length && !medicationNames.length) {
    highlights.push({
      title: 'No data to cross-check yet',
      detail: 'Add supplements and medications to evaluate interactions.',
      tone: 'neutral',
    })
  } else {
    highlights.push({
      title: 'No conflicts detected',
      detail: 'Current regimen shows no common spacing or interaction flags.',
      tone: 'positive',
    })
  }

  const recommendations: SectionRecommendation[] = []
  if (flags.length) {
    flags.forEach(flag => {
      recommendations.push({
        title: flag.message,
        description: flag.rationale,
        actions: ['Confirm timing with clinician', 'Update supplement log after any change'],
        priority: flag.priority,
      })
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Keep regimen audit-ready',
      description: 'Ensure medications and supplements remain up-to-date for safe AI insights.',
      actions: ['Review list monthly', 'Log any new prescriptions within 24h'],
      priority: 'monitor',
    })
  }

  const dataPoints: SectionDatum[] = []
  if (supplementNames.length) {
    dataPoints.push({ label: 'Supplements logged', value: supplementNames.join(', ') })
  }
  if (medicationNames.length) {
    dataPoints.push({ label: 'Medications logged', value: medicationNames.join(', ') })
  }

  return {
    issue,
    section: 'interactions',
    generatedAt: now,
    confidence: 0.65,
    summary: flags.length ? `${flags.length} interaction flag${flags.length > 1 ? 's' : ''} found.` : 'No common conflicts detected.',
    highlights,
    dataPoints,
    recommendations,
  }
}

function buildLabsSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const key = pickKnowledgeKey(issue.name.toLowerCase())
  const labs = key ? ISSUE_KNOWLEDGE_BASE[key].keyLabs ?? [] : []
  const blood = context.bloodResults
  const highlights: SectionHighlight[] = []

  if (blood?.documents?.length) {
    highlights.push({
      title: `${blood.documents.length} lab file${blood.documents.length > 1 ? 's' : ''} uploaded`,
      detail: blood.notes ? `Notes: ${blood.notes}` : 'Add notes to highlight markers of concern.',
      tone: 'positive',
    })
  } else if (blood?.skipped) {
    highlights.push({
      title: 'Labs skipped in intake',
      detail: 'Upload results anytime to unlock personalised ranges.',
      tone: 'neutral',
    })
  } else {
    highlights.push({
      title: 'No lab data yet',
      detail: 'Add bloodwork PDFs or enter key markers to tailor insights.',
      tone: 'warning',
    })
  }

  const dataPoints: SectionDatum[] = []
  if (blood?.markers?.length) {
    blood.markers.forEach(marker => {
      dataPoints.push({
        label: marker.name,
        value: marker.value !== undefined ? `${marker.value}${marker.unit ? ` ${marker.unit}` : ''}` : 'Value not supplied',
        context: marker.reference || 'Reference range not provided',
      })
    })
  }

  const recommendations: SectionRecommendation[] = []
  if (labs.length) {
    recommendations.push({
      title: 'Key labs to monitor',
      description: 'Prioritise markers that influence this issue most directly.',
      actions: labs.map(item => `${item.marker}: ${item.optimal} (${item.cadence})`),
      priority: blood?.documents?.length ? 'soon' : 'now',
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Coordinate lab work',
      description: 'Work with your clinician to identify relevant blood markers.',
      actions: ['Upload most recent panel', 'Flag markers where you want tighter ranges'],
      priority: 'soon',
    })
  }

  return {
    issue,
    section: 'labs',
    generatedAt: now,
    confidence: 0.6,
    summary: blood?.documents?.length ? 'Bloodwork on file – review markers below.' : 'No bloodwork uploaded yet.',
    highlights,
    dataPoints,
    recommendations,
  }
}

function buildNutritionSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const foods: Array<{ name?: string; meal?: string; calories?: number }> = context.todaysFoods.length
    ? context.todaysFoods
    : context.foodLogs.slice(0, 5).map((log) => ({
        name: log.name,
        meal: log.description ?? undefined,
        calories: undefined,
      }))
  const key = pickKnowledgeKey(issue.name.toLowerCase())
  const focus = key ? ISSUE_KNOWLEDGE_BASE[key].nutritionFocus ?? [] : []
  const highlights: SectionHighlight[] = []

  if (foods.length) {
    const mealsPreview = foods.slice(0, 3).map(item => item.name || item.meal || 'Meal').join(', ')
    highlights.push({
      title: 'Recent meals logged',
      detail: mealsPreview,
      tone: 'neutral',
    })
  } else {
    highlights.push({
      title: 'No meals logged',
      detail: 'Capture meals or upload food photos to unlock macronutrient guidance.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = []
  if (focus.length) {
    recommendations.push({
      title: 'Nutrition moves for this issue',
      description: focus.map(item => `${item.title}: ${item.detail}`).join(' '),
      actions: ['Plan upcoming meals around these anchors', 'Log response (energy, symptoms) after 2 weeks'],
      priority: foods.length ? 'soon' : 'now',
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Build consistent logging',
      description: 'At least two meal logs per day sharpen AI calories and micronutrient hints.',
      actions: ['Log breakfast and dinner every day for a week', 'Tag meals impacting symptoms'],
      priority: 'now',
    })
  }

  return {
    issue,
    section: 'nutrition',
    generatedAt: now,
    confidence: 0.63,
    summary: foods.length ? 'Analysing recent meals – see focus areas below.' : 'Need more food data to personalise guidance.',
    highlights,
    dataPoints: foods.map((item, idx) => ({
      label: item.meal ? `${item.meal}` : `Meal ${idx + 1}`,
      value: item.name ?? 'Food logged',
      context: item.calories ? `${item.calories} kcal` : undefined,
    })),
    recommendations,
  }
}

function buildLifestyleSection(issue: IssueSummary, context: UserInsightContext): BaseSectionResult {
  const now = new Date().toISOString()
  const key = pickKnowledgeKey(issue.name.toLowerCase())
  const focus = key ? ISSUE_KNOWLEDGE_BASE[key].lifestyleFocus ?? [] : []
  const highlights: SectionHighlight[] = []

  if (context.profile.exerciseFrequency) {
    highlights.push({
      title: 'Reported activity frequency',
      detail: context.profile.exerciseFrequency,
      tone: 'neutral',
    })
  }
  if (context.profile.bodyType) {
    highlights.push({
      title: 'Body type & considerations',
      detail: context.profile.bodyType,
      tone: 'neutral',
    })
  }
  if (!highlights.length) {
    highlights.push({
      title: 'Lifestyle data incomplete',
      detail: 'Add sleep, stress, and daily routine info to refine insights.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = []
  if (focus.length) {
    recommendations.push({
      title: 'Daily routines to reinforce progress',
      description: focus.map(item => `${item.title}: ${item.detail}`).join(' '),
      actions: ['Schedule habits in calendar', 'Track adherence for 14 days'],
      priority: 'soon',
    })
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Capture lifestyle metrics',
      description: 'Log sleep duration, stress ratings, and mood to unlock correlations.',
      actions: ['Add daily sleep entry in Health Tracking', 'Log stress (0–6) alongside symptoms'],
      priority: 'now',
    })
  }

  return {
    issue,
    section: 'lifestyle',
    generatedAt: now,
    confidence: 0.58,
    summary: 'Lifestyle routines shape recovery – tighten the inputs above.',
    highlights,
    dataPoints: [],
    recommendations,
  }
}
