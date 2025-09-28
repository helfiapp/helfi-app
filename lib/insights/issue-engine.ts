import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { generateSectionInsightsFromLLM } from './llm'

export type IssueSectionKey =
  | 'overview'
  | 'exercise'
  | 'supplements'
  | 'medications'
  | 'interactions'
  | 'labs'
  | 'nutrition'
  | 'lifestyle'

export const ISSUE_SECTION_ORDER: IssueSectionKey[] = [
  'overview',
  'exercise',
  'supplements',
  'medications',
  'interactions',
  'labs',
  'nutrition',
  'lifestyle',
]

export type DataNeedStatus = 'missing' | 'in-progress' | 'complete'

export interface InsightDataNeed {
  key: string
  title: string
  description: string
  actionLabel: string
  href: string
  status: DataNeedStatus
}

export type IssueStatus = 'needs-data' | 'focus' | 'monitor' | 'on-track'

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
  status: IssueStatus
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
  extras?: Record<string, unknown>
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
  dataNeeds: InsightDataNeed[]
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
  avoidSupplements?: Array<{ pattern: RegExp; why: string }>
  helpfulMedications?: Array<{ pattern: RegExp; why: string }>
  gapMedications?: Array<{ title: string; why: string; suggested?: string }>
  avoidMedications?: Array<{ pattern: RegExp; why: string }>
  supportiveExercises?: Array<{ title: string; detail: string; keywords?: string[] }>
  avoidExercises?: Array<{ title: string; detail: string }>
  nutritionFocus?: Array<{ title: string; detail: string; keywords?: string[] }>
  avoidFoods?: Array<{ title: string; detail: string; keywords?: string[] }>
  lifestyleFocus?: Array<{ title: string; detail: string }>
  keyLabs?: Array<{ marker: string; optimal: string; cadence: string; note?: string }>
}> = {
  libido: {
    aliases: ['low libido', 'sexual health', 'erectile function', 'erection quality'],
    helpfulSupplements: [
      { pattern: /ashwagandha/i, why: 'may improve sexual performance and stress resilience' },
      { pattern: /tongkat|longjack/i, why: 'can support testosterone and libido metrics' },
      { pattern: /tribulus/i, why: 'traditionally used for libido and androgen support' },
      { pattern: /cistanche/i, why: 'Tonifies yang and may enhance libido and stamina' },
      { pattern: /muira|muira\s?puama|ptychopetalum/i, why: 'Often used for arousal and nitric oxide support' },
      { pattern: /zinc/i, why: 'supports hormonal balance when levels are low' },
      { pattern: /l[-\s]?arginine/i, why: 'can aid nitric oxide availability for circulation' },
    ],
    gapSupplements: [
      { title: 'Consider adaptogens for stress-linked libido dips', why: 'Chronic stress suppresses libido; ashwagandha or rhodiola can moderate cortisol', suggested: 'Ashwagandha 600mg/day (divided)' },
      { title: 'Evaluate zinc status', why: 'Low zinc impairs testosterone conversion and sexual health', suggested: 'Zinc bisglycinate 15–30mg with food' },
    ],
    avoidSupplements: [
      { pattern: /yohim(b|)ine/i, why: 'Can spike blood pressure and anxiety, use only with practitioner oversight.' },
      { pattern: /pseudoephedrine|decongestant/i, why: 'These constrict blood vessels and can undermine erectile blood flow.' },
    ],
    helpfulMedications: [
      {
        pattern: /tadalafil|cialis|sildenafil|viagra|avanafil|stendra|vardenafil|levitra/i,
        why: 'PDE5 inhibitors directly improve erection quality by enhancing blood flow.',
      },
    ],
    gapMedications: [
      { title: 'Discuss PDE5 support', why: 'Low erections or arousal could benefit from as-needed PDE5 inhibitors.', suggested: 'Tadalafil 5mg once daily' },
    ],
    avoidMedications: [
      { pattern: /ssri|snri/i, why: 'Some antidepressants can blunt libido—review dosing with your clinician.' },
    ],
    supportiveExercises: [
      {
        title: 'Progressive resistance training 3x/week',
        detail: 'Supports testosterone, strength, and confidence metrics',
        keywords: ['strength', 'resistance', 'weights'],
      },
      {
        title: 'Short HIIT blocks',
        detail: 'Improves endothelial function and nitric oxide availability',
        keywords: ['hiit', 'interval', 'sprint'],
      },
    ],
    avoidExercises: [
      {
        title: 'Excessive long slow cardio when energy is low',
        detail: 'Very long endurance blocks can suppress testosterone—cap steady sessions at 45 minutes until resilience improves.',
      },
    ],
    nutritionFocus: [
      {
        title: 'Prioritise omega-3 rich meals',
        detail: 'Cardiovascular health underpins libido; aim for 2 oily fish servings/week',
        keywords: ['salmon', 'sardine', 'mackerel', 'omega'],
      },
      {
        title: 'Stabilise blood sugar',
        detail: 'Balanced carbs + protein prevent insulin spikes that can blunt hormone signalling',
        keywords: ['balanced', 'protein', 'fiber', 'low glycemic'],
      },
    ],
    avoidFoods: [
      {
        title: 'Ultra-processed sugary foods',
        detail: 'Rapid glucose swings can disrupt hormones linked to libido.',
        keywords: ['soda', 'dessert', 'candy', 'pastry', 'cake'],
      },
      {
        title: 'Trans-fat laden takeaways',
        detail: 'Industrial oils impair vascular tone; swap for home-cooked meals with olive oil.',
        keywords: ['fried', 'fast food', 'takeaway'],
      },
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
    avoidSupplements: [
      { pattern: /mega\s?dose\s?caffeine|excessive\s?caffeine/i, why: 'Very high stimulant loads can worsen crashes and sleep, keeping fatigue high.' },
    ],
    helpfulMedications: [
      { pattern: /thyroid|levothyroxine/i, why: 'Optimised thyroid replacement can lift energy when labs are low.' },
    ],
    gapMedications: [
      { title: 'Review iron status', why: 'Low ferritin sometimes calls for iron therapy—confirm labs first.', suggested: 'Consider iron bisglycinate (practitioner guided)' },
    ],
    avoidMedications: [
      { pattern: /sedative|benzodiazepine/i, why: 'Sedatives can worsen daytime fatigue—check in with your prescriber.' },
    ],
    supportiveExercises: [
      {
        title: 'Zone 2 cardio 2–3x/week',
        detail: 'Builds mitochondrial density without draining reserves',
        keywords: ['zone 2', 'steady', 'endurance', 'cardio'],
      },
      {
        title: 'Mobility days',
        detail: 'Maintains circulation and reduces stiffness-related fatigue',
        keywords: ['mobility', 'stretch', 'yoga', 'pilates'],
      },
    ],
    avoidExercises: [
      {
        title: 'Stacking intense HIIT on consecutive days',
        detail: 'Back-to-back redline sessions can deepen fatigue; insert recovery between high-intensity blocks.',
      },
    ],
    nutritionFocus: [
      {
        title: 'Anchor each meal with 25g protein',
        detail: 'Prevents post-prandial crashes and supports recovery',
        keywords: ['protein', 'eggs', 'chicken', 'beans', 'tofu'],
      },
      {
        title: 'Strategic caffeine window',
        detail: 'Keep caffeine before 2pm to protect sleep architecture',
        keywords: ['coffee', 'matcha', 'caffeine'],
      },
    ],
    avoidFoods: [
      {
        title: 'Late afternoon caffeine hits',
        detail: 'Stimulants after 2pm can blunt sleep quality and daytime energy.',
        keywords: ['energy drink', 'late coffee', 'espresso', 'caffeine'],
      },
      {
        title: 'High-sugar breakfast pastries',
        detail: 'Spike-and-crash breakfasts keep fatigue high—pair carbs with protein and fiber.',
        keywords: ['donut', 'croissant', 'muffin', 'pastry'],
      },
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

function unslugify(value: string) {
  const words = value.replace(/[-_]+/g, ' ').trim()
  if (!words) return 'Issue'
  return words
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function hasStructuredData(value: unknown) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return !!value
}

function buildDataNeed(goalName: string, category: string | null | undefined): InsightDataNeed | null {
  let parsed: any = null
  if (category) {
    try {
      parsed = JSON.parse(category)
    } catch {
      parsed = null
    }
  }

  switch (goalName) {
    case '__TODAYS_FOODS_DATA__': {
      const foods = Array.isArray(parsed?.foods) ? parsed.foods : []
      return {
        key: 'todays-foods',
        title: "Log today's meals",
        description: foods.length ? 'Meals saved for today — keep logging to stay on track.' : 'Log what you ate today to unlock nutrition insights.',
        actionLabel: foods.length ? 'Review food log' : 'Log food',
        href: '/food',
        status: foods.length ? 'in-progress' : 'missing',
      }
    }
    case '__BLOOD_RESULTS_DATA__': {
      const documents = Array.isArray(parsed?.documents) ? parsed.documents : []
      const images = Array.isArray(parsed?.images) ? parsed.images : []
      const markers = Array.isArray(parsed?.markers) ? parsed.markers : []
      const skipped = Boolean(parsed?.skipped)
      const hasData = documents.length > 0 || images.length > 0 || markers.length > 0
      return {
        key: 'blood-results',
        title: 'Upload recent labs',
        description: hasData
          ? 'Lab files saved. Add markers or new results when ready.'
          : skipped
          ? 'You can skip for now, but labs unlock deeper tracking.'
          : 'Add your latest bloodwork to personalise lab insights.',
        actionLabel: hasData ? 'Update labs' : 'Add labs',
        href: '/insights/issues/labs',
        status: hasData ? 'in-progress' : skipped ? 'in-progress' : 'missing',
      }
    }
    case '__HEALTH_SITUATIONS_DATA__': {
      const situations = Array.isArray(parsed) ? parsed : parsed?.situations
      const hasData = hasStructuredData(situations)
      return {
        key: 'health-situations',
        title: 'Log current health situations',
        description: hasData
          ? 'Situations recorded. Update if something changes.'
          : 'Tell us about recent diagnoses or treatments to tailor insights.',
        actionLabel: hasData ? 'Review details' : 'Add situations',
        href: '/onboarding?step=health-situations',
        status: hasData ? 'in-progress' : 'missing',
      }
    }
    case '__SUPPLEMENTS_BACKUP_DATA__': {
      const supplements = Array.isArray(parsed?.supplements) ? parsed.supplements : []
      const hasData = supplements.length > 0
      return {
        key: 'supplements-backup',
        title: 'Confirm supplement list',
        description: hasData
          ? 'Supplement backup saved. Keep it updated for quick restores.'
          : 'Save a master list of supplements so we can track changes easily.',
        actionLabel: hasData ? 'Update list' : 'Add supplements',
        href: '/insights/issues/supplements',
        status: hasData ? 'in-progress' : 'missing',
      }
    }
    case '__SUPPLEMENTS_EMERGENCY_BACKUP__': {
      const hasData = hasStructuredData(parsed)
      return {
        key: 'supplements-emergency',
        title: 'Set an emergency supplement plan',
        description: hasData
          ? 'Emergency protocol saved. Revisit to keep it current.'
          : 'Outline a go-to plan for missed doses or travel days.',
        actionLabel: hasData ? 'Review plan' : 'Create plan',
        href: '/insights/issues/supplements',
        status: hasData ? 'in-progress' : 'missing',
      }
    }
    case '__DEVICE_INTEREST__': {
      const selections = parsed && typeof parsed === 'object' ? Object.values(parsed).filter(Boolean) : []
      const hasData = selections.length > 0
      return {
        key: 'device-sync',
        title: 'Connect wearables',
        description: hasData
          ? 'Device preferences saved. Sync data when ready.'
          : 'Tell us which devices you use so we can pull in activity and sleep.',
        actionLabel: hasData ? 'Update devices' : 'Add device',
        href: '/settings?section=devices',
        status: hasData ? 'in-progress' : 'missing',
      }
    }
    case '__PROFILE_INFO_DATA__': {
      const hasData = hasStructuredData(parsed)
      return {
        key: 'profile-info',
        title: 'Complete your profile',
        description: hasData
          ? 'Profile saved. Update it if your basics change.'
          : 'Add basic details so recommendations can be personalised.',
        actionLabel: hasData ? 'Edit profile' : 'Add profile info',
        href: '/settings',
        status: hasData ? 'in-progress' : 'missing',
      }
    }
    default:
      return null
  }
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

function normaliseRating(
  rating: number | null | undefined,
  polarity: 'positive' | 'negative',
  hasLogs: boolean
) : { score: number | null; label: string; status: IssueStatus } {
  if (!hasLogs || rating === null || rating === undefined) {
    return { score: null, label: 'Needs data', status: 'needs-data' }
  }
  const scaleMax = RATING_SCALE_DEFAULT
  const bounded = Math.max(0, Math.min(scaleMax, rating))
  const percentage = (bounded / scaleMax) * 100
  if (polarity === 'negative') {
    if (percentage >= 70) return { score: percentage, label: 'High impact', status: 'focus' }
    if (percentage >= 40) return { score: percentage, label: 'Moderate impact', status: 'monitor' }
    if (percentage > 0) return { score: percentage, label: 'Mild impact', status: 'monitor' }
    return { score: percentage, label: 'On track', status: 'on-track' }
  }
  if (percentage >= 80) return { score: percentage, label: 'Excellent progress', status: 'on-track' }
  if (percentage >= 55) return { score: percentage, label: 'On track', status: 'monitor' }
  if (percentage >= 30) return { score: percentage, label: 'Needs support', status: 'focus' }
  return { score: percentage, label: 'Off track', status: 'focus' }
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
  // Use a lightweight context for landing to reduce DB work and latency.
  const context = await loadUserLandingContext(userId)
  const summaries = context.issues.map((issue) => enrichIssueSummary(issue, context))
  return {
    issues: summaries,
    generatedAt: new Date().toISOString(),
    onboardingComplete: context.onboardingComplete,
    dataNeeds: context.dataNeeds,
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
      dataNeeds: [],
      profile: {},
      onboardingComplete: false,
    }
  }

  const healthGoals: Record<string, HealthGoalWithLogs> = {}
  const visibleGoals: HealthGoalWithLogs[] = []
  const todaysFoods: Array<{ name?: string; meal?: string; calories?: number }> = []
  let bloodResults: BloodResultsData | null = null
  const dataNeeds: InsightDataNeed[] = []
  const seenNeeds = new Set<string>()

  for (const goal of user.healthGoals) {
    if (goal.name.startsWith('__')) {
      const dataNeed = buildDataNeed(goal.name, goal.category)
      if (dataNeed && !seenNeeds.has(dataNeed.key)) {
        seenNeeds.add(dataNeed.key)
        dataNeeds.push(dataNeed)
      }
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
    dataNeeds,
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

// Lighter loader for the Insights landing page: fetch only what we need to build summaries
// and skip heavy joins (supplements, medications, logs not required for landing).
const loadUserLandingContext = cache(async (userId: string): Promise<UserInsightContext> => {
  const [issuesRows, user] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ id: string; name: string; polarity: string }>>(
      'SELECT id, name, polarity FROM "CheckinIssues" WHERE "userId" = $1',
      userId
    ).catch(() => []),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        healthGoals: {
          select: {
            id: true,
            name: true,
            category: true,
            currentRating: true,
            createdAt: true,
            updatedAt: true,
            healthLogs: {
              select: { rating: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 12,
            },
          },
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
      dataNeeds: [],
      profile: {},
      onboardingComplete: false,
    }
  }

  const healthGoals: Record<string, HealthGoalWithLogs> = {}
  const visibleGoals: HealthGoalWithLogs[] = []
  const dataNeeds: InsightDataNeed[] = []
  const seenNeeds = new Set<string>()
  for (const goal of user.healthGoals) {
    if (goal.name.startsWith('__')) {
      const dataNeed = buildDataNeed(goal.name, goal.category)
      if (dataNeed && !seenNeeds.has(dataNeed.key)) {
        seenNeeds.add(dataNeed.key)
        dataNeeds.push(dataNeed)
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
      healthLogs: logsAsc.map(log => ({ rating: log.rating, notes: null, createdAt: log.createdAt })),
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
    supplements: [],
    medications: [],
    exerciseLogs: [],
    foodLogs: [],
    todaysFoods: [],
    bloodResults: null,
    dataNeeds,
    profile: {},
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
  const issueRecord = context.issues.find(issue => issue.slug === slug) || {
    id: `temp:${slug}`,
    name: unslugify(slug),
    slug,
    polarity: inferPolarityFromName(unslugify(slug)),
  }
  const summary = enrichIssueSummary(issueRecord, context)

  let base: BaseSectionResult | null = null
  switch (section) {
    case 'overview':
      base = await buildOverviewSection(summary, context)
      break
    case 'exercise':
      base = await buildExerciseSection(summary, context)
      break
    case 'supplements':
      base = await buildSupplementsSection(summary, context)
      break
    case 'medications':
      base = await buildMedicationsSection(summary, context)
      break
    case 'interactions':
      base = await buildInteractionsSection(summary, context)
      break
    case 'labs':
      base = await buildLabsSection(summary, context)
      break
    case 'nutrition':
      base = await buildNutritionSection(summary, context)
      break
    case 'lifestyle':
      base = await buildLifestyleSection(summary, context)
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
  const hasLogs = (goal?.healthLogs?.length ?? 0) > 0
  const normalised = normaliseRating(goal?.currentRating ?? null, issue.polarity, hasLogs)
  const { trend, delta } = calculateTrend(goal?.healthLogs ?? [], issue.polarity)
  const lastLog = goal?.healthLogs?.slice(-1)[0]
  const highlight = buildIssueHighlight(issue, normalised.label, trend, normalised.status)
  const blockers = buildIssueBlockers(issue, context, normalised.status)

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
    status: normalised.status,
  }
}

function buildIssueHighlight(
  issue: { name: string; polarity: 'positive' | 'negative' },
  severity: string,
  trend: IssueSummary['trend'],
  status: IssueStatus
) {
  const trendText =
    trend === 'improving' ? 'Improvements logged recently' : trend === 'declining' ? 'Recent data shows regression' : trend === 'stable' ? 'Holding steady' : 'Needs more data'
  if (status === 'needs-data') {
    return 'Log a fresh check-in to unlock personalised guidance.'
  }
  if (issue.polarity === 'negative') {
    return `${severity} • ${trendText}`
  }
  return `${severity} • ${trendText}`
}

function buildIssueBlockers(
  issue: { name: string; polarity: 'positive' | 'negative' },
  context: UserInsightContext,
  status: IssueStatus
) {
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
  if (status !== 'needs-data' && !context.foodLogs.length && !context.todaysFoods.length) {
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

async function buildOverviewSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
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

async function buildExerciseSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const normalizedLogs = context.exerciseLogs.map((log) => ({
    name: log.type,
    dosage: log.duration ? `${log.duration} min` : null,
    timing: [
      log.intensity ? `Intensity: ${log.intensity}` : null,
      `Logged ${relativeDays(log.createdAt)}`,
    ].filter(Boolean) as string[],
  }))

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedLogs,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      mode: 'exercise',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'exercise',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate exercise guidance right now. Please try again shortly.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return exercise insights. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: context.exerciseLogs.slice(0, 5).map((log) => ({
        label: log.type,
        value: `${log.duration} min`,
        context: relativeDays(log.createdAt),
      })),
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
      extras: {
        workingActivities: [],
        suggestedActivities: [],
        avoidActivities: [],
        totalLogged: context.exerciseLogs.length,
        source: 'llm-error',
      },
    }
  }

  const canonical = (value: string) => value.trim().toLowerCase()
  const logMap = new Map(normalizedLogs.map((log) => [canonical(log.name), log]))

  const workingActivities = llmResult.working.map((item) => {
    const match = logMap.get(canonical(item.name))
    return {
      title: item.name,
      reason: item.reason,
      summary: item.dosage ?? match?.dosage ?? '',
      lastLogged: item.timing ?? match?.timing?.[0] ?? '',
    }
  })

  const suggestedActivities = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  const avoidActivities = llmResult.avoid.map((item) => ({
    title: item.name,
    reason: item.reason,
  }))

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : 'AI-generated exercise guidance ready below.'

  const highlights: SectionHighlight[] = [
    {
      title: 'Training wins',
      detail: workingActivities.length
        ? workingActivities.map((activity) => `${activity.title}: ${activity.reason}`).join('; ')
        : 'No activities flagged as supportive yet.',
      tone: workingActivities.length ? 'positive' : 'neutral',
    },
    {
      title: 'Next training moves',
      detail: suggestedActivities.length
        ? suggestedActivities.map((activity) => `${activity.title}: ${activity.reason}`).join('; ')
        : 'Follow the suggestions below to expand your plan.',
      tone: suggestedActivities.length ? 'neutral' : 'positive',
    },
    {
      title: 'Activities to monitor',
      detail: avoidActivities.length
        ? avoidActivities.map((activity) => `${activity.title}: ${activity.reason}`).join('; ')
        : 'No avoid items flagged—review the cautions below for awareness.',
      tone: avoidActivities.length ? 'warning' : 'neutral',
    },
  ]

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or coach'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Plan next week of training',
          description: 'Schedule supportive sessions and monitor recovery.',
          actions: ['Block training slots', 'Log how your body responds'],
          priority: 'soon',
        },
      ]

  return {
    issue,
    section: 'exercise',
    generatedAt: now,
    confidence: 0.82,
    summary,
    highlights,
    dataPoints: context.exerciseLogs.slice(0, 5).map((log) => ({
      label: log.type,
      value: `${log.duration} min`,
      context: relativeDays(log.createdAt),
    })),
    recommendations,
    extras: {
      workingActivities,
      suggestedActivities,
      avoidActivities,
      totalLogged: context.exerciseLogs.length,
      source: 'llm',
    },
  }
}

async function buildSupplementsSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const supplements = context.supplements

  const normalizedSupplements = supplements.map((supp) => ({
    name: supp.name,
    dosage: supp.dosage ?? null,
    timing: Array.isArray(supp.timing) ? supp.timing : [],
  }))

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedSupplements,
      otherItems: context.medications.map((med) => ({ name: med.name, dosage: med.dosage ?? null })),
      mode: 'supplements',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'supplements',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate supplement guidance right now. Please try again shortly or check with support.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return supplement suggestions. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: normalizedSupplements.map((supp) => ({
        label: supp.name,
        value: supp.dosage || 'Dose not set',
        context: supp.timing?.length ? `Timing: ${supp.timing.join(', ')}` : 'Add timing details',
      })),
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
      extras: {
        supportiveDetails: [],
        suggestedAdditions: [],
        avoidList: [],
        missingDose: supplements.filter((supp) => !supp.dosage).map((supp) => supp.name),
        missingTiming: supplements.filter((supp) => !supp.timing || !supp.timing.length).map((supp) => supp.name),
        totalLogged: supplements.length,
        source: 'llm-error',
      } as Record<string, unknown>,
    }
  }

  const canonical = (value: string) => value.trim().toLowerCase()
  const supplementMap = new Map(
    normalizedSupplements.map((supp) => [canonical(supp.name), supp])
  )

  const parseTiming = (timing?: string | null, fallback?: string[]) => {
    if (timing && timing.trim().length) {
      return timing
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    }
    return fallback ?? []
  }

  const supportiveDetails = llmResult.working.map((item) => {
    const match = supplementMap.get(canonical(item.name))
    return {
      name: item.name,
      reason: item.reason,
      dosage: item.dosage ?? match?.dosage ?? null,
      timing: parseTiming(item.timing, match?.timing ?? []),
    }
  })

  const suggestedAdditions = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    suggestion: item.protocol ?? null,
    alreadyCovered: supplementMap.has(canonical(item.name)),
  }))

  const avoidList = llmResult.avoid.map((item) => {
    const match = supplementMap.get(canonical(item.name))
    return {
      name: item.name,
      reason: item.reason,
      dosage: match?.dosage ?? null,
      timing: match?.timing ?? [],
    }
  })

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : supportiveDetails.length
    ? `You have ${supportiveDetails.length} supplement${supportiveDetails.length === 1 ? '' : 's'} supporting ${issue.name}.`
    : 'AI-generated guidance ready below.'

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Review supplement plan with your clinician',
          description: 'Discuss current regimen and adjust based on response and labs.',
          actions: ['Bring this summary to your next consult', 'Track symptom response weekly'],
          priority: 'soon',
        },
      ]

  const highlights: SectionHighlight[] = [
    {
      title: "What's working",
      detail: supportiveDetails.length
        ? supportiveDetails.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : 'No supplements clearly supporting this issue yet.',
      tone: supportiveDetails.length ? 'positive' : 'neutral',
    },
    {
      title: 'Opportunities',
      detail: suggestedAdditions.length
        ? suggestedAdditions.map((item) => `${item.title}: ${item.reason}`).join('; ')
        : 'Leverage the AI suggestions below to discuss next steps.',
      tone: suggestedAdditions.length ? 'neutral' : 'positive',
    },
    {
      title: 'Cautions',
      detail: avoidList.length
        ? avoidList.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : 'No avoid items flagged—review suggestions below for future awareness.',
      tone: avoidList.length ? 'warning' : 'neutral',
    },
  ]

  return {
    issue,
    section: 'supplements',
    generatedAt: now,
    confidence: 0.82,
    summary,
    highlights,
    dataPoints: supplements.slice(0, 6).map((supp) => ({
      label: supp.name,
      value: supp.dosage || 'Dose not set',
      context: supp.timing?.length ? `Timing: ${supp.timing.join(', ')}` : 'Add timing details',
    })),
    recommendations,
    extras: {
      supportiveDetails,
      suggestedAdditions,
      avoidList,
      missingDose: supplements.filter((supp) => !supp.dosage).map((supp) => supp.name),
      missingTiming: supplements.filter((supp) => !supp.timing || !supp.timing.length).map((supp) => supp.name),
      totalLogged: supplements.length,
      source: 'llm',
    } as Record<string, unknown>,
  }
}

