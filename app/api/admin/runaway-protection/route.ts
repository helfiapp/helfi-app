import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { closeCircuit, getCircuitState, openCircuit } from '@/lib/safety-circuit'
import { sendWriteSpikeAlertEmail } from '@/lib/admin-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getRecipientEmail() {
  return ((process.env.OWNER_EMAIL || 'support@helfi.ai') as string).trim() || 'support@helfi.ai'
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = await getCircuitState('health-setup-saves')
  return NextResponse.json({
    ok: true,
    action: 'status',
    scope: 'health-setup-saves',
    ...state,
    openUntil: state.openUntil?.toISOString() || null,
  })
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as any
  const action = String(body?.action || 'test')

  if (action === 'close') {
    await closeCircuit('health-setup-saves')
    const state = await getCircuitState('health-setup-saves')
    return NextResponse.json({
      ok: true,
      action: 'close',
      scope: 'health-setup-saves',
      ...state,
      openUntil: state.openUntil?.toISOString() || null,
    })
  }

  const minutesRaw = Number(body?.minutes)
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : action === 'test' ? 2 : 10

  await openCircuit({
    scope: 'health-setup-saves',
    minutes,
    reason: action === 'test' ? 'Manual test from admin panel.' : String(body?.reason || 'Manual pause from admin panel.'),
  })

  const recipientEmail = getRecipientEmail()
  const state = await getCircuitState('health-setup-saves')

  let emailOk = false
  try {
    await sendWriteSpikeAlertEmail({
      recipientEmail,
      subject: action === 'test' ? 'TEST: Helfi runaway protection' : 'Helfi runaway protection enabled',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="margin: 0 0 12px 0;">Runaway protection ${action === 'test' ? 'test' : 'enabled'}</h2>
          <p style="margin: 0 0 12px 0;"><strong>Scope:</strong> health-setup-saves</p>
          <p style="margin: 0 0 12px 0;"><strong>Paused until:</strong> ${state.openUntil ? state.openUntil.toISOString() : 'unknown'}</p>
          <p style="margin: 0 0 12px 0;"><strong>Triggered by:</strong> ${admin.email}</p>
          <p style="margin: 0 0 12px 0;">This is an automated email from the Helfi admin panel.</p>
        </div>
      `,
    })
    emailOk = true
  } catch (error) {
    console.error('[runaway protection admin] failed to send email', error)
  }

  return NextResponse.json({
    ok: true,
    action,
    scope: 'health-setup-saves',
    emailOk,
    ...state,
    openUntil: state.openUntil?.toISOString() || null,
  })
}
