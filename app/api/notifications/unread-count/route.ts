import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { countUnreadNotifications } from '@/lib/notification-inbox'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = await countUnreadNotifications(session.user.id)
  return NextResponse.json({ count })
}
