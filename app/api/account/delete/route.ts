import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    })
  : null

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    console.log('🗑️ Account deletion requested for:', userEmail)

    // Find user with all related data
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        subscription: true,
        accounts: true,
        sessions: true,
        creditTopUps: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Cancel Stripe subscription if exists
    if (stripe && user.subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId)
        console.log('✅ Cancelled Stripe subscription:', user.subscription.stripeSubscriptionId)
      } catch (error: any) {
        // Log but don't fail - subscription might already be cancelled
        console.warn('⚠️ Failed to cancel Stripe subscription (may already be cancelled):', error.message)
      }
    }

    // Delete Stripe customer if exists
    if (stripe && user.subscription?.stripeCustomerId) {
      try {
        await stripe.customers.del(user.subscription.stripeCustomerId)
        console.log('✅ Deleted Stripe customer:', user.subscription.stripeCustomerId)
      } catch (error: any) {
        // Log but don't fail - customer might already be deleted
        console.warn('⚠️ Failed to delete Stripe customer (may already be deleted):', error.message)
      }
    }

    // Delete all user-related data (cascading deletes will handle most relationships)
    // But we'll explicitly delete some to be safe and clear
    
    // Delete OAuth accounts (Fitbit, Garmin, etc.)
    await prisma.account.deleteMany({
      where: { userId: user.id }
    })

    // Delete sessions
    await prisma.session.deleteMany({
      where: { userId: user.id }
    })

    // Delete verification tokens
    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email }
    })

    // Delete credit top-ups
    await prisma.creditTopUp.deleteMany({
      where: { userId: user.id }
    })

    // Delete subscription (if not already deleted)
    await prisma.subscription.deleteMany({
      where: { userId: user.id }
    }).catch(() => {
      // Ignore if already deleted
    })

    // Delete all health-related data
    await prisma.healthGoal.deleteMany({ where: { userId: user.id } })
    await prisma.supplement.deleteMany({ where: { userId: user.id } })
    await prisma.medication.deleteMany({ where: { userId: user.id } })
    await prisma.healthLog.deleteMany({ where: { userId: user.id } })
    await prisma.foodLog.deleteMany({ where: { userId: user.id } })
    await prisma.exerciseLog.deleteMany({ where: { userId: user.id } })
    await prisma.exerciseEntry.deleteMany({ where: { userId: user.id } })
    
    // Delete AI analysis data
    await prisma.interactionAnalysis.deleteMany({ where: { userId: user.id } })
    await prisma.symptomAnalysis.deleteMany({ where: { userId: user.id } })
    await prisma.medicalImageAnalysis.deleteMany({ where: { userId: user.id } })
    await prisma.foodAnalysisFeedback.deleteMany({ where: { userId: user.id } })
    
    // Delete device data
    await prisma.fitbitData.deleteMany({ where: { userId: user.id } })
    await prisma.garminRequestToken.deleteMany({ where: { userId: user.id } })
    await prisma.garminWebhookLog.deleteMany({ where: { userId: user.id } })
    
    // Delete files
    await prisma.file.deleteMany({ where: { userId: user.id } })
    
    // Delete reports
    await prisma.report.deleteMany({ where: { userId: user.id } })
    await prisma.consentRecord.deleteMany({ where: { userId: user.id } })
    
    // Delete affiliate data
    await prisma.affiliateReferral.deleteMany({ where: { referredUserId: user.id } })
    await prisma.affiliateConversion.deleteMany({ where: { convertedUserId: user.id } })
    await prisma.affiliateApplication.deleteMany({ where: { userId: user.id } })
    // Delete affiliate record if user is an affiliate
    await prisma.affiliate.deleteMany({ where: { userId: user.id } }).catch(() => {
      // Ignore if not an affiliate
    })
    
    // Delete support tickets
    await prisma.supportTicket.deleteMany({ where: { userId: user.id } })

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
