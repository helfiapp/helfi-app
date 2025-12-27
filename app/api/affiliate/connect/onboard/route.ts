import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getAffiliateUser } from '@/lib/affiliate-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getAffiliateUser(request)
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })

  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true, stripeConnectAccountId: true },
  })
  if (!affiliate || affiliate.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Not an active affiliate' }, { status: 403 })
  }

  const origin = new URL(request.url).origin
  const returnUrl = `${origin}/affiliate`

  let accountId = affiliate.stripeConnectAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email: user.email,
      capabilities: { transfers: { requested: true } },
      metadata: { helfi_affiliate_id: affiliate.id },
    })
    accountId = account.id
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { stripeConnectAccountId: accountId },
    })
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}?connect=refresh`,
    return_url: `${returnUrl}?connect=return`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}
