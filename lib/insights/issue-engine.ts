import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { generateSectionInsightsFromLLM, generateDegradedSection, generateDegradedSectionQuick, generateDegradedSectionQuickStrict, evaluateFocusItemsForIssue } from './llm'

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
  supplements: Array<{ name: string; dosage: string; timing: string[]; updatedAt: Date }>
  medications: Array<{ name: string; dosage: string; timing: string[]; updatedAt: Date }>
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
    exerciseTypes?: string[] | null
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
const SECTION_CACHE_TTL_MS = 1000 * 60 * 15
const DEGRADED_CACHE_TTL_MS = 1000 * 60 * 2
const CURRENT_PIPELINE_VERSION = 'v8'
const FORCE_QUICK_FIRST = process.env.INSIGHTS_FORCE_QUICK_FIRST === 'true'
const PAUSE_HEAVY = process.env.INSIGHTS_PAUSE_HEAVY === 'true'

const RECENT_DATA_WINDOW_MS = 1000 * 60 * 60 * 24

let sectionCacheTableEnsured = false

async function ensureSectionCacheTable() {
  if (sectionCacheTableEnsured) return
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "InsightsSectionCache" ("userId" TEXT NOT NULL, "slug" TEXT NOT NULL, "section" TEXT NOT NULL, "mode" TEXT NOT NULL, "rangeKey" TEXT NOT NULL, "result" JSONB NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY ("userId","slug","section","mode","rangeKey"))'
    )
    sectionCacheTableEnsured = true
  } catch (error) {
    console.error('[insights.cache] Failed to ensure cache table', error)
  }
}

async function readSectionCache(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  mode: ReportMode,
  rangeKey: string
): Promise<{ result: IssueSectionResult; updatedAt: Date } | null> {
  try {
    await ensureSectionCacheTable()
    const rows: Array<{ result: IssueSectionResult; updatedAt: Date }> = await prisma.$queryRawUnsafe(
      'SELECT "result", "updatedAt" FROM "InsightsSectionCache" WHERE "userId" = $1 AND "slug" = $2 AND "section" = $3 AND "mode" = $4 AND "rangeKey" = $5',
      userId,
      slug,
      section,
      mode,
      rangeKey
    )
    if (rows && rows[0]) {
      return {
        result: rows[0].result,
        updatedAt: new Date(rows[0].updatedAt),
      }
    }
  } catch (error) {
    console.warn('[insights.cache] Failed to read section cache', error)
  }
  return null
}

// Lightweight exported helper: read a cached section without triggering any compute.
export async function getCachedIssueSection(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  options: Partial<{ mode: ReportMode; range?: { from?: string; to?: string } }>
): Promise<IssueSectionResult | null> {
  const mode = options.mode ?? 'latest'
  const rangeKey = encodeRange(options.range)
  const cached = await readSectionCache(userId, slug, section, mode, rangeKey)
  if (!cached) return null
  
  // CRITICAL: For exercise section, ensure intake exercises are ALWAYS present in cached results
  // This fixes stale cached results that were generated before the fix
  // This is especially important for SSR since getCachedIssueSection is used by layout.tsx
  if (section === 'exercise') {
    try {
      const landing = await loadUserLandingContext(userId)
      const intakeTypesArray = landing.profile.exerciseTypes ?? []
      
      console.log(`[exercise.getCachedIssueSection] Checking cached result. Intake exercises:`, intakeTypesArray)
      
      if (intakeTypesArray.length > 0) {
        const extras = (cached.result.extras as Record<string, unknown> | undefined) ?? {}
        const existingWorking = (extras.workingActivities as Array<{ title: string; reason?: string; summary?: string; lastLogged?: string }> | undefined) ?? []
        const workingActivities = [...existingWorking] // Create a new array to avoid mutation issues
        const workingTitles = new Set(workingActivities.map(w => canonical(w.title)))
        
        console.log(`[exercise.getCachedIssueSection] Existing workingActivities count:`, workingActivities.length)
        
        // Add any missing intake exercises
        for (const exerciseType of intakeTypesArray) {
          const exerciseTypeKey = canonical(exerciseType)
          if (!workingTitles.has(exerciseTypeKey)) {
            // Check fuzzy match
            let alreadyAdded = false
            for (const w of workingActivities) {
              if (matchesExerciseType(w.title, exerciseType)) {
                alreadyAdded = true
                break
              }
            }
            
            if (!alreadyAdded) {
              console.log(`[exercise.getCachedIssueSection] ✅ Injecting intake exercise "${exerciseType}" into cached result`)
              workingActivities.push({
                title: exerciseType,
                reason: `${exerciseType} can support this health goal through improved cardiovascular health, stress reduction, and overall physical wellbeing. Regular ${exerciseType.toLowerCase()} helps maintain optimal body function and may contribute positively to this health goal.`,
                summary: 'Selected in health intake',
                lastLogged: 'From your health profile',
              })
              workingTitles.add(exerciseTypeKey)
            }
          }
        }
        
        console.log(`[exercise.getCachedIssueSection] Final workingActivities count:`, workingActivities.length)
        
        // Return modified result
        return {
          ...cached.result,
          extras: {
            ...extras,
            workingActivities,
          },
        }
      }
    } catch (error) {
      console.error(`[exercise.getCachedIssueSection] Error injecting intake exercises:`, error)
      // Fall through to return cached result as-is if injection fails
    }
  }
  
  return cached.result
}

async function upsertSectionCache(params: {
  userId: string
  slug: string
  section: IssueSectionKey
  mode: ReportMode
  rangeKey: string
  result: IssueSectionResult | null
}) {
  const { userId, slug, section, mode, rangeKey, result } = params
  if (!result) return
  try {
    await ensureSectionCacheTable()
    await prisma.$executeRawUnsafe(
      'INSERT INTO "InsightsSectionCache" ("userId","slug","section","mode","rangeKey","result","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())\n         ON CONFLICT ("userId","slug","section","mode","rangeKey") DO UPDATE SET "result" = EXCLUDED."result", "updatedAt" = NOW()',
      userId,
      slug,
      section,
      mode,
      rangeKey,
      JSON.stringify(result)
    )
  } catch (error) {
    console.error('[insights.cache] Failed to upsert section cache', error)
  }
}

function isRecent(date: Date | null | undefined, windowMs = RECENT_DATA_WINDOW_MS) {
  if (!date) return false
  return date.getTime() >= Date.now() - windowMs
}

const SUPPLEMENT_KEYWORDS = [
  'supplement',
  'capsule',
  'powder',
  'extract',
  'herb',
  'herbal',
  'oil',
  'tincture',
  'tea',
  'vitamin',
  'magnesium',
  'zinc',
  'omega',
  'ashwagandha',
  'turmeric',
  'probiotic',
  'adaptogen',
  'psyllium',
  'fiber',
]

const FOOD_KEYWORDS = [
  'salad',
  'apple',
  'banana',
  'pear',
  'orange',
  'citrus',
  'broccoli',
  'kale',
  'spinach',
  'fruit',
  'vegetable',
  'veg',
  'berry',
  'grain',
  'oat',
  'rice',
  'bread',
  'pasta',
  'bean',
  'lentil',
  'fish',
  'salmon',
  'tuna',
  'sardine',
  'chicken',
  'turkey',
  'beef',
  'egg',
  'yogurt',
  'kefir',
  'smoothie',
  'soup',
  'stew',
  'nut',
  'seed',
  'avocado',
  'leafy',
]

function canonical(value: string) {
  return value.trim().toLowerCase()
}

// Enhanced matching for exercise name variations
function matchesExerciseType(exerciseName: string, intakeType: string): boolean {
  const exerciseKey = canonical(exerciseName)
  const intakeKey = canonical(intakeType)
  
  // Exact match
  if (exerciseKey === intakeKey) return true
  
  // Common exercise name variations
  const variations: Record<string, string[]> = {
    'walking': ['walk', 'walking exercise', 'brisk walking', 'walking workout'],
    'running': ['run', 'jogging', 'jog', 'running workout'],
    'cycling': ['bike riding', 'bicycle', 'bike', 'cycling workout', 'bike ride'],
    'swimming': ['swim', 'swimming workout'],
    'weight training': ['weights', 'weightlifting', 'strength training', 'resistance training'],
    'yoga': ['yoga practice', 'yoga session'],
    'boxing': ['boxing workout', 'boxing training', 'box'],
    'hiit': ['high intensity interval training', 'hiit workout'],
  }
  
  // Check if either name is a key and the other is in its variations
  for (const [key, vars] of Object.entries(variations)) {
    const normalizedKey = canonical(key)
    if (normalizedKey === exerciseKey || normalizedKey === intakeKey) {
      const otherKey = normalizedKey === exerciseKey ? intakeKey : exerciseKey
      if (vars.some(v => canonical(v) === otherKey)) return true
    }
  }
  
  // Partial match: check if one contains the other (for multi-word exercises)
  const exerciseWords = exerciseKey.split(/\s+/).filter(w => w.length >= 4)
  const intakeWords = intakeKey.split(/\s+/).filter(w => w.length >= 4)
  
  if (exerciseWords.length > 0 && intakeWords.length > 0) {
    // Check if any significant word from one appears in the other
    if (exerciseWords.some(w => intakeKey.includes(w)) || intakeWords.some(w => exerciseKey.includes(w))) {
      return true
    }
  }
  
  return false
}

