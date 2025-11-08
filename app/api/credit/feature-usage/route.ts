import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CREDIT_COSTS } from '@/lib/credit-system'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        monthlySymptomAnalysisUsed: true,
        monthlyFoodAnalysisUsed: true,
        monthlyMedicalImageAnalysisUsed: true,
        monthlyInteractionAnalysisUsed: true,
        totalAnalysisCount: true,
        totalFoodAnalysisCount: true,
        totalInteractionAnalysisCount: true,
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

    // Check if user has a subscription (not just purchased credits)
    const hasSubscription = user.subscription?.plan === 'PREMIUM'

    // Calculate symptom analysis count: totalAnalysisCount minus food and interaction
    const symptomAnalysisLifetime = Math.max(0, 
      (user.totalAnalysisCount || 0) - (user.totalFoodAnalysisCount || 0) - (user.totalInteractionAnalysisCount || 0)
    )

    // Return monthly per-feature usage, but fall back to lifetime if monthly is 0
    // This handles cases where monthly counters were just added and don't reflect past usage
    const featureUsage = {
      symptomAnalysis: {
        count: (user.monthlySymptomAnalysisUsed || 0) > 0 
          ? (user.monthlySymptomAnalysisUsed || 0)
          : symptomAnalysisLifetime, // Fall back to lifetime if monthly is 0
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
      },
      foodAnalysis: {
        count: (user.monthlyFoodAnalysisUsed || 0) > 0
          ? (user.monthlyFoodAnalysisUsed || 0)
          : (user.totalFoodAnalysisCount || 0), // Fall back to lifetime if monthly is 0
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
      },
      interactionAnalysis: {
        count: (user.monthlyInteractionAnalysisUsed || 0) > 0
          ? (user.monthlyInteractionAnalysisUsed || 0)
          : (user.totalInteractionAnalysisCount || 0), // Fall back to lifetime if monthly is 0
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
      },
      medicalImageAnalysis: {
        count: user.monthlyMedicalImageAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
      },
    }

    return NextResponse.json({
      featureUsage,
      hasSubscription,
      actualCreditsUsed: user.walletMonthlyUsedCents || 0,
    })
  } catch (err) {
    console.error('Error fetching feature usage:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

