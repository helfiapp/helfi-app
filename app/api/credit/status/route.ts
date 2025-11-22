import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ABSOLUTE GUARD RAIL:
// This endpoint powers the "Credits remaining" bar. Do NOT change credit
// calculation rules or disable billing here without:
//   1) Reading `GUARD_RAILS.md` (credits section), and
//   2) Getting explicit written approval from the user.
//
// This API must always be dynamic because it depends on per-request auth headers.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Direct mapping of subscription price → monthly wallet credits
// Mirrors CreditManager.SUBSCRIPTION_CREDITS_MAP but kept local here to
// avoid depending on wallet internals (display‑only endpoint).
const SUBSCRIPTION_CREDITS_MAP: Record<number, number> = {
  2000: 1400, // $20/month → 1,400 credits
  3000: 2100, // $30/month → 2,100 credits
  5000: 3500, // $50/month → 3,500 credits
}

function creditsForSubscriptionPrice(monthlyPriceCents: number | null | undefined): number {
  if (!monthlyPriceCents) return 0
  if (SUBSCRIPTION_CREDITS_MAP[monthlyPriceCents]) {
    return SUBSCRIPTION_CREDITS_MAP[monthlyPriceCents]
  }
  // Fallback: 50% of price as credits if an unknown tier appears
  const percent = Number(process.env.HELFI_WALLET_PLAN_PERCENT || '0.5')
  const safePercent = percent > 0 && percent <= 1 ? percent : 0.5
  return Math.floor(monthlyPriceCents * safePercent)
}

function monthlyCapFromSubscription(sub: any | null | undefined): number {
  if (!sub?.plan) return 0
  if (sub.monthlyPriceCents != null) {
    return creditsForSubscriptionPrice(sub.monthlyPriceCents)
  }
  // Defensive fallback by plan name if price is missing
  if (sub.plan === 'PREMIUM') return SUBSCRIPTION_CREDITS_MAP[2000] || 1000
  return 0
}

function computeNextResetAt(subscriptionStart: Date | null): string | null {
  try {
    const now = new Date()
    if (!subscriptionStart) {
      // Calendar‑month reset: first day of next month (UTC)
      const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
      return nextReset.toISOString()
    }

    // Align reset with subscription billing day (same logic as usage‑breakdown)
    const subStartDate = new Date(subscriptionStart)
    const startYear = subStartDate.getUTCFullYear()
    const startMonth = subStartDate.getUTCMonth()
    const startDay = subStartDate.getUTCDate()

    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    const currentDay = now.getUTCDate()

    let monthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth)
    if (currentDay >= startDay) {
      monthsSinceStart += 1
    }

    const nextReset = new Date(Date.UTC(startYear, startMonth + monthsSinceStart, startDay, 0, 0, 0, 0))
    return nextReset.toISOString()
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest) {
  let debugStage = 'start'
  try {
    // 1) Resolve current user (session or JWT fallback)
    debugStage = 'resolve-session'
    let session = await getServerSession(authOptions)
    let userEmail: string | null = session?.user?.email ?? null

    if (!userEmail) {
      try {
        const token = await getToken({
          req: _req,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
        })
        if (token?.email) {
          userEmail = String(token.email)
        }
      } catch (tokenError) {
        console.error('/api/credit/status - JWT fallback failed:', tokenError)
      }
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2) Load user with all fields needed for wallet + legacy credits
    debugStage = 'load-user'
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        // Legacy daily/additional credits
        dailyAnalysisCredits: true,
        dailyAnalysisUsed: true,
        additionalCredits: true,
        // Wallet + subscription
        walletMonthlyUsedCents: true,
        subscription: {
          select: {
            plan: true,
            monthlyPriceCents: true,
            startDate: true,
          },
        },
        creditTopUps: {
          select: {
            id: true,
            amountCents: true,
            usedCents: true,
            expiresAt: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const now = new Date()
    const isPremium = user.subscription?.plan === 'PREMIUM'

    // 3) Wallet‑style credits (subscription + top‑ups)
    debugStage = 'wallet-calc'
    const monthlyCapCents = monthlyCapFromSubscription(user.subscription)
    const monthlyUsedCents = user.walletMonthlyUsedCents || 0
    const monthlyRemainingCents = Math.max(0, monthlyCapCents - monthlyUsedCents)

    const activeTopUps = (user.creditTopUps || []).filter((t) => t.expiresAt > now)
    const topUpsTotalAvailable = activeTopUps.reduce(
      (sum, t) => sum + Math.max(0, t.amountCents - t.usedCents),
      0
    )
    const topUpsTotalPurchased = activeTopUps.reduce((sum, t) => sum + t.amountCents, 0)
    const topUpsTotalUsed = activeTopUps.reduce((sum, t) => sum + t.usedCents, 0)

    const totalAvailableCents = monthlyRemainingCents + topUpsTotalAvailable

    let percentUsed = 0
    if (monthlyCapCents > 0) {
      percentUsed = Math.min(100, Math.floor((monthlyUsedCents / monthlyCapCents) * 100))
    } else if (topUpsTotalPurchased > 0) {
      percentUsed = Math.min(100, Math.floor((topUpsTotalUsed / topUpsTotalPurchased) * 100))
    }

    // 4) Legacy daily/additional credits (for truly free accounts)
    debugStage = 'legacy-calc'
    const dailyRemainingLegacy = Math.max(
      0,
      (user.dailyAnalysisCredits || 0) - (user.dailyAnalysisUsed || 0)
    )
    const additionalRemainingLegacy = user.additionalCredits || 0
    const legacyTotal = dailyRemainingLegacy + additionalRemainingLegacy

    // For subscription / wallet users, show wallet credits.
    // For non‑subscription users without wallet credits, fall back to legacy.
    const hasWalletCredits = totalAvailableCents > 0
    const showLegacy = !isPremium && !hasWalletCredits

    const creditsTotal = showLegacy ? legacyTotal : totalAvailableCents

    debugStage = 'compute-reset'
    const refreshAt = computeNextResetAt(user.subscription?.startDate ?? null)

    return NextResponse.json({
      schemaVersion: 2,
      debugStage: 'success',
      percentUsed,
      refreshAt,
      plan: user.subscription?.plan ?? null,
      // Any authenticated user can see the meter; billing enforcement happens in
      // the analyzer APIs.
      hasAccess: true,
      monthlyCapCents,
      monthlyUsedCents,
      topUps: activeTopUps.map((t) => ({
        id: t.id,
        availableCents: Math.max(0, t.amountCents - t.usedCents),
        expiresAt: t.expiresAt,
      })),
      totalAvailableCents,
      credits: {
        total: creditsTotal,
        dailyRemaining: showLegacy ? dailyRemainingLegacy : 0,
        additionalRemaining: showLegacy ? additionalRemainingLegacy : 0,
      },
    })
  } catch (err: any) {
    console.error('Error in /api/credit/status:', err)
    // Degrade gracefully: zero credits but keep shape stable so UI can render.
    return NextResponse.json({
      schemaVersion: 2,
      debugStage,
      percentUsed: 0,
      refreshAt: null,
      plan: null,
      hasAccess: false,
      monthlyCapCents: 0,
      monthlyUsedCents: 0,
      topUps: [],
      totalAvailableCents: 0,
      credits: {
        total: 0,
        dailyRemaining: 0,
        additionalRemaining: 0,
      },
      degraded: true,
      errorType: err?.name || 'UnknownError',
      errorMessage: err?.message || 'Unknown error',
    })
  }
}
