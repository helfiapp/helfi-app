import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { sendVercelSpendAlertEmail } from '@/lib/admin-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveBaseUrl(): string {
  let base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  base = (base || '').trim()
  if (base && !/^https?:\/\//i.test(base)) {
    base = `https://${base}`
  }
  return base.replace(/\/+$/, '')
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = (process.env.VERCEL_SPEND_WEBHOOK_SECRET || '').trim()
    if (!secret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 })
    }

    const payload = {
      test: true,
      source: 'admin-panel',
      sentAt: new Date().toISOString(),
    }

    const baseUrl = resolveBaseUrl()
    if (!baseUrl) {
      await sendVercelSpendAlertEmail({ payload })
      return NextResponse.json({
        ok: true,
        delivered: 'email',
        note: 'Base URL not configured; sent direct email instead.',
      })
    }

    const webhookUrl = `${baseUrl}/api/vercel/spend-webhook?secret=${encodeURIComponent(secret)}`
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: 'Webhook test failed', status: res.status, detail: text },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, delivered: 'webhook', url: webhookUrl })
  } catch (error) {
    console.error('[admin vercel-spend-test] error', error)
    return NextResponse.json({ error: 'Failed to send test webhook' }, { status: 500 })
  }
}
