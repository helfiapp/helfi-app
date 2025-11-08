import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CreditManager } from '@/lib/credit-system'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email }, 
      include: { subscription: true, creditTopUps: true } 
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isPremium = user.subscription?.plan === 'PREMIUM'
    
    // Check if user has purchased credits (non-expired)
    const now = new Date()
    const hasPurchasedCredits = user.creditTopUps.some(
      (topUp: any) => topUp.expiresAt > now && (topUp.amountCents - topUp.usedCents) > 0
    )
    
    // Only show usage meter if user has subscription OR purchased credits
    if (!isPremium && !hasPurchasedCredits) {
      return NextResponse.json({
        plan: null,
        percentUsed: 0,
        refreshAt: null,
        monthlyCapCents: 0,
        monthlyUsedCents: 0,
        topUps: [],
        totalAvailableCents: 0,
        hasAccess: false
      })
    }

    const cm = new CreditManager(user.id)
    const status = await cm.getWalletStatus()
    // Also fetch credit counts (daily + additional) to support numeric credit display
    const creditCounts = await cm.checkCredits('SYMPTOM_ANALYSIS')

    // Compute next reset timestamp (1st of next month, UTC)
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))

    return NextResponse.json({
      percentUsed: status.percentUsed, // percentage of monthly wallet only
      refreshAt: nextReset.toISOString(),
      plan: status.plan, // Include plan to check if user has PREMIUM
      hasAccess: true, // User has subscription or credits
      // Additional details for UI (kept minimal; no dollar values shown)
      monthlyCapCents: status.monthlyCapCents,
      monthlyUsedCents: status.monthlyUsedCents,
      topUps: status.topUps, // [{ id, availableCents, expiresAt }]
      totalAvailableCents: status.totalAvailableCents,
      // Credits (credits == cents). These include daily allowance + additional purchased credits.
      credits: {
        total: creditCounts.totalCreditsRemaining,
        dailyRemaining: creditCounts.dailyCreditsRemaining,
        additionalRemaining: creditCounts.additionalCreditsRemaining,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





