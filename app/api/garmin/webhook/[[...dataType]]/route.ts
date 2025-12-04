import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertGarminConfigured, parseOAuthHeader } from '@/lib/garmin-oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = {
  params: {
    dataType?: string[]
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const rawBody = await request.text()
  const oauthHeader = request.headers.get('authorization')
  const oauthParams = parseOAuthHeader(oauthHeader)

  try {
    assertGarminConfigured()
  } catch (error) {
    console.error('Garmin webhook received but credentials missing:', error)
    return NextResponse.json({ error: 'Garmin not configured' }, { status: 500 })
  }

  if (!oauthParams || !oauthParams.oauth_consumer_key) {
    return NextResponse.json({ error: 'Missing OAuth signature' }, { status: 401 })
  }

  if (process.env.GARMIN_CONSUMER_KEY && oauthParams.oauth_consumer_key !== process.env.GARMIN_CONSUMER_KEY) {
    return NextResponse.json({ error: 'Invalid consumer key' }, { status: 401 })
  }

  const oauthToken = oauthParams.oauth_token || null
  let userId: string | null = null

  if (oauthToken) {
    const account = await prisma.account.findFirst({
      where: {
        provider: 'garmin',
        OR: [
          { access_token: oauthToken },
          { providerAccountId: oauthToken },
        ],
      },
    })

    if (account) {
      userId = account.userId
    }
  }

  let payload: any
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    payload = { raw: rawBody }
  }

  const dataType = params?.dataType?.length ? params.dataType.join('/') : 'default'

  await prisma.garminWebhookLog.create({
    data: {
      userId,
      oauthToken,
      dataType,
      payload,
    },
  })

  return new NextResponse('OK', { status: 200 })
}

// Optional health check / verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
