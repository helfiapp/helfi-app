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
      stripeConnectOnboardedAt: true,
      createdAt: true,
    },
  })
  if (!affiliate) return NextResponse.json({ ok: true, affiliate: null })

  const [clickCount, uniqueVisitors, conversionCounts, sums] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id } }),
    prisma.affiliateClick.findMany({
      where: { affiliateId: affiliate.id },
      distinct: ['visitorId'],
      select: { visitorId: true },
    }),
    prisma.affiliateConversion.groupBy({
      by: ['type'],
      where: { affiliateId: affiliate.id },
      _count: { _all: true },
    }),
    prisma.affiliateCommission.groupBy({
      by: ['status'],
      where: { affiliateId: affiliate.id },
      _sum: { commissionCents: true },
    }),
  ])

  const now = new Date()
  const payableSum = await prisma.affiliateCommission.aggregate({
    where: { affiliateId: affiliate.id, status: 'PENDING', payableAt: { lte: now } },
    _sum: { commissionCents: true },
  })

  const conversions = await prisma.affiliateConversion.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: {
      occurredAt: true,
      type: true,
      currency: true,
      amountGrossCents: true,
      stripeFeeCents: true,
      amountNetCents: true,
      commission: { select: { status: true, commissionCents: true, payableAt: true, paidAt: true } },
    },
  })

  const stats = {
    clicks: clickCount,
    uniqueVisitors: uniqueVisitors.length,
    conversionsByType: conversionCounts.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.type] = row._count._all
        return acc
      },
      {} as Record<string, number>
    ),
    commissionTotalsByStatus: sums.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.status] = Number(row._sum.commissionCents || 0)
        return acc
      },
      {} as Record<string, number>
    ),
    payableNowCents: Number(payableSum._sum.commissionCents || 0),
  }

  return NextResponse.json({
    ok: true,
    affiliate,
    referralLink: `/r/${affiliate.code}`,
    stats,
    events: conversions.map(c => ({
      occurredAt: c.occurredAt,
      type: c.type,
      currency: c.currency,
      amountGrossCents: c.amountGrossCents,
      stripeFeeCents: c.stripeFeeCents,
      amountNetCents: c.amountNetCents,
      commission: c.commission,
    })),
  })
}
