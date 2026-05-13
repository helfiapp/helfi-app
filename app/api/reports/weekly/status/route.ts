import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getLatestWeeklyReport, getWeeklyReportState, markWeeklyReportOnboardingComplete, setWeeklyReportsEnabled } from '@/lib/weekly-health-report'
import { prisma } from '@/lib/prisma'
import { isSubscriptionActive } from '@/lib/subscription-utils'
import { getWeeklyReportRequestUser, isWeeklyReportHealthSetupComplete } from '@/lib/weekly-report-request-auth'
import { isHealthSetupComplete } from '@/lib/health-setup-completion'

export async function GET(request: NextRequest) {
  const requestUser = await getWeeklyReportRequestUser(request)
  if (!requestUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const session = { user: requestUser }

  let [state, latest] = await Promise.all([
    getWeeklyReportState(requestUser.id),
    getLatestWeeklyReport(requestUser.id),
  ])
  const healthSetupComplete = await isWeeklyReportHealthSetupComplete(requestUser.id)
  if (!healthSetupComplete) {
    return NextResponse.json({
      healthSetupComplete: false,
      reportId: null,
      status: null,
      reportReady: false,
      reportLocked: false,
      showPopup: false,
      summary: null,
      periodStart: null,
      periodEnd: null,
      dataSummary: null,
      nextReportDueAt: null,
      lastReportAt: state?.lastReportAt ?? null,
      reportsEnabled: false,
      reportsEnabledAt: state?.reportsEnabledAt ?? null,
    })
  }

  // PROTECTED: WEEKLY_STATUS_SELF_HEAL START
  if (!state?.nextReportDueAt) {
    const isOwnerTestAccount = String(session.user.email || '').toLowerCase() === 'info@sonicweb.com.au'
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        gender: true,
        weight: true,
        height: true,
        subscription: {
          select: {
            plan: true,
            endDate: true,
          },
        },
        healthGoals: { select: { name: true, category: true } },
      },
    })

    if (user) {
      const eligible = isHealthSetupComplete({
        gender: user.gender,
        weight: user.weight,
        height: user.height,
        goals: user.healthGoals,
      })
      const hasActivePlan = isSubscriptionActive(user.subscription ?? null, new Date())
      if ((hasActivePlan || isOwnerTestAccount) && eligible) {
        await setWeeklyReportsEnabled(session.user.id, true, { scheduleFrom: new Date() })
        state = await getWeeklyReportState(session.user.id)
      }

      if (!state?.nextReportDueAt && eligible) {
        await markWeeklyReportOnboardingComplete(session.user.id)
        state = await getWeeklyReportState(session.user.id)
      }
    }
  }
  // PROTECTED: WEEKLY_STATUS_SELF_HEAL END

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

  return NextResponse.json({
    reportId: latest?.id ?? null,
    healthSetupComplete: true,
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
  })
}
