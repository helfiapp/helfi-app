import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  sendPractitionerTrialReminderEmail,
  sendPractitionerTrialEndedEmail,
  sendPractitionerReengageEmail,
} from '@/lib/practitioner-emails'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

function daysUntil(date: Date): number {
  const diffMs = date.getTime() - Date.now()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const subscriptions = await prisma.practitionerListingSubscription.findMany({
    where: {
      status: 'TRIALING',
      trialEndAt: { not: null },
    },
    include: {
      listing: {
        include: { practitionerAccount: true },
      },
    },
  })

  let remindersSent = 0
  let trialsEnded = 0
  let reengageSent = 0

  for (const subscription of subscriptions) {
    if (!subscription.trialEndAt) continue
    const listing = subscription.listing
    if (!listing) continue

    const daysLeft = daysUntil(new Date(subscription.trialEndAt))
    const logTypes = await prisma.practitionerEmailLog.findMany({
      where: {
        listingId: listing.id,
        type: { in: ['TRIAL_14D', 'TRIAL_7D', 'TRIAL_1D', 'TRIAL_ENDED'] },
      },
      select: { type: true },
    })
    const sentSet = new Set(logTypes.map((row) => row.type))

    if ([14, 7, 1].includes(daysLeft)) {
      const type = daysLeft === 14 ? 'TRIAL_14D' : daysLeft === 7 ? 'TRIAL_7D' : 'TRIAL_1D'
      if (!sentSet.has(type)) {
        sendPractitionerTrialReminderEmail({
          practitionerAccountId: listing.practitionerAccountId,
          listingId: listing.id,
          toEmail: listing.practitionerAccount.contactEmail,
          displayName: listing.displayName,
          daysLeft,
        })
        remindersSent += 1
      }
    }

    if (daysLeft <= 0 && !sentSet.has('TRIAL_ENDED')) {
      await prisma.practitionerListing.update({
        where: { id: listing.id },
        data: { status: 'HIDDEN', visibilityReason: 'SUB_LAPSED' },
      })
      await prisma.practitionerListingSubscription.update({
        where: { listingId: listing.id },
        data: { status: 'EXPIRED' },
      })
      sendPractitionerTrialEndedEmail({
        practitionerAccountId: listing.practitionerAccountId,
        listingId: listing.id,
        toEmail: listing.practitionerAccount.contactEmail,
        displayName: listing.displayName,
      })
      trialsEnded += 1
    }
  }

  const hiddenListings = await prisma.practitionerListing.findMany({
    where: {
      status: 'HIDDEN',
      reviewStatus: 'APPROVED',
      visibilityReason: { in: ['SUB_LAPSED', 'PAYMENT_FAILED'] },
    },
    include: { practitionerAccount: true },
  })

  for (const listing of hiddenListings) {
    const lastEmail = await prisma.practitionerEmailLog.findFirst({
      where: { listingId: listing.id, type: 'WEEKLY_REENGAGE' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    })
    const lastSentAt = lastEmail?.sentAt ? new Date(lastEmail.sentAt) : null
    const daysSince = lastSentAt ? Math.floor((Date.now() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24)) : null

    if (!lastSentAt || (daysSince !== null && daysSince >= 7)) {
      sendPractitionerReengageEmail({
        practitionerAccountId: listing.practitionerAccountId,
        listingId: listing.id,
        toEmail: listing.practitionerAccount.contactEmail,
        displayName: listing.displayName,
      })
      reengageSent += 1
    }
  }

  return NextResponse.json({ processed: subscriptions.length, remindersSent, trialsEnded, reengageSent })
}
