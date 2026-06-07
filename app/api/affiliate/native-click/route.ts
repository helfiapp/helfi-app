import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { normalizeAffiliateCode } from '@/lib/affiliate-cookies'
import { consumeRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 20

function getClientIp(request: NextRequest): string | null {
  const header = request.headers.get('x-forwarded-for')
  if (!header) return null
  const first = header.split(',')[0]?.trim()
  return first || null
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const code = normalizeAffiliateCode(String(body?.code || ''))
  const visitorId = String(body?.visitorId || '').trim() || crypto.randomUUID()
  if (!code) return NextResponse.json({ error: 'Affiliate code is required' }, { status: 400 })

  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { id: true, status: true },
  })
  if (!affiliate || affiliate.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Affiliate link is not active' }, { status: 404 })
  }

  const ip = getClientIp(request)
  const limiterKey = ip || visitorId
  const rateLimit = await consumeRateLimit('affiliate_native_click', limiterKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many referral attempts' }, { status: 429 })
  }

  const click = await prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      visitorId,
      ip,
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      landingPath: `/r/${code}`,
      destinationPath: 'native-app',
    },
    select: { id: true, createdAt: true },
  })

  return NextResponse.json({
    ok: true,
    attribution: {
      code,
      clickId: click.id,
      visitorId,
      clickedAtMs: click.createdAt.getTime(),
    },
  })
}
