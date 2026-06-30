import { NextRequest, NextResponse } from 'next/server'

import { createNativeDeviceOauthTicket, type NativeDeviceOauthProvider } from '@/lib/native-device-oauth-ticket'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'

export const runtime = 'nodejs'

function normalizeProvider(value: unknown): NativeDeviceOauthProvider | null {
  const provider = String(value || '').trim().toLowerCase()
  return provider === 'fitbit' || provider === 'garmin' ? provider : null
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromNativeAuth(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const provider = normalizeProvider(body?.provider)
  if (!provider) {
    return NextResponse.json({ error: 'Unsupported device provider' }, { status: 400 })
  }

  const response = NextResponse.json({
    ticket: createNativeDeviceOauthTicket(provider, userId),
    expiresInSeconds: 15 * 60,
  })
  response.headers.set('cache-control', 'no-store')
  return response
}
