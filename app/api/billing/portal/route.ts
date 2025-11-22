import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
    }

    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })
    const email = session.user.email.toLowerCase()

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email, limit: 1 })
    if (!customers.data.length) {
      // User might have admin-granted subscription without Stripe customer
      // Return a helpful error message
      return NextResponse.json({ 
        error: 'No Stripe customer found',
        message: 'Your subscription was granted by an administrator. Please contact support to manage your subscription, or subscribe through Stripe to enable self-service management.'
      }, { status: 404 })
    }

    const customerId = customers.data[0].id
    const returnUrl = `${req.nextUrl.origin}/billing`

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error('Error creating portal session:', error)
    return NextResponse.json({ 
      error: 'Failed to create portal session',
      details: error?.message || 'Unknown error',
      code: error?.code || 'NO_CODE'
    }, { status: 500 })
  }
}
