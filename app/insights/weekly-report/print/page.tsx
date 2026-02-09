import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getWeeklyReportById } from '@/lib/weekly-health-report'
import WeeklyReportPrintClient from './weekly-report-print-client'

interface WeeklyReportPrintPageProps {
  searchParams?: { id?: string }
}

export default async function WeeklyReportPrintPage({ searchParams }: WeeklyReportPrintPageProps) {
  const session = await getServerSession(authOptions)
  const reportId = typeof searchParams?.id === 'string' ? searchParams?.id : ''

  if (!session?.user?.id) {
    const callback = reportId
      ? `/insights/weekly-report/print?id=${encodeURIComponent(reportId)}`
      : '/insights/weekly-report'
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`)
  }

  if (!reportId) {
    redirect('/insights/weekly-report')
  }

  const report = await getWeeklyReportById(session.user.id, reportId)
  if (!report) {
    redirect('/insights/weekly-report')
  }

  return <WeeklyReportPrintClient report={report} />
}

