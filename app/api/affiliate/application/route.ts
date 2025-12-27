import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAffiliateUser } from '@/lib/affiliate-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getAffiliateUser(request)
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      code: true,
      status: true,
      stripeConnectAccountId: true,
      stripeConnectDetailsSubmitted: true,
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
    },
  })

  const application = await prisma.affiliateApplication.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      autoApproved: true,
      riskLevel: true,
      recommendation: true,
      primaryChannel: true,
      primaryChannelOther: true,
      audienceSize: true,
      termsVersion: true,
      termsAcceptedAt: true,
      createdAt: true,
      reviewedAt: true,
      aiReasoning: true,
    },
  })

  return NextResponse.json({ ok: true, affiliate, application })
}
