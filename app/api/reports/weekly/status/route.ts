import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLatestWeeklyReport, getWeeklyReportState, markWeeklyReportOnboardingComplete } from '@/lib/weekly-health-report'
import { CreditManager } from '@/lib/credit-system'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let [state, latest] = await Promise.all([
    getWeeklyReportState(session.user.id),
    getLatestWeeklyReport(session.user.id),
  ])

  if (!state?.nextReportDueAt) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        gender: true,
        weight: true,
        height: true,
        healthGoals: { select: { name: true, category: true } },
      },
    })

    if (user) {
      const hasBasicProfile = !!(user.gender && user.weight && user.height)
      const visibleGoals = user.healthGoals.filter((goal) => !goal.name.startsWith('__'))
      const selectedRecord = user.healthGoals.find((goal) => goal.name === '__SELECTED_ISSUES__')
      let hasSelectedIssues = false
      if (selectedRecord?.category) {
        try {
          const parsed = JSON.parse(selectedRecord.category)
          hasSelectedIssues = Array.isArray(parsed) && parsed.filter(Boolean).length > 0
        } catch {
          hasSelectedIssues = false
        }
      }

      let hasCheckinIssues = false
      try {
        const rows: Array<{ count: number }> = await prisma.$queryRawUnsafe(
          'SELECT COUNT(*)::int AS count FROM CheckinIssues WHERE userid = $1',
          session.user.id
        )
        hasCheckinIssues = (rows?.[0]?.count || 0) > 0
      } catch {
        hasCheckinIssues = false
      }

      const eligible = hasBasicProfile && (visibleGoals.length > 0 || hasSelectedIssues || hasCheckinIssues)
      if (eligible) {
        await markWeeklyReportOnboardingComplete(session.user.id)
        state = await getWeeklyReportState(session.user.id)
      }
    }
  }

  const reportReady = latest?.status === 'READY'
  const reportLocked = latest?.status === 'LOCKED'
  const now = Date.now()
  const lastShownAt = latest?.lastShownAt ? new Date(latest.lastShownAt).getTime() : 0
  const shouldShowPopup = Boolean(
    (reportReady || reportLocked) &&
      !latest?.viewedAt &&
      !latest?.dontShowAt &&
      (lastShownAt === 0 || now - lastShownAt >= 24 * 60 * 60 * 1000)
  )

  let hasPaidAccess = false
  let hasPlan = false
  let hasCredits = false
  let totalAvailableCents = 0
  try {
    const cm = new CreditManager(session.user.id)
    const wallet = await cm.getWalletStatus()
    totalAvailableCents = Number(wallet?.totalAvailableCents ?? 0)
    hasCredits = Number.isFinite(totalAvailableCents) && totalAvailableCents > 0
    hasPlan = Boolean(wallet?.plan)
    hasPaidAccess = hasPlan || hasCredits
  } catch {
    hasPaidAccess = false
  }

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
    reportsEnabled: state?.reportsEnabled ?? false,
    reportsEnabledAt: state?.reportsEnabledAt ?? null,
    hasPaidAccess,
    hasPlan,
    hasCredits,
    totalAvailableCents,
  })
}