async function buildMedicationsSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const medications = context.medications

  const normalizedMeds = medications.map((med) => ({
    name: med.name,
    dosage: med.dosage ?? null,
    timing: Array.isArray(med.timing) ? med.timing : [],
  }))

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedMeds,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      mode: 'medications',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'medications',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate medication guidance right now. Please try again shortly.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return medication suggestions. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: normalizedMeds.map((med) => ({
        label: med.name,
        value: med.dosage || 'Dose not set',
        context: med.timing?.length ? `Timing: ${med.timing.join(', ')}` : 'Add timing details',
      })),
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
      extras: {
        supportiveDetails: [],
        suggestedAdditions: [],
        avoidList: [],
        missingDose: medications.filter((med) => !med.dosage).map((med) => med.name),
        missingTiming: medications.filter((med) => !med.timing || !med.timing.length).map((med) => med.name),
        totalLogged: medications.length,
        source: 'llm-error',
      } as Record<string, unknown>,
    }
  }

  const canonical = (value: string) => value.trim().toLowerCase()
  const medMap = new Map(normalizedMeds.map((med) => [canonical(med.name), med]))

  const parseTiming = (timing?: string | null, fallback?: string[]) => {
    if (timing && timing.trim().length) {
      return timing
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    }
    return fallback ?? []
  }

  const supportiveDetails = llmResult.working.map((item) => {
    const match = medMap.get(canonical(item.name))
    return {
      name: item.name,
      reason: item.reason,
      dosage: item.dosage ?? match?.dosage ?? null,
      timing: parseTiming(item.timing, match?.timing ?? []),
    }
  })

  const suggestedAdditions = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    suggestion: item.protocol ?? null,
    alreadyCovered: medMap.has(canonical(item.name)),
  }))

  const avoidList = llmResult.avoid.map((item) => {
    const match = medMap.get(canonical(item.name))
    return {
      name: item.name,
      reason: item.reason,
      dosage: match?.dosage ?? null,
      timing: match?.timing ?? [],
    }
  })

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : supportiveDetails.length
    ? `You have ${supportiveDetails.length} medication${supportiveDetails.length === 1 ? '' : 's'} aligned with ${issue.name}.`
    : 'AI-generated guidance ready below.'

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Coordinate changes with your clinician'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Review therapy plan',
          description: 'Align dosing and timing with symptom response and labs.',
          actions: ['Discuss adjustments with your clinician', 'Track response weekly'],
          priority: 'soon',
        },
      ]

  const highlights: SectionHighlight[] = [
    {
      title: "What's working",
      detail: supportiveDetails.length
        ? supportiveDetails.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : 'No medications clearly supporting this issue yet.',
      tone: supportiveDetails.length ? 'positive' : 'neutral',
    },
    {
      title: 'Opportunities',
      detail: suggestedAdditions.length
        ? suggestedAdditions.map((item) => `${item.title}: ${item.reason}`).join('; ')
        : 'Leverage the suggestions below for your next clinician discussion.',
      tone: suggestedAdditions.length ? 'neutral' : 'positive',
    },
    {
      title: 'Cautions',
      detail: avoidList.length
        ? avoidList.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : 'No avoid items flagged—review the AI cautions below for future awareness.',
      tone: avoidList.length ? 'warning' : 'neutral',
    },
  ]

  return {
    issue,
    section: 'medications',
    generatedAt: now,
    confidence: 0.82,
    summary,
    highlights,
    dataPoints: medications.slice(0, 6).map((med) => ({
      label: med.name,
      value: med.dosage || 'Dose not set',
      context: med.timing?.length ? `Timing: ${med.timing.join(', ')}` : 'Add timing details',
    })),
    recommendations,
    extras: {
      supportiveDetails,
      suggestedAdditions,
      avoidList,
      missingDose: medications.filter((med) => !med.dosage).map((med) => med.name),
      missingTiming: medications.filter((med) => !med.timing || !med.timing.length).map((med) => med.name),
      totalLogged: medications.length,
      source: 'llm',
    } as Record<string, unknown>,
  }
}

