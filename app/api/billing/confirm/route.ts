import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// Force dynamic so this route isn't considered for static optimization at build time
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const sessionParam = new URL(request.url).searchParams.get('session_id')
    if (!sessionParam) {
      return NextResponse.json({ error: 'missing_session_id' }, { status: 400 })
    }
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 })
    }
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })
    const checkout = await stripe.checkout.sessions.retrieve(sessionParam, {
      expand: ['line_items', 'payment_intent'],
    })

    if (checkout.payment_status !== 'paid') {
      return NextResponse.json({ error: 'not_paid' }, { status: 400 })
    }

    // Determine the user
    const serverSession = (await getServerSession(authOptions as any)) as any
    const email = (serverSession?.user?.email as string) || (checkout.customer_details?.email ?? checkout.customer_email ?? '')
    if (!email) {
      return NextResponse.json({ error: 'user_email_missing' }, { status: 400 })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    // Only process one time
    const existing = await prisma.creditTopUp.findFirst({
      where: { userId: user.id, source: `stripe:${checkout.id}` },
    })
    if (existing) {
      return NextResponse.json({ ok: true, alreadyProcessed: true })
    }

    // For credit purchases we used Checkout in 'payment' mode.
    const amountCents = typeof checkout.amount_total === 'number' ? checkout.amount_total : 0
    if (amountCents <= 0 || checkout.mode !== 'payment') {
      return NextResponse.json({ error: 'not_a_credit_purchase' }, { status: 400 })
    }

    const purchasedAt = new Date()
    const expiresAt = new Date(purchasedAt)
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 12)

    await prisma.creditTopUp.create({
      data: {
        userId: user.id,
        amountCents,
        usedCents: 0,
        purchasedAt,
        expiresAt,
        source: `stripe:${checkout.id}`,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[billing.confirm] error', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


