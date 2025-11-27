import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

    // Check if user already has an active subscription (only for subscription plans, not credit top-ups)
    if (!isCredits && customerEmail) {
      try {
        const user = await prisma.user.findUnique({
          where: { email: customerEmail.toLowerCase() },
          include: { subscription: true }
        })

        if (user?.subscription) {
          // Check if subscription is active (no endDate or endDate is in the future)
          const now = new Date()
          const isActive = !user.subscription.endDate || new Date(user.subscription.endDate) > now

          if (isActive) {
            // Determine current plan tier for better error message
            const currentTier = user.subscription.monthlyPriceCents
            let tierName = 'Premium'
            if (currentTier === 1000) tierName = '$10/month (700 credits)'
            else if (currentTier === 2000) tierName = '$20/month (1,400 credits)'
            else if (currentTier === 3000) tierName = '$30/month (2,100 credits)'
            else if (currentTier === 5000) tierName = '$50/month (3,500 credits)'
            else if (currentTier) tierName = `$${(currentTier / 100).toFixed(0)}/month`

            return NextResponse.json(
              { 
                error: 'You already have an active subscription',
                message: `You are currently subscribed to ${tierName}. Please cancel your existing subscription before subscribing to a new plan.`,
                currentPlan: tierName
              },
              { status: 400 }
            )
          }
        }
      } catch (error) {
        console.error('Error checking existing subscription:', error)
        // Continue with checkout if we can't check (don't block user)
      }
    }

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
