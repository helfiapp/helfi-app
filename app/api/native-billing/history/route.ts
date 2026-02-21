import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type BillingUser = {
  id: string
  email: string
}

type BillingHistoryItem = {
  id: string
  type: 'subscription' | 'topup'
  title: string
  subtitle: string
  amountText: string
  status: string
  occurredAt: string
}

function centsToDollars(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

function sourceLabel(source: string): string {
  const raw = source.trim().toLowerCase()
  if (!raw) return 'Unknown source'
  if (raw.startsWith('apple_iap:')) return 'Apple App Store'
  if (raw.startsWith('google_iap:')) return 'Google Play'
  if (raw.startsWith('cs_') || raw.includes('stripe')) return 'Stripe'
  if (raw.includes('admin')) return 'Admin'
  return 'Other source'
}

async function getBillingUser(request: NextRequest): Promise<BillingUser | null> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true },
    })
    if (user?.id && user?.email) return user
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const user = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true },
  })
  if (!user?.id || !user?.email) return null
  return user
}

export async function GET(request: NextRequest) {
  try {
    const user = await getBillingUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [subscription, topUps] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          monthlyPriceCents: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.creditTopUp.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          amountCents: true,
          usedCents: true,
          purchasedAt: true,
          expiresAt: true,
          source: true,
        },
        orderBy: { purchasedAt: 'desc' },
        take: 60,
      }),
    ])

    const now = new Date()
    const items: BillingHistoryItem[] = []

    if (subscription?.startDate) {
      const amountCents = Number(subscription.monthlyPriceCents || 0)
      const isActive = !subscription.endDate || subscription.endDate > now
      items.push({
        id: `subscription-${subscription.id}`,
        type: 'subscription',
        title: 'Monthly subscription',
        subtitle: amountCents > 0 ? `${centsToDollars(amountCents)} per month` : 'Premium subscription',
        amountText: amountCents > 0 ? centsToDollars(amountCents) : 'Premium',
        status: isActive ? 'Active' : 'Ended',
        occurredAt: subscription.startDate.toISOString(),
      })
    }

    for (const topUp of topUps) {
      const amountCents = Number(topUp.amountCents || 0)
      const credits = Math.floor(Math.max(0, amountCents) / 100)
      const remaining = Math.max(0, amountCents - Number(topUp.usedCents || 0))
      const expired = topUp.expiresAt <= now
      const status = expired ? 'Expired' : remaining <= 0 ? 'Used' : 'Available'

      items.push({
        id: `topup-${topUp.id}`,
        type: 'topup',
        title: 'Credit top-up',
        subtitle: `${credits.toLocaleString()} credits • ${sourceLabel(String(topUp.source || ''))}`,
        amountText: centsToDollars(amountCents),
        status,
        occurredAt: topUp.purchasedAt.toISOString(),
      })
    }

    items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

    return NextResponse.json({
      ok: true,
      history: items,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to load billing history',
        message: error?.message || 'Unknown error',
      },
      { status: 500 },
    )
  }
}
