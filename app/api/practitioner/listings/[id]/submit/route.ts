import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { screenPractitionerListing } from '@/lib/practitioner-screening'
import {
  sendPractitionerAdminActivatedEmail,
  sendPractitionerAdminFlaggedEmail,
  sendPractitionerApprovedEmail,
  sendPractitionerReviewEmail,
} from '@/lib/practitioner-emails'

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

async function getListingForUser(listingId: string, userId: string) {
  return prisma.practitionerListing.findFirst({
    where: {
      id: listingId,
      practitionerAccount: { userId },
    },
    include: {
      practitionerAccount: true,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const listing = await getListingForUser(params.id, session.user.id)
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  if (listing.reviewStatus === 'APPROVED' && listing.status === 'ACTIVE') {
    return NextResponse.json({ error: 'Your listing is already approved.' }, { status: 400 })
  }

  const hasContact = Boolean(listing.phone || listing.websiteUrl || listing.emailPublic)
  const hasLocation = Boolean((listing.lat && listing.lng) || listing.suburbCity || listing.country)
  if (!hasContact || !hasLocation) {
    return NextResponse.json(
      { error: 'Please add contact details and a location before submitting.' },
      { status: 400 }
    )
  }

  await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      status: 'PENDING_REVIEW',
      visibilityReason: 'AI_REVIEW_PENDING',
      reviewStatus: 'PENDING',
      reviewDecisionAt: null,
      reviewFlagReason: null,
    },
  })

  const category = await prisma.practitionerCategory.findUnique({ where: { id: listing.categoryId } })
  const subcategory = listing.subcategoryId
    ? await prisma.practitionerCategory.findUnique({ where: { id: listing.subcategoryId } })
    : null

  let screening
  try {
    screening = await screenPractitionerListing({
      listingId: listing.id,
      displayName: listing.displayName,
      description: listing.description,
      websiteUrl: listing.websiteUrl,
      phone: listing.phone,
      emailPublic: listing.emailPublic,
      address: [listing.addressLine1, listing.suburbCity, listing.stateRegion, listing.postcode, listing.country]
        .filter(Boolean)
        .join(', '),
      category: category?.name || null,
      subcategory: subcategory?.name || null,
      tags: listing.tags,
      languages: listing.languages,
    })
  } catch (error: any) {
    screening = {
      riskLevel: 'MEDIUM',
      recommendedAction: 'MANUAL_REVIEW',
      reasoning: 'Automatic review failed; manual review required.',
      raw: { error: error?.message || 'Screening error' },
    }
  }

  const aiRiskLevel = screening.riskLevel
  const aiReasoning = screening.reasoning
  const aiRawJson = screening.raw || null
  const needsManualReview = screening.recommendedAction === 'MANUAL_REVIEW' || aiRiskLevel !== 'LOW'

  if (needsManualReview) {
    const updated = await prisma.practitionerListing.update({
      where: { id: listing.id },
      data: {
        status: 'HIDDEN',
        visibilityReason: 'AI_FLAGGED',
        reviewStatus: 'FLAGGED',
        reviewFlagReason: screening.redFlags?.join('\n') || null,
        reviewDecisionAt: new Date(),
        aiRiskLevel,
        aiReasoning,
        aiRawJson,
      },
    })

    await prisma.practitionerModerationLog.create({
      data: {
        listingId: listing.id,
        action: 'HIDE',
        reason: `Flagged by AI: ${aiReasoning}`,
      },
    })

    sendPractitionerReviewEmail({
      practitionerAccountId: listing.practitionerAccountId,
      listingId: listing.id,
      toEmail: listing.practitionerAccount.contactEmail,
      displayName: listing.displayName,
    })
    sendPractitionerAdminFlaggedEmail({
      listingId: listing.id,
      displayName: listing.displayName,
      riskLevel: aiRiskLevel,
      reasoning: aiReasoning,
    })

    return NextResponse.json({ listing: updated, reviewStatus: 'FLAGGED' })
  }

  const now = new Date()
  const trialEnd = addMonths(now, 2)

  const updated = await prisma.practitionerListing.update({
    where: { id: listing.id },
    data: {
      status: 'ACTIVE',
      visibilityReason: 'TRIAL_ACTIVE',
      reviewStatus: 'APPROVED',
      reviewDecisionAt: new Date(),
      aiRiskLevel,
      aiReasoning,
      aiRawJson,
    },
  })

  await prisma.practitionerListingSubscription.upsert({
    where: { listingId: listing.id },
    create: {
      listingId: listing.id,
      status: 'TRIALING',
      trialStartAt: now,
      trialEndAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    },
    update: {
      status: 'TRIALING',
      trialStartAt: now,
      trialEndAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    },
  })

  await prisma.practitionerModerationLog.create({
    data: {
      listingId: listing.id,
      action: 'APPROVE',
      reason: 'Auto-approved by AI',
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

  return NextResponse.json({ listing: updated, reviewStatus: 'APPROVED' })
}
