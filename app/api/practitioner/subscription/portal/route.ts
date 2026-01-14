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
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 500 })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: {
      practitionerAccount: { userId: session.user.id },
    },
    include: { subscription: true },
  })

  if (!listing?.subscription) {
    return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 })
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  let customerId = listing.subscription.providerCustomerId || null

  if (!customerId) {
    const customers = await stripe.customers.list({
      email: session.user.email.toLowerCase(),
      limit: 1,
    })
    customerId = customers.data[0]?.id || null
    if (customerId) {
      await prisma.practitionerListingSubscription.update({
        where: { listingId: listing.id },
        data: { providerCustomerId: customerId },
      })
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: 'Stripe customer not found.' }, { status: 404 })
  }

  const origin = new URL(request.url).origin
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/practitioner`,
  })

  return NextResponse.json({ url: portalSession.url })
}
