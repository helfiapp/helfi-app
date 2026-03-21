import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions } from '@/lib/auth'
import {
  triggerManualSectionRegeneration,
  getAffectedSections,
  ManualRegenerationTimeoutError,
} from '@/lib/insights/regeneration-service'
import { CreditManager } from '@/lib/credit-system'
import { prisma } from '@/lib/prisma'
import { getRunCostCents } from '@/lib/ai-usage-runs'
import { getBillingMarkupMultiplier, getModelPriceInfo } from '@/lib/cost-meter'
import type { RunContext } from '@/lib/run-context'
import { getInsightsLlmStatus } from '@/lib/insights/llm'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { getCachedIssueSection } from '@/lib/insights/issue-engine'

// Keep runtime bounded so users get a faster response if regeneration is slow.
export const maxDuration = 45
const TARGETED_INSIGHTS_EMERGENCY_PAUSED = true

const VALID_CHANGE_TYPES = [
  'supplements',
  'medications',
  'food',
  'exercise',
  'health_goals',
  'health_situations',
  'profile',
  'blood_results',
] as const

type ChangeType = (typeof VALID_CHANGE_TYPES)[number]

const SUB_CREDIT_VALUE = 0.0143 // $/credit for subscriptions
const TOPUP_CREDIT_VALUE = 0.02 // $/credit for top-ups
const SUB_COST_SHARE = 0.4 // 60% margin target (cost = 40% of revenue)
const TOPUP_COST_SHARE = 0.3 // 70% margin target (cost = 30% of revenue)
const NUTRITION_REGEN_TIMEOUT_MS = 30_000
const MAX_NUTRITION_CREDITS_PER_RUN = 12
const MIN_NUTRITION_SUGGESTIONS = 2
const MIN_NUTRITION_AVOIDS = 2

type WalletStatus = Awaited<ReturnType<CreditManager['getWalletStatus']>>
type ChargePlan = ReturnType<typeof calculateChargePlan>

function calculateChargePlan(costCents: number, wallet: WalletStatus) {
  const costUsd = Math.max(0, costCents) / 100
  if (costUsd === 0) {
    return {
      subscriptionCredits: 0,
      topUpCredits: 0,
      totalCredits: 0,
      remainingCostUsd: 0,
      canAfford: true,
    }
  }

  const monthlyAvailable = Math.max(0, wallet.monthlyRemainingCents || 0)
  const topUpAvailable = (wallet.topUps || []).reduce(
    (sum, tu) => sum + Math.max(0, tu.availableCents || 0),
    0
  )

  const subRevenueAvailable = monthlyAvailable * SUB_CREDIT_VALUE
  const subCoverageUsd = subRevenueAvailable * SUB_COST_SHARE

  let remainingCost = costUsd
  let subscriptionCredits = 0

  if (monthlyAvailable > 0) {
    const neededSubRevenue = remainingCost / SUB_COST_SHARE
    const neededSubCredits = Math.ceil(neededSubRevenue / SUB_CREDIT_VALUE)
    if (neededSubCredits <= monthlyAvailable) {
      subscriptionCredits = neededSubCredits
      remainingCost = 0
    } else {
      subscriptionCredits = monthlyAvailable
      remainingCost = Math.max(0, remainingCost - subCoverageUsd)
    }
  }

  let topUpCredits = 0
  if (remainingCost > 0) {
    const neededTopUpRevenue = remainingCost / TOPUP_COST_SHARE
    topUpCredits = Math.ceil(neededTopUpRevenue / TOPUP_CREDIT_VALUE)
  }

  const totalCredits = subscriptionCredits + topUpCredits
  const canAfford = monthlyAvailable + topUpAvailable >= totalCredits

  return {
    subscriptionCredits,
    topUpCredits,
    totalCredits,
    remainingCostUsd: remainingCost,
    canAfford,
  }
}

function toIssueSlug(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseGoalSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(
    new Set(
      input
        .map((value) => toIssueSlug(String(value || '').trim()))
        .filter(Boolean)
    )
  )
}

