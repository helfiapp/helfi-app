import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { notifyOwner } from '@/lib/owner-notifications'
import { reportCriticalError } from '@/lib/error-reporter'
import { purchasedCredits, grantStripeCreditPurchase } from '@/lib/stripe-credit-purchase'

// Force dynamic so this route isn't considered for static optimization at build time
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  let sessionParam: string | null = null
  try {
    sessionParam = new URL(request.url).searchParams.get('session_id')
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

    const serverSession = (await getServerSession(authOptions as any)) as any
    const sessionUserId = (serverSession?.user?.id as string) || ''
    const sessionEmail = ((serverSession?.user?.email as string) || '').toLowerCase()
    const metadata = (checkout.metadata || {}) as Record<string, string>
    const metaUserId = String(metadata.helfi_user_id || '').trim()
    const metaEmail = String(metadata.helfi_user_email || '').toLowerCase().trim()
    const checkoutEmail = String(checkout.customer_details?.email || checkout.customer_email || '').toLowerCase().trim()
    const expectedUserId = metaUserId
    const expectedEmail = metaEmail || checkoutEmail

    if ((sessionUserId || sessionEmail) && (expectedUserId || expectedEmail)) {
      const matchesId = expectedUserId && sessionUserId && expectedUserId === sessionUserId
      const matchesEmail = expectedEmail && sessionEmail && expectedEmail === sessionEmail
      if (!matchesId && !matchesEmail) {
        return NextResponse.json({ error: 'user_mismatch' }, { status: 403 })
      }
    }

    let user = null as { id: string; email: string; name: string | null } | null
    if (expectedUserId) {
      user = await prisma.user.findUnique({ where: { id: expectedUserId }, select: { id: true, email: true, name: true } })
    } else if (expectedEmail) {
      user = await prisma.user.findUnique({ where: { email: expectedEmail }, select: { id: true, email: true, name: true } })
    } else if (sessionEmail) {
      user = await prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true, email: true, name: true } })
    }

    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    // For credit purchases we used Checkout in 'payment' mode.
    const paymentCents = typeof checkout.amount_total === 'number' ? checkout.amount_total : 0
    const walletCredits = purchasedCredits(checkout)
    if (paymentCents <= 0 || checkout.mode !== 'payment' || checkout.status !== 'complete' || !walletCredits) {
      return NextResponse.json({ error: 'not_a_credit_purchase' }, { status: 400 })
    }

    const created = await grantStripeCreditPurchase(stripe, checkout, user.id)
    if (typeof created === 'string') return NextResponse.json({ error: 'payment_refunded_or_unavailable' }, { status: 400 })
    if (!created) return NextResponse.json({ ok: true, alreadyProcessed: true })

    // Notify owner of credit purchase (don't await to avoid blocking response)
    notifyOwner({
      event: 'credit_purchase',
      userEmail: user.email,
      userName: user.name || undefined,
      amount: paymentCents,
      currency: (checkout.currency || 'usd').toUpperCase(),
      creditAmount: walletCredits,
    }).catch(error => {
      console.error('❌ Owner notification failed (non-blocking):', error)
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    reportCriticalError({
      source: 'billing.confirm',
      error: err,
      details: {
        sessionId: sessionParam || undefined,
      },
    })
    console.error('[billing.confirm] error', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
