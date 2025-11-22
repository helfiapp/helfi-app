import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Debug endpoint to check what's happening
export async function GET(request: NextRequest) {
  const debug: any = {
    timestamp: new Date().toISOString(),
    checks: []
  }

  try {
    // Check 1: Session
    const session = await getServerSession(authOptions)
    debug.checks.push({
      name: 'Session',
      status: session ? 'OK' : 'FAILED',
      email: session?.user?.email || 'N/A'
    })

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized', debug }, { status: 401 })
    }

    // Check 2: Stripe Config
    const stripeKey = process.env.STRIPE_SECRET_KEY
    debug.checks.push({
      name: 'Stripe Config',
      status: stripeKey ? 'OK' : 'FAILED',
      keyPrefix: stripeKey ? stripeKey.substring(0, 10) + '...' : 'NOT SET'
    })

    // Check 3: User lookup
    let user
    try {
      user = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { id: true, email: true }
      })
      debug.checks.push({
        name: 'User Lookup',
        status: user ? 'OK' : 'NOT FOUND',
        userId: user?.id || 'N/A'
      })
    } catch (error: any) {
      debug.checks.push({
        name: 'User Lookup',
        status: 'ERROR',
        error: error?.message
      })
      return NextResponse.json({ error: 'User lookup failed', debug }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found', debug }, { status: 404 })
    }

    // Check 4: Subscription lookup
    let subscription
    try {
      subscription = await prisma.subscription.findFirst({
        where: { userId: user.id },
      })
      debug.checks.push({
        name: 'Subscription Lookup',
        status: subscription ? 'OK' : 'NOT FOUND',
        subscriptionId: subscription?.id || 'N/A',
        monthlyPriceCents: subscription?.monthlyPriceCents || 'N/A'
      })
    } catch (error: any) {
      debug.checks.push({
        name: 'Subscription Lookup',
        status: 'ERROR',
        error: error?.message,
        stack: error?.stack
      })
      return NextResponse.json({ error: 'Subscription lookup failed', debug }, { status: 500 })
    }

    // Check 5: Try to access stripeSubscriptionId
    try {
      const stripeId = (subscription as any)?.stripeSubscriptionId
      debug.checks.push({
        name: 'Stripe Subscription ID Access',
        status: 'OK',
        value: stripeId || 'NULL'
      })
    } catch (error: any) {
      debug.checks.push({
        name: 'Stripe Subscription ID Access',
        status: 'ERROR',
        error: error?.message
      })
    }

    return NextResponse.json({ 
      success: true,
      debug,
      subscription: subscription ? {
        id: subscription.id,
        monthlyPriceCents: subscription.monthlyPriceCents,
        stripeSubscriptionId: (subscription as any).stripeSubscriptionId || null
      } : null
    })
  } catch (error: any) {
    debug.checks.push({
      name: 'Overall Error',
      status: 'ERROR',
      error: error?.message,
      stack: error?.stack
    })
    return NextResponse.json({ error: 'Debug endpoint failed', debug }, { status: 500 })
  }
}