async function buildInteractionsSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
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

async function buildLabsSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const blood = context.bloodResults

  const labItems = (blood?.markers ?? []).map((marker) => ({
    name: marker.name,
    dosage: marker.value !== undefined ? `${marker.value}${marker.unit ? ` ${marker.unit}` : ''}` : null,
    timing: marker.reference ? [marker.reference] : [],
  }))

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: labItems,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      mode: 'labs',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'labs',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate lab guidance right now. Please try again shortly.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return lab insights. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: labItems.map((item) => ({
        label: item.name,
        value: item.dosage ?? 'Value not supplied',
        context: item.timing?.[0],
      })),
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
    }
  }

  const workingLabs = llmResult.working.map((item) => ({
    name: item.name,
    reason: item.reason,
    detail: item.dosage ?? item.timing ?? '',
  }))

  const suggestedLabs = llmResult.suggested.map((item) => ({
    name: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  const avoidLabs = llmResult.avoid.map((item) => ({
    name: item.name,
    reason: item.reason,
  }))

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : 'AI-generated lab guidance ready below.'

  const highlights: SectionHighlight[] = [
    {
      title: 'Labs on track',
      detail: workingLabs.length
        ? workingLabs.map((lab) => `${lab.name}: ${lab.reason}`).join('; ')
        : 'No supportive labs identified yet.',
      tone: workingLabs.length ? 'positive' : 'neutral',
    },
    {
      title: 'Labs to order or adjust',
      detail: suggestedLabs.length
        ? suggestedLabs.map((lab) => `${lab.name}: ${lab.reason}`).join('; ')
        : 'Review the suggestions below with your clinician.',
      tone: suggestedLabs.length ? 'neutral' : 'positive',
    },
    {
      title: 'Labs to monitor carefully',
      detail: avoidLabs.length
        ? avoidLabs.map((lab) => `${lab.name}: ${lab.reason}`).join('; ')
        : 'No avoid items flagged—see cautions below for awareness.',
      tone: avoidLabs.length ? 'warning' : 'neutral',
    },
  ]

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Coordinate lab follow-up',
          description: 'Use the suggested labs to plan your next panel.',
          actions: ['Schedule tests with your clinician', 'Log results once available'],
          priority: 'soon',
        },
      ]

  const dataPoints: SectionDatum[] = labItems.map((item) => ({
    label: item.name,
    value: item.dosage ?? 'Value not supplied',
    context: item.timing?.[0],
  }))

  return {
    issue,
    section: 'labs',
    generatedAt: now,
    confidence: 0.8,
    summary,
    highlights,
    dataPoints,
    recommendations,
    extras: {
      workingLabs,
      suggestedLabs,
      avoidLabs,
      source: 'llm',
    },
  }
}

