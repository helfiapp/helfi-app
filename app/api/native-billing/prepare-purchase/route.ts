import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { getNativeStoreProductId, type NativeBillingProductCode } from '@/lib/native-billing/catalog'

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) return true

  const nativeUserId = await getUserIdFromNativeAuth(request)
  return !!nativeUserId
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await isAuthorized(request)
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const platform = body?.platform === 'android' ? 'android' : body?.platform === 'ios' ? 'ios' : null
    const code = String(body?.code || '') as NativeBillingProductCode

    if (!platform) {
      return NextResponse.json({ error: 'Invalid platform. Use ios or android.' }, { status: 400 })
    }
    if (!code) {
      return NextResponse.json({ error: 'Missing product code.' }, { status: 400 })
    }

    const storeProductId = getNativeStoreProductId(platform, code)
    if (!storeProductId) {
      return NextResponse.json(
        {
          error: 'Store product not configured',
          message: `${platform === 'ios' ? 'Apple' : 'Google'} product ID is not set for ${code}.`,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      platform,
      code,
      storeProductId,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to prepare purchase',
        message: error?.message || 'Unknown error',
      },
      { status: 500 },
    )
  }
}
