import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CREDIT_COSTS } from '@/lib/credit-system'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        monthlySymptomAnalysisUsed: true,
        monthlyFoodAnalysisUsed: true,
        monthlyMedicalImageAnalysisUsed: true,
        monthlyInteractionAnalysisUsed: true,
        monthlyInsightsGenerationUsed: true,
        totalAnalysisCount: true,
        totalFoodAnalysisCount: true,
        totalInteractionAnalysisCount: true,
        walletMonthlyUsedCents: true,
        subscription: {
          select: {
            plan: true,
            startDate: true, // Need this for calculating monthly reset date
          },
        },
        creditTopUps: {
          select: {
            purchasedAt: true,
            expiresAt: true,
          },
          orderBy: {
            purchasedAt: 'desc', // Most recent first
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user has a subscription (not just purchased credits)
    const hasSubscription = user.subscription?.plan === 'PREMIUM'

    // Calculate the start date for monthly food analysis counting
    // Priority: subscription start date > most recent credit purchase date
    let monthlyStartDate: Date | null = null
    
    if (hasSubscription && user.subscription?.startDate) {
      // For subscriptions: calculate current subscription month based on start date
      // Reset on the same calendar day each month (e.g., if started on 15th, reset on 15th)
      const subStartDate = new Date(user.subscription.startDate)
      const now = new Date()
      
      // Calculate the start of the current subscription month
      // Find which subscription month we're in (0 = first month, 1 = second month, etc.)
      const startYear = subStartDate.getUTCFullYear()
      const startMonth = subStartDate.getUTCMonth()
      const startDay = subStartDate.getUTCDate()
      
      const currentYear = now.getUTCFullYear()
      const currentMonth = now.getUTCMonth()
      const currentDay = now.getUTCDate()
      
      // Calculate how many months have passed
      let monthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth)
      
      // If we haven't reached the same day this month yet, we're still in the previous month
      if (currentDay < startDay) {
        monthsSinceStart--
      }
      
      // Calculate the start date of the current subscription month
      monthlyStartDate = new Date(Date.UTC(startYear, startMonth + monthsSinceStart, startDay, 0, 0, 0, 0))
      
      // Ensure we don't go into the future
      if (monthlyStartDate > now) {
        monthsSinceStart--
        monthlyStartDate = new Date(Date.UTC(startYear, startMonth + monthsSinceStart, startDay, 0, 0, 0, 0))
      }
    } else if (user.creditTopUps && user.creditTopUps.length > 0) {
      // For credit purchases: calculate current month from purchase date
      // Reset on the same calendar day each month (e.g., if purchased on 10th, reset on 10th)
      const mostRecentTopUp = user.creditTopUps[0]
      if (mostRecentTopUp && mostRecentTopUp.expiresAt > new Date()) {
        const purchaseDate = new Date(mostRecentTopUp.purchasedAt)
        const now = new Date()
        
        const purchaseYear = purchaseDate.getUTCFullYear()
        const purchaseMonth = purchaseDate.getUTCMonth()
        const purchaseDay = purchaseDate.getUTCDate()
        
        const currentYear = now.getUTCFullYear()
        const currentMonth = now.getUTCMonth()
        const currentDay = now.getUTCDate()
        
        // Calculate how many months have passed since purchase
        let monthsSincePurchase = (currentYear - purchaseYear) * 12 + (currentMonth - purchaseMonth)
        
        // If we haven't reached the same day this month yet, we're still in the previous month
        if (currentDay < purchaseDay) {
          monthsSincePurchase--
        }
        
        // Calculate the start date of the current month based on purchase date
        monthlyStartDate = new Date(Date.UTC(purchaseYear, purchaseMonth + monthsSincePurchase, purchaseDay, 0, 0, 0, 0))
        
        // Ensure we don't go into the future
        if (monthlyStartDate > now) {
          monthsSincePurchase--
          monthlyStartDate = new Date(Date.UTC(purchaseYear, purchaseMonth + monthsSincePurchase, purchaseDay, 0, 0, 0, 0))
        }
      }
    }

    // Use live monthly counter that updates immediately after analysis completes
    // Fallback to lifetime total if monthly is unavailable
    const foodMonthly = (user as any).monthlyFoodAnalysisUsed || 0
    const actualFoodUsage = Math.max(foodMonthly, (user.totalFoodAnalysisCount || 0))
    const foodLabel: 'monthly' | 'total' = foodMonthly > 0 ? 'monthly' : 'total'

    // Calculate symptom analysis count
    // If user has subscription, only show monthly count (not lifetime)
    // If no subscription, show lifetime count
    const symptomMonthly = user.monthlySymptomAnalysisUsed || 0
    const symptomAnalysisLifetime = Math.max(0, 
      (user.totalAnalysisCount || 0) - (user.totalFoodAnalysisCount || 0) - (user.totalInteractionAnalysisCount || 0)
    )
    
    // For symptom analysis: if subscription exists, use monthly count only
    // Otherwise, use lifetime count
    const symptomCount = hasSubscription ? symptomMonthly : Math.max(symptomMonthly, symptomAnalysisLifetime)
    const symptomLabel = hasSubscription && symptomMonthly > 0 ? 'monthly' : 'total'

    // Choose the larger of monthly vs lifetime to reflect usage before monthly counters existed
    const interactionMonthly = user.monthlyInteractionAnalysisUsed || 0
    const medicalMonthly = user.monthlyMedicalImageAnalysisUsed || 0
    const insightsMonthly = user.monthlyInsightsGenerationUsed || 0

    const featureUsage = {
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
        count: Math.max(interactionMonthly, (user.totalInteractionAnalysisCount || 0)),
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        label: interactionMonthly >= (user.totalInteractionAnalysisCount || 0) && interactionMonthly > 0 ? 'monthly' : 'total',
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

