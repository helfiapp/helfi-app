import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CREDIT_COSTS } from '@/lib/credit-system'

// Usage breakdown reads per-user data and must be dynamic.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
        walletMonthlyUsedCents: true,
        monthlySymptomAnalysisUsed: true,
        monthlyFoodAnalysisUsed: true,
        monthlyMedicalImageAnalysisUsed: true,
        monthlyInteractionAnalysisUsed: true,
        totalFoodAnalysisCount: true,
        totalInteractionAnalysisCount: true,
        subscription: {
          select: {
            plan: true,
            startDate: true,
          },
        },
        creditTopUps: {
          select: {
            purchasedAt: true,
            expiresAt: true,
          },
          orderBy: {
            purchasedAt: 'desc',
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate the start date for monthly counting (same logic as feature-usage)
    let monthlyStartDate: Date | null = null
    
    if (user.subscription?.plan === 'PREMIUM' && user.subscription?.startDate) {
      const subStartDate = new Date(user.subscription.startDate)
      const now = new Date()
      
      const startYear = subStartDate.getUTCFullYear()
      const startMonth = subStartDate.getUTCMonth()
      const startDay = subStartDate.getUTCDate()
      
      const currentYear = now.getUTCFullYear()
      const currentMonth = now.getUTCMonth()
      const currentDay = now.getUTCDate()
      
      let monthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth)
      
      if (currentDay < startDay) {
        monthsSinceStart--
      }
      
      monthlyStartDate = new Date(Date.UTC(startYear, startMonth + monthsSinceStart, startDay, 0, 0, 0, 0))
      
      if (monthlyStartDate > now) {
        monthsSinceStart--
        monthlyStartDate = new Date(Date.UTC(startYear, startMonth + monthsSinceStart, startDay, 0, 0, 0, 0))
      }
    } else if (user.creditTopUps && user.creditTopUps.length > 0) {
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
        
        let monthsSincePurchase = (currentYear - purchaseYear) * 12 + (currentMonth - purchaseMonth)
        
        if (currentDay < purchaseDay) {
          monthsSincePurchase--
        }
        
        monthlyStartDate = new Date(Date.UTC(purchaseYear, purchaseMonth + monthsSincePurchase, purchaseDay, 0, 0, 0, 0))
        
        if (monthlyStartDate > now) {
          monthsSincePurchase--
          monthlyStartDate = new Date(Date.UTC(purchaseYear, purchaseMonth + monthsSincePurchase, purchaseDay, 0, 0, 0, 0))
        }
      }
    }

    // Query actual usage from database since monthlyStartDate
    const breakdown: any = {
      schemaVersion: 1,
      monthlyStartDate: monthlyStartDate?.toISOString() || null,
      walletMonthlyUsedCents: user.walletMonthlyUsedCents || 0,
      features: {},
    }

    if (monthlyStartDate) {
      // Count FoodLog entries (food analysis)
      const foodLogCount = await prisma.foodLog.count({
        where: {
          userId: user.id,
          createdAt: {
            gte: monthlyStartDate,
          },
        },
      })
      breakdown.features.foodAnalysis = {
        count: foodLogCount,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
        totalCredits: foodLogCount * CREDIT_COSTS.FOOD_ANALYSIS,
      }

      // Count InteractionAnalysis entries
      const interactionCount = await prisma.interactionAnalysis.count({
        where: {
          userId: user.id,
          createdAt: {
            gte: monthlyStartDate,
          },
        },
      })
      breakdown.features.interactionAnalysis = {
        count: interactionCount,
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        totalCredits: interactionCount * CREDIT_COSTS.INTERACTION_ANALYSIS,
      }

      // For symptom analysis, we need to check if there's a way to track it
      // Since there's no SymptomAnalysis table, we'll use the monthly counter
      // but also check if there are any other records
      breakdown.features.symptomAnalysis = {
        count: user.monthlySymptomAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
        totalCredits: (user.monthlySymptomAnalysisUsed || 0) * CREDIT_COSTS.SYMPTOM_ANALYSIS,
      }

      // Medical image analysis - check if there's a way to track this
      breakdown.features.medicalImageAnalysis = {
        count: user.monthlyMedicalImageAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
        totalCredits: (user.monthlyMedicalImageAnalysisUsed || 0) * CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
      }
    } else {
      // Fallback to monthly counters
      breakdown.features.foodAnalysis = {
        count: user.monthlyFoodAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.FOOD_ANALYSIS,
        totalCredits: (user.monthlyFoodAnalysisUsed || 0) * CREDIT_COSTS.FOOD_ANALYSIS,
      }
      breakdown.features.interactionAnalysis = {
        count: user.monthlyInteractionAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.INTERACTION_ANALYSIS,
        totalCredits: (user.monthlyInteractionAnalysisUsed || 0) * CREDIT_COSTS.INTERACTION_ANALYSIS,
      }
      breakdown.features.symptomAnalysis = {
        count: user.monthlySymptomAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.SYMPTOM_ANALYSIS,
        totalCredits: (user.monthlySymptomAnalysisUsed || 0) * CREDIT_COSTS.SYMPTOM_ANALYSIS,
      }
      breakdown.features.medicalImageAnalysis = {
        count: user.monthlyMedicalImageAnalysisUsed || 0,
        costPerUse: CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
        totalCredits: (user.monthlyMedicalImageAnalysisUsed || 0) * CREDIT_COSTS.MEDICAL_IMAGE_ANALYSIS,
      }
    }

    // Calculate total expected credits
    const totalExpectedCredits = Object.values(breakdown.features).reduce(
      (sum: number, feature: any) => sum + (feature.totalCredits || 0),
      0
    )

    // Note: Food reanalyses and insights chat also charge credits but aren't tracked in monthly counters
    // Food reanalyses: 1 credit each (tracked in dailyFoodReanalysisUsed but not monthly)
    // Insights chat: Variable cost based on actual API usage
    
    breakdown.summary = {
      totalExpectedCredits,
      walletMonthlyUsedCents: user.walletMonthlyUsedCents || 0,
      difference: (user.walletMonthlyUsedCents || 0) - totalExpectedCredits,
      note: 'Food reanalyses and insights chat also charge credits but are not included in monthly counters above',
    }

    return NextResponse.json(breakdown)
  } catch (err) {
    console.error('Error fetching usage breakdown:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

