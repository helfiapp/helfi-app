import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { consumePendingNotificationOpen } from '@/lib/notification-inbox'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await consumePendingNotificationOpen(session.user.id, {
    withinMinutes: 30,
    types: ['checkin_reminder', 'mood_reminder'],
    sources: ['push'],
  })

  return NextResponse.json({ url: pending?.url ?? null })
}
