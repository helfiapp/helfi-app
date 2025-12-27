import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { Prisma } from '@prisma/client'

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    })
  : null

function isMissingDbObjectError(err: unknown): boolean {
  const anyErr = err as any
  const code = anyErr?.code as string | undefined
  const msg = String(anyErr?.message || '')

  // Prisma known request errors:
  // - P2021: table does not exist
  // - P2022: column does not exist
  if (code === 'P2021' || code === 'P2022') return true

  // Fallback string checks (covers some prisma engines / postgres phrasing)
  return (
    /does not exist/i.test(msg) ||
    /Unknown column/i.test(msg) ||
    /column .* does not exist/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  )
}

async function bestEffort(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (err: any) {
    // If production DB is behind schema, ignore missing table/column errors so deletion can proceed.
    if (isMissingDbObjectError(err) || err instanceof Prisma.PrismaClientKnownRequestError) {
      if (isMissingDbObjectError(err)) {
        console.warn(`⚠️ Account deletion cleanup skipped (${label}):`, err?.message || err)
        return
      }
    }
    throw err
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    console.log('🗑️ Account deletion requested for:', userEmail)

    // IMPORTANT:
    // Do NOT use `include` here because Prisma will select all scalar User columns by default.
    // If the DB hasn't been migrated yet for newly added fields (e.g., free credits counters),
    // selecting the full User row will throw "column does not exist". We only select what we need.
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        subscription: {
          select: {
            stripeSubscriptionId: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Cancel Stripe subscription (and derive customer id from subscription, since we don't store it in DB)
    let stripeCustomerId: string | null = null
    if (stripe && user.subscription?.stripeSubscriptionId) {
      const subId = user.subscription.stripeSubscriptionId
      try {
        const sub = await stripe.subscriptions.retrieve(subId)
        const customer = (sub as any)?.customer
        stripeCustomerId = typeof customer === 'string' ? customer : (customer?.id ?? null)
      } catch (error: any) {
        console.warn('⚠️ Failed to retrieve Stripe subscription (non-blocking):', error?.message || error)
      }

      try {
        await stripe.subscriptions.cancel(subId)
        console.log('✅ Cancelled Stripe subscription:', subId)
      } catch (error: any) {
        // Log but don't fail - subscription might already be cancelled
        console.warn('⚠️ Failed to cancel Stripe subscription (may already be cancelled):', error.message)
      }
    }

    // Delete Stripe customer if we could resolve it from the subscription
    if (stripe && stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId)
        console.log('✅ Deleted Stripe customer:', stripeCustomerId)
      } catch (error: any) {
        // Log but don't fail - customer might already be deleted
        console.warn('⚠️ Failed to delete Stripe customer (may already be deleted):', error.message)
      }
    }

    // Delete all user-related data (cascading deletes will handle most relationships)
    // But we'll explicitly delete some to be safe and clear
    
    // Delete OAuth accounts (Fitbit, Garmin, etc.)
    await bestEffort('account.deleteMany', () =>
      prisma.account.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete sessions
    await bestEffort('session.deleteMany', () =>
      prisma.session.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete verification tokens
    await bestEffort('verificationToken.deleteMany', () =>
      prisma.verificationToken.deleteMany({
        where: { identifier: user.email },
      })
    )

    // Delete credit top-ups
    await bestEffort('creditTopUp.deleteMany', () =>
      prisma.creditTopUp.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete subscription (if not already deleted)
    await bestEffort('subscription.deleteMany', () =>
      prisma.subscription.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete all health-related data
    await bestEffort('healthGoal.deleteMany', () => prisma.healthGoal.deleteMany({ where: { userId: user.id } }))
    await bestEffort('supplement.deleteMany', () => prisma.supplement.deleteMany({ where: { userId: user.id } }))
    await bestEffort('medication.deleteMany', () => prisma.medication.deleteMany({ where: { userId: user.id } }))
    await bestEffort('healthLog.deleteMany', () => prisma.healthLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('foodLog.deleteMany', () => prisma.foodLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('exerciseLog.deleteMany', () => prisma.exerciseLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('exerciseEntry.deleteMany', () => prisma.exerciseEntry.deleteMany({ where: { userId: user.id } }))
    
    // Delete AI analysis data
    await bestEffort('interactionAnalysis.deleteMany', () => prisma.interactionAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('symptomAnalysis.deleteMany', () => prisma.symptomAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('medicalImageAnalysis.deleteMany', () => prisma.medicalImageAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('foodAnalysisFeedback.deleteMany', () => prisma.foodAnalysisFeedback.deleteMany({ where: { userId: user.id } }))
    
    // Delete device data
    await bestEffort('fitbitData.deleteMany', () => prisma.fitbitData.deleteMany({ where: { userId: user.id } }))
    await bestEffort('garminRequestToken.deleteMany', () => prisma.garminRequestToken.deleteMany({ where: { userId: user.id } }))
    await bestEffort('garminWebhookLog.deleteMany', () => prisma.garminWebhookLog.deleteMany({ where: { userId: user.id } }))
    
    // Delete files (File model uses uploadedById, not userId)
    await bestEffort('file.deleteMany', () => prisma.file.deleteMany({ where: { uploadedById: user.id } }))
    
    // Delete reports
    await bestEffort('report.deleteMany', () => prisma.report.deleteMany({ where: { userId: user.id } }))
    await bestEffort('consentRecord.deleteMany', () => prisma.consentRecord.deleteMany({ where: { userId: user.id } }))
    
    // Delete affiliate data
    await bestEffort('affiliateReferral.deleteMany', () => prisma.affiliateReferral.deleteMany({ where: { referredUserId: user.id } }))
    await bestEffort('affiliateConversion.deleteMany', () => prisma.affiliateConversion.deleteMany({ where: { referredUserId: user.id } }))
    await bestEffort('affiliateApplication.deleteMany', () => prisma.affiliateApplication.deleteMany({ where: { userId: user.id } }))
    await bestEffort('affiliate.deleteMany', () => prisma.affiliate.deleteMany({ where: { userId: user.id } }))
    
    // Delete support tickets
    await bestEffort('supportTicket.deleteMany', () => prisma.supportTicket.deleteMany({ where: { userId: user.id } }))

    // Finally, delete the user (this will cascade delete any remaining relationships)
    await prisma.user.delete({
      where: { id: user.id }
    })

    console.log('✅ Successfully deleted account and all related data for:', userEmail)

    return NextResponse.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    })
  } catch (error: any) {
    console.error('❌ Error deleting account:', error)
    return NextResponse.json({ 
      error: 'Failed to delete account',
      message: error.message || 'An unexpected error occurred'
    }, { status: 500 })
  }
}