function looksSupplementLike(value: string) {
  const lower = value.toLowerCase()
  return SUPPLEMENT_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function looksFoodLike(value: string) {
  const lower = value.toLowerCase()
  return FOOD_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function hasRecentSupplementActivity(supplements: UserInsightContext['supplements']) {
  return supplements.some((supp) => isRecent(supp.updatedAt))
}

function hasRecentMedicationActivity(medications: UserInsightContext['medications']) {
  return medications.some((med) => isRecent(med.updatedAt))
}

function hasRecentExerciseLogs(exerciseLogs: UserInsightContext['exerciseLogs']) {
  return exerciseLogs.some((log) => isRecent(log.createdAt))
}

function hasRecentFoodLogs(foodLogs: UserInsightContext['foodLogs']) {
  return foodLogs.some((log) => isRecent(log.createdAt))
}

const ISSUE_KNOWLEDGE_BASE: Record<string, {
  aliases?: string[]
  helpfulSupplements?: Array<{ pattern: RegExp; title?: string; why: string; suggested?: string }>
  gapSupplements?: Array<{ title: string; why: string; suggested?: string }>
  avoidSupplements?: Array<{ pattern: RegExp; title?: string; why: string }>
  helpfulMedications?: Array<{ pattern: RegExp; title?: string; why: string; suggested?: string }>
  gapMedications?: Array<{ title: string; why: string; suggested?: string }>
  avoidMedications?: Array<{ pattern: RegExp; title?: string; why: string }>
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
      { pattern: /ashwagandha/i, why: 'may improve sexual performance and stress resilience', suggested: 'KSM-66 or Sensoril, 300–600mg/day' },
      { pattern: /tongkat|longjack/i, why: 'can support testosterone and libido metrics', suggested: 'Eurycoma longifolia extract, 200–400mg/day' },
      { pattern: /tribulus/i, why: 'traditionally used for libido and androgen support', suggested: 'Standardized to protodioscin, 500–750mg/day' },
      { pattern: /cistanche/i, why: 'Tonifies yang and may enhance libido and stamina', suggested: 'Cistanche tubulosa extract, 300–600mg/day' },
      { pattern: /muira|muira\s?puama|ptychopetalum/i, why: 'Often used for arousal and nitric oxide support', suggested: 'Muira puama extract, 250–500mg/day' },
      { pattern: /zinc/i, why: 'supports hormonal balance when levels are low', suggested: 'Zinc bisglycinate 15–30mg with food' },
      { pattern: /l[-\s]?arginine/i, why: 'can aid nitric oxide availability for circulation', suggested: 'L-arginine 3–6g/day or L-citrulline 2–3g/day' },
    ],
    gapSupplements: [
      { title: 'Consider adaptogens for stress-linked libido dips', why: 'Chronic stress suppresses libido; ashwagandha or rhodiola can moderate cortisol', suggested: 'Ashwagandha 600mg/day (divided)' },
      { title: 'Evaluate zinc status', why: 'Low zinc impairs testosterone conversion and sexual health', suggested: 'Zinc bisglycinate 15–30mg with food' },
    ],
    avoidSupplements: [
      { pattern: /yohim(b|)ine/i, why: 'Can spike blood pressure and anxiety; avoid unless supervised by a clinician.' },
      { pattern: /pseudoephedrine|decongestant/i, why: 'Constriction of blood vessels can undermine erectile blood flow.' },
      { pattern: /excessive\s?alcohol/i, why: 'Depresses CNS and worsens erection quality and arousal.' },
      { pattern: /nicotine|smoking/i, why: 'Impairs vascular function and nitric oxide signaling.' },
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
      {
        title: 'Add nitrate-rich greens',
        detail: 'Beetroot and leafy greens support nitric oxide for blood flow',
        keywords: ['beet', 'rocket', 'arugula', 'spinach'],
      },
      {
        title: 'Hydration and electrolytes',
        detail: 'Adequate fluids support performance and vascular tone',
        keywords: ['water', 'electrolyte', 'salt'],
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
      {
        title: 'Heavy late-night meals',
        detail: 'Late, heavy meals impair sleep quality and next-day libido.',
        keywords: ['late dinner', 'greasy', 'large portions'],
      },
      {
        title: 'High alcohol evenings',
        detail: 'Alcohol blunts arousal and disrupts sleep architecture.',
        keywords: ['alcohol', 'wine', 'beer', 'spirits'],
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
  'bowel movements': {
    aliases: ['constipation', 'irregular stools', 'sluggish bowels', 'bowel-movement', 'bowel-movements'],
    helpfulSupplements: [
      { pattern: /magnesium\s?(citrate|glycinate|oxide)?/i, why: 'Osmotic effect draws water into stool to ease passage', suggested: 'Magnesium citrate 200–400mg in the evening' },
      { pattern: /psyllium|husk|fiber/i, why: 'Bulk-forming fiber improves stool consistency and frequency', suggested: 'Psyllium husk 1–2 tsp with 300ml water daily' },
      { pattern: /probiotic|bifido|lacto/i, why: 'Certain strains improve stool frequency and transit time', suggested: 'Multi‑strain probiotic providing 10–20B CFU daily' },
      { pattern: /triphala/i, why: 'Ayurvedic blend gently supports motility without harsh stimulation', suggested: '500–1000mg before bed' },
    ],
    gapSupplements: [
      { title: 'Hydration + electrolytes', why: 'Adequate fluids keep fiber effective and stool soft', suggested: 'Aim for 2–2.5L water/day; add electrolytes if training' },
    ],
    avoidSupplements: [
      { pattern: /high[-\s]?dose\s?iron/i, why: 'Frequently constipating; review need and dose with clinician' },
      { pattern: /calcium(\s?carbonate)?/i, why: 'Carbonate form can slow motility and harden stools' },
      { pattern: /aluminium|aluminum/i, why: 'Aluminium-containing antacids can cause constipation' },
      { pattern: /excessive\s?caffeine/i, why: 'Diuretic effect can dehydrate and harden stools for some' },
    ],
    helpfulMedications: [
      { pattern: /polyethylene\s?glycol|peg\s?3350|macrogol/i, why: 'Osmotic laxative softens stool and increases frequency' },
      { pattern: /lactulose/i, why: 'Osmotic agent that draws water into colon to ease passage' },
      { pattern: /senna|sennosides/i, why: 'Stimulant laxative that increases motility (short term use)' },
      { pattern: /docusate|stool\s?softener/i, why: 'Reduces stool surface tension to ease passage' },
    ],
    gapMedications: [
      { title: 'Consider short trial of osmotic support', why: 'If dietary measures fail, short course may help reset rhythm', suggested: 'PEG 3350 as directed by clinician' },
    ],
    avoidMedications: [
      { pattern: /opioid|codeine|oxycodone|morphine/i, why: 'Strongly constipating; requires bowel regimen if continued' },
      { pattern: /anticholinergic|amitriptyline|oxybutynin/i, why: 'Reduce gut motility and secretions—review necessity' },
      { pattern: /high[-\s]?dose\s?iron/i, why: 'Common cause of medication‑induced constipation' },
      { pattern: /calcium\s?channel\s?blocker|verapamil/i, why: 'May slow intestinal transit in some people' },
    ],
    supportiveExercises: [
      { title: '10–15 min brisk walk after meals', detail: 'Post‑meal movement stimulates gastrocolic reflex and motility', keywords: ['walk', 'post-meal', 'brisk'] },
      { title: 'Deep squat holds 3×30–45s', detail: 'Improves pelvic floor relaxation and defecation posture', keywords: ['squat', 'deep squat', 'mobility'] },
      { title: 'Abdominal massage clockwise 5 min', detail: 'Mechanical stimulation of colon segments can aid transit', keywords: ['massage', 'abdominal'] },
      { title: 'Gentle yoga: wind-relieving, twists', detail: 'Twists and knee‑to‑chest postures can mobilize gas/stool', keywords: ['yoga', 'twist', 'pawanmuktasana'] },
    ],
    avoidExercises: [
      { title: 'Heavy straining without breath control', detail: 'Valsalva increases pelvic floor tension and can worsen constipation' },
      { title: 'Very long sedentary blocks', detail: 'Prolonged sitting reduces colonic motility—insert movement snacks' },
      { title: 'Dehydrating endurance without fluids', detail: 'Fluid loss hardens stool; match sweat with hydration' },
      { title: 'Late‑night vigorous training', detail: 'May disturb sleep which impairs morning bowel rhythm' },
    ],
    nutritionFocus: [
      { title: '25–35g fiber with gradual build', detail: 'Mix soluble and insoluble fiber to improve stool form', keywords: ['oats', 'vegetables', 'legumes', 'fruit'] },
      { title: '2 kiwifruit or a handful of prunes', detail: 'Both show evidence for increasing stool frequency', keywords: ['kiwi', 'prunes'] },
      { title: 'Daily probiotic/fermented food', detail: 'Supports beneficial bacteria and short‑chain fatty acids', keywords: ['yogurt', 'kefir', 'sauerkraut'] },
      { title: 'Hydration habit (2–2.5L)', detail: 'Water keeps fiber effective and stool soft', keywords: ['water', 'electrolyte'] },
    ],
    avoidFoods: [
      { title: 'Ultra‑processed low‑fiber snacks', detail: 'Lack of fiber reduces stool bulk and slows transit', keywords: ['chips', 'cookies', 'white bread'] },
      { title: 'Excess dairy if sensitive', detail: 'For some, high cheese/ice‑cream intake worsens firmness', keywords: ['cheese', 'ice cream'] },
      { title: 'Very low‑carb with minimal vegetables', detail: 'Insufficient fiber intake commonly leads to constipation', keywords: ['keto', 'low carb'] },
      { title: 'Dehydrating alcohol evenings', detail: 'Fluid loss overnight hardens stools next morning', keywords: ['alcohol', 'wine', 'spirits'] },
    ],
    lifestyleFocus: [
      { title: 'Morning bowel routine after breakfast', detail: 'Use the gastrocolic reflex; sit unhurriedly 10–15 min' },
      { title: 'Footstool for squat‑like posture', detail: 'Improves anorectal angle and reduces straining' },
      { title: 'Mindful breathing to relax pelvic floor', detail: 'Down‑regulates sympathetic tone that inhibits motility' },
      { title: 'Consistent sleep and wake time', detail: 'Circadian regularity supports predictable bowel movements' },
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

// Turn a regex pattern into a readable label as a fallback when no explicit title is provided.
function displayFromPattern(pattern: RegExp): string {
  let s = pattern.source
  s = s
    .replace(/\\s\?/g, ' ') // optional whitespace
    .replace(/\\s/g, ' ')
    .replace(/\[.*?\]/g, ' ') // character classes
    .replace(/[\\^$*+?]/g, '') // regex operators
    .replace(/\(\?:/g, '(')
    .replace(/[()]/g, '')
    .replace(/\|/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!s) return 'Item'
  return s
    .split(' ')
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ')
}

// Ensure at least `min` items by topping up from a fallback list, de-duplicating by JSON identity.
function ensureMin<T>(primary: T[], fallback: T[], min = 4): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of primary) {
    const key = JSON.stringify(item)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(item)
    }
    if (out.length >= min) break
  }
  if (out.length < min) {
    for (const fb of fallback) {
      const key = JSON.stringify(fb)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(fb)
      }
      if (out.length >= min) break
    }
  }
  return out.slice(0, min)
}

function hasStructuredData(value: unknown) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return !!value
}

// Only persist successful, useful results in the DB cache. Avoid caching
// error states or placeholder results that would mask recovery for 15 minutes.
function shouldCacheSectionResult(result: IssueSectionResult | null): boolean {
  if (!result) return false
  // Always cache overview since it has no LLM dependency
  if (result.section === 'overview') return true
  const extras = (result.extras as Record<string, unknown> | undefined) ?? {}
  const source = String(extras['source'] ?? '')
  const pipelineVersion = String(extras['pipelineVersion'] ?? '')
  const validated = Boolean(extras['validated'])
  const degraded = Boolean(extras['degraded'])
  // Known non-success sources we do not want to cache
  const badSources = new Set(['llm-error', 'needs-data', 'needs-fresh-data'])
  if (badSources.has(source)) return false
  // Cache validated results from the new pipeline
  if (validated && pipelineVersion === CURRENT_PIPELINE_VERSION) return true
  // Additionally, cache degraded results with a short TTL to avoid repeated cold waits
  if (!validated && degraded) return true
  return false
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
    const built = await buildIssueSectionWithContext(context, slug, section, {
      mode,
      range: options.range,
      force: true,
    })
    if (shouldCacheSectionResult(built)) {
      await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: built })
    }
    return built
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

type PrecomputeOptions = {
  slugs?: string[]
  sections?: IssueSectionKey[]
  mode?: ReportMode
  range?: { from?: string; to?: string }
  concurrency?: number
  sectionsFilter?: IssueSectionKey[] // Added for selective regeneration based on data changes
}

export async function precomputeIssueSectionsForUser(
  userId: string,
  options: PrecomputeOptions = {}
) {
  const context = await loadUserInsightContext(userId)
  const availableSlugs = context.issues.map((issue) => issue.slug)

  const targetSlugs = options.slugs && options.slugs.length
    ? Array.from(new Set(options.slugs)).filter(Boolean)
    : availableSlugs

  if (!targetSlugs.length) return

  const defaultSections = ISSUE_SECTION_ORDER.filter((section) => section !== 'overview')
  let targetSections = options.sections && options.sections.length
    ? Array.from(new Set(options.sections))
    : defaultSections

  // Apply sectionsFilter if provided (for selective regeneration)
  if (options.sectionsFilter && options.sectionsFilter.length) {
    targetSections = targetSections.filter((section) => options.sectionsFilter!.includes(section))
  }

  if (!targetSections.length) return

  const mode = options.mode ?? 'latest'
  const range = options.range
  const rangeKey = encodeRange(range)
  const concurrency = Math.max(1, options.concurrency ?? 4)

  const tasks = targetSlugs.flatMap((slug) =>
    targetSections.map((section) => ({ slug, section }))
  )

  await runWithConcurrency(tasks, concurrency, async ({ slug, section }) => {
    const built = await buildIssueSectionWithContext(context, slug, section, {
      mode,
      range,
      force: true,
    })
    if (shouldCacheSectionResult(built)) {
      await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: built })
    }
  })
}

