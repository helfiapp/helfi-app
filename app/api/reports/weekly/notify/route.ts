import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateWeeklyReportNotification } from '@/lib/weekly-health-report'
import { getWeeklyReportRequestUser } from '@/lib/weekly-report-request-auth'

export async function POST(request: NextRequest) {
  const requestUser = await getWeeklyReportRequestUser(request)
  if (!requestUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const reportId = typeof body?.reportId === 'string' ? body.reportId : ''
  const action = typeof body?.action === 'string' ? body.action : ''

  if (!reportId) {
    return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
  }

  if (!['shown', 'viewed', 'dont_show'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await updateWeeklyReportNotification(requestUser.id, reportId, action as any)
  if (!updated) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
