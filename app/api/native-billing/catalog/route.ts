import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { getNativeBillingCatalog } from '@/lib/native-billing/catalog'

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) return true

  const nativeUserId = await getUserIdFromNativeAuth(request)
  return !!nativeUserId
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorized(request)
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const catalog = getNativeBillingCatalog()
    return NextResponse.json(catalog)
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to load native billing catalog',
        message: error?.message || 'Unknown error',
      },
      { status: 500 },
    )
  }
}
