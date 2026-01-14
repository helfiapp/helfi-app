import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import {
  sendPractitionerAdminActivatedEmail,
  sendPractitionerApprovedEmail,
} from '@/lib/practitioner-emails'

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const note = body?.note ? String(body.note).trim() : ''

  const listing = await prisma.practitionerListing.findUnique({
    where: { id: params.id },
    include: { practitionerAccount: true, subscription: true },
  })

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const now = new Date()
  const trialEnd = addMonths(now, 2)

  const subscription = await prisma.practitionerListingSubscription.upsert({
    where: { listingId: listing.id },
    create: {
      listingId: listing.id,
      status: 'TRIALING',
      trialStartAt: now,
      trialEndAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    },
    update: listing.subscription?.status === 'ACTIVE'
      ? {}
      : {
          status: 'TRIALING',
          trialStartAt: now,
          trialEndAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
  })

  const visibilityReason = subscription.status === 'ACTIVE' ? 'SUB_ACTIVE' : 'TRIAL_ACTIVE'

  const updated = await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      status: 'ACTIVE',
      visibilityReason,
      reviewStatus: 'APPROVED',
      reviewDecisionAt: now,
      reviewedByAdminId: admin.adminId,
      reviewNotes: note || null,
    },
  })

  await prisma.practitionerModerationLog.create({
    data: {
      listingId: listing.id,
      adminUserId: admin.adminId,
      action: 'APPROVE',
      reason: note || 'Approved by admin',
    },
  })

  sendPractitionerApprovedEmail({
    practitionerAccountId: listing.practitionerAccountId,
    listingId: listing.id,
    toEmail: listing.practitionerAccount.contactEmail,
    displayName: listing.displayName,
    slug: updated.slug,
  })
  sendPractitionerAdminActivatedEmail({
    listingId: listing.id,
    displayName: listing.displayName,
    slug: updated.slug,
  })

  return NextResponse.json({ listing: updated })
}
