import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { CreditManager } from '@/lib/credit-system'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  try {
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null
    let usedTokenFallback = false

    if (!userEmail) {
      try {
        const token = await getToken({
          req: _req,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
          usedTokenFallback = true
        }
      } catch (tokenError) {
        console.error('/api/credit/status - JWT fallback failed:', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ 
      where: { email: userEmail }, 
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
    // For subscription users, credits come from wallet (monthlyCapCents - monthlyUsedCents + top-ups)
    // For non-subscription users with top-ups, also use wallet totalAvailableCents
    // Only use old credit system (daily + additional) if no subscription and no top-ups
    const hasSubscription = status.plan !== null
    const walletCreditsTotal = status.totalAvailableCents // This includes monthly remaining + top-ups
    
    // Only fetch old credit system if needed (no subscription and no wallet credits)
    let creditCounts = null
    if (!hasSubscription && walletCreditsTotal === 0) {
      creditCounts = await cm.checkCredits('SYMPTOM_ANALYSIS')
    }
    
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
      // Credits: Use wallet-based credits for subscription users or users with top-ups
      // Otherwise fall back to old credit system (daily + additional)
      credits: {
        total: walletCreditsTotal > 0 ? walletCreditsTotal : (creditCounts?.totalCreditsRemaining ?? 0),
        dailyRemaining: hasSubscription ? 0 : (creditCounts?.dailyCreditsRemaining ?? 0),
        additionalRemaining: hasSubscription ? 0 : (creditCounts?.additionalCreditsRemaining ?? 0),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