function parseIssueSlug(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const slug = toIssueSlug(input)
  return slug || null
}

async function getIssueSlugsFromCheckinIssues(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT name FROM "CheckinIssues" WHERE "userId" = $1',
      userId
    )
    return Array.from(
      new Set(
        rows
          .map((row) => toIssueSlug(row.name))
          .filter((slug) => slug.length > 0)
      )
    )
  } catch (error) {
    console.warn('[insights.regenerate-targeted] failed to read CheckinIssues slugs', { userId, error })
    return []
  }
}

function isNutritionSummaryWeak(summary: string) {
  const text = String(summary || '').toLowerCase()
  return (
    text.includes('couldn’t generate') ||
    text.includes("couldn't generate") ||
    text.includes('could not generate') ||
    text.includes('please try again') ||
    text.includes('generation unavailable') ||
    text.includes('unavailable')
  )
}

function applyCreditCap(plan: ChargePlan, wallet: WalletStatus, maxCredits: number) {
  if (maxCredits <= 0 || plan.totalCredits <= maxCredits) {
    return { ...plan, capApplied: false }
  }

  const monthlyAvailable = Math.max(0, wallet.monthlyRemainingCents || 0)
  const topUpAvailable = (wallet.topUps || []).reduce(
    (sum, tu) => sum + Math.max(0, tu.availableCents || 0),
    0
  )

  const subscriptionCredits = Math.min(plan.subscriptionCredits, maxCredits)
  const topUpCredits = Math.min(plan.topUpCredits, Math.max(0, maxCredits - subscriptionCredits))
  const totalCredits = subscriptionCredits + topUpCredits

  return {
    ...plan,
    subscriptionCredits,
    topUpCredits,
    totalCredits,
    canAfford: monthlyAvailable + topUpAvailable >= totalCredits,
    capApplied: true,
  }
}