export async function precomputeQuickSectionsForUser(
  userId: string,
  options: PrecomputeOptions = {}
) {
  const context = await loadUserInsightContext(userId)
  const availableSlugs = context.issues.map((issue) => issue.slug)

  const targetSlugs = options.slugs && options.slugs.length
    ? Array.from(new Set(options.slugs)).filter(Boolean)
    : availableSlugs

  if (!targetSlugs.length) return

  const defaultSections = ISSUE_SECTION_ORDER.filter((section) => section !== 'overview' && section !== 'interactions')
  let targetSections = options.sections && options.sections.length
    ? Array.from(new Set(options.sections)).filter((s) => s !== 'overview' && s !== 'interactions')
    : defaultSections

  if (!targetSections.length) return

  const mode = options.mode ?? 'latest'
  const range = options.range
  const rangeKey = encodeRange(range)
  const concurrency = Math.max(1, options.concurrency ?? 4)

  type CountPair = { suggested: number; avoid: number }
  const countBySection = (section: IssueSectionKey, extras: any): CountPair => {
    switch (section) {
      case 'supplements':
      case 'medications':
        return {
          suggested: Array.isArray(extras?.suggestedAdditions) ? extras.suggestedAdditions.length : 0,
          avoid: Array.isArray(extras?.avoidList) ? extras.avoidList.length : 0,
        }
      case 'exercise':
        return {
          suggested: Array.isArray(extras?.suggestedActivities) ? extras.suggestedActivities.length : 0,
          avoid: Array.isArray(extras?.avoidActivities) ? extras.avoidActivities.length : 0,
        }
      case 'nutrition':
        return {
          suggested: Array.isArray(extras?.suggestedFocus) ? extras.suggestedFocus.length : 0,
          avoid: Array.isArray(extras?.avoidFoods) ? extras.avoidFoods.length : 0,
        }
      case 'lifestyle':
        return {
          suggested: Array.isArray(extras?.suggestedHabits) ? extras.suggestedHabits.length : 0,
          avoid: Array.isArray(extras?.avoidHabits) ? extras.avoidHabits.length : 0,
        }
      case 'labs':
        return {
          suggested: Array.isArray(extras?.suggestedLabs) ? extras.suggestedLabs.length : 0,
          avoid: Array.isArray(extras?.avoidLabs) ? extras.avoidLabs.length : 0,
        }
      default:
        return { suggested: 0, avoid: 0 }
    }
  }

  const tasks = targetSlugs.flatMap((slug) => targetSections.map((section) => ({ slug, section })))

  await runWithConcurrency(tasks, concurrency, async ({ slug, section }) => {
    // Build quick once
    let quick = await buildQuickSection(userId, slug, section, mode)
    // Retry once with stricter quick if needed during precompute
    try {
      const counts = quick ? countBySection(section, (quick as any).extras) : { suggested: 0, avoid: 0 }
      if (!quick || counts.suggested < 4 || counts.avoid < 4) {
        const landing = await loadUserLandingContext(userId)
        const issue = landing.issues.find((i) => i.slug === slug) || {
          id: `temp:${slug}`,
          name: unslugify(slug),
          slug,
          polarity: inferPolarityFromName(unslugify(slug)),
        }
        const summary = enrichIssueSummary(issue, landing)
        // Strict quick generation per section
        const mapStrict = async (
          modeKey: 'supplements' | 'medications' | 'exercise' | 'nutrition' | 'lifestyle' | 'labs'
        ) =>
          (await generateDegradedSectionQuickStrict({
            issueName: summary.name,
            issueSummary: summary.highlight,
            items: [],
            otherItems: [],
            profile: landing.profile,
            mode: modeKey,
          }, { minSuggested: 4, minAvoid: 4 }))
        let strictResult: any = null
        switch (section) {
          case 'supplements': {
            const r = await mapStrict('supplements')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'supplements',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  supportiveDetails: [],
                  suggestedAdditions: r.suggested.map((s: any) => ({ title: s.name, reason: s.reason, suggestion: s.protocol ?? null })),
                  avoidList: r.avoid.map((a: any) => ({ name: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
          case 'medications': {
            const r = await mapStrict('medications')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'medications',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  supportiveDetails: [],
                  suggestedAdditions: r.suggested.map((s: any) => ({ title: s.name, reason: s.reason, suggestion: s.protocol ?? null })),
                  avoidList: r.avoid.map((a: any) => ({ name: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
          case 'exercise': {
            const r = await mapStrict('exercise')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'exercise',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  workingActivities: [],
                  suggestedActivities: r.suggested.map((s: any) => ({ title: s.name, reason: s.reason, detail: s.protocol ?? null })),
                  avoidActivities: r.avoid.map((a: any) => ({ title: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
          case 'nutrition': {
            const r = await mapStrict('nutrition')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'nutrition',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  workingFocus: [],
                  suggestedFocus: r.suggested.map((s: any) => ({ title: s.name, reason: s.reason })),
                  avoidFoods: r.avoid.map((a: any) => ({ name: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
          case 'lifestyle': {
            const r = await mapStrict('lifestyle')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'lifestyle',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  suggestedHabits: r.suggested.map((s: any) => ({ title: s.name, reason: s.reason })),
                  avoidHabits: r.avoid.map((a: any) => ({ title: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
          case 'labs': {
            const r = await mapStrict('labs')
            if (r) {
              strictResult = {
                issue: summary,
                section: 'labs',
                generatedAt: new Date().toISOString(),
                confidence: 0.6,
                summary: r.summary || 'Initial guidance while we prepare a deeper report.',
                highlights: [],
                dataPoints: [],
                recommendations: [],
                mode,
                extras: {
                  suggestedLabs: r.suggested.map((s: any) => ({ name: s.name, reason: s.reason, detail: s.protocol ?? null })),
                  avoidLabs: r.avoid.map((a: any) => ({ name: a.name, reason: a.reason })),
                  source: 'quick',
                  pipelineVersion: CURRENT_PIPELINE_VERSION,
                  validated: false,
                  degraded: true,
                  cacheHit: false,
                },
              }
            }
            break
          }
        }
        if (strictResult) {
          quick = strictResult
        }
      }
    } catch {}

    if (quick && shouldCacheSectionResult(quick)) {
      try {
        await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: quick })
      } catch {}
    }
  })
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
        exerciseTypes: true,
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
            updatedAt: true,
          },
        },
        medications: {
          select: {
            name: true,
            dosage: true,
            timing: true,
            updatedAt: true,
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

  let selectedIssues: string[] = []
  const selectedRecord = user.healthGoals.find((goal) => goal.name === '__SELECTED_ISSUES__')
  const hasSelectedSnapshot = !!selectedRecord
  if (selectedRecord?.category) {
    try {
      const parsed = JSON.parse(selectedRecord.category)
      if (Array.isArray(parsed)) {
        selectedIssues = Array.from(
          new Set(
            parsed
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter(Boolean)
          )
        )
      }
    } catch {
      selectedIssues = []
    }
  }

  let issues = selectedIssues.length
    ? selectedIssues
        .map((name) => {
          const lower = name.toLowerCase()
          const goal = healthGoals[lower]
          return goal
            ? {
                id: goal.id,
                name: goal.name,
                slug: slugify(goal.name),
                polarity: inferPolarityFromName(goal.name),
              }
            : {
                id: `selected:${slugify(name)}`,
                name,
                slug: slugify(name),
                polarity: inferPolarityFromName(name),
              }
        })
        .filter((issue) => issue.name.length > 0)
    : !hasSelectedSnapshot
      ? issuesRows.map((row) => {
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
      : []

  if (!issues.length && visibleGoals.length && !hasSelectedSnapshot) {
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
      updatedAt: supp.updatedAt,
    })),
    medications: user.medications.map((med) => ({
      name: med.name,
      dosage: med.dosage,
      timing: med.timing ?? [],
      updatedAt: med.updatedAt,
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
      exerciseTypes: user.exerciseTypes ?? null,
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
        gender: true,
        height: true,
        weight: true,
        bodyType: true,
        exerciseFrequency: true,
        exerciseTypes: true,
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

  let selectedIssues: string[] = []
  const selectedRecord = user.healthGoals.find((goal) => goal.name === '__SELECTED_ISSUES__')
  const hasSelectedSnapshotLanding = !!selectedRecord
  if (selectedRecord?.category) {
    try {
      const parsed = JSON.parse(selectedRecord.category)
      if (Array.isArray(parsed)) {
        selectedIssues = Array.from(
          new Set(
            parsed
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter(Boolean)
          )
        )
      }
    } catch {
      selectedIssues = []
    }
  }

  let issues = selectedIssues.length
    ? selectedIssues
        .map((name) => {
          const lower = name.toLowerCase()
          const goal = healthGoals[lower]
          return goal
            ? {
                id: goal.id,
                name: goal.name,
                slug: slugify(goal.name),
                polarity: inferPolarityFromName(goal.name),
              }
            : {
                id: `selected:${slugify(name)}`,
                name,
                slug: slugify(name),
                polarity: inferPolarityFromName(name),
              }
        })
        .filter((issue) => issue.name.length > 0)
    : !hasSelectedSnapshotLanding
      ? issuesRows.map((row) => {
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
      : []

  if (!issues.length && visibleGoals.length && !hasSelectedSnapshotLanding) {
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
    profile: {
      gender: user.gender ?? null,
      weight: user.weight ?? null,
      height: user.height ?? null,
      bodyType: (user.bodyType as any) ?? null,
      exerciseFrequency: user.exerciseFrequency ?? null,
      exerciseTypes: (user as any).exerciseTypes ?? null,
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

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const active = new Set<Promise<void>>()
  for (const item of items) {
    const promise = Promise.resolve()
      .then(() => task(item))
      .catch((error) => {
        console.error('[insights.precompute] Task failed', error)
      })
      .finally(() => {
        active.delete(promise)
      })
    active.add(promise)
    if (active.size >= limit) {
      await Promise.race(active)
    }
  }
  if (active.size) {
    await Promise.allSettled(Array.from(active))
  }
}

// Builds a section with an already loaded context and attaches mode/range
async function buildIssueSectionWithContext(
  context: UserInsightContext,
  slug: string,
  section: IssueSectionKey,
  options: { mode: ReportMode; range?: { from?: string; to?: string }; force?: boolean }
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
      base = await buildExerciseSection(summary, context, { forceRefresh: options.force ?? false })
      break
    case 'supplements':
      base = await buildSupplementsSection(summary, context, { forceRefresh: options.force ?? false })
      break
    case 'medications':
      base = await buildMedicationsSection(summary, context, { forceRefresh: options.force ?? false })
      break
    case 'interactions':
      base = await buildInteractionsSection(summary, context)
      break
    case 'labs':
      base = await buildLabsSection(summary, context, { forceRefresh: options.force ?? false })
      break
    case 'nutrition':
      base = await buildNutritionSection(summary, context, { forceRefresh: options.force ?? false })
      break
    case 'lifestyle':
      base = await buildLifestyleSection(summary, context, { forceRefresh: options.force ?? false })
      break
    default:
      base = null
  }
  if (!base) return null
  return { ...base, mode: options.mode, range: options.range }
}

// Build a fast personalised starter using only existing user data, no live AI.

// Placeholder that can be upgraded to add caching based on (mode, rangeKey)
async function computeIssueSection(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  mode: ReportMode,
  _rangeKey: string
): Promise<IssueSectionResult | null> {
  const t0 = Date.now()
  const rangeKey = _rangeKey
  const cached = await readSectionCache(userId, slug, section, mode, rangeKey)
  if (cached) {
    const extrasIn = (cached.result.extras as Record<string, unknown> | undefined) ?? {}
    const pipelineVersion = String(extrasIn['pipelineVersion'] ?? '')
    const validated = Boolean(extrasIn['validated'])
    const degraded = Boolean(extrasIn['degraded'])
    const ageMs = Date.now() - cached.updatedAt.getTime()
    const ttl = degraded ? DEGRADED_CACHE_TTL_MS : SECTION_CACHE_TTL_MS
    const ok = ageMs < ttl && (validated ? pipelineVersion === CURRENT_PIPELINE_VERSION : (degraded && pipelineVersion === CURRENT_PIPELINE_VERSION))
    
    // Debug logging for cache check
    if (section === 'exercise') {
      console.log('[exercise.cache] Checking cache:', {
        pipelineVersion,
        currentVersion: CURRENT_PIPELINE_VERSION,
        validated,
        degraded,
        ageMs,
        ttl,
        ok,
        cachedAt: cached.updatedAt.toISOString(),
      })
    }
    
    if (ok) {
      // CRITICAL: For exercise section, ensure intake exercises are ALWAYS present in cached results
      // This fixes stale cached results that were generated before the fix
      if (section === 'exercise') {
        const landing = await loadUserLandingContext(userId)
        const intakeTypesArray = landing.profile.exerciseTypes ?? []
        const workingActivities = (extrasIn.workingActivities as Array<{ title: string; reason?: string; summary?: string; lastLogged?: string }> | undefined) ?? []
        const workingTitles = new Set(workingActivities.map(w => canonical(w.title)))
        
        // Add any missing intake exercises
        for (const exerciseType of intakeTypesArray) {
          const exerciseTypeKey = canonical(exerciseType)
          if (!workingTitles.has(exerciseTypeKey)) {
            // Check fuzzy match
            let alreadyAdded = false
            for (const w of workingActivities) {
              if (matchesExerciseType(w.title, exerciseType)) {
                alreadyAdded = true
                break
              }
            }
            
            if (!alreadyAdded) {
              console.log(`[exercise.cache] ✅ Injecting intake exercise "${exerciseType}" into cached result`)
              workingActivities.push({
                title: exerciseType,
                reason: `${exerciseType} can support this health goal through improved cardiovascular health, stress reduction, and overall physical wellbeing. Regular ${exerciseType.toLowerCase()} helps maintain optimal body function and may contribute positively to this health goal.`,
                summary: 'Selected in health intake',
                lastLogged: 'From your health profile',
              })
              workingTitles.add(exerciseTypeKey)
            }
          }
        }
        
        extrasIn.workingActivities = workingActivities
      }
      
      const enriched: IssueSectionResult = {
        ...cached.result,
        extras: {
          ...extrasIn,
          cacheHit: true,
          degradedUsed: !!extrasIn['degraded'],
          firstByteMs: Date.now() - t0,
          computeMs: 0,
        },
      }
      emitInsightsTimingSafe({
        userId,
        slug,
        section,
        mode,
        cache: 'hit',
        degradedUsed: !!extrasIn['degraded'],
        generateMs: Number((extrasIn as any)?.generateMs ?? 0),
        classifyMs: Number((extrasIn as any)?.classifyMs ?? 0),
        rewriteMs: Number((extrasIn as any)?.rewriteMs ?? 0),
        fillMs: Number((extrasIn as any)?.fillMs ?? 0),
        totalMs: Number((extrasIn as any)?.totalMs ?? 0),
        firstByteMs: enriched.extras?.firstByteMs as number,
      }).catch(() => {})
      return enriched
    }
  }

  // Quick AI-only degraded result to avoid long waits
  const quick = await buildQuickSection(userId, slug, section, mode)
  if (quick) {
    // CRITICAL: For exercise section, ensure intake exercises are ALWAYS present
    // This handles cases where cached results are empty or LLM hasn't run yet
    if (section === 'exercise') {
      const landing = await loadUserLandingContext(userId)
      const intakeTypesArray = landing.profile.exerciseTypes ?? []
      const extrasQuick = (quick.extras as Record<string, unknown> | undefined) ?? {}
      const workingActivities = (extrasQuick.workingActivities as Array<{ title: string; reason?: string; summary?: string; lastLogged?: string }> | undefined) ?? []
      const workingTitles = new Set(workingActivities.map(w => canonical(w.title)))
      
      // Add any missing intake exercises
      for (const exerciseType of intakeTypesArray) {
        const exerciseTypeKey = canonical(exerciseType)
        if (!workingTitles.has(exerciseTypeKey)) {
          // Check fuzzy match
          let alreadyAdded = false
          for (const w of workingActivities) {
            if (matchesExerciseType(w.title, exerciseType)) {
              alreadyAdded = true
              break
            }
          }
          
          if (!alreadyAdded) {
            console.log(`[exercise.computeIssueSection] ✅ Injecting intake exercise "${exerciseType}" directly into quick result`)
            workingActivities.push({
              title: exerciseType,
              reason: `${exerciseType} can support ${quick.issue?.name || slug} through improved cardiovascular health, stress reduction, and overall physical wellbeing. Regular ${exerciseType.toLowerCase()} helps maintain optimal body function and may contribute positively to this health goal.`,
              summary: 'Selected in health intake',
              lastLogged: 'From your health profile',
            })
            workingTitles.add(exerciseTypeKey)
          }
        }
      }
      
      extrasQuick.workingActivities = workingActivities
      quick.extras = extrasQuick
    }
    
    // Persist degraded with short TTL and fire background upgrade
    try {
      const firstByteMs = Date.now() - t0
      const extrasQuick = (quick.extras as Record<string, unknown> | undefined) ?? {}
      quick.extras = {
        ...extrasQuick,
        cacheHit: false,
        quickUsed: true,
        degradedUsed: true,
        firstByteMs,
        generateMs: (extrasQuick as any)?.generateMs ?? 0,
        classifyMs: (extrasQuick as any)?.classifyMs ?? 0,
        rewriteMs: (extrasQuick as any)?.rewriteMs ?? 0,
        fillMs: (extrasQuick as any)?.fillMs ?? 0,
        totalMs: (extrasQuick as any)?.totalMs ?? firstByteMs,
      }
      await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: quick })
    } catch {}
    // Emit analytics for cache miss quick path
    try {
      await emitInsightsTimingSafe({
        userId,
        slug,
        section,
        mode,
        cache: 'miss',
        degradedUsed: true,
        firstByteMs: (quick.extras as any)?.firstByteMs ?? Date.now() - t0,
        generateMs: Number(((quick.extras as any)?.generateMs) ?? 0),
        classifyMs: Number(((quick.extras as any)?.classifyMs) ?? 0),
        rewriteMs: Number(((quick.extras as any)?.rewriteMs) ?? 0),
        fillMs: Number(((quick.extras as any)?.fillMs) ?? 0),
        totalMs: Number(((quick.extras as any)?.totalMs) ?? 0),
      })
    } catch {}
    // Background full build (non-blocking)
    if (!PAUSE_HEAVY) {
      setImmediate(async () => {
        try {
          const context = await loadUserInsightContext(userId)
          const full = await buildIssueSectionWithContext(context, slug, section, { mode, range: undefined, force: false })
          if (full && shouldCacheSectionResult(full)) {
            await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: full })
          }
        } catch (e) {
          console.warn('[insights.build] background upgrade failed', e)
        }
      })
    }
    return quick
  }

  // Fallback to full build if quick path failed
  console.time(`[insights.build] ${slug}/${section}`)
  const context = await loadUserInsightContext(userId)
  const built = await buildIssueSectionWithContext(context, slug, section, {
    mode,
    range: undefined,
    force: false,
  })
  console.timeEnd(`[insights.build] ${slug}/${section}`)
  if (!built) return null
  try {
    const firstByteMs = Date.now() - t0
    const extrasIn = (built.extras as Record<string, unknown> | undefined) ?? {}
    built.extras = {
      ...extrasIn,
      cacheHit: false,
      quickUsed: false,
      degradedUsed: !!(extrasIn as any)?.degraded,
      firstByteMs,
      generateMs: (extrasIn as any)?.generateMs ?? 0,
      classifyMs: (extrasIn as any)?.classifyMs ?? 0,
      rewriteMs: (extrasIn as any)?.rewriteMs ?? 0,
      fillMs: (extrasIn as any)?.fillMs ?? 0,
      totalMs: (extrasIn as any)?.totalMs ?? firstByteMs,
    }
    await emitInsightsTimingSafe({
      userId,
      slug,
      section,
      mode,
      cache: 'miss',
      degradedUsed: !!(built.extras as any)?.degraded,
      firstByteMs,
      generateMs: Number(((built.extras as any)?.generateMs) ?? 0),
      classifyMs: Number(((built.extras as any)?.classifyMs) ?? 0),
      rewriteMs: Number(((built.extras as any)?.rewriteMs) ?? 0),
      fillMs: Number(((built.extras as any)?.fillMs) ?? 0),
      totalMs: Number(((built.extras as any)?.totalMs) ?? 0),
    })
  } catch {}
  if (shouldCacheSectionResult(built)) {
    await upsertSectionCache({ userId, slug, section, mode, rangeKey, result: built })
  }
  return built
}

async function emitInsightsTimingSafe(event: {
  userId: string
  slug: string
  section: IssueSectionKey
  mode: ReportMode
  cache: 'hit' | 'miss'
  degradedUsed: boolean
  generateMs?: number
  classifyMs?: number
  rewriteMs?: number
  fillMs?: number
  totalMs?: number
  firstByteMs?: number
}) {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.ANALYTICS_BASE_URL || ''
    const url = base && /^https?:\/\//.test(base)
      ? `${base.replace(/\/$/, '')}/api/analytics`
      : `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://helfi.ai'}/api/analytics`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'insights-timing',
        action: 'insights',
        userId: event.userId,
        issueSlug: event.slug,
        section: event.section,
        mode: event.mode,
        cache: event.cache,
        degradedUsed: event.degradedUsed,
        generateMs: event.generateMs ?? null,
        classifyMs: event.classifyMs ?? null,
        rewriteMs: event.rewriteMs ?? null,
        fillMs: event.fillMs ?? null,
        totalMs: event.totalMs ?? null,
        firstByteMs: event.firstByteMs ?? null,
      }),
    })
  } catch {
    // best-effort only
  }
}

// Build a minimal, AI-only quick result for fast first paint (degraded=true).
async function buildQuickSection(
  userId: string,
  slug: string,
  section: IssueSectionKey,
  mode: ReportMode
): Promise<IssueSectionResult | null> {
  try {
    const landing = await loadUserLandingContext(userId)
    const issue = landing.issues.find((i) => i.slug === slug) || {
      id: `temp:${slug}`,
      name: unslugify(slug),
      slug,
      polarity: inferPolarityFromName(unslugify(slug)),
    }
    const summary = enrichIssueSummary(issue, landing)
    const map = async (
      modeKey: 'supplements' | 'medications' | 'exercise' | 'nutrition' | 'lifestyle' | 'labs'
    ) =>
      generateDegradedSectionQuick(
        { issueName: summary.name, issueSummary: summary.highlight, mode: modeKey, items: [], otherItems: [], profile: landing.profile },
        { minSuggested: 4, minAvoid: 4 }
      )

    let quick: any = null
    switch (section) {
      case 'supplements': {
        const r = await map('supplements')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'supplements',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            supportiveDetails: [],
            suggestedAdditions: r.suggested.map((s) => ({ title: s.name, reason: s.reason, suggestion: s.protocol ?? null })),
            avoidList: r.avoid.map((a) => ({ name: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
      case 'medications': {
        const r = await map('medications')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'medications',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            supportiveDetails: [],
            suggestedAdditions: r.suggested.map((s) => ({ title: s.name, reason: s.reason, suggestion: s.protocol ?? null })),
            avoidList: r.avoid.map((a) => ({ name: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
      case 'exercise': {
        const r = await map('exercise')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'exercise',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            workingActivities: (() => {
              // Apply same intake exerciseTypes matching logic as buildExerciseSection
              const intakeExerciseTypes = new Set(
                (landing.profile.exerciseTypes ?? []).map((type: string) => canonical(type))
              )
              
              // Logging for debugging quick path
              console.log('[exercise.working.quick] Raw profile.exerciseTypes:', landing.profile.exerciseTypes)
              console.log('[exercise.working.quick] Canonicalized intakeExerciseTypes Set:', Array.from(intakeExerciseTypes))
              console.log('[exercise.working.quick] LLM working items:', r.working ?? [])
              console.log('[exercise.working.quick] LLM suggested items:', r.suggested.map(s => ({ name: s.name, reason: s.reason })))
              
              // Process working items from LLM result
              // If LLM returned working items (including intake exercises we added), include them all
              const working = (r.working ?? []).map((item) => {
                const itemKey = canonical(item.name)
                
                // Check if it matches any intake exercise type
                let hasIntakeMatch = intakeExerciseTypes.has(itemKey)
                if (!hasIntakeMatch) {
                  // Try fuzzy matching against all intake exercise types
                  for (const intakeType of landing.profile.exerciseTypes ?? []) {
                    if (matchesExerciseType(item.name, intakeType)) {
                      hasIntakeMatch = true
                      console.log(`[exercise.working.quick] Fuzzy matched "${item.name}" to intake type "${intakeType}"`)
                      break
                    }
                  }
                }
                
                // If it matches intake, use the intake-specific format
                if (hasIntakeMatch) {
                  return {
                    title: item.name,
                    reason: item.reason,
                    summary: 'Selected in health intake',
                    lastLogged: 'From your health profile',
                  }
                }
                
                // If LLM returned it as working (even without intake match), still include it
                // This handles cases where LLM evaluates logs and finds them supportive
                return {
                  title: item.name,
                  reason: item.reason,
                  summary: item.dosage ?? '',
                  lastLogged: item.timing ?? '',
                }
              }).filter(Boolean) as Array<{ title: string; reason: string; summary: string; lastLogged: string }>
              
              // Fallback: if LLM returns exercise in suggested bucket that matches intake exerciseTypes, promote it to working
              const intakeTypesArray = landing.profile.exerciseTypes ?? []
              
              // EXTENSIVE DEBUGGING
              console.log('[exercise.working.quick] ========== DEBUG START ==========')
              console.log('[exercise.working.quick] landing.profile:', JSON.stringify(landing.profile, null, 2))
              console.log('[exercise.working.quick] landing.profile.exerciseTypes:', landing.profile.exerciseTypes)
              console.log('[exercise.working.quick] intakeTypesArray:', intakeTypesArray)
              console.log('[exercise.working.quick] intakeTypesArray.length:', intakeTypesArray.length)
              console.log('[exercise.working.quick] working.length BEFORE adding intake:', working.length)
              console.log('[exercise.working.quick] working items BEFORE:', working.map(w => w.title))
              
              // CRITICAL FIX: Always add intake exercises if they exist, even if LLM returned some working items
              // This ensures intake exercises ALWAYS appear in working section
              const intakeExercisesInWorking = new Set(
                working.map(w => canonical(w.title))
              )
              
              for (const exerciseType of intakeTypesArray) {
                const exerciseTypeKey = canonical(exerciseType)
                if (!intakeExercisesInWorking.has(exerciseTypeKey)) {
                  // Check if it's already in working via fuzzy match
                  let alreadyAdded = false
                  for (const w of working) {
                    if (matchesExerciseType(w.title, exerciseType)) {
                      alreadyAdded = true
                      break
                    }
                  }
                  
                  if (!alreadyAdded) {
                    console.log(`[exercise.working.quick] ✅ Adding intake exercise "${exerciseType}" directly to working`)
                    working.push({
                      title: exerciseType,
                      reason: `${exerciseType} can support ${summary.name} through improved cardiovascular health, stress reduction, and overall physical wellbeing. Regular ${exerciseType.toLowerCase()} helps maintain optimal body function and may contribute positively to this health goal.`,
                      summary: 'Selected in health intake',
                      lastLogged: 'From your health profile',
                    })
                  }
                } else {
                  console.log(`[exercise.working.quick] ⏭️ Skipping "${exerciseType}" - already in working`)
                }
              }
              
              console.log('[exercise.working.quick] working.length AFTER adding intake:', working.length)
              console.log('[exercise.working.quick] working items AFTER:', working.map(w => w.title))
              console.log('[exercise.working.quick] ========== DEBUG END ==========')
              
              const promotedFromSuggested: Array<{ title: string; reason: string; summary: string; lastLogged: string }> = []
              
              for (const suggestedItem of r.suggested) {
                // Check if already in working
                const alreadyInWorking = working.some(w => canonical(w.title) === canonical(suggestedItem.name))
                if (alreadyInWorking) continue
                
                // Check if it matches any intake exercise type
                for (const intakeType of intakeTypesArray) {
                  if (matchesExerciseType(suggestedItem.name, intakeType)) {
                    console.log(`[exercise.working.quick] ✓ Promoting suggested "${suggestedItem.name}" to working (matches intake "${intakeType}")`)
                    promotedFromSuggested.push({
                      title: suggestedItem.name,
                      reason: suggestedItem.reason,
                      summary: 'Selected in health intake',
                      lastLogged: 'From your health profile',
                    })
                    break
                  }
                }
              }
              
              if (promotedFromSuggested.length > 0) {
                working.push(...promotedFromSuggested)
                console.log(`[exercise.working.quick] Promoted ${promotedFromSuggested.length} items from suggested to working`)
              }
              
              console.log('[exercise.working.quick] Final workingActivities:', working.map(w => w.title))
              
              return working
            })(),
            suggestedActivities: r.suggested.filter((item) => {
              // Exclude items that match intake exerciseTypes (they should be in working)
              const intakeTypesArray = landing.profile.exerciseTypes ?? []
              for (const intakeType of intakeTypesArray) {
                if (matchesExerciseType(item.name, intakeType)) {
                  return false
                }
              }
              return true
            }).map((s) => ({ title: s.name, reason: s.reason, detail: s.protocol ?? null })),
            avoidActivities: r.avoid.map((a) => ({ title: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
      case 'nutrition': {
        const r = await map('nutrition')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'nutrition',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            workingFocus: [],
            suggestedFocus: r.suggested.map((s) => ({ title: s.name, reason: s.reason })),
            avoidFoods: r.avoid.map((a) => ({ name: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
      case 'lifestyle': {
        const r = await map('lifestyle')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'lifestyle',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            suggestedHabits: r.suggested.map((s) => ({ title: s.name, reason: s.reason })),
            avoidHabits: r.avoid.map((a) => ({ title: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
      case 'labs': {
        const r = await map('labs')
        if (!r) return null
        quick = {
          issue: summary,
          section: 'labs',
          generatedAt: new Date().toISOString(),
          confidence: 0.6,
          summary: r.summary || 'Initial guidance while we prepare a deeper report.',
          highlights: [],
          dataPoints: [],
          recommendations: [],
          mode,
          extras: {
            suggestedLabs: r.suggested.map((s) => ({ name: s.name, reason: s.reason, detail: s.protocol ?? null })),
            avoidLabs: r.avoid.map((a) => ({ name: a.name, reason: a.reason })),
            source: 'quick',
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            validated: false,
            degraded: true,
            cacheHit: false,
          },
        }
        break
      }
    }
    return quick as IssueSectionResult
  } catch (e) {
    console.warn('[insights.quick] failed', e)
    return null
  }
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

async function buildExerciseSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const hasLogs = context.exerciseLogs.length > 0
  const hasRecentLogs = hasRecentExerciseLogs(context.exerciseLogs)
  const normalizedLogs = context.exerciseLogs.map((log) => ({
    name: log.type,
    dosage: log.duration ? `${log.duration} min` : null,
    timing: [
      log.intensity ? `Intensity: ${log.intensity}` : null,
      `Logged ${relativeDays(log.createdAt)}`,
    ].filter(Boolean) as string[],
  }))

  console.time(`[insights.llm] exercise:${issue.slug}`)
  
  // Set minWorking to at least 1 if user has intake exerciseTypes, even without logs
  // But use fewer retries to avoid hanging if LLM can't find supportive exercises
  const hasIntakeExerciseTypes = (context.profile.exerciseTypes ?? []).length > 0
  const minWorking = normalizedLogs.length > 0 ? 1 : (hasIntakeExerciseTypes ? 1 : 0)
  const maxRetries = hasIntakeExerciseTypes && normalizedLogs.length === 0 ? 1 : 3
  
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedLogs,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      profile: context.profile,
      mode: 'exercise',
    },
    { minWorking, minSuggested: 4, minAvoid: 4, maxRetries }
  )
  console.timeEnd(`[insights.llm] exercise:${issue.slug}`)

  if (!llmResult) {
    // Degraded fallback
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: normalizedLogs,
        otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
        profile: context.profile,
        mode: 'exercise',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) {
      llmResult = degraded
    }
  }

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

  const logMap = new Map(normalizedLogs.map((log) => [canonical(log.name), log]))
  const kbSupportive: Array<{ title: string; detail: string; keywords?: string[] }> = []
  const kbAvoidActivities: Array<{ title: string; detail: string }> = []

  // Create map of intake exercise types for fallback when no logs exist
  const intakeExerciseTypes = new Set(
    (context.profile.exerciseTypes ?? []).map((type: string) => canonical(type))
  )

  // Logging for debugging intake exerciseTypes matching
  console.log('[exercise.working] Raw profile.exerciseTypes:', context.profile.exerciseTypes)
  console.log('[exercise.working] Canonicalized intakeExerciseTypes Set:', Array.from(intakeExerciseTypes))
  console.log('[exercise.working] LLM working items:', llmResult.working.map(w => ({ name: w.name, reason: w.reason })))
  console.log('[exercise.working] LLM suggested items:', llmResult.suggested.map(s => ({ name: s.name, reason: s.reason })))

  const workingActivities = llmResult.working
    .map((item) => {
      const itemKey = canonical(item.name)
      const match = logMap.get(itemKey)
      
      // Enhanced matching: check exact match first, then fuzzy match
      let hasIntakeMatch = intakeExerciseTypes.has(itemKey)
      if (!hasIntakeMatch) {
        // Try fuzzy matching against all intake exercise types
        for (const intakeType of context.profile.exerciseTypes ?? []) {
          if (matchesExerciseType(item.name, intakeType)) {
            hasIntakeMatch = true
            console.log(`[exercise.working] Fuzzy matched "${item.name}" to intake type "${intakeType}"`)
            break
          }
        }
      }
      
      // Log matching attempt
      console.log(`[exercise.working] Processing "${item.name}" (canonical: "${itemKey}"): logMatch=${!!match}, intakeMatch=${hasIntakeMatch}`)
      
      // If it matches a log, use log data
      if (match) {
        return {
          title: item.name,
          reason: item.reason,
          summary: item.dosage ?? match?.dosage ?? '',
          lastLogged: item.timing ?? match?.timing?.[0] ?? '',
        }
      }
      
      // If no log match but it matches intake exerciseTypes, include it with note about intake selection
      // This allows intake selections to appear as "working" when LLM identifies them as helpful
      if (hasIntakeMatch) {
        console.log(`[exercise.working] ✓ Matched intake exerciseType: "${item.name}"`)
        return {
          title: item.name,
          reason: item.reason,
          summary: 'Selected in health intake',
          lastLogged: 'From your health profile',
        }
      }
      
      return null
    })
    .filter(Boolean) as Array<{ title: string; reason: string; summary: string; lastLogged: string }>

  // Fallback: if LLM returns exercise in suggested bucket that matches intake exerciseTypes, promote it to working
  const intakeTypesArray = context.profile.exerciseTypes ?? []
  const promotedFromSuggested: Array<{ title: string; reason: string; summary: string; lastLogged: string }> = []
  
  console.log('[exercise.working] Checking suggested items for promotion. Intake types:', intakeTypesArray)
  
  for (const suggestedItem of llmResult.suggested) {
    // Check if already in workingActivities
    const alreadyInWorking = workingActivities.some(w => canonical(w.title) === canonical(suggestedItem.name))
    if (alreadyInWorking) {
      console.log(`[exercise.working] Skipping "${suggestedItem.name}" - already in working`)
      continue
    }
    
    // Check if it matches any intake exercise type (try multiple matching strategies)
    let matched = false
    let matchedIntakeType = ''
    
    for (const intakeType of intakeTypesArray) {
      // Strategy 1: Fuzzy matching (handles variations)
      if (matchesExerciseType(suggestedItem.name, intakeType)) {
        matched = true
        matchedIntakeType = intakeType
        console.log(`[exercise.working] ✓ Fuzzy matched suggested "${suggestedItem.name}" to intake "${intakeType}"`)
        break
      }
      
      // Strategy 2: Case-insensitive exact match (handles case differences)
      if (canonical(suggestedItem.name) === canonical(intakeType)) {
        matched = true
        matchedIntakeType = intakeType
        console.log(`[exercise.working] ✓ Exact matched suggested "${suggestedItem.name}" to intake "${intakeType}"`)
        break
      }
      
      // Strategy 3: Check if one contains the other (handles "Walking" vs "walking exercise")
      const suggestedLower = suggestedItem.name.toLowerCase()
      const intakeLower = intakeType.toLowerCase()
      if (suggestedLower.includes(intakeLower) || intakeLower.includes(suggestedLower)) {
        matched = true
        matchedIntakeType = intakeType
        console.log(`[exercise.working] ✓ Contains matched suggested "${suggestedItem.name}" to intake "${intakeType}"`)
        break
      }
    }
    
    if (matched) {
      console.log(`[exercise.working] ✓ Promoting suggested "${suggestedItem.name}" to working (matched intake "${matchedIntakeType}")`)
      promotedFromSuggested.push({
        title: suggestedItem.name, // Keep LLM's name but use intake match logic
        reason: suggestedItem.reason,
        summary: 'Selected in health intake',
        lastLogged: 'From your health profile',
      })
    } else {
      console.log(`[exercise.working] ✗ No match for suggested "${suggestedItem.name}" against intake types:`, intakeTypesArray)
    }
  }
  
  if (promotedFromSuggested.length > 0) {
    workingActivities.push(...promotedFromSuggested)
    console.log(`[exercise.working] ✅ Promoted ${promotedFromSuggested.length} items from suggested to working:`, promotedFromSuggested.map(p => p.title))
  } else if (intakeTypesArray.length > 0) {
    console.log(`[exercise.working] ⚠️ WARNING: No suggested items matched intake types. Intake types:`, intakeTypesArray, 'Suggested items:', llmResult.suggested.map(s => s.name))
  }

  console.log('[exercise.working] Final workingActivities:', workingActivities.map(w => w.title))

  // Deterministic enrichment: if AI returns zero or too few working items, top up using logs matched to KB supportive exercises
  if (workingActivities.length < 2 && context.exerciseLogs.length > 0) {
    if (kbSupportive.length) {
      const seen = new Set<string>(workingActivities.map((activity) => canonical(activity.title)))
      const enriched: Array<{ title: string; reason: string; summary: string; lastLogged: string }> = []
      // Latest log per type
      const latestByType = new Map<string, typeof context.exerciseLogs[number]>()
      for (const log of [...context.exerciseLogs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
        const key = canonical(log.type)
        if (!latestByType.has(key)) latestByType.set(key, log)
      }
      const tryMatch = (logName: string, act: { title: string; detail: string; keywords?: string[] }) => {
        const lname = canonical(logName)
        const titleKey = canonical(act.title)
        if (lname === titleKey) return true
        if (act.keywords && act.keywords.some((kw) => lname.includes(canonical(kw)))) return true
        const tokens = titleKey.split(/\s+/).filter((t) => t.length >= 4)
        return tokens.some((t) => lname.includes(t))
      }
      const needed = Math.max(4 - workingActivities.length, 0)
      if (needed > 0) {
        for (const [key, log] of Array.from(latestByType.entries())) {
          const match = kbSupportive.find((a) => tryMatch(log.type, a))
          if (!match || seen.has(key)) continue
          seen.add(key)
          const summaryParts: string[] = []
          if (log.duration) summaryParts.push(`${log.duration} min`)
          if (log.intensity) summaryParts.push(`Intensity: ${log.intensity}`)
          const summary = summaryParts.join(' • ')
          enriched.push({
            title: log.type,
            reason: match.detail ?? 'Logged activity aligns with supportive exercise guidance.',
            summary,
            lastLogged: `Logged ${relativeDays(log.createdAt)}`,
          })
          if (enriched.length >= needed) break
        }
      }
      if (enriched.length) {
        workingActivities.push(...enriched)
      }
    }
  }

  const novelSuggestedActivities = llmResult.suggested.filter((item) => {
    // Exclude items that match logs
    if (logMap.has(canonical(item.name))) return false
    // Exclude items that were promoted to working
    return !promotedFromSuggested.some(p => canonical(p.title) === canonical(item.name))
  })

  let suggestedActivities = novelSuggestedActivities.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  const kbSuggestedPrimary: Array<{ title: string; reason: string; detail: string | null }> = []
  const kbSuggestedSecondary: Array<{ title: string; reason: string; detail: string | null }> = []
  if (kbSupportive.length) {
    for (const act of kbSupportive) {
      const candidate = {
        title: act.title,
        reason: act.detail,
        detail: null,
      }
      const key = canonical(candidate.title)
      if (!logMap.has(key)) {
        kbSuggestedPrimary.push(candidate)
      } else {
        kbSuggestedSecondary.push(candidate)
      }
    }
  }
  suggestedActivities = ensureMin(suggestedActivities, [...kbSuggestedPrimary, ...kbSuggestedSecondary], 4)

  const avoidFromLLM = llmResult.avoid.map((item) => ({
    title: item.name,
    reason: item.reason,
  }))

  const avoidFallback = kbAvoidActivities.map((item) => ({
    title: item.title,
    reason: item.detail,
  }))

  const avoidActivities = ensureMin(avoidFromLLM, avoidFallback, 4)

  const validated = suggestedActivities.length >= 4 && avoidActivities.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!hasLogs) {
    summary = 'No exercise sessions are logged yet—use the suggestions below to build your starting plan.'
  } else if (!hasRecentLogs) {
    summary = 'No recent exercise entries—log this week’s training so the AI can flag what’s truly working.'
  } else {
    summary = 'AI-generated exercise guidance ready below.'
  }

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

  if (!hasLogs) {
    highlights.unshift({
      title: 'Add your first workout',
      detail: 'Log a strength, cardio, or recovery session so the AI can anchor future guidance.',
      tone: 'warning',
    })
  } else if (!hasRecentLogs) {
    highlights.unshift({
      title: 'Refresh recent training data',
      detail: 'Capture this week’s sessions to keep recommendations in sync with your actual routine.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or coach'],
        priority: rec.priority,
      }))
    : hasLogs
    ? [
        {
          title: 'Plan next week of training',
          description: 'Schedule supportive sessions and monitor recovery.',
          actions: ['Block training slots', 'Log how your body responds'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Log your first session',
          description: 'Record at least one workout this week so the AI can highlight wins and cautions.',
          actions: ['Open Health Tracking → Exercise', 'Add session duration and intensity'],
          priority: 'now',
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
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
    },
  }
}

async function buildSupplementsSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const supplements = context.supplements
  const hasSupplements = supplements.length > 0
  const hasRecentSupplements = hasRecentSupplementActivity(supplements)

  const normalizedSupplements = supplements.map((supp) => ({
    name: supp.name,
    dosage: supp.dosage ?? null,
    timing: Array.isArray(supp.timing) ? supp.timing : [],
  }))

  console.time(`[insights.llm] supplements:${issue.slug}`)
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedSupplements,
      otherItems: context.medications.map((med) => ({ name: med.name, dosage: med.dosage ?? null })),
      profile: context.profile,
      mode: 'supplements',
    },
    { minWorking: normalizedSupplements.length > 0 ? 1 : 0, minSuggested: 4, minAvoid: 4 }
  )
  console.timeEnd(`[insights.llm] supplements:${issue.slug}`)

  if (!llmResult) {
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: normalizedSupplements,
        otherItems: context.medications.map((med) => ({ name: med.name, dosage: med.dosage ?? null })),
        profile: context.profile,
        mode: 'supplements',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) llmResult = degraded
  }

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

  const kbAddLocal: Array<{ pattern: RegExp; title?: string; why: string; suggested?: string }> = []
  const kbAvoidLocal: Array<{ pattern: RegExp; title?: string; why: string }> = []
  // Populate KB fallbacks for this issue to guarantee 4/4
  try {
    const key = pickKnowledgeKey(issue.name)
    if (key && ISSUE_KNOWLEDGE_BASE[key]) {
      const kb = ISSUE_KNOWLEDGE_BASE[key]
      if (Array.isArray(kb.helpfulMedications)) kbAddLocal.push(...kb.helpfulMedications)
      if (Array.isArray(kb.avoidMedications)) kbAvoidLocal.push(...kb.avoidMedications)
    }
  } catch {}
  // Populate KB fallbacks for this issue to guarantee 4/4
  try {
    const key = pickKnowledgeKey(issue.name)
    if (key && ISSUE_KNOWLEDGE_BASE[key]) {
      const kb = ISSUE_KNOWLEDGE_BASE[key]
      if (Array.isArray(kb.helpfulSupplements)) kbAddLocal.push(...kb.helpfulSupplements)
      if (Array.isArray(kb.avoidSupplements)) kbAvoidLocal.push(...kb.avoidSupplements)
    }
  } catch {}

  const supportiveDetails = llmResult.working
    .map((item) => {
      const match = supplementMap.get(canonical(item.name))
      if (!match) return null
      return {
        name: item.name,
        reason: item.reason,
        dosage: item.dosage ?? match?.dosage ?? null,
        timing: parseTiming(item.timing, match?.timing ?? []),
      }
    })
    .filter(Boolean) as Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>

  // AI-based fallback: if LLM didn't properly match logged supplements, evaluate them directly
  if (supportiveDetails.length === 0 && normalizedSupplements.length > 0) {
    console.log(`[supplements] LLM didn't match logged supplements, using AI evaluator fallback for ${normalizedSupplements.length} items`)
    const evaluated = await evaluateFocusItemsForIssue({
      issueName: issue.name,
      issueSummary: issue.highlight,
      mode: 'supplements',
      focusItems: normalizedSupplements,
    })
    if (evaluated && evaluated.length > 0) {
      // Map evaluated results to exact logged names with dosage/timing
      for (const item of evaluated) {
        const logged = supplementMap.get(canonical(item.name))
        if (logged) {
          supportiveDetails.push({
            name: logged.name, // Use exact logged name
            reason: item.reason,
            dosage: item.dosage ?? logged.dosage ?? null,
            timing: parseTiming(item.timing, logged.timing ?? []),
          })
        }
      }
      console.log(`[supplements] AI evaluator found ${supportiveDetails.length} supportive supplements`)
    }
  }

  // AI-based augmentation: if some logged supplements are still missing from working, evaluate only the missing ones
  if (normalizedSupplements.length > 0) {
    const present = new Set(supportiveDetails.map((s) => canonical(s.name)))
    const missing = normalizedSupplements.filter((supp) => !present.has(canonical(supp.name)))
    if (missing.length > 0) {
      console.log(`[supplements] Evaluating ${missing.length} missing logged supplements for potential support`)
      const evaluatedMissing = await evaluateFocusItemsForIssue({
        issueName: issue.name,
        issueSummary: issue.highlight,
        mode: 'supplements',
        focusItems: missing,
      })
      if (evaluatedMissing && evaluatedMissing.length > 0) {
        for (const item of evaluatedMissing) {
          const key = canonical(item.name)
          if (present.has(key)) continue
          const logged = supplementMap.get(key)
          if (!logged) continue
          supportiveDetails.push({
            name: logged.name,
            reason: item.reason,
            dosage: item.dosage ?? logged.dosage ?? null,
            timing: parseTiming(item.timing, logged.timing ?? []),
          })
          present.add(key)
        }
        console.log(`[supplements] Added ${supportiveDetails.length} total supportive supplements after augmentation`)
      }
    }
  }

  // Legacy KB fallback (only if AI evaluator also found nothing)
  if (supportiveDetails.length === 0 && normalizedSupplements.length > 0) {
    const enriched = normalizedSupplements
      .map((supp) => {
        const match = kbAddLocal.find((k) => k.pattern.test(supp.name))
        if (!match) return null
        return {
          name: supp.name,
          reason: match.why,
          dosage: supp.dosage ?? null,
          timing: parseTiming(null, supp.timing ?? []),
        }
      })
      .filter(Boolean) as Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>
    if (enriched.length) {
      supportiveDetails.push(...enriched.slice(0, 4))
    }
  }

  const novelSuggestions = llmResult.suggested.filter((item) => !supplementMap.has(canonical(item.name)))

  let suggestedAdditions = novelSuggestions.map((item) => ({
    title: item.name,
    reason: item.reason,
    suggestion: item.protocol ?? null,
    alreadyCovered: false,
  }))

  const kbSuggestionCandidates = [
    ...kbAddLocal.map((entry) => ({
      title: entry.title ?? displayFromPattern(entry.pattern),
      reason: entry.why,
      suggestion: entry.suggested ?? null,
      alreadyCovered: normalizedSupplements.some((supp) => entry.pattern.test(supp.name)),
    })),
    // Include gap suggestions (non-regex) if provided for this issue
    ...(() => {
      const out: Array<{ title: string; reason: string; suggestion: string | null; alreadyCovered: boolean }> = []
      try {
        const key = pickKnowledgeKey(issue.name)
        if (key && ISSUE_KNOWLEDGE_BASE[key]?.gapSupplements) {
          for (const g of ISSUE_KNOWLEDGE_BASE[key]!.gapSupplements!) {
            out.push({
              title: g.title,
              reason: g.why,
              suggestion: g.suggested ?? null,
              alreadyCovered: false,
            })
          }
        }
      } catch {}
      return out
    })(),
  ]

  const fallbackSuggestions = kbSuggestionCandidates.filter((item) => !item.alreadyCovered)
  const coveredSuggestions = kbSuggestionCandidates.filter((item) => item.alreadyCovered)
  suggestedAdditions = ensureMin(suggestedAdditions, [...fallbackSuggestions, ...coveredSuggestions], 4)

  const avoidFromLLM = llmResult.avoid
    .map((item) => {
      const match = supplementMap.get(canonical(item.name))
      return {
        name: item.name,
        reason: item.reason,
        dosage: match?.dosage ?? null,
        timing: match?.timing ?? [],
      }
    })
    // Keep only true supplements (allow logged or names that look supplement-like).
    .filter((entry) => {
      const isLogged = supplementMap.has(canonical(entry.name))
      return isLogged || looksSupplementLike(entry.name) || looksSupplementLike(entry.reason)
    })

  const avoidFallback = kbAvoidLocal.map((entry) => ({
    name: entry.title ?? displayFromPattern(entry.pattern),
    reason: entry.why,
    dosage: null,
    timing: [],
  }))

  const avoidList = ensureMin(avoidFromLLM, avoidFallback, 4)

  const validated = suggestedAdditions.length >= 4 && avoidList.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!hasSupplements) {
    summary = 'No supplements are logged yet—use the suggested additions below to speak with your clinician about next steps.'
  } else if (!hasRecentSupplements) {
    summary = 'No recent supplement updates—log dose or timing changes and review the suggestions below to keep your plan dialled in.'
  } else if (supportiveDetails.length) {
    summary = `You have ${supportiveDetails.length} supplement${supportiveDetails.length === 1 ? '' : 's'} supporting ${issue.name}.`
  } else {
    summary = 'AI-generated guidance ready below.'
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician'],
        priority: rec.priority,
      }))
    : hasSupplements
    ? [
        {
          title: 'Review supplement plan with your clinician',
          description: 'Discuss current regimen and adjust based on response and labs.',
          actions: ['Bring this summary to your next consult', 'Track symptom response weekly'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Log your current supplements',
          description: 'Capture the products you’re already taking so we can highlight what is working.',
          actions: ['Open Health Setup → Supplements', 'Add each supplement with dose and timing'],
          priority: 'now',
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

  if (!hasSupplements) {
    highlights.unshift({
      title: 'Log your current supplements',
      detail: 'Recording each product with dose and timing unlocks “What’s Working” tracking.',
      tone: 'warning',
    })
  } else if (!hasRecentSupplements) {
    highlights.unshift({
      title: 'Update recent supplement changes',
      detail: 'Add any new products or dose adjustments so guidance reflects your current stack.',
      tone: 'warning',
    })
  }

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
      hasLogged: hasSupplements,
      hasRecentUpdates: hasRecentSupplements,
      source: 'llm',
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
    } as Record<string, unknown>,
  }
}

async function buildMedicationsSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const medications = context.medications
  const hasMedications = medications.length > 0
  const hasRecentMedicationUpdates = hasRecentMedicationActivity(medications)

  const normalizedMeds = medications.map((med) => ({
    name: med.name,
    dosage: med.dosage ?? null,
    timing: Array.isArray(med.timing) ? med.timing : [],
  }))

  console.time(`[insights.llm] medications:${issue.slug}`)
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedMeds,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      profile: context.profile,
      mode: 'medications',
    },
    { minWorking: normalizedMeds.length > 0 ? 1 : 0, minSuggested: 4, minAvoid: 4 }
  )
  console.timeEnd(`[insights.llm] medications:${issue.slug}`)

  if (!llmResult) {
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: normalizedMeds,
        otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
        profile: context.profile,
        mode: 'medications',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) llmResult = degraded
  }

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

  const medMap = new Map(normalizedMeds.map((med) => [canonical(med.name), med]))
  const supplementNameSet = new Set(
    context.supplements.map((supp) => canonical(supp.name))
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

  const kbAddLocal: Array<{ pattern: RegExp; title?: string; why: string; suggested?: string }> = []
  const kbAvoidLocal: Array<{ pattern: RegExp; title?: string; why: string }> = []

  const supportiveDetails = llmResult.working
    .map((item) => {
      const nameKey = canonical(item.name)
      if (supplementNameSet.has(nameKey) || looksSupplementLike(item.name) || looksSupplementLike(item.reason)) {
        return null
      }
      const match = medMap.get(nameKey)
      if (!match) return null
      return {
        name: item.name,
        reason: item.reason,
        dosage: item.dosage ?? match?.dosage ?? null,
        timing: parseTiming(item.timing, match?.timing ?? []),
      }
    })
    .filter(Boolean) as Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>

  // AI-based fallback: if LLM didn't properly match logged medications, evaluate them directly
  if (supportiveDetails.length === 0 && normalizedMeds.length > 0) {
    console.log(`[medications] LLM didn't match logged medications, using AI evaluator fallback for ${normalizedMeds.length} items`)
    const evaluated = await evaluateFocusItemsForIssue({
      issueName: issue.name,
      issueSummary: issue.highlight,
      mode: 'medications',
      focusItems: normalizedMeds,
    })
    if (evaluated && evaluated.length > 0) {
      // Map evaluated results to exact logged names with dosage/timing, filtering out supplements
      for (const item of evaluated) {
        const nameKey = canonical(item.name)
        if (supplementNameSet.has(nameKey) || looksSupplementLike(item.name)) continue
        const logged = medMap.get(nameKey)
        if (logged) {
          supportiveDetails.push({
            name: logged.name, // Use exact logged name
            reason: item.reason,
            dosage: item.dosage ?? logged.dosage ?? null,
            timing: parseTiming(item.timing, logged.timing ?? []),
          })
        }
      }
      console.log(`[medications] AI evaluator found ${supportiveDetails.length} supportive medications`)
    }
  }

  // AI-based augmentation: if some logged medications are still missing from working, evaluate only the missing ones
  if (normalizedMeds.length > 0) {
    const present = new Set(supportiveDetails.map((s) => canonical(s.name)))
    const missing = normalizedMeds.filter((med) => !present.has(canonical(med.name)))
    if (missing.length > 0) {
      console.log(`[medications] Evaluating ${missing.length} missing logged medications for potential support`)
      const evaluatedMissing = await evaluateFocusItemsForIssue({
        issueName: issue.name,
        issueSummary: issue.highlight,
        mode: 'medications',
        focusItems: missing,
      })
      if (evaluatedMissing && evaluatedMissing.length > 0) {
        for (const item of evaluatedMissing) {
          const key = canonical(item.name)
          if (present.has(key)) continue
          if (supplementNameSet.has(key) || looksSupplementLike(item.name)) continue
          const logged = medMap.get(key)
          if (!logged) continue
          supportiveDetails.push({
            name: logged.name,
            reason: item.reason,
            dosage: item.dosage ?? logged.dosage ?? null,
            timing: parseTiming(item.timing, logged.timing ?? []),
          })
          present.add(key)
        }
        console.log(`[medications] Added ${supportiveDetails.length} total supportive medications after augmentation`)
      }
    }
  }

  // Legacy KB fallback (only if AI evaluator also found nothing)
  if (supportiveDetails.length === 0 && normalizedMeds.length > 0) {
    if (kbAddLocal.length) {
      const seen = new Set<string>()
      const enriched = normalizedMeds
        .map((med) => {
          const key = canonical(med.name)
          if (supplementNameSet.has(key) || looksSupplementLike(med.name)) return null
          const match = kbAddLocal.find((k) => k.pattern.test(med.name))
          if (!match || seen.has(key)) return null
          seen.add(key)
          return {
            name: med.name,
            reason: match.why,
            dosage: med.dosage ?? null,
            timing: parseTiming(null, med.timing ?? []),
          }
        })
        .filter(Boolean) as Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>
      if (enriched.length) {
        supportiveDetails.push(...enriched.slice(0, 4))
      }
    }
  }

  const novelSuggestions = llmResult.suggested.filter((item) => {
    const nameKey = canonical(item.name)
    if (supplementNameSet.has(nameKey)) return false
    if (looksSupplementLike(item.name) || looksSupplementLike(item.reason)) return false
    return !medMap.has(nameKey)
  })

  let suggestedAdditions = novelSuggestions.map((item) => ({
    title: item.name,
    reason: item.reason,
    suggestion: item.protocol ?? null,
    alreadyCovered: false,
  }))

  const kbSuggestionCandidates = [
    ...kbAddLocal.map((entry) => ({
      title: entry.title ?? displayFromPattern(entry.pattern),
      reason: entry.why,
      suggestion: entry.suggested ?? null,
      alreadyCovered: normalizedMeds.some((med) => entry.pattern.test(med.name)),
    })),
    // Include gap medication suggestions when present
    ...(() => {
      const out: Array<{ title: string; reason: string; suggestion: string | null; alreadyCovered: boolean }> = []
      try {
        const key = pickKnowledgeKey(issue.name)
        if (key && ISSUE_KNOWLEDGE_BASE[key]?.gapMedications) {
          for (const g of ISSUE_KNOWLEDGE_BASE[key]!.gapMedications!) {
            out.push({ title: g.title, reason: g.why, suggestion: g.suggested ?? null, alreadyCovered: false })
          }
        }
      } catch {}
      return out
    })(),
  ]

  const fallbackSuggestions = kbSuggestionCandidates.filter((item) => !item.alreadyCovered)
  const coveredSuggestions = kbSuggestionCandidates.filter((item) => item.alreadyCovered)
  suggestedAdditions = ensureMin(suggestedAdditions, [...fallbackSuggestions, ...coveredSuggestions], 4)

  const avoidFromLLM = llmResult.avoid
    .map((item) => {
      const nameKey = canonical(item.name)
      if (supplementNameSet.has(nameKey) || looksSupplementLike(item.name) || looksSupplementLike(item.reason)) {
        return null
      }
      const match = medMap.get(nameKey)
      return {
        name: item.name,
        reason: item.reason,
        dosage: match?.dosage ?? null,
        timing: match?.timing ?? [],
      }
    })
    .filter(Boolean) as Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>

  const avoidFallback = kbAvoidLocal.map((entry) => ({
    name: entry.title ?? displayFromPattern(entry.pattern),
    reason: entry.why,
    dosage: null,
    timing: [],
  }))

  const avoidList = ensureMin(avoidFromLLM, avoidFallback, 4)

  const hasAnyMedicationGuidance =
    supportiveDetails.length + suggestedAdditions.length + avoidList.length > 0

  const validated = suggestedAdditions.length >= 4 && avoidList.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!hasMedications) {
    summary = 'No medications are logged yet—use the suggestions below to discuss options with your prescriber.'
  } else if (!hasRecentMedicationUpdates) {
    summary = 'No recent medication updates—log new prescriptions or dose changes and review the suggestions below.'
  } else if (supportiveDetails.length) {
    summary = `You have ${supportiveDetails.length} medication${supportiveDetails.length === 1 ? '' : 's'} aligned with ${issue.name}.`
  } else if (!hasAnyMedicationGuidance) {
    summary = 'No medication-specific guidance is available—log new prescriptions or consult your clinician.'
  } else {
    summary = 'AI-generated medication guidance ready below.'
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Coordinate changes with your clinician'],
        priority: rec.priority,
      }))
    : hasMedications
    ? [
        {
          title: 'Review therapy plan',
          description: 'Align dosing and timing with symptom response and labs.',
          actions: ['Discuss adjustments with your clinician', 'Track response weekly'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Log active prescriptions',
          description: 'Add medications with dose and timing so we can monitor what is supporting this issue.',
          actions: ['Open Health Setup → Medications', 'Add prescription and OTC therapies'],
          priority: 'now',
        },
      ]

  const highlights: SectionHighlight[] = [
    {
      title: "What's working",
      detail: supportiveDetails.length
        ? supportiveDetails.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : 'No medications in your log are clearly supporting this issue yet.',
      tone: supportiveDetails.length ? 'positive' : 'neutral',
    },
    {
      title: 'Opportunities',
      detail: suggestedAdditions.length
        ? suggestedAdditions.map((item) => `${item.title}: ${item.reason}`).join('; ')
        : medications.length
        ? 'No additional medications to suggest—discuss options with your clinician if symptoms persist.'
        : 'Add prescribed or OTC medications to your log so the AI can surface targeted options.',
      tone: suggestedAdditions.length ? 'neutral' : 'positive',
    },
    {
      title: 'Cautions',
      detail: avoidList.length
        ? avoidList.map((item) => `${item.name}: ${item.reason}`).join('; ')
        : medications.length
        ? 'No medications flagged for caution right now—continue monitoring with your clinician.'
        : 'Once medications are logged, cautions will show here.',
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
      hasLogged: hasMedications,
      hasRecentUpdates: hasRecentMedicationUpdates,
      source: 'llm',
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
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

async function buildLabsSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const blood = context.bloodResults

  const labItems = (blood?.markers ?? []).map((marker) => ({
    name: marker.name,
    dosage: marker.value !== undefined ? `${marker.value}${marker.unit ? ` ${marker.unit}` : ''}` : null,
    timing: marker.reference ? [marker.reference] : [],
  }))

  console.time(`[insights.llm] labs:${issue.slug}`)
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: labItems,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      profile: context.profile,
      mode: 'labs',
    },
    { minWorking: labItems.length > 0 ? 1 : 0, minSuggested: 4, minAvoid: 4 }
  )
  console.timeEnd(`[insights.llm] labs:${issue.slug}`)

  if (!llmResult) {
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: labItems,
        otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
        profile: context.profile,
        mode: 'labs',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) llmResult = degraded
  }

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

  const validated = suggestedLabs.length >= 4 && avoidLabs.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!labItems.length) {
    summary = 'No lab markers are logged yet—use the suggestions below to decide which tests to order next.'
  } else {
    summary = 'AI-generated lab guidance ready below.'
  }

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

  if (!labItems.length) {
    highlights.unshift({
      title: 'Upload recent labs',
      detail: 'Add PDFs or enter markers so we can track progress and flag gaps.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician'],
        priority: rec.priority,
      }))
    : labItems.length
    ? [
        {
          title: 'Coordinate lab follow-up',
          description: 'Use the suggested labs to plan your next panel.',
          actions: ['Schedule tests with your clinician', 'Log results once available'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Add your latest labs',
          description: 'Upload lab PDFs or enter key markers so we can track trends for this issue.',
          actions: ['Open Labs workspace', 'Upload PDF or enter markers manually'],
          priority: 'now',
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
      hasLoggedLabs: labItems.length > 0,
      source: 'llm',
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
    },
  }
}

async function buildNutritionSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
  const now = new Date().toISOString()
  const foods: Array<{ name?: string; meal?: string; calories?: number }> = context.todaysFoods.length
    ? context.todaysFoods
    : context.foodLogs.slice(0, 10).map((log) => ({
        name: log.name,
        meal: log.description ?? undefined,
        calories: undefined,
      }))

  const hasRecentFoodData = hasRecentFoodLogs(context.foodLogs) || Boolean(context.todaysFoods.length)
  const hasLoggedFoods = foods.length > 0

  const normalizedFoods = foods.map((food, idx) => ({
    name: food.name || food.meal || `Entry ${idx + 1}`,
    dosage: food.calories ? `${food.calories} kcal` : food.meal ?? null,
    timing: food.meal ? [food.meal] : [],
  }))

  const nonFoodNameSet = new Set(
    [
      ...context.supplements.map((supp) => canonical(supp.name)),
      ...context.medications.map((med) => canonical(med.name)),
    ]
  )

  console.time(`[insights.llm] nutrition:${issue.slug}`)
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: normalizedFoods,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      profile: context.profile,
      mode: 'nutrition',
    },
    { minWorking: hasLoggedFoods ? 1 : 0, minSuggested: 4, minAvoid: 4 }
  )
  console.timeEnd(`[insights.llm] nutrition:${issue.slug}`)

  if (!llmResult) {
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: normalizedFoods,
        otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
        profile: context.profile,
        mode: 'nutrition',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) llmResult = degraded
  }

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

  const allowFoodName = (name: string, reason: string) => {
    const nameKey = canonical(name)
    if (nonFoodNameSet.has(nameKey)) return false
    if (looksSupplementLike(name) || looksSupplementLike(reason)) return false
    if (looksFoodLike(name)) return true
    return name.split(' ').length >= 1 && !looksSupplementLike(name)
  }

  const foodNameSet = new Set(normalizedFoods.map((f) => canonical(f.name)))
  let workingFocus = llmResult.working
    .map((item) => ({
      title: item.name,
      reason: item.reason,
      example: item.dosage ?? item.timing ?? '',
    }))
    // Only show foods the user actually logged as "working".
    .filter((item) => allowFoodName(item.title, item.reason) && foodNameSet.has(canonical(item.title)))

  // AI-based fallback: if LLM didn't properly match logged foods, evaluate them directly
  if (workingFocus.length === 0 && normalizedFoods.length > 0 && hasLoggedFoods) {
    console.log(`[nutrition] LLM didn't match logged foods, using AI evaluator fallback for ${normalizedFoods.length} items`)
    const evaluated = await evaluateFocusItemsForIssue({
      issueName: issue.name,
      issueSummary: issue.highlight,
      mode: 'nutrition',
      focusItems: normalizedFoods,
    })
    if (evaluated && evaluated.length > 0) {
      // Map evaluated results to exact logged food names
      for (const item of evaluated) {
        const nameKey = canonical(item.name)
        if (!allowFoodName(item.name, item.reason)) continue
        if (foodNameSet.has(nameKey)) {
          const logged = normalizedFoods.find((f) => canonical(f.name) === nameKey)
          if (logged) {
            workingFocus.push({
              title: logged.name, // Use exact logged name
              reason: item.reason,
              example: item.dosage ?? item.timing ?? logged.dosage ?? '',
            })
          }
        }
      }
      console.log(`[nutrition] AI evaluator found ${workingFocus.length} supportive foods`)
    }
  }

  // AI-based augmentation: evaluate any remaining logged foods not yet included
  if (normalizedFoods.length > 0 && hasLoggedFoods) {
    const present = new Set(workingFocus.map((w) => canonical(w.title)))
    const missing = normalizedFoods.filter((f) => !present.has(canonical(f.name)))
    if (missing.length > 0) {
      console.log(`[nutrition] Evaluating ${missing.length} missing logged foods for potential support`)
      const evaluatedMissing = await evaluateFocusItemsForIssue({
        issueName: issue.name,
        issueSummary: issue.highlight,
        mode: 'nutrition',
        focusItems: missing,
      })
      if (evaluatedMissing && evaluatedMissing.length > 0) {
        for (const item of evaluatedMissing) {
          const key = canonical(item.name)
          if (present.has(key)) continue
          if (!allowFoodName(item.name, item.reason)) continue
          const logged = normalizedFoods.find((f) => canonical(f.name) === key)
          if (!logged) continue
          workingFocus.push({
            title: logged.name,
            reason: item.reason,
            example: item.dosage ?? item.timing ?? logged.dosage ?? '',
          })
          present.add(key)
        }
        console.log(`[nutrition] Added ${workingFocus.length} total working foods after augmentation`)
      }
    }
  }

  const suggestedFocus = llmResult.suggested
    .map((item) => ({ title: item.name, reason: item.reason, detail: item.protocol ?? null }))
    .filter((item) => allowFoodName(item.title, item.reason))
  let avoidFoods = llmResult.avoid
    .map((item) => ({ name: item.name, reason: item.reason }))
    .filter((item) => allowFoodName(item.name, item.reason))

  // Deterministic top-ups to guarantee 4/4 after domain filtering
  try {
    const kbKey = pickKnowledgeKey(issue.name)
    const kbBase = kbKey ? ISSUE_KNOWLEDGE_BASE[kbKey] : undefined
    const kbNutrition = (kbBase?.nutritionFocus ?? [])
      .map((n) => ({ title: n.title, reason: n.detail, detail: null as string | null }))
    const kbAvoidFoods = (kbBase?.avoidFoods ?? [])
      .map((n) => ({ name: n.title, reason: n.detail }))

    // Only foods; ensure we keep any LLM items first, then top-up from KB
    const fbSuggested = kbNutrition.filter((n) => allowFoodName(n.title, n.reason))
    const fbAvoid = kbAvoidFoods.filter((n) => allowFoodName(n.name, n.reason))

    const suggestedFocusTopped = ensureMin(suggestedFocus, fbSuggested, 4)
    const avoidFoodsTopped = ensureMin(avoidFoods, fbAvoid, 4)

    // Reassign to maintain references used below
    ;(suggestedFocus as any) = suggestedFocusTopped
    avoidFoods = avoidFoodsTopped
  } catch {}

  const validated = suggestedFocus.length >= 4 && avoidFoods.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!hasLoggedFoods) {
    summary = 'No meals are logged yet—use the suggested foods below to build your first grocery list.'
  } else if (!hasRecentFoodData) {
    summary = 'No recent food entries—log today’s meals so we can track what is working while you try the suggestions below.'
  } else if (!workingFocus.length && !suggestedFocus.length && !avoidFoods.length) {
    summary = 'Current food logs do not show clear support for this issue. Consider logging fresh meals for better guidance.'
  } else {
    summary = 'AI-generated nutrition guidance ready below.'
  }

  const highlights: SectionHighlight[] = [
    {
      title: 'Nutrition wins',
      detail: workingFocus.length
        ? workingFocus.map((focus) => `${focus.title}: ${focus.reason}`).join('; ')
        : hasLoggedFoods
        ? 'None of the foods you are currently eating are clearly helping this issue.'
        : 'Log meals so we can highlight what is already working.',
      tone: workingFocus.length ? 'positive' : hasLoggedFoods ? 'neutral' : 'warning',
    },
    {
      title: 'Add to your plan',
      detail: suggestedFocus.length
        ? suggestedFocus.map((focus) => `${focus.title}: ${focus.reason}`).join('; ')
        : hasLoggedFoods
        ? 'No new foods to suggest—log additional meals or discuss options with a clinician.'
        : 'Add meals to your diary so the AI can recommend supportive foods.',
      tone: suggestedFocus.length ? 'neutral' : hasLoggedFoods ? 'neutral' : 'warning',
    },
    {
      title: 'Foods to monitor',
      detail: avoidFoods.length
        ? avoidFoods.map((food) => `${food.name}: ${food.reason}`).join('; ')
        : hasLoggedFoods
        ? 'No foods flagged as problematic right now—keep logging meals.'
        : 'Problem foods will appear here once meals are logged.',
      tone: avoidFoods.length ? 'warning' : hasLoggedFoods ? 'neutral' : 'warning',
    },
  ]

  if (!hasLoggedFoods) {
    highlights.unshift({
      title: 'Log your meals',
      detail: 'Record breakfast, lunch, dinner, and snacks so the AI can evaluate your baseline nutrition.',
      tone: 'warning',
    })
  } else if (!hasRecentFoodData) {
    highlights.unshift({
      title: 'Update today’s meals',
      detail: 'Fresh meal logs keep “What’s Working” accurate while you trial the suggested foods.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or dietitian'],
        priority: rec.priority,
      }))
    : hasLoggedFoods
    ? [
        {
          title: 'Plan upcoming meals',
          description: 'Use the suggested foods to balance your next grocery list.',
          actions: ['Add suggested foods to your meal plan', 'Track symptom response weekly'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Start a food log',
          description: 'Capture at least one full day of eating so the AI can track what is supporting this issue.',
          actions: ['Open Food Diary', 'Log breakfast, lunch, dinner, and snacks'],
          priority: 'now',
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
      hasLoggedFoods,
      hasRecentFoodData,
      source: 'llm',
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
    },
  }
}

async function buildLifestyleSection(
  issue: IssueSummary,
  context: UserInsightContext,
  _options: { forceRefresh: boolean }
): Promise<BaseSectionResult> {
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

  const hasLifestyleSignals = lifestyleItems.length > 0
  console.time(`[insights.llm] lifestyle:${issue.slug}`)
  let llmResult = await generateSectionInsightsFromLLM(
    {
      issueName: issue.name,
      issueSummary: issue.highlight,
      items: lifestyleItems,
      otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
      profile: context.profile,
      mode: 'lifestyle',
    },
    { minWorking: lifestyleItems.length > 0 ? 1 : 0, minSuggested: 4, minAvoid: 4 }
  )
  console.timeEnd(`[insights.llm] lifestyle:${issue.slug}`)

  if (!llmResult) {
    const degraded = await generateDegradedSection(
      {
        issueName: issue.name,
        issueSummary: issue.highlight,
        items: lifestyleItems,
        otherItems: context.supplements.map((supp) => ({ name: supp.name, dosage: supp.dosage ?? null })),
        profile: context.profile,
        mode: 'lifestyle',
      },
      { minSuggested: 4, minAvoid: 4 }
    )
    if (degraded) llmResult = degraded
  }

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

  // "What's Working" must only come from real logs; lifestyle has no logs → keep empty
  let workingHabits: Array<{ title: string; reason: string; detail: string }> = []

  let suggestedHabits = llmResult.suggested.map((item) => ({
    title: item.name,
    reason: item.reason,
    detail: item.protocol ?? null,
  }))

  let avoidHabits = llmResult.avoid.map((item) => ({
    title: item.name,
    reason: item.reason,
  }))

  // Deterministic top-ups from KB to guarantee 4/4 after filtering
  try {
    const kbKey = pickKnowledgeKey(issue.name)
    const kbBase = kbKey ? ISSUE_KNOWLEDGE_BASE[kbKey] : undefined
    const kbLifestyle = (kbBase?.lifestyleFocus ?? [])
      .map((n) => ({ title: n.title, reason: n.detail, detail: null as string | null }))
    // For lifestyle "avoid", use avoidExercises plus any avoidFoods phrased as habits
    const kbAvoidFromExercises = (kbBase?.avoidExercises ?? []).map((n) => ({ title: n.title, reason: n.detail }))
    const kbAvoidFromFoods = (kbBase?.avoidFoods ?? []).map((n) => ({ title: n.title, reason: n.detail }))

    const suggestedHabitsTopped = ensureMin(suggestedHabits, kbLifestyle, 4)
    const avoidHabitsTopped = ensureMin(avoidHabits, [...kbAvoidFromExercises, ...kbAvoidFromFoods], 4)

    ;(suggestedHabits as any) = suggestedHabitsTopped
    avoidHabits = avoidHabitsTopped
  } catch {}

  const validated = suggestedHabits.length >= 4 && avoidHabits.length >= 4

  let summary: string
  if (llmResult.summary?.trim().length) {
    summary = llmResult.summary
  } else if (!hasLifestyleSignals) {
    summary = 'No lifestyle data is logged yet—complete your profile so we can track sleep, stress, and routines while you trial the suggestions below.'
  } else {
    summary = 'AI-generated lifestyle coaching ready below.'
  }

  const highlights: SectionHighlight[] = [
    {
      title: 'Lifestyle foundations',
      detail: workingHabits.length
        ? workingHabits.map((habit) => `${habit.title}: ${habit.reason}`).join('; ')
        : 'No lifestyle habits flagged as supportive yet.',
      tone: workingHabits.length ? 'positive' : hasLifestyleSignals ? 'neutral' : 'warning',
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

  if (!hasLifestyleSignals) {
    highlights.unshift({
      title: 'Complete lifestyle profile',
      detail: 'Add sleep, stress, and exercise frequency details so we can track habit wins over time.',
      tone: 'warning',
    })
  }

  const recommendations: SectionRecommendation[] = llmResult.recommendations.length
    ? llmResult.recommendations.map((rec) => ({
        title: rec.title,
        description: rec.description,
        actions: rec.actions.length ? rec.actions : ['Discuss with your clinician or coach'],
        priority: rec.priority,
      }))
    : hasLifestyleSignals
    ? [
        {
          title: 'Plan daily routine updates',
          description: 'Use the suggested habits to refine your schedule.',
          actions: ['Add habits to your calendar', 'Track adherence for 14 days'],
          priority: 'soon',
        },
      ]
    : [
        {
          title: 'Complete lifestyle profile',
          description: 'Add sleep, stress, and routine details so the AI can track habit wins and risks.',
          actions: ['Open Profile → Lifestyle', 'Log bedtime, wake time, and stress routines'],
          priority: 'now',
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
      hasLifestyleSignals,
      source: 'llm',
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      validated,
      degraded: !validated,
    },
  }
}
