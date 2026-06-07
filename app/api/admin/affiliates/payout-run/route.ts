import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PayableCommission = {
  id: string
  affiliateId: string
  currency: string
  commissionCents: number
  payableAt: Date
  affiliate: {
    id: string
    code: string
    stripeConnectAccountId: string | null
    stripeConnectPayoutsEnabled: boolean
    status: 'ACTIVE' | 'SUSPENDED'
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  const schedulerSecrets = [process.env.CRON_SECRET, process.env.SCHEDULER_SECRET].filter(Boolean)
  const isScheduler = schedulerSecrets.some(secret => authHeader === `Bearer ${secret}`)
  if (!admin && !isScheduler) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })

  const body = await request.json().catch(() => ({}))
  const currency = String(body?.currency || 'usd').toLowerCase()
  const minThresholdCents = Number(body?.minThresholdCents ?? 5000)
  const dryRun = Boolean(body?.dryRun ?? false)

  const now = new Date()

  const commissions: PayableCommission[] = (await prisma.affiliateCommission.findMany({
    where: {
      status: 'PENDING',
      payableAt: { lte: now },
      payoutId: null,
      currency,
    },
    select: {
      id: true,
      affiliateId: true,
      currency: true,
      commissionCents: true,
      payableAt: true,
      affiliate: {
        select: {
          id: true,
          code: true,
          status: true,
          stripeConnectAccountId: true,
          stripeConnectPayoutsEnabled: true,
        },
      },
    },
  })) as any

  const byAffiliate = new Map<
    string,
    { affiliate: PayableCommission['affiliate']; commissionIds: string[]; totalCents: number }
  >()
  for (const c of commissions) {
    const existing = byAffiliate.get(c.affiliateId)
    const total = Number(c.commissionCents || 0)
    if (!existing) {
      byAffiliate.set(c.affiliateId, { affiliate: c.affiliate, commissionIds: [c.id], totalCents: total })
    } else {
      existing.commissionIds.push(c.id)
      existing.totalCents += total
    }
  }

  const candidates = Array.from(byAffiliate.values())
    .filter(x => x.totalCents >= minThresholdCents)
    .map(x => ({
      affiliateId: x.affiliate.id,
      code: x.affiliate.code,
      connectAccountId: x.affiliate.stripeConnectAccountId,
      payoutsEnabled: x.affiliate.stripeConnectPayoutsEnabled,
      status: x.affiliate.status,
      totalCents: x.totalCents,
      commissionIds: x.commissionIds,
    }))

  const skipped = candidates.filter(
    c => !c.connectAccountId || !c.payoutsEnabled || c.status !== 'ACTIVE' || c.totalCents <= 0
  )
  const toPay = candidates.filter(
    c => c.connectAccountId && c.payoutsEnabled && c.status === 'ACTIVE' && c.totalCents > 0
  )

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      currency,
      minThresholdCents,
      payableAffiliateCount: toPay.length,
      totalCents: toPay.reduce((sum, x) => sum + x.totalCents, 0),
      payouts: toPay.map(x => ({
        affiliateCode: x.code,
        connectAccountId: x.connectAccountId,
        amountCents: x.totalCents,
        commissionCount: x.commissionIds.length,
      })),
      skipped: skipped.map(x => ({
        affiliateCode: x.code,
        reason: !x.connectAccountId ? 'missing_connect_account' : !x.payoutsEnabled ? 'payouts_not_enabled' : x.status,
        amountCents: x.totalCents,
      })),
    })
  }

  const run = await prisma.affiliatePayoutRun.create({
    data: {
      createdByAdminId: admin?.adminId || null,
      currency,
      periodStart: new Date(0),
      periodEnd: now,
      runAt: now,
      status: 'FAILED',
      totalCents: 0,
      transferCount: 0,
      note: 'running',
    },
    select: { id: true },
  })

  const results: Array<{ affiliateCode: string; amountCents: number; transferId: string }> = []
  const failures: Array<{ affiliateCode: string; reason: string }> = []
  let totalCents = 0

  for (const payout of toPay) {
    let reservedPayoutId: string | null = null
    try {
      const reservation = await prisma.$transaction(async tx => {
        const payoutRecord = await tx.affiliatePayout.create({
          data: {
            payoutRunId: run.id,
            affiliateId: payout.affiliateId,
            currency,
            amountCents: payout.totalCents,
            stripeTransferId: `pending:${run.id}:${payout.affiliateId}`,
          },
          select: { id: true },
        })

        const updated = await tx.affiliateCommission.updateMany({
          where: {
            id: { in: payout.commissionIds },
            status: 'PENDING',
            payoutId: null,
          },
          data: { payoutId: payoutRecord.id },
        })

        if (updated.count !== payout.commissionIds.length) {
          await tx.affiliatePayout.delete({ where: { id: payoutRecord.id } })
          return null
        }

        return payoutRecord
      })

      if (!reservation) {
        failures.push({ affiliateCode: payout.code, reason: 'commissions_already_reserved' })
        continue
      }
      reservedPayoutId = reservation.id

      const transfer = await stripe.transfers.create(
        {
          amount: payout.totalCents,
          currency,
          destination: payout.connectAccountId!,
          transfer_group: `affiliate_payout_run:${run.id}`,
          description: `Helfi affiliate payout (${currency.toUpperCase()})`,
          metadata: {
            helfi_payout_run_id: run.id,
            helfi_affiliate_code: payout.code,
          },
        },
        { idempotencyKey: `affiliate_payout:${reservedPayoutId}` }
      )

      await prisma.$transaction(async tx => {
        await tx.affiliatePayout.update({
          where: { id: reservedPayoutId! },
          data: { stripeTransferId: transfer.id },
        })
        await tx.affiliateCommission.updateMany({
          where: {
            id: { in: payout.commissionIds },
            payoutId: reservedPayoutId,
            status: 'PENDING',
          },
          data: { status: 'PAID', paidAt: now },
        })
      })

      results.push({ affiliateCode: payout.code, amountCents: payout.totalCents, transferId: transfer.id })
      totalCents += payout.totalCents
    } catch (e: any) {
      if (reservedPayoutId) {
        await prisma.affiliatePayout.delete({ where: { id: reservedPayoutId } }).catch(() => {})
      }
      failures.push({ affiliateCode: payout.code, reason: e?.message || 'transfer_failed' })
    }
  }

  await prisma.affiliatePayoutRun.update({
    where: { id: run.id },
    data: {
      status: failures.length ? 'FAILED' : 'SUCCEEDED',
      totalCents,
      transferCount: results.length,
      note: failures.length ? JSON.stringify(failures.slice(0, 25)) : null,
    },
  })

  return NextResponse.json({
    ok: true,
    runId: run.id,
    currency,
    transferCount: results.length,
    totalCents,
    failures,
  })
}
