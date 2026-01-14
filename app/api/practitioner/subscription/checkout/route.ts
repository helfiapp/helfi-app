import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const priceId = process.env.STRIPE_PRICE_PRACTITIONER_LISTING
  if (!stripeSecretKey || !priceId) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 500 })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: {
      practitionerAccount: { userId: session.user.id },
      reviewStatus: 'APPROVED',
    },
    include: { subscription: true },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found or not approved yet.' }, { status: 404 })
  }

  if (listing.subscription?.status === 'ACTIVE') {
    return NextResponse.json({ error: 'Subscription already active.' }, { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  const origin = new URL(request.url).origin

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/practitioner?checkout=success`,
    cancel_url: `${origin}/practitioner?checkout=cancelled`,
    customer_email: session.user.email,
    payment_method_collection: 'always',
    metadata: {
      helfi_listing_id: listing.id,
      helfi_listing_subscription: '1',
      helfi_user_id: session.user.id,
    },
    subscription_data: {
      metadata: {
        helfi_listing_id: listing.id,
        helfi_listing_subscription: '1',
        helfi_user_id: session.user.id,
      },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
