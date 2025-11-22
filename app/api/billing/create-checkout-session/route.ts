import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'

// POST /api/billing/create-checkout-session
export async function POST(request: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-06-20',
    })

    const url = new URL(request.url)
    const origin = url.origin

    const body = await request.json().catch(() => ({} as any))
    const requestedPlan: string | undefined = body?.plan
    const quantity: number = Number(body?.quantity || 1)

    const PLAN_TO_PRICE: Record<string, string | undefined> = {
      // Monthly subscription plans
      plan_10_monthly: process.env.STRIPE_PRICE_10_MONTHLY,
      plan_20_monthly: process.env.STRIPE_PRICE_20_MONTHLY,
      plan_30_monthly: process.env.STRIPE_PRICE_30_MONTHLY,
      plan_50_monthly: process.env.STRIPE_PRICE_50_MONTHLY,
      // Legacy plan names (for backward compatibility)
      premium_monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      premium_yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
      premium_plus_monthly: process.env.STRIPE_PRICE_PREMIUM_PLUS_MONTHLY,
      premium_plus_yearly: process.env.STRIPE_PRICE_PREMIUM_PLUS_YEARLY,
      // Credit top-ups (one-time payments)
      credits_250: process.env.STRIPE_PRICE_CREDITS_250,
      credits_500: process.env.STRIPE_PRICE_CREDITS_500,
      credits_1000: process.env.STRIPE_PRICE_CREDITS_1000,
      // Legacy credit name
      credits_100: process.env.STRIPE_PRICE_CREDITS_100,
    }

    const priceId = requestedPlan ? PLAN_TO_PRICE[requestedPlan] : undefined

    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan or price not configured' }, { status: 400 })
    }

    const isCredits = (requestedPlan ?? '').startsWith('credits_')

    // Get user email from session if available
    const session = await getServerSession(authOptions)
    const customerEmail = session?.user?.email || undefined

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: isCredits ? 'payment' : 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      customer_email: customerEmail,
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      // No trial period - subscriptions start immediately
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}

