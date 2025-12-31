import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listWeeklyReports } from '@/lib/weekly-health-report'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const enabled = process.env.NEXT_PUBLIC_REPORTS_ENABLED === 'true'
  if (!enabled && !preview) {
    return NextResponse.json({ enabled: false, reports: [] }, { status: 200 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reports = await listWeeklyReports(session.user.id, 8)

  return NextResponse.json({ enabled: true, reports, preview }, { status: 200 })
}

