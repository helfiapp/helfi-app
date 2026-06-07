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
  const payableByCurrencyRows = await prisma.affiliateCommission.groupBy({
    by: ['currency'],
    where: { affiliateId: affiliate.id, status: 'PENDING', payableAt: { lte: now } },
    _sum: { commissionCents: true },
  })
  const payableNowByCurrency = payableByCurrencyRows.reduce(
    (acc: Record<string, number>, row: any) => {
      acc[String(row.currency || 'usd').toLowerCase()] = Number(row._sum.commissionCents || 0)
      return acc
    },
    {} as Record<string, number>
  )

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
    payableNowCents: Object.values(payableNowByCurrency).reduce((sum, value) => sum + Number(value || 0), 0),
    payableNowByCurrency,
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