async function buildNutritionSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const foods: Array<{ name?: string; meal?: string; calories?: number }> = context.todaysFoods.length
    ? context.todaysFoods
    : context.foodLogs.slice(0, 10).map((log) => ({
        name: log.name,
        meal: log.description ?? undefined,
        calories: undefined,
      }))

  const normalizedFoods = foods.map((food, idx) => ({
    name: food.name || food.meal || `Entry ${idx + 1}`,
    dosage: food.calories ? `${food.calories} kcal` : food.meal ?? null,
    timing: food.meal ? [food.meal] : [],
  }))

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedFoods,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      mode: 'nutrition',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'nutrition',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate nutrition guidance right now. Please try again shortly.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return nutrition insights. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: foods.map((item, idx) => ({
        label: item.meal ? `${item.meal}` : `Meal ${idx + 1}`,
        value: item.name ?? 'Food logged',
        context: item.calories ? `${item.calories} kcal` : undefined,
      })),
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
      extras: {
        workingFocus: [],
        suggestedFocus: [],
        avoidFoods: [],
        totalLogged: foods.length,
        source: 'llm-error',
      },
    }
  }

  const workingFocus = llmResult.working.map((item) => ({
    title: item.name,
    reason: item.reason,
    example: item.dosage ?? item.timing ?? '',
  }))

  const suggestedFocus = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  const avoidFoods = llmResult.avoid.map((item) => ({
    name: item.name,
    reason: item.reason,
  }))

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : 'AI-generated nutrition guidance ready below.'

  const highlights: SectionHighlight[] = [
    {
      title: 'Nutrition wins',
      detail: workingFocus.length
        ? workingFocus.map((focus) => `${focus.title}: ${focus.reason}`).join('; ')
        : 'No foods flagged as supportive yet.',
      tone: workingFocus.length ? 'positive' : 'neutral',
    },
    {
      title: 'Add to your plan',
      detail: suggestedFocus.length
        ? suggestedFocus.map((focus) => `${focus.title}: ${focus.reason}`).join('; ')
        : 'Review suggestions below to expand your plan.',
      tone: suggestedFocus.length ? 'neutral' : 'positive',
    },
    {
      title: 'Foods to monitor',
      detail: avoidFoods.length
        ? avoidFoods.map((food) => `${food.name}: ${food.reason}`).join('; ')
        : 'No avoid items flagged—see the cautions below for awareness.',
      tone: avoidFoods.length ? 'warning' : 'neutral',
    },
  ]

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or dietitian'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Plan upcoming meals',
          description: 'Use the suggested foods to balance your next grocery list.',
          actions: ['Add suggested foods to your meal plan', 'Track symptom response weekly'],
          priority: 'soon',
        },
      ]

  return {
    issue,
    section: 'nutrition',
    generatedAt: now,
    confidence: 0.82,
    summary,
    highlights,
    dataPoints: foods.map((item, idx) => ({
      label: item.meal ? `${item.meal}` : `Meal ${idx + 1}`,
      value: item.name ?? 'Food logged',
      context: item.calories ? `${item.calories} kcal` : undefined,
    })),
    recommendations,
    extras: {
      workingFocus,
      suggestedFocus,
      avoidFoods,
      totalLogged: foods.length,
      source: 'llm',
    },
  }
}

