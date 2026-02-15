import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { consumePendingNotificationOpen } from '@/lib/notification-inbox'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const urlPrefixRaw = (searchParams.get('urlPrefix') || '').trim()
  const urlPrefix = urlPrefixRaw.startsWith('/') ? urlPrefixRaw : null

  const pending = await consumePendingNotificationOpen(session.user.id, {
    withinMinutes: 30,
    types: ['checkin_reminder', 'mood_reminder'],
    sources: ['push'],
    urlPrefix,
  })

  return NextResponse.json({ url: pending?.url ?? null, id: pending?.id ?? null })
}
