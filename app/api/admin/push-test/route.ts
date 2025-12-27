import { NextRequest, NextResponse } from 'next/server'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { notifyOwner } from '@/lib/owner-notifications'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await notifyOwner({
      event: 'signup',
      userEmail: 'test@helfi.ai',
      userName: 'Test User',
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[ADMIN PUSH TEST] error', e?.stack || e)
    return NextResponse.json({ error: 'Failed to enqueue test notification' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

