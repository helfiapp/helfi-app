import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { precomputeIssueSectionsForUser, precomputeQuickSectionsForUser } from '@/lib/insights/issue-engine'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

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

    // Update monthly counter
    await prisma.user.update({
      where: { id: userId },
      data: {
        monthlyInsightsGenerationUsed: { increment: 1 },
      } as any,
    })

    // Trigger regeneration for all issues (non-blocking)
    // Start quick regeneration first, then full regeneration in background
    setImmediate(async () => {
      try {
        console.log('🚀 Starting insights regeneration for user:', userId)
        
        // Quick regeneration first (faster, less detailed)
        await precomputeQuickSectionsForUser(userId, { concurrency: 4 })
        
        // Full regeneration in background (more detailed, takes longer)
        await precomputeIssueSectionsForUser(userId, { concurrency: 2 })
        
        console.log('✅ Insights regeneration complete for user:', userId)
      } catch (error) {
        console.error('❌ Insights regeneration failed:', error)
      }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Insights regeneration started. This may take a few minutes.',
      creditsCharged: costCents
    }, { status: 202 }) // 202 Accepted - processing in background

  } catch (error) {
    console.error('Error regenerating insights:', error)
    return NextResponse.json({ 
      error: 'Failed to regenerate insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

