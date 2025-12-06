import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions } from '@/lib/auth'
import { triggerManualSectionRegeneration, getAffectedSections } from '@/lib/insights/regeneration-service'
import { CreditManager } from '@/lib/credit-system'
import { prisma } from '@/lib/prisma'
import { getRunCostCents } from '@/lib/ai-usage-runs'
import type { RunContext } from '@/lib/run-context'

// Allow longer runtime so the full regeneration completes without a gateway timeout
export const maxDuration = 120

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

type WalletStatus = Awaited<ReturnType<CreditManager['getWalletStatus']>>

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Log visible goals to diagnose missing-goal cases without blocking the request
    const goals = await prisma.healthGoal.findMany({
      where: {
        userId: session.user.id,
        name: { not: { startsWith: '__' } },
      },
      select: { name: true },
      take: 10,
    })
    console.log('[insights.regenerate-targeted] goals detected', {
      runId,
      userId: session.user.id,
      goalCount: goals.length,
      goalNames: goals.map((g) => g.name),
      changeTypes: effectiveChangeTypes,
    })

    if (changeTypes.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No valid change types provided; nothing to regenerate.',
        sectionsTriggered: [],
      }, { status: 400 })
    }

    const runContext: RunContext = { runId, feature: 'insights:targeted' }
    console.log('[insights.regenerate-targeted] start', {
      runId,
      userId: session.user.id,
      changeTypes: effectiveChangeTypes,
    })

    const preferQuickProfile = effectiveChangeTypes.length === 1 && effectiveChangeTypes[0] === 'profile'

    // Kick off the heavy run in the background to avoid frontend timeouts.
    // We still use the same runId so AI usage is captured and credits charge when done.
    const heavyPromise = triggerManualSectionRegeneration(session.user.id, effectiveChangeTypes, {
      inline: false,
      runContext,
      preferQuick: preferQuickProfile,
    }).catch((error) => {
      console.error('[insights.regenerate-targeted] background regeneration failed', { runId, error })
      throw error
    })

    let sections: string[] = []
    const affected = effectiveChangeTypes.reduce<string[]>((acc, type) => {
      const mapped = getAffectedSections(type)
      mapped.forEach((s) => acc.push(s))
      return acc
    }, [])
    const affectedUnique = Array.from(new Set(affected))

    const finalizeCharge = async (overrideSections?: string[]) => {
      const sectionsForCharge =
        Array.isArray(overrideSections) && overrideSections.length ? overrideSections : (sections.length ? sections : affectedUnique)
      const { costCents, count } = await getRunCostCents(runId, session.user.id)
      const cm = new CreditManager(session.user.id)
      const walletStatus = await cm.getWalletStatus()
      const plan = calculateChargePlan(costCents, walletStatus)

      if (!plan.canAfford) {
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
          },
        }
      }

      let chargedCredits = 0
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
            },
          }
        }
        chargedCredits = plan.totalCredits
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            monthlyInsightsGenerationUsed: { increment: 1 },
          } as any,
        })
      }

      if (costCents === 0 || count === 0) {
        console.warn('[insights.regenerate-targeted] zero cost/usage for run', {
          runId,
          userId: session.user.id,
          changeTypes: Array.from(new Set(effectiveChangeTypes)),
          costCents,
          usageEvents: count,
          sectionsTriggered: sections,
        })
      } else {
        console.log('[insights.regenerate-targeted] charge summary', {
          runId,
          userId: session.user.id,
          changeTypes: Array.from(new Set(effectiveChangeTypes)),
          costCents,
          usageEvents: count,
          chargedCredits,
          sectionsTriggered: sectionsForCharge,
        })
      }

      return {
        success: true as const,
        status: 200 as const,
        body: {
          success: true,
          message:
            chargedCredits > 0
              ? `Charged ${chargedCredits} credits based on actual AI usage.`
              : 'Targeted insights regeneration completed.',
          changeTypes: Array.from(new Set(effectiveChangeTypes)),
          sectionsTriggered: sectionsForCharge,
          affectedSections: affectedUnique,
          runId,
          costCents,
          usageEvents: count,
          chargedCredits,
          subscriptionCreditsCharged: plan.subscriptionCredits,
          topUpCreditsCharged: plan.topUpCredits,
        },
      }
    }

    // Finalize charging after the heavy run completes (background)
    heavyPromise
      .then((sectionsForCharge) => finalizeCharge(sectionsForCharge || sections))
      .then((chargeResult) => {
        if (!chargeResult.success) {
          console.warn('[insights.regenerate-targeted] charge failed (background)', { runId, chargeResult })
        }
      })
      .catch((error) => {
        console.error('[insights.regenerate-targeted] background finalize charge failed', { runId, error })
      })

    // Respond immediately to avoid 504s; background promise will charge when done.
    const sectionsForResponse = sections.length ? sections : affectedUnique
    return NextResponse.json(
      {
        success: true,
        message: 'Finishing in the background. Credits will update when complete.',
        changeTypes: Array.from(new Set(effectiveChangeTypes)),
        sectionsTriggered: sectionsForResponse,
        affectedSections: affectedUnique,
        runId,
        background: true,
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('[insights.regenerate-targeted] Failed to trigger regeneration', error)
    return NextResponse.json({ error: 'Failed to start regeneration' }, { status: 500 })
  }
}
