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

    // Since we don't track monthly per-feature usage, we'll show lifetime usage
    // but only display it if user has subscription (for "This month" context)
    // For non-subscription users with credits, we won't show per-feature usage
    const featureUsage = {
      symptomAnalysis: {
        // Estimate: totalAnalysisCount includes all analyses, subtract food and interaction
        count: Math.max(0, (user.totalAnalysisCount || 0) - (user.totalFoodAnalysisCount || 0) - (user.totalInteractionAnalysisCount || 0)),
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
      },
      foodAnalysis: {
        count: user.totalFoodAnalysisCount || 0,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
      },
      interactionAnalysis: {
        count: user.totalInteractionAnalysisCount || 0,
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
      },
      medicalImageAnalysis: {
        count: 0, // We don't have reliable tracking for this
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

