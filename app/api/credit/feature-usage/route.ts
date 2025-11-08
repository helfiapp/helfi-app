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
        totalFoodAnalysisCount: true,
        totalInteractionAnalysisCount: true,
        totalAnalysisCount: true,
        dailyFoodAnalysisUsed: true,
        dailyInteractionAnalysisUsed: true,
        dailyMedicalAnalysisUsed: true,
        walletMonthlyUsedCents: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate estimated credits used per feature this month
    // Note: This is an estimate based on counts * typical cost
    // Actual costs may vary slightly based on API usage
    const featureUsage = {
      symptomAnalysis: {
        count: (user.totalAnalysisCount || 0) - (user.totalFoodAnalysisCount || 0) - (user.totalInteractionAnalysisCount || 0),
        creditsUsed: ((user.totalAnalysisCount || 0) - (user.totalFoodAnalysisCount || 0) - (user.totalInteractionAnalysisCount || 0)) * CREDIT_COSTS.SYMPTOM_ANALYSIS,
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
      },
      foodAnalysis: {
        count: user.totalFoodAnalysisCount || 0,
        creditsUsed: (user.totalFoodAnalysisCount || 0) * CREDIT_COSTS.FOOD_ANALYSIS,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
      },
      interactionAnalysis: {
        count: user.totalInteractionAnalysisCount || 0,
        creditsUsed: (user.totalInteractionAnalysisCount || 0) * CREDIT_COSTS.INTERACTION_ANALYSIS,
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
      },
      medicalImageAnalysis: {
        count: user.dailyMedicalAnalysisUsed || 0, // Note: This is daily, not lifetime
        creditsUsed: (user.dailyMedicalAnalysisUsed || 0) * CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
      },
    }

    // Total estimated credits (may not match walletMonthlyUsedCents exactly due to actual API costs)
    const totalEstimatedCredits = Object.values(featureUsage).reduce(
      (sum, feature) => sum + feature.creditsUsed,
      0
    )

    return NextResponse.json({
      featureUsage,
      totalEstimatedCredits,
      actualCreditsUsed: user.walletMonthlyUsedCents || 0,
      dailyUsage: {
        foodAnalysis: user.dailyFoodAnalysisUsed || 0,
        interactionAnalysis: user.dailyInteractionAnalysisUsed || 0,
        medicalImageAnalysis: user.dailyMedicalAnalysisUsed || 0,
      },
    })
  } catch (err) {
    console.error('Error fetching feature usage:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

