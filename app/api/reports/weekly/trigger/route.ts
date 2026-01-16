import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { upsertWeeklyReportState } from '@/lib/weekly-health-report'

const buildBaseUrl = (request: NextRequest) => {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (envBase) return envBase.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  if (!host) return ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const now = new Date()
  await upsertWeeklyReportState(userId, { nextReportDueAt: now.toISOString() })

  const schedulerSecret = process.env.SCHEDULER_SECRET || ''
  if (!schedulerSecret) {
    return NextResponse.json({ error: 'Missing scheduler secret' }, { status: 500 })
  }

  const baseUrl = buildBaseUrl(request)
  if (!baseUrl) {
    return NextResponse.json({ error: 'Missing base URL' }, { status: 500 })
  }

  const response = await fetch(`${baseUrl}/api/reports/weekly/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${schedulerSecret}`,
    },
    body: JSON.stringify({ userId, triggerSource: 'manual' }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return NextResponse.json({ error: payload?.error || 'Failed to trigger report' }, { status: response.status })
  }

  return NextResponse.json({ ok: true, result: payload })
}
