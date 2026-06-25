export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { getIssueLandingPayload } from '@/lib/insights/issue-engine'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const nativeToken = session?.user?.id
      ? null
      : await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
        }).catch(() => null)
    const nativeUserId = session?.user?.id ? null : await getUserIdFromNativeAuth(request)
    const tokenUserId = typeof nativeToken?.id === 'string' ? nativeToken.id : typeof nativeToken?.sub === 'string' ? nativeToken.sub : null
    const userId = session?.user?.id || tokenUserId || nativeUserId
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const payload = await getIssueLandingPayload(userId)
    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    console.error('GET /api/insights/issues error', error)
    return NextResponse.json({ error: 'Failed to load issues' }, { status: 500 })
  }
}
