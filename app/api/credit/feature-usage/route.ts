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

    // Return monthly per-feature usage (accurate monthly tracking)
    const featureUsage = {
      symptomAnalysis: {
        count: user.monthlySymptomAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
      },
      foodAnalysis: {
        count: user.monthlyFoodAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
      },
      interactionAnalysis: {
        count: user.monthlyInteractionAnalysisUsed || 0,
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

