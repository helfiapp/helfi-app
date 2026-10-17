import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listWeeklyReports } from '@/lib/weekly-health-report'
import { getWeeklyReportRequestUser, isWeeklyReportHealthSetupComplete } from '@/lib/weekly-report-request-auth'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const readOnly = url.searchParams.get('voiceReadOnly') === '1'
  const preview = url.searchParams.get('preview') === '1'
  const enabled = process.env.NEXT_PUBLIC_REPORTS_ENABLED === 'true'
  if (!enabled && !preview) {
    return NextResponse.json({ enabled: false, reports: [], ...(readOnly ? { readOnly: true } : {}) }, { status: 200 })
  }

  const requestUser = await getWeeklyReportRequestUser(request)
  if (!requestUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const healthSetupComplete = await isWeeklyReportHealthSetupComplete(requestUser.id)
  if (!healthSetupComplete) {
    return NextResponse.json({ error: 'health_setup_required', enabled: false, reports: [] }, { status: 403 })
  }

  let reports
  if (readOnly) {
    try { reports = await listWeeklyReports(requestUser.id, 50, undefined, { readOnly: true }) }
    catch { return NextResponse.json({ error: 'Failed to read existing weekly reports' }, { status: 500 }) }
  } else reports = await listWeeklyReports(requestUser.id, 50)

  return NextResponse.json({ enabled: true, healthSetupComplete: true, reports, preview, ...(readOnly ? { readOnly: true } : {}) }, { status: 200 })
}
