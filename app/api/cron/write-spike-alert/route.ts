import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWriteSpikeAlertEmail } from '@/lib/admin-alerts'
import { estimateDailyCostUsd, fetchNeonUsageSummary } from '@/lib/neon-usage'
import { formatNumber, getSpikeCandidates } from '@/lib/usage-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

async function ensureAlertTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WriteSpikeAlertLog (
      scope TEXT PRIMARY KEY,
      lastAlertAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function canSendAlert(scope: string, cooldownMinutes: number) {
  await ensureAlertTable()
  const rows: any[] = await prisma.$queryRawUnsafe(
    'SELECT lastAlertAt FROM WriteSpikeAlertLog WHERE scope = $1',
    scope
  )
  const existing = rows?.[0]
  const now = Date.now()
  if (existing?.lastAlertAt) {
    const last = new Date(existing.lastAlertAt).getTime()
    if (now - last < cooldownMinutes * 60 * 1000) {
      return false
    }
  }

  await prisma.$queryRawUnsafe(
    `INSERT INTO WriteSpikeAlertLog (scope, lastAlertAt)
     VALUES ($1, NOW())
     ON CONFLICT (scope) DO UPDATE SET lastAlertAt = NOW()`,
    scope
  )
  return true
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const warningUsdRaw = Number(process.env.NEON_DAILY_COST_WARNING_USD || '1')
  const warningUsd = Number.isFinite(warningUsdRaw) && warningUsdRaw >= 0 ? warningUsdRaw : 1
  const shouldCheckCost = warningUsd > 0

  if (shouldCheckCost) {
    const costWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const neonUsage = await fetchNeonUsageSummary({
      from: costWindowStart.toISOString(),
      to: now.toISOString(),
      granularity: 'daily',
      orgId: (process.env.NEON_ORG_ID || '').trim() || undefined,
    })
    const costEstimate = estimateDailyCostUsd(neonUsage)

    if (costEstimate.estimatedDailyCostUsd === null) {
      return NextResponse.json({
        skipped: true,
        reason: 'daily_cost_unavailable',
        note: costEstimate.note || neonUsage?.note || 'Daily cost estimate unavailable.',
      })
    }

    if (costEstimate.estimatedDailyCostUsd < warningUsd) {
      return NextResponse.json({
        skipped: true,
        reason: 'daily_cost_below_threshold',
        estimatedDailyCostUsd: costEstimate.estimatedDailyCostUsd,
        warningUsd,
      })
    }
  }

  const recentMinutes = 10
  const baselineHours = 6
  const baselineWindows = (baselineHours * 60) / recentMinutes

  const recentFrom = new Date(now.getTime() - recentMinutes * 60 * 1000)
  const baselineFrom = new Date(now.getTime() - baselineHours * 60 * 60 * 1000)

  const candidates = await getSpikeCandidates({
    recentFrom,
    recentTo: now,
    baselineFrom,
    baselineTo: now,
    baselineWindows,
  })

  const spikes = candidates.filter((row) => {
    if (row.recentCount < row.spikeThreshold) return false
    const baseline = row.baselinePerWindow || 0
    if (baseline === 0) return row.recentCount >= row.spikeThreshold
    return row.recentCount >= baseline * 3
  })

  if (!spikes.length) {
    return NextResponse.json({ ok: true, spikes: 0 })
  }

  const scope = 'write-spike-alert'
  const allowed = await canSendAlert(scope, 60)
  if (!allowed) {
    return NextResponse.json({ ok: true, spikes: spikes.length, suppressed: true })
  }

  const recipientEmail = 'support@helfi.ai'
  const subject = 'Helfi write spike alert'

  const listHtml = spikes
    .map(
      (row) =>
        `<li>${row.label}: ${formatNumber(row.recentCount)} in last ${recentMinutes} mins (baseline ${formatNumber(Math.round(row.baselinePerWindow || 0))})</li>`
    )
    .join('')

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Write spike alert</h2>
      <p style="margin: 0 0 12px 0;">Window: last ${recentMinutes} minutes.</p>
      <ul>${listHtml}</ul>
    </div>
  `

  await sendWriteSpikeAlertEmail({
    recipientEmail,
    subject,
    html,
  })

  return NextResponse.json({ ok: true, spikes: spikes.length, sentTo: recipientEmail })
}
