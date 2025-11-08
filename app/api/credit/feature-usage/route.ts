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

    // Choose the larger of monthly vs lifetime to reflect usage before monthly counters existed
    const symptomMonthly = user.monthlySymptomAnalysisUsed || 0
    const foodMonthly = user.monthlyFoodAnalysisUsed || 0
    const interactionMonthly = user.monthlyInteractionAnalysisUsed || 0
    const medicalMonthly = user.monthlyMedicalImageAnalysisUsed || 0

    const featureUsage = {
      symptomAnalysis: {
        count: Math.max(symptomMonthly, symptomAnalysisLifetime),
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
        label: symptomMonthly >= symptomAnalysisLifetime && symptomMonthly > 0 ? 'monthly' : 'total',
      },
      foodAnalysis: {
        count: Math.max(foodMonthly, (user.totalFoodAnalysisCount || 0)),
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
        label: foodMonthly >= (user.totalFoodAnalysisCount || 0) && foodMonthly > 0 ? 'monthly' : 'total',
      },
      interactionAnalysis: {
        count: Math.max(interactionMonthly, (user.totalInteractionAnalysisCount || 0)),
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        label: interactionMonthly >= (user.totalInteractionAnalysisCount || 0) && interactionMonthly > 0 ? 'monthly' : 'total',
      },
      medicalImageAnalysis: {
        count: medicalMonthly,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
        label: medicalMonthly > 0 ? 'monthly' : 'total',
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

