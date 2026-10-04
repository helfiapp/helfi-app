import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAiConsentRequestUserId, hasAiSharingConsent } from '@/lib/ai-consent'
import { AI_SHARING_CONSENT_VERSION, AI_SHARING_DISCLOSURE } from '@/lib/ai-consent-text'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = await getAiConsentRequestUserId(request)
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  return NextResponse.json({ granted: await hasAiSharingConsent(userId), version: AI_SHARING_CONSENT_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const userId = await getAiConsentRequestUserId(request)
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.granted !== 'boolean' || body.version !== AI_SHARING_CONSENT_VERSION) {
    return NextResponse.json({ error: 'Please review the current AI permission notice.' }, { status: 400 })
  }
  const now = new Date()
  await prisma.aiDataSharingConsent.upsert({
    where: { userId },
    create: { userId, version: AI_SHARING_CONSENT_VERSION, disclosure: AI_SHARING_DISCLOSURE, granted: body.granted, grantedAt: body.granted ? now : null, withdrawnAt: body.granted ? null : now },
    update: { version: AI_SHARING_CONSENT_VERSION, disclosure: AI_SHARING_DISCLOSURE, granted: body.granted, ...(body.granted ? { grantedAt: now, withdrawnAt: null } : { withdrawnAt: now }) },
  })
  return NextResponse.json({ granted: body.granted, version: AI_SHARING_CONSENT_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}
