import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertGarminConfigured, parseBearerToken, parseOAuthHeader } from '@/lib/garmin-oauth'
import { publishWithQStash } from '@/lib/qstash'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = {
  params: {
    dataType?: string[]
  }
}

function collectGarminUserIdsAndCallbacks(payload: unknown) {
  const userIds = new Set<string>()
  const callbacks: Array<{ url: string; userId?: string }> = []

  const visit = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (typeof node !== 'object') return

    const possibleUserId = (node.userId ?? node.userid ?? node.user_id) as unknown
    if (typeof possibleUserId === 'string' && possibleUserId.trim()) {
      userIds.add(possibleUserId.trim())
    }

    const callbackRaw = (node.callbackURL ?? node.callbackUrl) as unknown
    if (typeof callbackRaw === 'string' && callbackRaw.trim()) {
      callbacks.push({
        url: callbackRaw.trim(),
        userId: typeof possibleUserId === 'string' && possibleUserId.trim() ? possibleUserId.trim() : undefined,
      })
    }

    for (const value of Object.values(node)) visit(value)
  }

  visit(payload)
  return { userIds: Array.from(userIds), callbacks }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const rawBody = await request.text()
  const oauthHeader = request.headers.get('authorization')
  const oauthParams = parseOAuthHeader(oauthHeader)
  const bearerToken = parseBearerToken(oauthHeader)

  const dataType = params?.dataType?.length ? params.dataType.join('/') : 'default'

  let payload: any
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    payload = { raw: rawBody }
  }

  try {
    assertGarminConfigured()
  } catch (error) {
    console.error('Garmin webhook received but credentials missing:', error)
    return NextResponse.json({ error: 'Garmin not configured' }, { status: 500 })
  }

  const oauthToken = oauthParams?.oauth_token || null
  const tokenToMatch = bearerToken || oauthToken || null
  let userId: string | null = null

  const { userIds: garminUserIds, callbacks } = collectGarminUserIdsAndCallbacks(payload)
  const primaryGarminUserId = garminUserIds[0] || null

  try {
    if (primaryGarminUserId) {
      const account = await prisma.account.findFirst({
        where: { provider: 'garmin', providerAccountId: primaryGarminUserId },
        select: { userId: true },
      })
      userId = account?.userId || null
    }

    if (!userId && tokenToMatch) {
      const account = await prisma.account.findFirst({
        where: {
          provider: 'garmin',
          OR: [{ access_token: tokenToMatch }, { providerAccountId: tokenToMatch }],
        },
        select: { userId: true },
      })
      userId = account?.userId || null
    }
  } catch (error) {
    console.warn('⚠️ Garmin webhook user mapping failed:', error)
    userId = null
  }

  try {
    const created = await prisma.garminWebhookLog.create({
      data: {
        userId,
        oauthToken,
        dataType,
        payload,
      },
    })

    // Garmin production requirement: respond HTTP 200 quickly (within 30 seconds).
    // Queue any heavier processing (PING/PULL callback pulls + ingestion) to a background job.
    if (callbacks.length || primaryGarminUserId || userId) {
      publishWithQStash('/api/garmin/process', { logId: created.id }).catch(() => {})
    }
  } catch (error) {
    console.warn('⚠️ Garmin webhook logging failed:', error)
  }

  return new NextResponse('OK', { status: 200 })
}

// Optional health check / verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
