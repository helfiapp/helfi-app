import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCT_NAME = 'Practitioner Listing'
const PRODUCT_DESCRIPTION = 'Monthly subscription to keep a practitioner listing active after the free review period. USD $4.95 per month per listing.'
const PRICE_AMOUNT = 495 // $4.95 in cents
const CURRENCY = 'usd'
const BILLING_INTERVAL = 'month'
const TAX_CODE = 'txcd_10103000' // Software as a service (SaaS) - personal use

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })

  try {
    // Create the product
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      tax_code: TAX_CODE,
    })

    // Create the recurring price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_AMOUNT,
      currency: CURRENCY,
      recurring: {
        interval: BILLING_INTERVAL,
      },
    })

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
      },
      price: {
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval,
      },
      environmentVariable: {
        name: 'STRIPE_PRICE_PRACTITIONER_LISTING',
        value: price.id,
      },
    })
  } catch (error: any) {
    console.error('Error creating Stripe product:', error)
    return NextResponse.json(
      { error: 'Failed to create product', message: error.message },
      { status: 500 }
    )
  }
}
