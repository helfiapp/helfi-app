import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { getWeeklyReportById, getWeeklyReportChatActivity } from '@/lib/weekly-health-report'
import { getWeeklyReportRequestUser } from '@/lib/weekly-report-request-auth'

export async function GET(request: NextRequest) {
  const requestUser = await getWeeklyReportRequestUser(request)
  if (!requestUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reportId = new URL(request.url).searchParams.get('reportId') || ''
  if (!reportId) {
    return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
  }

  const report = await getWeeklyReportById(requestUser.id, reportId)
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const activity = await getWeeklyReportChatActivity(requestUser.id, report.periodStart, report.periodEnd)
  return NextResponse.json({ activity })
}
