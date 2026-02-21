import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPractitionerWinbackActivatedEmail } from '@/lib/practitioner-emails'

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function hasUsedWinbackTrial(subscription: {
  trialStartAt: Date | null
  currentPeriodStart: Date | null
}) {
  if (!subscription.trialStartAt || !subscription.currentPeriodStart) return false
  const diffMs = subscription.currentPeriodStart.getTime() - subscription.trialStartAt.getTime()
  return diffMs > 1000 * 60 * 60 * 24
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: {
      practitionerAccount: { userId: session.user.id },
      reviewStatus: 'APPROVED',
    },
    include: {
      practitionerAccount: true,
      subscription: true,
    },
  })

  if (!listing || !listing.subscription) {
    return NextResponse.json({ error: 'Listing subscription not found.' }, { status: 404 })
  }

  const subscription = listing.subscription
  const alreadyUsed = hasUsedWinbackTrial({
    trialStartAt: subscription.trialStartAt ? new Date(subscription.trialStartAt) : null,
    currentPeriodStart: subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null,
  })

  if (alreadyUsed) {
    return NextResponse.json({ error: 'This one-time extra trial has already been used.' }, { status: 400 })
  }

  if (subscription.status === 'ACTIVE' || subscription.providerSubscriptionId) {
    return NextResponse.json({ error: 'Paid subscription already active.' }, { status: 400 })
  }

  const trialEndAt = subscription.trialEndAt ? new Date(subscription.trialEndAt) : null
  if (!trialEndAt || trialEndAt.getTime() > Date.now()) {
    return NextResponse.json({ error: 'Extra trial is only available after your current trial ends.' }, { status: 400 })
  }

  const extensionStart = new Date()
  const extensionEnd = addMonths(extensionStart, 3)

  await prisma.practitionerListingSubscription.update({
    where: { listingId: listing.id },
    data: {
      status: 'TRIALING',
      trialEndAt: extensionEnd,
      currentPeriodStart: extensionStart,
      currentPeriodEnd: extensionEnd,
      cancelAtPeriodEnd: false,
    },
  })

  await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      status: 'ACTIVE',
      visibilityReason: 'TRIAL_ACTIVE',
    },
  })

  sendPractitionerWinbackActivatedEmail({
    toEmail: listing.practitionerAccount.contactEmail,
    displayName: listing.displayName,
    trialEndAt: extensionEnd,
  })

  return NextResponse.json({
    success: true,
    message: 'One-time extra 3 months free has been activated.',
    trialEndsAt: extensionEnd.toISOString(),
  })
}
