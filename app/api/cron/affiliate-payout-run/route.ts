import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  const isVercelCron = vercelCronHeader !== null
  const authHeader = request.headers.get('authorization')
  const expected = process.env.SCHEDULER_SECRET

  if (!(isVercelCron || (expected && authHeader === `Bearer ${expected}`))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const origin = new URL(request.url).origin
  const res = await fetch(`${origin}/api/admin/affiliates/payout-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer temp-admin-token',
    },
    body: JSON.stringify({
      currency: 'usd',
      minThresholdCents: 5000,
      dryRun: false,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json({ error: data?.error || 'Payout run failed' }, { status: res.status })
  }

  return NextResponse.json({ ok: true, result: data })
}
