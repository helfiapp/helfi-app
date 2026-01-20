import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CreditManager } from '@/lib/credit-system'
import { getWeeklyReportState, setWeeklyReportsEnabled } from '@/lib/weekly-health-report'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = await getWeeklyReportState(session.user.id)
  const cm = new CreditManager(session.user.id)
  const wallet = await cm.getWalletStatus().catch(() => null)
  const totalAvailable = wallet?.totalAvailableCents ?? 0
  const hasCredits = Number.isFinite(totalAvailable) && totalAvailable > 0
  const hasPlan = !!wallet?.plan
  const isFounder = (session.user.email || '').toLowerCase() === 'info@sonicweb.com.au'

  // Auto-enable for founder/premium users if not already enabled, so UI never blocks
  let effectiveState = state
  if (!state?.reportsEnabled && (isFounder || hasPlan || hasCredits)) {
    effectiveState = await setWeeklyReportsEnabled(session.user.id, true, {
      scheduleFrom: new Date(),
    })
  }

  return NextResponse.json({
    reportsEnabled: effectiveState?.reportsEnabled ?? false,
    reportsEnabledAt: effectiveState?.reportsEnabledAt ?? null,
    nextReportDueAt: effectiveState?.nextReportDueAt ?? null,
    lastStatus: effectiveState?.lastStatus ?? null,
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : null
  if (enabled === null) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  if (enabled) {
    // Enforce paid access: require either a premium plan or available credits.
    // Soft-allow if wallet lookup fails to avoid blocking paid users.
    const cm = new CreditManager(session.user.id)
    const wallet = await cm.getWalletStatus().catch(() => null)
    const totalAvailable = wallet?.totalAvailableCents ?? 0
    const hasCredits = Number.isFinite(totalAvailable) && totalAvailable > 0
    const hasPlan = !!wallet?.plan
    // Founder override
    const isFounder = (session.user.email || '').toLowerCase() === 'info@sonicweb.com.au'

    if (!isFounder && !hasPlan && !hasCredits) {
      return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 })
    }
  }

  const state = await setWeeklyReportsEnabled(session.user.id, enabled, {
    scheduleFrom: new Date(),
  })

  return NextResponse.json({
    reportsEnabled: state?.reportsEnabled ?? false,
    reportsEnabledAt: state?.reportsEnabledAt ?? null,
    nextReportDueAt: state?.nextReportDueAt ?? null,
    lastStatus: state?.lastStatus ?? null,
  })
}
