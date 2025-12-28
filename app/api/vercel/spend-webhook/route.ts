import { NextRequest, NextResponse } from 'next/server'
import { sendVercelSpendAlertEmail } from '@/lib/admin-alerts'

function getIncomingSecret(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || null
  }
  try {
    const url = new URL(request.url)
    return url.searchParams.get('secret')
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.VERCEL_SPEND_WEBHOOK_SECRET
  if (!expectedSecret) {
    console.error('❌ Vercel spend webhook secret not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const incomingSecret = getIncomingSecret(request)
  if (incomingSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown = null
  try {
    payload = await request.json()
  } catch (error) {
    console.error('❌ Failed to parse Vercel spend webhook payload:', error)
  }

  const recipientEmail = (process.env.OWNER_EMAIL || 'louie@helfi.ai').trim() || 'louie@helfi.ai'
  sendVercelSpendAlertEmail({ recipientEmail, payload }).catch((error) => {
    console.error('❌ Vercel spend alert email failed (non-blocking):', error)
  })

  return NextResponse.json({ ok: true })
}
