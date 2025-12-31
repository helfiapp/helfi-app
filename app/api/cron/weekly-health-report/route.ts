import { NextRequest, NextResponse } from 'next/server'
import { backfillWeeklyReportState, listDueWeeklyReportUsers } from '@/lib/weekly-health-report'
import { publishWithQStash } from '@/lib/qstash'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.SCHEDULER_SECRET || ''
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  return isVercelCron || (expected && authHeader === `Bearer ${expected}`)
}

function getBaseUrl() {
  let base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (!base) return ''
  base = base.trim()
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  return base.replace(/\/+$/, '')
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await backfillWeeklyReportState(50)
  const dueUsers = await listDueWeeklyReportUsers(20)
  if (dueUsers.length === 0) {
    return NextResponse.json({ processed: 0, scheduled: 0 })
  }

  const base = getBaseUrl()
  const schedulerSecret = process.env.SCHEDULER_SECRET || ''

  const results = [] as Array<{ userId: string; ok: boolean; reason?: string }>

  for (const user of dueUsers) {
    if (process.env.QSTASH_TOKEN) {
      const published = await publishWithQStash('/api/reports/weekly/run', { userId: user.userId })
      results.push({ userId: user.userId, ok: published.ok, reason: published.reason })
      continue
    }

    if (!base || !schedulerSecret) {
      results.push({ userId: user.userId, ok: false, reason: 'missing_base_or_secret' })
      continue
    }

    try {
      const res = await fetch(`${base}/api/reports/weekly/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${schedulerSecret}`,
        },
        body: JSON.stringify({ userId: user.userId }),
      })
      results.push({ userId: user.userId, ok: res.ok, reason: res.ok ? undefined : `http_${res.status}` })
    } catch (error: any) {
      results.push({ userId: user.userId, ok: false, reason: error?.message || 'fetch_error' })
    }
  }

  return NextResponse.json({ processed: dueUsers.length, scheduled: results.length, results })
}
