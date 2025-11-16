import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssueLandingPayload } from '@/lib/insights/issue-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const payload = await getIssueLandingPayload(session.user.id)
    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    console.error('GET /api/insights/issues error', error)
    return NextResponse.json({ error: 'Failed to load issues' }, { status: 500 })
  }
}

