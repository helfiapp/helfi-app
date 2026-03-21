import { prisma } from '@/lib/prisma'
import { hashPayload } from '@/lib/write-guard'
import type { DataChangeEvent } from '@/lib/insights/regeneration-service'

type ChangeType = DataChangeEvent['changeType']

type CheckTargetedRefreshStateInput = {
  userId: string
  changeTypes: ChangeType[]
  affectedSections: string[]
  targetIssueSlugs: string[]
}

type CheckTargetedRefreshStateResult = {
  guardReady: boolean
  shouldSkip: boolean
  payloadHash: string
  scope: string
  hitCount: number
}

let refreshStateReady = false

const normalizeText = (value: unknown) => String(value || '').trim().toLowerCase()

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean))).sort()
}

const normalizeNumber = (value: unknown): number | null => {
  const num = Number(value)
  return Number.isFinite(num) ? Number(num) : null
}

const normalizeDateString = (value: unknown): string => {
  if (!value) return ''
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? normalizeText(value) : date.toISOString()
}

const normalizeRoundedNumberString = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  return Number.isFinite(num) ? String(Math.round(num)) : normalizeText(value)
}

const normalizeDecimalString = (value: unknown, precision: number): string => {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(precision) : normalizeText(value)
}

const sortByJson = <T>(items: T[]): T[] =>
  items.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

const safeParseJson = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toIssueSlug(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const normalizeFoodNutrients = (value: unknown) => {
  if (!value || typeof value !== 'object') return value ?? null
  const raw = value as Record<string, unknown>
  return {
    calories: normalizeNumber(raw.calories),
    protein_g: normalizeNumber(raw.protein_g),
    carbs_g: normalizeNumber(raw.carbs_g),
    fat_g: normalizeNumber(raw.fat_g),
    fiber_g: normalizeNumber(raw.fiber_g),
    sugar_g: normalizeNumber(raw.sugar_g),
    sodium_mg: normalizeNumber(raw.sodium_mg),
  }
}

const normalizeDocumentList = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return sortByJson(
    value.map((item) => {
      if (!item || typeof item !== 'object') {
        return { value: normalizeText(item) }
      }
      const raw = item as Record<string, unknown>
      return {
        id: normalizeText(raw.id),
        name: normalizeText(raw.name),
        url: normalizeText(raw.url),
        uploadedAt: normalizeDateString(raw.uploadedAt),
      }
    })
  )
}

const normalizeImageList = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return sortByJson(
    value.map((item) => {
      if (!item || typeof item !== 'object') {
        return { value: normalizeText(item) }
      }
      const raw = item as Record<string, unknown>
      return {
        id: normalizeText(raw.id),
        name: normalizeText(raw.name),
        url: normalizeText(raw.url),
      }
    })
  )
}

const normalizeMarkerList = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return sortByJson(
    value.map((item) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        name: normalizeText(raw.name),
        value: normalizeNumber(raw.value),
        unit: normalizeText(raw.unit),
        reference: normalizeText(raw.reference),
      }
    })
  )
}

async function ensureRefreshStateTable() {
  if (refreshStateReady) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InsightsRefreshState" (
        "userId" TEXT NOT NULL,
        "scope" TEXT NOT NULL,
        "payloadHash" TEXT NOT NULL,
        "lastCompletedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "lastRunId" TEXT,
        "hitCount" INTEGER NOT NULL DEFAULT 1,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("userId", "scope")
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS insights_refresh_state_updated_idx ON "InsightsRefreshState" ("updatedAt" DESC)'
    ).catch(() => {})
    refreshStateReady = true
  } catch (error) {
    console.warn('[targeted-refresh-idempotency] Failed to ensure table', error)
    throw error
  }
}

