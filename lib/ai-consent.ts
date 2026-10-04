import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { AI_SHARING_CONSENT_VERSION } from '@/lib/ai-consent-text'

export class AiConsentError extends Error {
  code = 'ai_consent_required'
  status = 403
  constructor() {
    super('Please allow AI help before using this feature. You can manage AI permission in Settings.')
    this.name = 'AiConsentError'
  }
}

export async function getAiConsentRequestUserId(request?: Request): Promise<string | null> {
  // Prefer the native identity when a native token is explicitly supplied.
  const req = request instanceof NextRequest ? request : new NextRequest('https://helfi.ai', { headers: request?.headers ?? await headers() })
  if (req.headers.has('x-native-token') || /^Bearer /i.test(req.headers.get('authorization') || '')) {
    const nativeId = await getUserIdFromNativeAuth(req)
    if (nativeId) return nativeId
  }
  const session = await getServerSession(authOptions)
  return session?.user?.id || null
}

export async function hasAiSharingConsent(userId: string | null | undefined) {
  if (!userId) return false
  const record = await prisma.aiDataSharingConsent.findUnique({ where: { userId } })
  return record?.granted === true && record.version === AI_SHARING_CONSENT_VERSION
}

export async function assertAiSharingConsent(context: { userId?: string | null; feature?: string | null } = {}) {
  // The authenticated admin benchmark uses public demonstration photos only.
  if (context.feature === 'admin:food-benchmark') return
  let requestUserId: string | null = null
  try { requestUserId = await getAiConsentRequestUserId() } catch {}
  const userId = requestUserId || context.userId
  if (!(await hasAiSharingConsent(userId))) throw new AiConsentError()
}

export async function aiConsentRequiredResponse(request: Request) {
  try {
    const userId = await getAiConsentRequestUserId(request)
    if (!userId) return NextResponse.json({ error: 'Please sign in.', code: 'unauthorized' }, { status: 401 })
    if (!(await hasAiSharingConsent(userId))) {
      return NextResponse.json({ error: new AiConsentError().message, code: 'ai_consent_required' }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Could not check AI permission. Please try again.', code: 'ai_consent_unavailable' }, { status: 503 })
  }
}
