import { NextRequest, NextResponse } from 'next/server'
import { notifyOwner } from '@/lib/owner-notifications'

// Upstash QStash will POST here. This simply reuses our notifyOwner pathway,
// which resolves owner's subscription and performs the web-push delivery.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { event, userEmail, userName, amount, currency, planName, creditAmount } = body || {}
    if (!event || !userEmail) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    // Reuse existing delivery function (includes VAPID config and subscription lookup)
    await notifyOwner({
      event,
      userEmail,
      userName,
      amount,
      currency,
      planName,
      creditAmount,
    } as any)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[OWNER PUSH API] error', e?.stack || e)
    return NextResponse.json({ error: 'owner_push_error', message: e?.message || String(e) }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


