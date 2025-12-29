import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { precomputeIssueSectionsForUser, precomputeQuickSectionsForUser } from '@/lib/insights/issue-engine'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { withRunContext } from '@/lib/run-context'
import { randomUUID } from 'crypto'
import { consumeFreeCredit, hasFreeCredits } from '@/lib/free-credits'
import { isSubscriptionActive } from '@/lib/subscription-utils'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true, creditTopUps: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = isSubscriptionActive(user.subscription)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps?.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    const hasFreeInsightsCredits = await hasFreeCredits(userId, 'INSIGHTS_UPDATE')
    const allowViaFreeUse = !isPremium && !hasPurchasedCredits && hasFreeInsightsCredits
    if (!isPremium && !hasPurchasedCredits && !hasFreeInsightsCredits) {
      return NextResponse.json({
        error: 'Insufficient credits',
        message: 'You\'ve used all your free insights updates. Please purchase credits or subscribe.',
        exhaustedFreeCredits: true,
      }, { status: 402 })
    }

    if (!allowViaFreeUse) {
      // Check if user has credits
      const cm = new CreditManager(userId)
      const hasCredits = await cm.checkCredits('INSIGHTS_GENERATION')
      
      if (!hasCredits.hasCredits) {
        return NextResponse.json({ 
          error: 'Insufficient credits',
          message: 'You need credits to regenerate insights. Please purchase credits or subscribe.'
        }, { status: 402 })
      }

      // Charge credits for insights regeneration
      const costCents = CREDIT_COSTS.INSIGHTS_GENERATION
      const charged = await cm.chargeCents(costCents)
      
      if (!charged) {
        return NextResponse.json({ 
          error: 'Failed to charge credits',
          message: 'Unable to process payment. Please try again.'
        }, { status: 402 })
      }
    } else {
      await consumeFreeCredit(userId, 'INSIGHTS_UPDATE')
    }

    // Update monthly counter
    await prisma.user.update({
      where: { id: userId },
      data: {
        monthlyInsightsGenerationUsed: { increment: 1 },
      } as any,
    })

    // Trigger FULL regeneration for all issues (not just quick cache)
    // Start quick regeneration first, then full regeneration
    setImmediate(async () => {
      try {
        const runId = randomUUID()
        console.log('🚀 Starting FULL insights regeneration for user:', userId)
        
        // Generate full insights for all issues
        await withRunContext(
          { runId, feature: 'insights:regenerate', meta: { userId } },
          () => precomputeIssueSectionsForUser(userId, { concurrency: 2 })
        )
        
        console.log('✅ FULL insights regeneration complete for user:', userId)
      } catch (error) {
        console.error('❌ FULL insights regeneration failed:', error)
      }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Insights regeneration started. This may take a few minutes.',
      creditsCharged: allowViaFreeUse ? 0 : CREDIT_COSTS.INSIGHTS_GENERATION
    }, { status: 202 }) // 202 Accepted - processing in background

  } catch (error) {
    console.error('Error regenerating insights:', error)
    return NextResponse.json({ 
      error: 'Failed to regenerate insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
