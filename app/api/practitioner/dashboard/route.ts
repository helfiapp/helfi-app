import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null
  const diffMs = date.getTime() - Date.now()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await prisma.practitionerAccount.findUnique({
    where: { userId: session.user.id },
  })

  if (!account) {
    return NextResponse.json({ account: null, listing: null })
  }

  const listing = await prisma.practitionerListing.findFirst({
    where: { practitionerAccountId: account.id },
    include: {
      category: true,
      subcategory: true,
      subscription: true,
    },
  })

  if (!listing) {
    return NextResponse.json({ account, listing: null })
  }

  const subscription = listing.subscription
  const trialEndsAt = subscription?.trialEndAt ? new Date(subscription.trialEndAt) : null
  const currentPeriodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null

  return NextResponse.json({
    account,
    listing: {
      id: listing.id,
      displayName: listing.displayName,
      slug: listing.slug,
      status: listing.status,
      visibilityReason: listing.visibilityReason,
      reviewStatus: listing.reviewStatus,
      reviewNotes: listing.reviewNotes,
      reviewFlagReason: listing.reviewFlagReason,
      aiRiskLevel: listing.aiRiskLevel,
      aiReasoning: listing.aiReasoning,
      categoryName: listing.category?.name || null,
      subcategoryName: listing.subcategory?.name || null,
      serviceType: listing.serviceType,
      trialEndsAt,
      trialDaysLeft: daysUntil(trialEndsAt),
      subscriptionStatus: subscription?.status || null,
      stripeSubscriptionId: subscription?.providerSubscriptionId || null,
      subscriptionPeriodEnd: currentPeriodEnd,
    },
  })
}
