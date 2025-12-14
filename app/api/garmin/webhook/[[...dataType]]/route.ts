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

async function pullGarminCallbackUrl(callbackUrl: string, garminClientId: string, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(callbackUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'garmin-client-id': garminClientId,
      },
      signal: controller.signal,
    })

    const text = await resp.text()
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = { raw: text }
    }

    return { ok: resp.ok, status: resp.status, payload: parsed }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startedAt = Date.now()
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
    await prisma.garminWebhookLog.create({
      data: {
        userId,
        oauthToken,
        dataType,
        payload,
      },
    })
  } catch (error) {
    console.warn('⚠️ Garmin webhook logging failed:', error)
  }

  // PING/PULL model: Garmin sends callback URLs we should pull within 24h.
  // We time-box and limit work so we still respond within Garmin’s required window.
  if (callbacks.length) {
    const { clientId } = assertGarminConfigured()
    const deadlineMs = startedAt + 18_000
    const maxConcurrency = 2
    const maxCallbacks = 5
    const limitedCallbacks = callbacks.slice(0, maxCallbacks)

    let index = 0
    const workers = Array.from({ length: Math.min(maxConcurrency, limitedCallbacks.length) }, async () => {
      while (index < limitedCallbacks.length && Date.now() < deadlineMs) {
        const current = limitedCallbacks[index++]
        if (Date.now() > deadlineMs - 1_500) return

        let callbackUserId: string | null = userId
        try {
          if (!callbackUserId && current.userId) {
            const account = await prisma.account.findFirst({
              where: { provider: 'garmin', providerAccountId: current.userId },
              select: { userId: true },
            })
            callbackUserId = account?.userId || null
          }
        } catch {}

        try {
          const pulled = await pullGarminCallbackUrl(current.url, clientId, 5_000)
          await prisma.garminWebhookLog.create({
            data: {
              userId: callbackUserId,
              oauthToken,
              dataType: `${dataType}/pulled`,
              payload: {
                callbackUrl: current.url,
                ok: pulled.ok,
                status: pulled.status,
                data: pulled.payload,
              },
            },
          })
        } catch (error) {
          try {
            await prisma.garminWebhookLog.create({
              data: {
                userId: callbackUserId,
                oauthToken,
                dataType: `${dataType}/pull_error`,
                payload: {
                  callbackUrl: current.url,
                  error: (error as Error)?.message || String(error),
                },
              },
            })
          } catch {}
        }
      }
    })

    try {
      await Promise.all(workers)
    } catch (error) {
      console.warn('⚠️ Garmin callback pull loop failed:', error)
    }
  }

  // Best-effort: ingest workout-style records into the Food Diary exercise log.
  // This is intentionally conservative (requires duration + calories + activity id).
  if (userId && Date.now() - startedAt < 28_000) {
    try {
      const workouts = extractGarminWorkouts(payload).slice(0, 10)
      for (const w of workouts) {
        if (Date.now() - startedAt > 28_000) break
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
