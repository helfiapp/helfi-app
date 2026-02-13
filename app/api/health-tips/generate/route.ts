import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    {
      error: 'manual_generation_disabled',
      message:
        'Smart Health Coach alerts are automatic. Turn Smart Health Coach on in Notifications to receive alerts.',
    },
    { status: 400 }
  )
}
