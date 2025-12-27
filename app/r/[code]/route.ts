import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  AFFILIATE_COOKIE_MAX_AGE_SECONDS,
  AFFILIATE_COOKIES,
  getOrCreateVisitorId,
  normalizeAffiliateCode,
} from '@/lib/affiliate-cookies'
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

export async function GET(request: NextRequest, context: { params: { code: string } }) {
  const code = normalizeAffiliateCode(context.params.code)

  const url = new URL(request.url)
  const destination = url.searchParams.get('to') || '/'
  const destinationPath = destination.startsWith('/') ? destination : '/'

  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { id: true, status: true },
  })

  if (!affiliate || affiliate.status !== 'ACTIVE') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const visitorId = getOrCreateVisitorId(request)
  const ip = getClientIp(request)
  const limiterKey = ip || visitorId
  const rateLimit = consumeRateLimit('affiliate_click', limiterKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return NextResponse.redirect(new URL(destinationPath, request.url))
  }

  const referer = request.headers.get('referer')
  const userAgent = request.headers.get('user-agent')
  const landingPath = url.pathname

  const click = await prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      visitorId,
      ip,
      userAgent,
      referer,
      landingPath,
      destinationPath,
    },
    select: { id: true, createdAt: true },
  })

  const response = NextResponse.redirect(new URL(destinationPath, request.url))

  response.cookies.set(AFFILIATE_COOKIES.visitorId, visitorId, {
    httpOnly: true,
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
  response.cookies.set(AFFILIATE_COOKIES.code, code, {
    httpOnly: true,
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
  response.cookies.set(AFFILIATE_COOKIES.clickId, click.id, {
    httpOnly: true,
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
  response.cookies.set(AFFILIATE_COOKIES.clickedAtMs, String(click.createdAt.getTime()), {
    httpOnly: true,
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })

  return response
}
