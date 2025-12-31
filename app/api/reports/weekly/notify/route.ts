import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateWeeklyReportNotification } from '@/lib/weekly-health-report'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
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

  const updated = await updateWeeklyReportNotification(session.user.id, reportId, action as any)
  if (!updated) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
