import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertGarminConfigured, parseBearerToken, parseOAuthHeader } from '@/lib/garmin-oauth'
import { extractGarminWorkouts } from '@/lib/exercise/garmin-workouts'
import { ingestExerciseEntry } from '@/lib/exercise/ingest'

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
  const bearerToken = parseBearerToken(oauthHeader)

  try {
    assertGarminConfigured()
  } catch (error) {
    console.error('Garmin webhook received but credentials missing:', error)
    return NextResponse.json({ error: 'Garmin not configured' }, { status: 500 })
  }

  const oauthToken = oauthParams?.oauth_token || null
  const tokenToMatch = bearerToken || oauthToken || null
  let userId: string | null = null

  if (tokenToMatch) {
    const account = await prisma.account.findFirst({
      where: {
        provider: 'garmin',
        OR: [
          { access_token: tokenToMatch },
          { providerAccountId: tokenToMatch },
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

  // Best-effort: ingest workout-style records into the Food Diary exercise log.
  // This is intentionally conservative (requires duration + calories + activity id).
  if (userId) {
    try {
      const workouts = extractGarminWorkouts(payload)
      for (const w of workouts) {
        if (!w.startTime) continue
        const localDate = `${w.startTime.getUTCFullYear()}-${String(w.startTime.getUTCMonth() + 1).padStart(2, '0')}-${String(w.startTime.getUTCDate()).padStart(2, '0')}`
        await ingestExerciseEntry({
          userId,
          source: 'GARMIN',
          deviceId: `garmin:${w.deviceId}`,
          localDate,
          startTime: w.startTime,
          durationMinutes: w.durationMinutes,
          calories: w.calories,
          label: w.label,
          rawPayload: w.raw,
        })
      }
    } catch (error) {
      console.warn('⚠️ Garmin webhook exercise ingest failed:', error)
    }
  }

  return new NextResponse('OK', { status: 200 })
}

// Optional health check / verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
