import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deleteAllNotifications, deleteNotifications, listInboxNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/notification-inbox'

// GUARD RAIL: Notification inbox API behavior is locked. Do not change without owner approval.

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '30', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const statusParam = searchParams.get('status')
  const status = statusParam === 'read' || statusParam === 'unread' ? statusParam : 'all'

  const items = await listInboxNotifications(session.user.id, { limit, offset, status })
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : ''

  if (action === 'mark_read') {
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const ok = await markNotificationRead(session.user.id, id)
    return NextResponse.json({ success: ok })
  }

  if (action === 'mark_all_read') {
    const ok = await markAllNotificationsRead(session.user.id)
    return NextResponse.json({ success: ok })
  }

  if (action === 'delete_selected') {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []
    if (!ids.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
    const deleted = await deleteNotifications(session.user.id, ids)
    return NextResponse.json({ success: true, deleted })
  }

  if (action === 'delete_all') {
    const deleted = await deleteAllNotifications(session.user.id)
    return NextResponse.json({ success: true, deleted })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
