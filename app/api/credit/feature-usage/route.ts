import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CREDIT_COSTS } from '@/lib/credit-system'

export async function GET(_req: NextRequest) {
  try {
    // Authentication: rely on standard session (same as usage‑breakdown).
    let debugStage = 'start'
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
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const hasSubscription = user.subscription?.plan === 'PREMIUM'

    // Use live monthly counters where available, but fall back to lifetime totals
    // so that historical usage (before monthly fields existed) is still visible.
    const foodMonthly = user.monthlyFoodAnalysisUsed || 0
    const foodLifetime = user.totalFoodAnalysisCount || 0
    const actualFoodUsage = Math.max(foodMonthly, foodLifetime)
    const foodLabel: 'monthly' | 'total' = foodMonthly > 0 ? 'monthly' : 'total'

    const symptomMonthly = user.monthlySymptomAnalysisUsed || 0
    const symptomAnalysisLifetime = Math.max(
      0,
      (user.totalAnalysisCount || 0) -
        (user.totalFoodAnalysisCount || 0) -
        (user.totalInteractionAnalysisCount || 0)
    )
    const symptomCount = hasSubscription
      ? symptomMonthly
      : Math.max(symptomMonthly, symptomAnalysisLifetime)
    const symptomLabel: 'monthly' | 'total' =
      hasSubscription && symptomMonthly > 0 ? 'monthly' : 'total'

    const interactionMonthly = user.monthlyInteractionAnalysisUsed || 0
    const interactionLifetime = user.totalInteractionAnalysisCount || 0

    const medicalMonthly = user.monthlyMedicalImageAnalysisUsed || 0
    const insightsMonthly = user.monthlyInsightsGenerationUsed || 0

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
        count: Math.max(interactionMonthly, interactionLifetime),
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        label:
          interactionMonthly >= interactionLifetime && interactionMonthly > 0
            ? 'monthly'
            : 'total',
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
      // Health Tips usage remains optional and is currently reported as zero,
      // but the shape is kept for forward‑compatibility with UI.
      healthTips: {
        count: 0,
        costPerUse: 0,
        label: 'total',
        totalCredits: 0,
      },
    }

    return NextResponse.json({
      debugStage: 'success',
      schemaVersion: 2,
      featureUsage,
      hasSubscription,
      actualCreditsUsed: user.walletMonthlyUsedCents || 0,
    })
  } catch (err: any) {
    console.error('Error fetching feature usage:', err)
    // Degrade gracefully: return zeros so UI can still render without errors.
    return NextResponse.json({
      debugStage: 'error',
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
    })
  }
}
