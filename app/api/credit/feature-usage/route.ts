import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CREDIT_COSTS } from '@/lib/credit-system'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { logServerCall } from '@/lib/server-call-tracker'

// ABSOLUTE GUARD RAIL:
// This endpoint powers the "This AI feature has been used X times…" text.
// Do NOT change how featureUsage is computed without reading `GUARD_RAILS.md`
// and getting explicit user approval.
//
// This API depends on session headers and must never be statically rendered.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest) {
  let debugStage = 'start'
  try {
    const url = new URL(_req.url)
    const featureParam = (url.searchParams.get('feature') || '').trim()
    // Authentication: rely on standard session (same as usage‑breakdown).
    debugStage = 'resolve-session'
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    debugStage = 'load-user'
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        // Monthly per‑feature counters
        monthlySymptomAnalysisUsed: true,
        monthlyFoodAnalysisUsed: true,
        monthlyMedicalImageAnalysisUsed: true,
        monthlyInteractionAnalysisUsed: true,
        monthlyInsightsGenerationUsed: true,
        // Lifetime counters (for back‑filling old usage)
        totalAnalysisCount: true,
        totalFoodAnalysisCount: true,
        totalInteractionAnalysisCount: true,
        // Wallet usage + subscription (for context only)
        walletMonthlyUsedCents: true,
        subscription: {
          select: {
            plan: true,
            endDate: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (featureParam) {
      logServerCall({
        feature: featureParam,
        endpoint: '/api/credit/feature-usage',
        kind: 'feature_usage',
      }).catch((error) => {
        console.error('❌ Failed to log feature usage call:', error)
      })
    }

    const hasSubscription = isSubscriptionActive(user.subscription)

    debugStage = 'prepare-counts'
    const foodMonthly = user.monthlyFoodAnalysisUsed || 0
    const foodLifetime = user.totalFoodAnalysisCount || 0
    const foodLabel: 'monthly' | 'total' = foodMonthly > 0 ? 'monthly' : 'total'
    const actualFoodUsage = foodLabel === 'monthly' ? foodMonthly : foodLifetime

    const symptomMonthly = user.monthlySymptomAnalysisUsed || 0
    const symptomAnalysisLifetime = Math.max(
      0,
      (user.totalAnalysisCount || 0) -
        (user.totalFoodAnalysisCount || 0) -
        (user.totalInteractionAnalysisCount || 0)
    )
    const symptomLabel: 'monthly' | 'total' = symptomMonthly > 0 ? 'monthly' : 'total'
    const symptomCount = symptomLabel === 'monthly' ? symptomMonthly : symptomAnalysisLifetime

    const interactionMonthly = user.monthlyInteractionAnalysisUsed || 0
    const interactionLifetime = user.totalInteractionAnalysisCount || 0

    const medicalMonthly = user.monthlyMedicalImageAnalysisUsed || 0
    const insightsMonthly = user.monthlyInsightsGenerationUsed || 0

    // Health tips usage (no counters; derive from usage events)
    const startOfUtcMonth = (() => {
      const now = new Date()
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    })()
    const healthTipsMonthly = await prisma.aIUsageEvent.count({
      where: {
        userId: user.id,
        success: true,
        createdAt: { gte: startOfUtcMonth },
        feature: { startsWith: 'health-tips:' },
      },
    })

    const featureUsage: any = {
      symptomAnalysis: {
        count: symptomCount,
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
        label: symptomLabel,
      },
      foodAnalysis: {
        count: actualFoodUsage,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
        label: foodLabel,
      },
      interactionAnalysis: {
        count: interactionMonthly > 0 ? interactionMonthly : interactionLifetime,
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        label: interactionMonthly > 0 ? 'monthly' : 'total',
      },
      medicalImageAnalysis: {
        count: medicalMonthly,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
        label: medicalMonthly > 0 ? 'monthly' : 'total',
      },
      insightsGeneration: {
        count: insightsMonthly,
        costPerUse: CREDIT_COSTS.INSIGHTS_GENERATION,
        label: insightsMonthly > 0 ? 'monthly' : 'total',
      },
      healthTips: {
        count: healthTipsMonthly,
        costPerUse: 0,
        label: 'monthly',
        totalCredits: 0,
      },
    }

    return NextResponse.json({
      debugStage: 'success',
      schemaVersion: 3,
      featureUsage,
      hasSubscription,
      actualCreditsUsed: user.walletMonthlyUsedCents || 0,
    })
  } catch (err: any) {
    console.error('Error fetching feature usage:', err)
    // Degrade gracefully: return zeros so UI can still render without errors.
    return NextResponse.json({
      debugStage,
      schemaVersion: 2,
      featureUsage: {
        symptomAnalysis: {
          count: 0,
          costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
          label: 'total',
        },
        foodAnalysis: {
          count: 0,
          costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
          label: 'total',
        },
        interactionAnalysis: {
          count: 0,
          costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
          label: 'total',
        },
        medicalImageAnalysis: {
          count: 0,
          costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
          label: 'total',
        },
        insightsGeneration: {
          count: 0,
          costPerUse: CREDIT_COSTS.INSIGHTS_GENERATION,
          label: 'total',
        },
        healthTips: {
          count: 0,
          costPerUse: 0,
          label: 'total',
          totalCredits: 0,
        },
      },
      hasSubscription: false,
      actualCreditsUsed: 0,
      degraded: true,
      errorType: err?.name || 'UnknownError',
      errorMessage: err?.message || 'Unknown error',
    })
  }
}
