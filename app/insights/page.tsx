import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueLandingPayload } from '@/lib/insights/issue-engine'
import { getLatestWeeklyReport, getWeeklyReportState, markWeeklyReportOnboardingComplete } from '@/lib/weekly-health-report'
import { CreditManager } from '@/lib/credit-system'
import InsightsLandingClient from './InsightLandingClient'

export default async function InsightsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const payload = await getIssueLandingPayload(session.user.id)

  // ⚠️ HEALTH SETUP GUARD RAIL
  // If Health Setup is not complete, Insights MUST remain fully locked.
  // This gate is the single source of truth for /insights access and must
  // mirror the onboardingComplete definition in HEALTH_SETUP_PROTECTION.md.
  // Do NOT bypass this check or show "fake" personalised insights to users
  // with incomplete Health Setup.
  // If Health Setup is not complete, completely gate the Insights section and
  // guide the user back to onboarding instead of showing empty insights.
  if (!payload.onboardingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-helfi-green-light/10 dark:from-gray-900 dark:to-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-2xl">📝</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Finish your Health Setup to unlock Insights
          </h1>
          <p className="text-sm text-gray-600 mb-5">
            Helfi needs your core health information to generate accurate insights. Complete your
            Health Setup and we&apos;ll unlock this section for you.
          </p>
          <div className="space-y-3">
            <Link
              href="/onboarding?step=1"
              className="block w-full bg-helfi-green text-white text-sm font-medium py-2.5 rounded-lg hover:bg-helfi-green-dark transition-colors"
            >
              Complete Health Setup
            </Link>
            <Link
              href="/dashboard"
              className="block w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  let weeklyState = await getWeeklyReportState(session.user.id)
  if (!weeklyState?.nextReportDueAt) {
    await markWeeklyReportOnboardingComplete(session.user.id)
    weeklyState = await getWeeklyReportState(session.user.id)
  }
  const latestReport = await getLatestWeeklyReport(session.user.id)
  const reportReady = latestReport?.status === 'READY'
  const reportLocked = latestReport?.status === 'LOCKED'
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

  return (
    <InsightsLandingClient
      sessionUser={{
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      issues={payload.issues}
      generatedAt={payload.generatedAt}
      onboardingComplete={payload.onboardingComplete}
      dataNeeds={payload.dataNeeds}
      initialWeeklyStatus={{
        reportReady,
        reportLocked,
        status: latestReport?.status ?? null,
        nextReportDueAt: weeklyState?.nextReportDueAt ?? null,
        reportsEnabled: weeklyState?.reportsEnabled ?? false,
        reportsEnabledAt: weeklyState?.reportsEnabledAt ?? null,
        hasPaidAccess,
        hasPlan,
        hasCredits,
        totalAvailableCents,
      }}
    />
  )
}
