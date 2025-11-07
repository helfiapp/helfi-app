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
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { subscription: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const cm = new CreditManager(user.id)
    const status = await cm.getWalletStatus()

    // Compute next reset timestamp (1st of next month, UTC)
    const now = new Date()
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))

    return NextResponse.json({
      percentUsed: status.percentUsed, // percentage of monthly wallet only
      refreshAt: nextReset.toISOString(),
      plan: status.plan, // Include plan to check if user has PREMIUM
      // Additional details for UI (kept minimal; no dollar values shown)
      monthlyCapCents: status.monthlyCapCents,
      monthlyUsedCents: status.monthlyUsedCents,
      topUps: status.topUps, // [{ id, availableCents, expiresAt }]
      totalAvailableCents: status.totalAvailableCents,
    })
  } catch (err) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