async function buildPayloadHash(input: CheckTargetedRefreshStateInput) {
  const safeUserId = String(input.userId || '').trim()
  if (!safeUserId) {
    return { payloadHash: '', scope: '' }
  }

  try {
    const changeTypes = Array.from(
      new Set(input.changeTypes.map((item) => String(item || '').trim()).filter(Boolean))
    ).sort()
    const affectedSections = Array.from(
      new Set(input.affectedSections.map((item) => String(item || '').trim()).filter(Boolean))
    ).sort()
    const targetIssueSlugs = Array.from(
      new Set(input.targetIssueSlugs.map((item) => toIssueSlug(String(item || ''))).filter(Boolean))
    ).sort()

    const user = await prisma.user.findUnique({
      where: { id: safeUserId },
      select: {
        gender: true,
        weight: true,
        height: true,
        bodyType: true,
        exerciseFrequency: true,
        exerciseTypes: true,
        healthGoals: {
          select: {
            name: true,
            category: true,
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
        foodLogs: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            name: true,
            description: true,
            meal: true,
            localDate: true,
            nutrients: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 300,
        },
      },
    })

    if (!user) {
      return { payloadHash: '', scope: '' }
    }

    const hiddenGoals = new Map(user.healthGoals.filter((goal) => goal.name.startsWith('__')).map((goal) => [goal.name, goal]))
    const visibleGoalSlugs = sortByJson(
      user.healthGoals
        .filter((goal) => !goal.name.startsWith('__'))
        .map((goal) => ({ slug: toIssueSlug(goal.name), name: normalizeText(goal.name) }))
        .filter((goal) => goal.slug)
    )
    const selectedIssueSlugs = sortByJson(
      (
        await prisma.$queryRawUnsafe<Array<{ name: string }>>(
          'SELECT name FROM "CheckinIssues" WHERE "userId" = $1',
          safeUserId
        ).catch(() => []) as Array<{ name: string }>
      )
        .map((row) => ({ slug: toIssueSlug(row.name), name: normalizeText(row.name) }))
        .filter((row) => row.slug)
    )

    const profileInfoRaw = safeParseJson(hiddenGoals.get('__PROFILE_INFO_DATA__')?.category) as Record<string, unknown> | null
    const primaryGoalRaw = safeParseJson(hiddenGoals.get('__PRIMARY_GOAL__')?.category) as Record<string, unknown> | null
    const allergiesRaw = safeParseJson(hiddenGoals.get('__ALLERGIES_DATA__')?.category) as Record<string, unknown> | null
    const dietRaw = safeParseJson(hiddenGoals.get('__DIET_PREFERENCE__')?.category) as Record<string, unknown> | null

    const profile = {
      gender: normalizeText(user.gender),
      weight: normalizeRoundedNumberString(user.weight),
      height: normalizeRoundedNumberString(user.height),
      bodyType: normalizeText(user.bodyType),
      birthdate: normalizeText(profileInfoRaw?.dateOfBirth),
      dietTypes: normalizeStringList(
        Array.isArray(dietRaw?.dietTypes)
          ? (dietRaw?.dietTypes as unknown[])
          : typeof dietRaw?.dietType === 'string'
          ? [dietRaw.dietType]
          : []
      ),
      goalChoice: normalizeText(primaryGoalRaw?.goalChoice),
      goalIntensity: normalizeText(primaryGoalRaw?.goalIntensity || 'standard'),
      goalTargetWeightKg: normalizeDecimalString(primaryGoalRaw?.goalTargetWeightKg, 1),
      goalTargetWeightUnit: normalizeText(primaryGoalRaw?.goalTargetWeightUnit),
      goalPaceKgPerWeek: normalizeDecimalString(primaryGoalRaw?.goalPaceKgPerWeek, 2),
      goalCalorieTarget: normalizeRoundedNumberString(primaryGoalRaw?.goalCalorieTarget),
      goalMacroSplit: primaryGoalRaw?.goalMacroSplit && typeof primaryGoalRaw.goalMacroSplit === 'object'
        ? {
            proteinPct: normalizeDecimalString((primaryGoalRaw.goalMacroSplit as Record<string, unknown>).proteinPct, 3),
            carbPct: normalizeDecimalString((primaryGoalRaw.goalMacroSplit as Record<string, unknown>).carbPct, 3),
            fatPct: normalizeDecimalString((primaryGoalRaw.goalMacroSplit as Record<string, unknown>).fatPct, 3),
          }
        : null,
      goalMacroMode: normalizeText(primaryGoalRaw?.goalMacroMode || 'auto'),
      goalFiberTarget: normalizeRoundedNumberString(primaryGoalRaw?.goalFiberTarget),
      goalSugarMax: normalizeRoundedNumberString(primaryGoalRaw?.goalSugarMax),
      allergies: normalizeStringList(allergiesRaw?.allergies),
      diabetesType: normalizeText(allergiesRaw?.diabetesType),
      exerciseFrequency: normalizeText(user.exerciseFrequency),
      exerciseTypes: normalizeStringList(user.exerciseTypes),
    }

    const supplements = sortByJson(
      user.supplements.map((item) => ({
        name: normalizeText(item.name),
        dosage: normalizeText(item.dosage),
        timing: normalizeStringList(item.timing),
      }))
    )

    const medications = sortByJson(
      user.medications.map((item) => ({
        name: normalizeText(item.name),
        dosage: normalizeText(item.dosage),
        timing: normalizeStringList(item.timing),
      }))
    )

    const healthSituationsGoal = hiddenGoals.get('__HEALTH_SITUATIONS_DATA__')
    const healthSituationsRaw = safeParseJson(healthSituationsGoal?.category)
    const healthSituations = healthSituationsRaw
      ? {
          healthIssues: normalizeText((healthSituationsRaw as Record<string, unknown>).healthIssues),
          healthProblems: normalizeText((healthSituationsRaw as Record<string, unknown>).healthProblems),
          additionalInfo: normalizeText((healthSituationsRaw as Record<string, unknown>).additionalInfo),
          skipped: Boolean((healthSituationsRaw as Record<string, unknown>).skipped),
        }
      : null

    const bloodResultsGoal = hiddenGoals.get('__BLOOD_RESULTS_DATA__')
    const bloodResultsRaw = safeParseJson(bloodResultsGoal?.category)
    const bloodResults = bloodResultsRaw
      ? {
          uploadMethod: normalizeText((bloodResultsRaw as Record<string, unknown>).uploadMethod),
          skipped: Boolean((bloodResultsRaw as Record<string, unknown>).skipped),
          notes: normalizeText((bloodResultsRaw as Record<string, unknown>).notes),
          documents: normalizeDocumentList((bloodResultsRaw as Record<string, unknown>).documents),
          images: normalizeImageList((bloodResultsRaw as Record<string, unknown>).images),
          markers: normalizeMarkerList((bloodResultsRaw as Record<string, unknown>).markers),
        }
      : null

    const todaysFoodsGoal = hiddenGoals.get('__TODAYS_FOODS_DATA__')
    const todaysFoodsRaw = safeParseJson(todaysFoodsGoal?.category)
    const todaysFoods = Array.isArray((todaysFoodsRaw as Record<string, unknown> | null)?.foods)
      ? sortByJson(
          ((todaysFoodsRaw as Record<string, unknown>).foods as unknown[]).map((item) => {
            const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
            return {
              name: normalizeText(raw.name),
              meal: normalizeText(raw.meal),
              calories: normalizeNumber(raw.calories),
              protein_g: normalizeNumber(raw.protein_g),
              carbs_g: normalizeNumber(raw.carbs_g),
              fat_g: normalizeNumber(raw.fat_g),
            }
          })
        )
      : []

    const foodLogs = sortByJson(
      user.foodLogs.map((log) => ({
        name: normalizeText(log.name),
        description: normalizeText(log.description),
        meal: normalizeText(log.meal),
        localDate: normalizeText(log.localDate),
        nutrients: normalizeFoodNutrients(log.nutrients),
        createdAt: normalizeDateString(log.createdAt),
      }))
    )

    const isFullRefresh = affectedSections.includes('full')
    const includeProfile = isFullRefresh || affectedSections.some((section) => section === 'supplements' || section === 'medications')
    const includeHealthSituations = isFullRefresh || affectedSections.some((section) => section === 'supplements' || section === 'medications')
    const includeSupplements = isFullRefresh || affectedSections.includes('supplements')
    const includeMedications = isFullRefresh || affectedSections.includes('medications')
    const includeBloodResults = isFullRefresh || affectedSections.includes('labs')
    const includeFood = isFullRefresh || affectedSections.includes('nutrition')

    const payload = {
      version: 1,
      changeTypes,
      affectedSections,
      targetIssueSlugs,
      data: {
        profile: includeProfile ? profile : undefined,
        supplements: includeSupplements ? supplements : undefined,
        medications: includeMedications ? medications : undefined,
        healthSituations: includeHealthSituations ? healthSituations : undefined,
        bloodResults: includeBloodResults ? bloodResults : undefined,
        food:
          includeFood
            ? {
                foodLogs,
                todaysFoods,
              }
            : undefined,
        visibleGoals: isFullRefresh ? visibleGoalSlugs : undefined,
        selectedIssues: isFullRefresh ? selectedIssueSlugs : undefined,
      },
    }

    return {
      payloadHash: hashPayload(payload),
      scope: ['targeted-insights', affectedSections.join('|') || 'none', targetIssueSlugs.join('|') || 'general-health'].join('::'),
    }
  } catch (error) {
    console.warn('[targeted-refresh-idempotency] Failed to build payload hash', error)
    return { payloadHash: '', scope: '' }
  }
}

export async function checkTargetedRefreshState(
  input: CheckTargetedRefreshStateInput
): Promise<CheckTargetedRefreshStateResult> {
  const { payloadHash, scope } = await buildPayloadHash(input)
  if (!payloadHash || !scope) {
    return { guardReady: false, shouldSkip: false, payloadHash, scope, hitCount: 0 }
  }

  try {
    await ensureRefreshStateTable()

    const rows: Array<{ payloadHash: string; hitCount: number }> = await prisma.$queryRawUnsafe(
      'SELECT "payloadHash", "hitCount" FROM "InsightsRefreshState" WHERE "userId" = $1 AND "scope" = $2',
      input.userId,
      scope
    )
    const existing = rows?.[0]
    if (existing?.payloadHash === payloadHash) {
      const nextHitCount = Number(existing.hitCount || 0) + 1
      await prisma.$queryRawUnsafe(
        'UPDATE "InsightsRefreshState" SET "hitCount" = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "scope" = $3',
        nextHitCount,
        input.userId,
        scope
      )
      return {
        guardReady: true,
        shouldSkip: true,
        payloadHash,
        scope,
        hitCount: nextHitCount,
      }
    }
  } catch (error) {
    console.warn('[targeted-refresh-idempotency] Failed to read refresh state', error)
    return { guardReady: false, shouldSkip: false, payloadHash, scope, hitCount: 0 }
  }

  return { guardReady: true, shouldSkip: false, payloadHash, scope, hitCount: 1 }
}

export async function recordTargetedRefreshState(options: {
  userId: string
  scope: string
  payloadHash: string
  runId?: string | null
}) {
  if (!options.userId || !options.scope || !options.payloadHash) return

  try {
    await ensureRefreshStateTable()
    await prisma.$queryRawUnsafe(
      `INSERT INTO "InsightsRefreshState" ("userId", "scope", "payloadHash", "lastCompletedAt", "lastRunId", "hitCount", "updatedAt")
       VALUES ($1, $2, $3, NOW(), $4, 1, NOW())
       ON CONFLICT ("userId", "scope")
       DO UPDATE SET "payloadHash" = EXCLUDED."payloadHash",
                     "lastCompletedAt" = EXCLUDED."lastCompletedAt",
                     "lastRunId" = EXCLUDED."lastRunId",
                     "hitCount" = 1,
                     "updatedAt" = NOW()`,
      options.userId,
      options.scope,
      options.payloadHash,
      options.runId || null
    )
  } catch (error) {
    console.warn('[targeted-refresh-idempotency] Failed to record refresh state', error)
    throw error
  }
}

export async function clearTargetedRefreshState(options: {
  userId: string
  scope: string
  payloadHash?: string | null
}) {
  if (!options.userId || !options.scope) return

  try {
    await ensureRefreshStateTable()
    if (options.payloadHash) {
      await prisma.$queryRawUnsafe(
        'DELETE FROM "InsightsRefreshState" WHERE "userId" = $1 AND "scope" = $2 AND "payloadHash" = $3',
        options.userId,
        options.scope,
        options.payloadHash
      )
      return
    }

    await prisma.$queryRawUnsafe(
      'DELETE FROM "InsightsRefreshState" WHERE "userId" = $1 AND "scope" = $2',
      options.userId,
      options.scope
    )
  } catch (error) {
    console.warn('[targeted-refresh-idempotency] Failed to clear refresh state', error)
  }
}
