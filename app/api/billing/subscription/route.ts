import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { createSign } from 'crypto'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { ensureSubscriptionStoreColumns } from '@/lib/native-billing/subscription-store'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

function isMissingStripeSubscriptionError(error: any) {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '')
  return code === 'resource_missing' || /no such subscription/i.test(message)
}

async function clearStripeSubscriptionIdForUser(userId: string) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Subscription" SET "stripeSubscriptionId" = NULL WHERE "userId" = $1`,
      userId,
    )
  } catch (error) {
    console.error('Error clearing stale stripeSubscriptionId:', error)
  }
}

async function getBillingUser(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    return prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true, name: true },
    })
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  return prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true, name: true },
  })
}

type AppleApiCredentials = {
  issuerId: string
  keyId: string
  privateKey: string
}

type AppleSubscriptionState = {
  autoRenewStatus: number | null
  expiresDate: Date | null
}

function base64Url(input: string | Buffer): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return raw
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function decodeBase64UrlJSON(value: string): any {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

function parseAppleJwsPayload(value: string): any {
  const parts = String(value || '').split('.')
  if (parts.length < 2) return null
  return decodeBase64UrlJSON(parts[1])
}

function getAppleApiCredentials(): AppleApiCredentials | null {
  const issuerId = String(process.env.APPLE_IAP_ISSUER_ID || '').trim()
  const keyId = String(process.env.APPLE_IAP_KEY_ID || '').trim()
  const privateKey = String(process.env.APPLE_IAP_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  if (!issuerId || !keyId || !privateKey) return null
  return { issuerId, keyId, privateKey }
}

function createAppleAppStoreApiToken(credentials: AppleApiCredentials): string {
  const now = Math.floor(Date.now() / 1000)
  const unsignedToken = `${base64Url(JSON.stringify({
    alg: 'ES256',
    kid: credentials.keyId,
    typ: 'JWT',
  }))}.${base64Url(JSON.stringify({
    iss: credentials.issuerId,
    iat: now,
    exp: now + 60 * 5,
    aud: 'appstoreconnect-v1',
  }))}`
  const signer = createSign('SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign({ key: credentials.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${unsignedToken}.${base64Url(signature)}`
}

async function fetchAppleSubscriptionState(subscription: any): Promise<AppleSubscriptionState | null> {
  const source = String(subscription?.source || '')
  const transactionId = String(subscription?.storeOriginalTransactionId || subscription?.storeTransactionId || '').trim()
  const storeProductId = String(subscription?.storeProductId || '').trim()
  if (source !== 'apple_iap' || !transactionId) return null

  const credentials = getAppleApiCredentials()
  if (!credentials) return null

  const token = createAppleAppStoreApiToken(credentials)
  const encodedTransactionId = encodeURIComponent(transactionId)
  const urls = [
    `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${encodedTransactionId}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/${encodedTransactionId}`,
  ]

  for (const url of urls) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) continue

    const groups = Array.isArray(data?.data) ? data.data : []
    const transactions = groups.flatMap((group: any) =>
      Array.isArray(group?.lastTransactions) ? group.lastTransactions : [],
    )

    const candidates = transactions
      .map((item: any) => {
        const transactionInfo = parseAppleJwsPayload(String(item?.signedTransactionInfo || '')) || {}
        const renewalInfo = parseAppleJwsPayload(String(item?.signedRenewalInfo || '')) || {}
        return {
          status: Number(item?.status || item?.rawStatus || 0) || null,
          productId: String(transactionInfo?.productId || renewalInfo?.productId || ''),
          expiresDateMs: Number(transactionInfo?.expiresDate || 0),
          autoRenewStatus:
            renewalInfo?.autoRenewStatus === 0 || renewalInfo?.autoRenewStatus === 1
              ? Number(renewalInfo.autoRenewStatus)
              : null,
        }
      })
      .filter((item: any) => !storeProductId || item.productId === storeProductId)
      .sort((a: any, b: any) => Number(b.expiresDateMs || 0) - Number(a.expiresDateMs || 0))

    const current = candidates[0]
    if (!current) continue

    const expiresDate =
      Number.isFinite(current.expiresDateMs) && current.expiresDateMs > 0
        ? new Date(current.expiresDateMs)
        : null

    return {
      autoRenewStatus: current.autoRenewStatus,
      expiresDate,
    }
  }

  return null
}

// GET /api/billing/subscription - Get current subscription status
export async function GET(request: NextRequest) {
  try {
    const authUser = await getBillingUser(request)
    if (!authUser?.email) {
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
      user = authUser
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
      await ensureSubscriptionStoreColumns()
      const subscriptionResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, "userId", plan, "monthlyPriceCents", "startDate", "endDate",
                source, "storeProductId", "storeTransactionId", "storeOriginalTransactionId"
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

    let appleSubscriptionState: AppleSubscriptionState | null = null
    try {
      appleSubscriptionState = await fetchAppleSubscriptionState(subscription)
      if (appleSubscriptionState?.expiresDate) {
        subscription.endDate = appleSubscriptionState.expiresDate
        await prisma.$executeRawUnsafe(
          `UPDATE "Subscription" SET "endDate" = $1 WHERE "userId" = $2`,
          appleSubscriptionState.expiresDate,
          user.id,
        )
      }
    } catch (error: any) {
      console.error('Error fetching Apple subscription status:', error?.message || error)
    }

    // Check if subscription is active
    const now = new Date()
    const endDate = subscription.endDate ? new Date(subscription.endDate) : null
    const isActive = !endDate || endDate > now
    const appleCancelAtPeriodEnd = appleSubscriptionState?.autoRenewStatus === 0

    // Get Stripe subscription details if available
    let stripeSubscription = null
    // Safely access stripeSubscriptionId field (may not exist in Prisma types yet)
    let stripeSubscriptionId = (subscription as any).stripeSubscriptionId || null
    
    if (stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
      } catch (error: any) {
        console.error('Error fetching Stripe subscription:', error?.message || error)
        if (isMissingStripeSubscriptionError(error)) {
          await clearStripeSubscriptionIdForUser(user.id)
          stripeSubscriptionId = null
        }
      }
    } else {
      // Try to find Stripe subscription by customer email
      try {
        const customers = await stripe.customers.list({
          email: user.email.toLowerCase(),
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
                `UPDATE "Subscription" SET "stripeSubscriptionId" = $1, source = 'stripe' WHERE "userId" = $2`,
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

    const currentPeriodEnd =
      stripeSubscription?.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : endDate
          ? endDate.toISOString()
          : null

    // Determine plan tier name
    const currentTier = subscription.monthlyPriceCents
    let tierName = 'Premium'
    let credits = 0

    const subscriptionCreditsMap: Record<number, number> = {
      1000: 700,  // $10/month → 700 credits
      2000: 1400, // $20/month → 1,400 credits
      3000: 2100, // $30/month → 2,100 credits
      5000: 3500, // $50/month → 3,500 credits
    }

    if (currentTier && subscriptionCreditsMap[currentTier]) {
      tierName = `$${(currentTier / 100).toFixed(0)}/month`
      credits = subscriptionCreditsMap[currentTier]
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
        stripeSubscriptionId,
        source: subscription.source || (stripeSubscriptionId ? 'stripe' : null),
        storeProductId: subscription.storeProductId || null,
        storeTransactionId: subscription.storeTransactionId || null,
        storeOriginalTransactionId: subscription.storeOriginalTransactionId || null,
        stripeStatus: stripeSubscription?.status,
        stripeCancelAtPeriodEnd: Boolean(stripeSubscription?.cancel_at_period_end || appleCancelAtPeriodEnd),
        stripeCurrentPeriodEnd: currentPeriodEnd,
        storeCancelAtPeriodEnd: appleCancelAtPeriodEnd,
        storeAutoRenewStatus: appleSubscriptionState?.autoRenewStatus ?? null,
        isStripeManaged: !!stripeSubscription
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
    const user = await getBillingUser(request)
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, newPlan } = body // action: 'cancel' | 'upgrade' | 'downgrade', newPlan: 'plan_20_monthly' | etc.

    // Fetch subscription using raw SQL to avoid Prisma schema issues
    let dbSubscription
    try {
      await ensureSubscriptionStoreColumns()
      const subscriptionResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, "userId", plan, "monthlyPriceCents", "startDate", "endDate",
                source, "storeProductId", "storeTransactionId", "storeOriginalTransactionId"
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
          email: user.email.toLowerCase(),
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
                `UPDATE "Subscription" SET "stripeSubscriptionId" = $1, source = 'stripe' WHERE "userId" = $2`,
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
        try {
          // Cancel Stripe subscription at period end
          const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true
          })
          
          // Get the actual cancellation date (current_period_end)
          const cancellationDate = updatedSubscription.current_period_end 
            ? new Date(updatedSubscription.current_period_end * 1000)
            : null
          
          return NextResponse.json({ 
            success: true,
            message: 'Subscription will be canceled at the end of the current billing period',
            cancellationDate: cancellationDate?.toISOString() || null
          })
        } catch (error: any) {
          if (!isMissingStripeSubscriptionError(error)) throw error
          await clearStripeSubscriptionIdForUser(user.id)
          stripeSubscriptionId = null
        }
      }

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
        message: 'Subscription will be canceled at the end of the current billing period',
        cancellationDate: endDate.toISOString()
      })
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
        try {
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
        } catch (error: any) {
          if (!isMissingStripeSubscriptionError(error)) throw error
          await clearStripeSubscriptionIdForUser(user.id)
          stripeSubscriptionId = null
        }
      }

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