async function buildLifestyleSection(issue: IssueSummary, context: UserInsightContext): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const lifestyleItems: Array<{ name: string; dosage?: string | null; timing?: string[] | null }> = []

  if (context.profile.exerciseFrequency) {
    lifestyleItems.push({ name: 'Exercise frequency', dosage: context.profile.exerciseFrequency, timing: null })
  }
  if (context.profile.bodyType) {
    lifestyleItems.push({ name: 'Body type', dosage: context.profile.bodyType, timing: null })
  }
  if (context.profile.gender) {
    lifestyleItems.push({ name: 'Gender', dosage: context.profile.gender, timing: null })
  }
  if (context.profile.weight) {
    lifestyleItems.push({ name: 'Weight', dosage: `${context.profile.weight} kg`, timing: null })
  }
  if (context.profile.height) {
    lifestyleItems.push({ name: 'Height', dosage: `${context.profile.height} cm`, timing: null })
  }

  const llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: lifestyleItems,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      mode: 'lifestyle',
    },
    { minWorking: 1, minSuggested: 2, minAvoid: 2 }
  )

  if (!llmResult) {
    return {
      issue,
      section: 'lifestyle',
      generatedAt: now,
      confidence: 0.4,
      summary: 'We couldn’t generate lifestyle guidance right now. Please try again shortly.',
      highlights: [
        {
          title: 'Generation unavailable',
          detail: 'The AI service did not return lifestyle insights. Retry in a few minutes.',
          tone: 'warning',
        },
      ],
      dataPoints: [],
      recommendations: [
        {
          title: 'Retry insight generation',
          description: 'Refresh this page or trigger a new report in a few minutes.',
          actions: ['Tap Daily/Weekly report to regenerate', 'Contact support if the problem persists'],
          priority: 'soon',
        },
      ],
      extras: {
        workingHabits: [],
        suggestedHabits: [],
        avoidHabits: [],
        source: 'llm-error',
      },
    }
  }

  const workingHabits = llmResult.working.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.dosage ?? item.timing ?? '',
  }))

  const suggestedHabits = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  const avoidHabits = llmResult.avoid.map((item) => ({
    title: item.name,
    reason: item.reason,
  }))

  const summary = llmResult.summary?.trim().length
    ? llmResult.summary
    : 'AI-generated lifestyle coaching ready below.'

  const highlights: SectionHighlight[] = [
    {
      title: 'Lifestyle foundations',
      detail: workingHabits.length
        ? workingHabits.map((habit) => `${habit.title}: ${habit.reason}`).join('; ')
        : 'No lifestyle habits flagged as supportive yet.',
      tone: workingHabits.length ? 'positive' : 'neutral',
    },
    {
      title: 'Habits to add',
      detail: suggestedHabits.length
        ? suggestedHabits.map((habit) => `${habit.title}: ${habit.reason}`).join('; ')
        : 'Review the suggested habits below to evolve your plan.',
      tone: suggestedHabits.length ? 'neutral' : 'positive',
    },
    {
      title: 'Habits to avoid',
      detail: avoidHabits.length
        ? avoidHabits.map((habit) => `${habit.title}: ${habit.reason}`).join('; ')
        : 'No avoid items flagged—see cautions below for awareness.',
      tone: avoidHabits.length ? 'warning' : 'neutral',
    },
  ]

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or coach'],
        priority: rec.priority,
      }))
    : [
        {
          title: 'Plan daily routine updates',
          description: 'Use the suggested habits to refine your schedule.',
          actions: ['Add habits to your calendar', 'Track adherence for 14 days'],
          priority: 'soon',
        },
      ]

  return {
    issue,
    section: 'lifestyle',
    generatedAt: now,
    confidence: 0.8,
    summary,
    highlights,
    dataPoints: [],
    recommendations,
    extras: {
      workingHabits,
      suggestedHabits,
      avoidHabits,
      source: 'llm',
    },
  }
}
