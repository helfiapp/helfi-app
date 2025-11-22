import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

// GET /api/billing/subscription - Get current subscription status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Stripe configuration
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not set')
      return NextResponse.json({ 
        error: 'Stripe not configured',
        details: 'STRIPE_SECRET_KEY environment variable is missing'
      }, { status: 500 })
    }

    // Fetch user and subscription separately to avoid Prisma client issues
    let user
    try {
      user = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { id: true, email: true, name: true }
      })
    } catch (error) {
      console.error('Error fetching user:', error)
      return NextResponse.json({ 
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch subscription using raw SQL to avoid Prisma schema issues with stripeSubscriptionId column
    let subscription
    try {
      const subscriptionResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, "userId", plan, "monthlyPriceCents", "startDate", "endDate"
         FROM "Subscription"
         WHERE "userId" = $1
         LIMIT 1`,
        user.id
      )
      subscription = subscriptionResult && subscriptionResult.length > 0 ? subscriptionResult[0] : null
      
      // Try to get stripeSubscriptionId separately if column exists
      if (subscription) {
        try {
          const stripeIdResult: any[] = await prisma.$queryRawUnsafe(
            `SELECT "stripeSubscriptionId" FROM "Subscription" WHERE "userId" = $1 LIMIT 1`,
            user.id
          )
          if (stripeIdResult && stripeIdResult.length > 0) {
            subscription.stripeSubscriptionId = stripeIdResult[0].stripeSubscriptionId || null
          } else {
            subscription.stripeSubscriptionId = null
          }
        } catch {
          // Column doesn't exist, set to null
          subscription.stripeSubscriptionId = null
        }
      }
    } catch (error: any) {
      console.error('Error fetching subscription:', error)
      return NextResponse.json({ 
        error: 'Database error',
        details: error?.message || 'Unknown error'
      }, { status: 500 })
    }
    
    if (!subscription) {
      return NextResponse.json({ 
        hasSubscription: false,
        subscription: null
      })
    }

    // Check if subscription is active
    const now = new Date()
    const endDate = subscription.endDate ? new Date(subscription.endDate) : null
    const isActive = !endDate || endDate > now

    // Get Stripe subscription details if available
    let stripeSubscription = null
    // Safely access stripeSubscriptionId field (may not exist in Prisma types yet)
    const stripeSubscriptionId = (subscription as any).stripeSubscriptionId || null
    
    if (stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
      } catch (error: any) {
        console.error('Error fetching Stripe subscription:', error?.message || error)
        // Continue without Stripe data - subscription might have been deleted in Stripe
      }
    } else {
      // Try to find Stripe subscription by customer email
      try {
        const customers = await stripe.customers.list({
          email: session.user.email.toLowerCase(),
          limit: 1
        })
        
        if (customers.data.length > 0) {
          const customer = customers.data[0]
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 1
          })
          
          if (subscriptions.data.length > 0) {
            stripeSubscription = subscriptions.data[0]
            // Update database with Stripe subscription ID (only if column exists) - use raw SQL
            try {
              await prisma.$executeRawUnsafe(
                `UPDATE "Subscription" SET "stripeSubscriptionId" = $1 WHERE "userId" = $2`,
                stripeSubscription.id,
                user.id
              )
            } catch (updateError: any) {
              console.error('Error updating stripeSubscriptionId:', updateError?.message || updateError)
              // Continue without updating - column might not exist yet
            }
          }
        }
      } catch (error: any) {
        console.error('Error finding Stripe subscription by email:', error?.message || error)
        // Continue without Stripe data - user might not have Stripe customer yet
      }
    }

    // Determine plan tier name
    const currentTier = subscription.monthlyPriceCents
    let tierName = 'Premium'
    let credits = 0
    if (currentTier === 1000) {
      tierName = '$10/month'
      credits = 500
    } else if (currentTier === 2000) {
      tierName = '$20/month'
      credits = 1000
    } else if (currentTier === 3000) {
      tierName = '$30/month'
      credits = 1500
    } else if (currentTier === 5000) {
      tierName = '$50/month'
      credits = 2500
    } else if (currentTier) {
      tierName = `$${(currentTier / 100).toFixed(0)}/month`
      // Estimate credits based on price (rough approximation)
      credits = Math.round(currentTier / 2) // $1 = ~50 credits
    } else {
      // Default for admin-granted subscriptions without price set
      tierName = 'Premium'
      credits = 1000 // Default estimate
    }

    return NextResponse.json({
      hasSubscription: true,
      isActive,
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        tier: tierName,
        credits,
        monthlyPriceCents: subscription.monthlyPriceCents,
        startDate: subscription.startDate?.toISOString() || subscription.startDate,
        endDate: subscription.endDate?.toISOString() || subscription.endDate || null,
        stripeSubscriptionId: stripeSubscriptionId,
        stripeStatus: stripeSubscription?.status,
        stripeCancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end,
        stripeCurrentPeriodEnd: stripeSubscription?.current_period_end ? new Date(stripeSubscription.current_period_end * 1000).toISOString() : null,
        isStripeManaged: !!stripeSubscriptionId || !!stripeSubscription
      }
    })
  } catch (error: any) {
    console.error('Error fetching subscription:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    })
    
    // Always return detailed error to help diagnose (we can remove later)
    return NextResponse.json({ 
      error: 'Failed to fetch subscription',
      details: {
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
        code: error?.code || 'NO_CODE',
        stack: error?.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace'
      }
    }, { status: 500 })
  }
}

// POST /api/billing/subscription - Cancel, upgrade, or downgrade subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, newPlan } = body // action: 'cancel' | 'upgrade' | 'downgrade', newPlan: 'plan_20_monthly' | etc.

    const user = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch subscription using raw SQL to avoid Prisma schema issues
    let dbSubscription
    try {
      const subscriptionResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, "userId", plan, "monthlyPriceCents", "startDate", "endDate"
         FROM "Subscription"
         WHERE "userId" = $1
         LIMIT 1`,
        user.id
      )
      dbSubscription = subscriptionResult && subscriptionResult.length > 0 ? subscriptionResult[0] : null
      
      // Try to get stripeSubscriptionId separately if column exists
      if (dbSubscription) {
        try {
          const stripeIdResult: any[] = await prisma.$queryRawUnsafe(
            `SELECT "stripeSubscriptionId" FROM "Subscription" WHERE "userId" = $1 LIMIT 1`,
            user.id
          )
          if (stripeIdResult && stripeIdResult.length > 0) {
            dbSubscription.stripeSubscriptionId = stripeIdResult[0].stripeSubscriptionId || null
          } else {
            dbSubscription.stripeSubscriptionId = null
          }
        } catch {
          // Column doesn't exist, set to null
          dbSubscription.stripeSubscriptionId = null
        }
      }
    } catch (error: any) {
      console.error('Error fetching subscription:', error)
      return NextResponse.json({ 
        error: 'Database error',
        message: error?.message || 'Failed to fetch subscription'
      }, { status: 500 })
    }

    if (!dbSubscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    // Find or get Stripe subscription
    let stripeSubscriptionId = dbSubscription.stripeSubscriptionId || null
    
    if (!stripeSubscriptionId) {
      // Try to find by customer email
      try {
        const customers = await stripe.customers.list({
          email: session.user.email.toLowerCase(),
          limit: 1
        })
        
        if (customers.data.length > 0) {
          const customer = customers.data[0]
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'active',
            limit: 1
          })
          
          if (subscriptions.data.length > 0) {
            stripeSubscriptionId = subscriptions.data[0].id
            // Update database (only if column exists) - use raw SQL
            try {
              await prisma.$executeRawUnsafe(
                `UPDATE "Subscription" SET "stripeSubscriptionId" = $1 WHERE "userId" = $2`,
                stripeSubscriptionId,
                user.id
              )
            } catch (updateError) {
              console.error('Error updating stripeSubscriptionId (column may not exist yet):', updateError)
              // Continue without updating
            }
          }
        }
      } catch (error) {
        console.error('Error finding Stripe subscription:', error)
      }
    }

    if (action === 'cancel') {
      if (stripeSubscriptionId) {
        // Cancel Stripe subscription at period end
        await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: true
        })
        
        return NextResponse.json({ 
          success: true,
          message: 'Subscription will be canceled at the end of the current billing period'
        })
      } else {
        // Admin-granted subscription - set endDate to end of current period
        const startDate = dbSubscription.startDate ? new Date(dbSubscription.startDate) : new Date()
        const endDate = new Date(startDate)
        endDate.setMonth(endDate.getMonth() + 1) // Cancel at end of current month
        
        // Use raw SQL to update endDate
        await prisma.$executeRawUnsafe(
          `UPDATE "Subscription" SET "endDate" = $1 WHERE "userId" = $2`,
          endDate,
          user.id
        )
        
        return NextResponse.json({ 
          success: true,
          message: 'Subscription will be canceled at the end of the current billing period'
        })
      }
    } else if (action === 'upgrade' || action === 'downgrade') {
      if (!newPlan) {
        return NextResponse.json({ error: 'New plan required for upgrade/downgrade' }, { status: 400 })
      }

      const PLAN_TO_PRICE: Record<string, string | undefined> = {
        plan_10_monthly: process.env.STRIPE_PRICE_10_MONTHLY,
        plan_20_monthly: process.env.STRIPE_PRICE_20_MONTHLY,
        plan_30_monthly: process.env.STRIPE_PRICE_30_MONTHLY,
        plan_50_monthly: process.env.STRIPE_PRICE_50_MONTHLY,
      }

      const newPriceId = PLAN_TO_PRICE[newPlan]
      if (!newPriceId) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      }

      if (stripeSubscriptionId) {
        // Update Stripe subscription
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        const currentPriceId = stripeSub.items.data[0]?.price?.id

        if (currentPriceId === newPriceId) {
          return NextResponse.json({ error: 'You are already on this plan' }, { status: 400 })
        }

        // Update subscription to new price
        await stripe.subscriptions.update(stripeSubscriptionId, {
          items: [{
            id: stripeSub.items.data[0].id,
            price: newPriceId,
          }],
          proration_behavior: 'always_invoice', // Prorate the difference
        })

        // Determine new tier
        let newPriceCents = 2000
        if (newPlan === 'plan_10_monthly') newPriceCents = 1000
        else if (newPlan === 'plan_20_monthly') newPriceCents = 2000
        else if (newPlan === 'plan_30_monthly') newPriceCents = 3000
        else if (newPlan === 'plan_50_monthly') newPriceCents = 5000

        // Update database using raw SQL
        await prisma.$executeRawUnsafe(
          `UPDATE "Subscription" SET "monthlyPriceCents" = $1 WHERE "userId" = $2`,
          newPriceCents,
          user.id
        )

        return NextResponse.json({ 
          success: true,
          message: `Subscription ${action === 'upgrade' ? 'upgraded' : 'downgraded'} successfully`
        })
      } else {
        // Admin-granted subscription - update database only
        let newPriceCents = 2000
        if (newPlan === 'plan_10_monthly') newPriceCents = 1000
        else if (newPlan === 'plan_20_monthly') newPriceCents = 2000
        else if (newPlan === 'plan_30_monthly') newPriceCents = 3000
        else if (newPlan === 'plan_50_monthly') newPriceCents = 5000

        // Update database using raw SQL
        await prisma.$executeRawUnsafe(
          `UPDATE "Subscription" SET "monthlyPriceCents" = $1 WHERE "userId" = $2`,
          newPriceCents,
          user.id
        )

        return NextResponse.json({ 
          success: true,
          message: `Subscription ${action === 'upgrade' ? 'upgraded' : 'downgraded'} successfully`
        })
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Error managing subscription:', error)
    return NextResponse.json({ 
      error: 'Failed to manage subscription',
      message: error?.message || 'Unknown error occurred',
      details: error?.code || 'NO_CODE'
    }, { status: 500 })
  }
}
