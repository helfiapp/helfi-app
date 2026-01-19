import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import {
  getLatestWeeklyReport,
  getWeeklyReportById,
  getWeeklyReportState,
  listWeeklyReports,
} from '@/lib/weekly-health-report'
import WeeklyReportClient from './WeeklyReportClient'

interface WeeklyReportPageProps {
  searchParams?: { id?: string }
}

export default async function WeeklyReportPage({ searchParams }: WeeklyReportPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    const reportId = typeof searchParams?.id === 'string' ? searchParams?.id : ''
    const callback = reportId ? `/insights/weekly-report?id=${encodeURIComponent(reportId)}` : '/insights/weekly-report'
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`)
  }

  const reportId = typeof searchParams?.id === 'string' ? searchParams?.id : ''
  const [report, reports, state] = await Promise.all([
    reportId ? getWeeklyReportById(session.user.id, reportId) : getLatestWeeklyReport(session.user.id),
    listWeeklyReports(session.user.id, 50),
    getWeeklyReportState(session.user.id),
  ])
  const canManualReport = String(session.user.email || '').toLowerCase() === 'info@sonicweb.com.au'

  return (
    <WeeklyReportClient
      report={report}
      reports={reports}
      nextReportDueAt={state?.nextReportDueAt ?? null}
      canManualReport={canManualReport}
    />
  )
}
