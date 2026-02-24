import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { deleteAllNotifications, deleteNotifications, listInboxNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/notification-inbox'

// GUARD RAIL: Notification inbox API behavior is locked. Do not change without owner approval.

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const sessionUserId = String(session?.user?.id || '').trim()
  if (sessionUserId) return sessionUserId

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (nativeUserId) return nativeUserId

  // Fallback for native Bearer tokens.
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'helfi-secret-key-production-2024',
    })
    const tokenUserId = String(token?.sub || token?.id || '').trim()
    if (tokenUserId) return tokenUserId
  } catch {
    // Ignore and return null.
  }

  return null
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '30', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const statusParam = searchParams.get('status')
  const status = statusParam === 'read' || statusParam === 'unread' ? statusParam : 'all'

  const items = await listInboxNotifications(userId, { limit, offset, status })
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'mark_read') {
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const ok = await markNotificationRead(userId, id)
    return NextResponse.json({ success: ok })
  }

  if (action === 'mark_all_read') {
    const ok = await markAllNotificationsRead(userId)
    return NextResponse.json({ success: ok })
  }

  if (action === 'delete_selected') {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []
    if (!ids.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
    const deleted = await deleteNotifications(userId, ids)
    return NextResponse.json({ success: true, deleted })
  }

  if (action === 'delete_all') {
    const deleted = await deleteAllNotifications(userId)
    return NextResponse.json({ success: true, deleted })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