async function checkNutritionQuality(userId: string, targetSlugs: string[]) {
  let checked = 0
  let withRecentData = 0
  let useful = 0

  for (const slug of targetSlugs) {
    const section = await getCachedIssueSection(userId, slug, 'nutrition', { mode: 'latest' })
    if (!section) continue
    checked += 1

    const extras = (section.extras as Record<string, unknown> | undefined) ?? {}
    const hasRecentFoodData = Boolean(extras.hasRecentFoodData)
    const workingCount = Array.isArray(extras.workingFocus) ? extras.workingFocus.length : 0

    let suggestedCount = Array.isArray(extras.suggestedFocus) ? extras.suggestedFocus.length : 0
    let avoidCount = Array.isArray(extras.avoidFoods) ? extras.avoidFoods.length : 0

    if (Array.isArray(extras.suggestionRuns) && extras.suggestionRuns.length > 0) {
      const latestRun = extras.suggestionRuns[0] as
        | { suggestedFocus?: unknown[]; avoidFoods?: unknown[] }
        | undefined
      if (latestRun) {
        suggestedCount = Array.isArray(latestRun.suggestedFocus) ? latestRun.suggestedFocus.length : suggestedCount
        avoidCount = Array.isArray(latestRun.avoidFoods) ? latestRun.avoidFoods.length : avoidCount
      }
    }

    if (hasRecentFoodData) withRecentData += 1

    const hasUsefulContent =
      workingCount > 0 || suggestedCount >= MIN_NUTRITION_SUGGESTIONS || avoidCount >= MIN_NUTRITION_AVOIDS

    if (hasRecentFoodData && hasUsefulContent && !isNutritionSummaryWeak(section.summary || '')) {
      useful += 1
    }
  }

  if (checked === 0 || withRecentData === 0) {
    return {
      pass: false,
      reason: 'Not enough new food data yet. No credits were used.',
      checked,
      withRecentData,
      useful,
    }
  }

  if (useful === 0) {
    return {
      pass: false,
      reason: 'Nutrition update completed, but the output was too weak to charge. No credits were used.',
      checked,
      withRecentData,
      useful,
    }
  }

  return {
    pass: true,
    reason: null,
    checked,
    withRecentData,
    useful,
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (TARGETED_INSIGHTS_EMERGENCY_PAUSED) {
      console.error('[insights.regenerate-targeted] emergency pause active', {
        userId: session.user.id,
      })
      return NextResponse.json(
        {
          success: false,
          paused: true,
          message:
            'Insights updates are temporarily paused while we stop a runaway usage issue. Your saved health data is safe.',
        },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const changeTypesInput: unknown = body?.changeTypes
    const changeTypes = Array.isArray(changeTypesInput)
      ? changeTypesInput.filter((t): t is ChangeType => VALID_CHANGE_TYPES.includes(t as ChangeType))
      : []

    // If the client didn’t specify, default to a minimal set so we never fan out accidentally.
    // NOTE: This should rarely happen because the client always sends changeTypes, but this keeps
    // the call bounded to avoid long-running jobs/504s.
    const effectiveChangeTypes = changeTypes.length ? changeTypes : (['profile'] as ChangeType[])

    const runId: string =
      typeof body?.runId === 'string' && body.runId.trim().length > 0
        ? body.runId
        : randomUUID()

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true, creditTopUps: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    const hasFreeInsightsCredits = await hasFreeCredits(session.user.id, 'INSIGHTS_UPDATE')
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && hasFreeInsightsCredits
    if (!isPremium && !hasPurchasedCredits && !hasFreeInsightsCredits) {
      return NextResponse.json({
        success: false,
        message: 'You\'ve used all your free insights updates. Please purchase credits or subscribe.',
        exhaustedFreeCredits: true,
      }, { status: 402 })
    }

    const requestedIssueSlug = parseIssueSlug(body?.issueSlug)

    // Pull goals without SQL prefix filtering because "__" is a wildcard pattern in SQL LIKE.
    // Filtering in JS avoids accidentally hiding real goals.
    const rawGoals = await prisma.healthGoal.findMany({
      where: { userId: session.user.id },
      select: { name: true },
      take: 100,
    })
    const goals = rawGoals.filter((goal) => typeof goal.name === 'string' && !goal.name.startsWith('__'))
    const checkinIssueSlugs = await getIssueSlugsFromCheckinIssues(session.user.id)

    console.log('[insights.regenerate-targeted] goals detected', {
      runId,
      userId: session.user.id,
      goalCount: goals.length,
      goalNames: goals.map((g) => g.name),
      requestedIssueSlug,
      checkinIssueSlugs,
      changeTypes: effectiveChangeTypes,
    })

    const providedGoalSlugs =
      changeTypes.includes('health_goals') ? parseGoalSlugs(body?.goalSlugs) : []
    const goalIssueSlugs = goals.map((g) => toIssueSlug(g.name)).filter(Boolean)
    const targetIssueSlugs = requestedIssueSlug
      ? [requestedIssueSlug]
      : providedGoalSlugs.length
      ? providedGoalSlugs
      : goalIssueSlugs.length
      ? goalIssueSlugs
      : checkinIssueSlugs.length
      ? checkinIssueSlugs
      : ['general-health']

    const llmStatus = getInsightsLlmStatus()

    if (changeTypes.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No valid change types provided; nothing to regenerate.',
        sectionsTriggered: [],
        llmStatus,
      }, { status: 400 })
    }

    let sections: string[] = []
    const affected = effectiveChangeTypes.reduce<string[]>((acc, type) => {
      const mapped = getAffectedSections(type)
      mapped.forEach((s) => acc.push(s))
      return acc
    }, [])
    const affectedUnique = Array.from(new Set(affected))

    if (affectedUnique.length === 0) {
      console.log('[insights.regenerate-targeted] no sections triggered for change types', {
        runId,
        userId: session.user.id,
        changeTypes: effectiveChangeTypes,
      })
      return NextResponse.json(
        {
          success: true,
          message: 'No insight sections need regeneration for these changes.',
          runId,
          sectionsTriggered: [],
          affectedSections: [],
          llmStatus,
        },
        { status: 200 }
      )
    }

    const runContext: RunContext = {
      runId,
      feature: 'insights:targeted',
      meta: {
        userId: session.user.id,
        changeTypes: Array.from(new Set(effectiveChangeTypes)),
        sections: affectedUnique,
      },
    }
    console.log('[insights.regenerate-targeted] start', {
      runId,
      userId: session.user.id,
      changeTypes: effectiveChangeTypes,
    })

    const preferQuickProfile = effectiveChangeTypes.length === 1 && effectiveChangeTypes[0] === 'profile'

    const finalizeCharge = async (overrideSections?: string[]) => {
      const sectionsForCharge =
        Array.isArray(overrideSections) && overrideSections.length ? overrideSections : (sections.length ? sections : affectedUnique)
      const successMessage = sectionsForCharge.includes('nutrition')
        ? 'Nutrition insights updated.'
        : 'Insights updated.'

      if (sectionsForCharge.includes('nutrition')) {
        const quality = await checkNutritionQuality(session.user.id, targetIssueSlugs)
        if (!quality.pass) {
          return {
            success: true as const,
            status: 200 as const,
            body: {
              success: true,
              message: quality.reason,
              noChargeReason: 'nutrition_quality_gate',
              changeTypes: Array.from(new Set(effectiveChangeTypes)),
              sectionsTriggered: sectionsForCharge,
              affectedSections: affectedUnique,
              runId,
              costCents: 0,
              usageEvents: 0,
              promptTokens: 0,
              completionTokens: 0,
              chargedCredits: 0,
              subscriptionCreditsCharged: 0,
              topUpCreditsCharged: 0,
              qualityChecked: quality.checked,
              qualityWithRecentData: quality.withRecentData,
              qualityUseful: quality.useful,
            },
          }
        }
      }

      const { costCents, count, promptTokens, completionTokens } = await getRunCostCents(runId, session.user.id)
      const modelPrice = getModelPriceInfo(llmStatus.model)
      const markupMultiplier = getBillingMarkupMultiplier()
      const cm = new CreditManager(session.user.id)
      const walletStatus = await cm.getWalletStatus()
      const basePlan = calculateChargePlan(costCents, walletStatus)
      const plan = sectionsForCharge.includes('nutrition')
        ? applyCreditCap(basePlan, walletStatus, MAX_NUTRITION_CREDITS_PER_RUN)
        : { ...basePlan, capApplied: false }

      if (!allowViaFreeUse && !plan.canAfford) {
        return {
          success: false as const,
          status: 402 as const,
          body: {
            success: false,
            message: 'Not enough credits to cover this insights refresh.',
            runId,
            sectionsTriggered: sectionsForCharge,
            affectedSections: affectedUnique,
            costCents,
            usageEvents: count,
          promptTokens,
          completionTokens,
          },
        }
      }

      if (costCents === 0 || count === 0) {
        console.warn('[insights.regenerate-targeted] no usage recorded - returning no-charge success', {
          runId,
          userId: session.user.id,
          changeTypes: Array.from(new Set(effectiveChangeTypes)),
          costCents,
          usageEvents: count,
          sectionsTriggered: sectionsForCharge,
        })
        return {
          success: true as const,
          status: 200 as const,
          body: {
            success: true,
            message: `${successMessage} No credits were used.`,
            runId,
            sectionsTriggered: sectionsForCharge,
            affectedSections: affectedUnique,
            costCents: 0,
            usageEvents: 0,
            promptTokens,
            completionTokens,
            chargedCredits: 0,
            subscriptionCreditsCharged: 0,
            topUpCreditsCharged: 0,
            noChargeReason: 'no_usage_recorded',
            llmStatus,
            modelPrice,
            markupMultiplier,
          },
        }
      }

      let chargedCredits = 0
      if (!allowViaFreeUse) {
        if (plan.totalCredits > 0) {
          const chargedOk = await cm.chargeSplitCredits(plan.subscriptionCredits, plan.topUpCredits)
          if (!chargedOk) {
            return {
              success: false as const,
              status: 402 as const,
              body: {
                success: false,
                message: 'Unable to charge credits for this insights refresh.',
                runId,
                sectionsTriggered: sectionsForCharge,
                affectedSections: affectedUnique,
                costCents,
                usageEvents: count,
                promptTokens,
                completionTokens,
              },
            }
          }
          chargedCredits = plan.totalCredits
        }
      }

      if (allowViaFreeUse) {
        await consumeFreeCredit(session.user.id, 'INSIGHTS_UPDATE')
      }

      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          monthlyInsightsGenerationUsed: { increment: 1 },
        } as any,
      })

      console.log('[insights.regenerate-targeted] charge summary', {
        runId,
        userId: session.user.id,
        changeTypes: Array.from(new Set(effectiveChangeTypes)),
        costCents,
        usageEvents: count,
        chargedCredits,
        creditCapApplied: plan.capApplied,
        creditCapMax: sectionsForCharge.includes('nutrition') ? MAX_NUTRITION_CREDITS_PER_RUN : null,
        sectionsTriggered: sectionsForCharge,
      })

      return {
        success: true as const,
        status: 200 as const,
        body: {
          success: true,
          message: successMessage,
          changeTypes: Array.from(new Set(effectiveChangeTypes)),
          sectionsTriggered: sectionsForCharge,
          affectedSections: affectedUnique,
          runId,
          costCents,
          usageEvents: count,
          promptTokens,
          completionTokens,
          chargedCredits,
          subscriptionCreditsCharged: allowViaFreeUse ? 0 : plan.subscriptionCredits,
          topUpCreditsCharged: allowViaFreeUse ? 0 : plan.topUpCredits,
          creditCapApplied: plan.capApplied,
          creditCapMax: sectionsForCharge.includes('nutrition') ? MAX_NUTRITION_CREDITS_PER_RUN : null,
          modelPrice,
          markupMultiplier,
        },
      }
    }

    try {
      sections = await triggerManualSectionRegeneration(session.user.id, effectiveChangeTypes, {
        inline: true,
        runContext,
        preferQuick: preferQuickProfile,
        slugs: requestedIssueSlug
          ? [requestedIssueSlug]
          : providedGoalSlugs.length
          ? providedGoalSlugs
          : undefined,
        timeoutMs: NUTRITION_REGEN_TIMEOUT_MS,
      })
    } catch (error) {
      if (error instanceof ManualRegenerationTimeoutError || (error as any)?.name === 'ManualRegenerationTimeoutError') {
        console.warn('[insights.regenerate-targeted] regeneration timed out - returning no-charge fallback', {
          runId,
          userId: session.user.id,
          timeoutMs: NUTRITION_REGEN_TIMEOUT_MS,
          changeTypes: effectiveChangeTypes,
        })
        return NextResponse.json(
          {
            success: true,
            message: 'Update is taking longer than expected. Showing your latest saved insights for now. No credits were used.',
            noChargeReason: 'generation_timeout',
            runId,
            sectionsTriggered: sections.length ? sections : affectedUnique,
            affectedSections: affectedUnique,
            chargedCredits: 0,
            subscriptionCreditsCharged: 0,
            topUpCreditsCharged: 0,
            costCents: 0,
            usageEvents: 0,
            timeout: true,
            llmStatus,
          },
          { status: 200 }
        )
      }
      console.error('[insights.regenerate-targeted] regeneration failed', { runId, error })
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to regenerate insights. Please retry.',
          runId,
          llmStatus,
        },
        { status: 500 }
      )
    }

    const chargeResult = await finalizeCharge(sections)
    if (!chargeResult.success) {
      return NextResponse.json(chargeResult.body, { status: chargeResult.status })
    }

    return NextResponse.json(
      {
        ...chargeResult.body,
        background: false,
        llmStatus,
      },
      { status: chargeResult.status }
    )
  } catch (error) {
    console.error('[insights.regenerate-targeted] Failed to trigger regeneration', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Could not start nutrition refresh right now. No credits were used.',
      },
      { status: 500 }
    )
  }
}
