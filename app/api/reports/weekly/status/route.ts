import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLatestWeeklyReport, getWeeklyReportState } from '@/lib/weekly-health-report'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [state, latest] = await Promise.all([
    getWeeklyReportState(session.user.id),
    getLatestWeeklyReport(session.user.id),
  ])

  const reportReady = latest?.status === 'READY'
  const reportLocked = latest?.status === 'LOCKED'
  const now = Date.now()
  const lastShownAt = latest?.lastShownAt ? new Date(latest.lastShownAt).getTime() : 0
  const shouldShowPopup = Boolean(
    reportReady &&
      !latest?.viewedAt &&
      !latest?.dontShowAt &&
      (lastShownAt === 0 || now - lastShownAt >= 24 * 60 * 60 * 1000)
  )

  return NextResponse.json({
    reportId: latest?.id ?? null,
    status: latest?.status ?? null,
    reportReady,
    reportLocked,
    showPopup: shouldShowPopup,
    summary: latest?.summary ?? null,
    periodStart: latest?.periodStart ?? null,
    periodEnd: latest?.periodEnd ?? null,
    dataSummary: latest?.dataSummary ?? null,
    nextReportDueAt: state?.nextReportDueAt ?? null,
    lastReportAt: state?.lastReportAt ?? null,
  })
}
