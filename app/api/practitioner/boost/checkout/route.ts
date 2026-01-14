import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildGeoKey } from '@/lib/practitioner-utils'

const PRICE_BY_RADIUS: Record<string, number> = {
  R5: 500,
  R10: 1000,
  R25: 1500,
  R50: 2000,
}

const LABEL_BY_RADIUS: Record<string, string> = {
  R5: '5 km',
  R10: '10 km',
  R25: '25 km',
  R50: '50 km',
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const radiusTier = String(body?.radiusTier || '').trim()
  const priceCents = PRICE_BY_RADIUS[radiusTier]
  const radiusLabel = LABEL_BY_RADIUS[radiusTier]

  if (!priceCents || !radiusLabel) {
    return NextResponse.json({ error: 'Invalid radius selection.' }, { status: 400 })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: {
      practitionerAccount: { userId: session.user.id },
      reviewStatus: 'APPROVED',
    },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found or not approved yet.' }, { status: 404 })
  }

  if (listing.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Boosts are only available for active listings.' }, { status: 400 })
  }

  const geoKey = buildGeoKey({
    country: listing.country,
  })

  if (!geoKey) {
    return NextResponse.json({ error: 'Listing location is incomplete.' }, { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  const origin = new URL(request.url).origin

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Helfi Boost (7 days) - ${radiusLabel}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/practitioner?boost=success`,
    cancel_url: `${origin}/practitioner?boost=cancelled`,
    customer_email: session.user.email,
    metadata: {
      helfi_boost: '1',
      helfi_boost_listing_id: listing.id,
      helfi_boost_radius_tier: radiusTier,
      helfi_boost_geo_key: geoKey,
      helfi_boost_category_id: listing.categoryId,
      helfi_boost_price_cents: String(priceCents),
      helfi_boost_duration_days: '7',
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
