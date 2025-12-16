export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertGarminConfigured } from '@/lib/garmin-oauth'
import { extractGarminWorkouts } from '@/lib/exercise/garmin-workouts'
import { ingestExerciseEntry } from '@/lib/exercise/ingest'

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

export async function POST(req: NextRequest) {
  try {
    // Optional simple verification: require Upstash signature header if configured
    const requireSignature = !!process.env.QSTASH_REQUIRE_SIGNATURE
    if (requireSignature) {
      const sig = req.headers.get('Upstash-Signature')
      if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { logId?: string }
    const logId = String(body.logId || '')
    if (!logId) return NextResponse.json({ error: 'missing_log_id' }, { status: 400 })

    const log = await prisma.garminWebhookLog.findFirst({
      where: { id: logId },
      select: { id: true, userId: true, oauthToken: true, dataType: true, payload: true, receivedAt: true },
    })
    if (!log) return NextResponse.json({ error: 'log_not_found' }, { status: 404 })

    const { clientId } = assertGarminConfigured()
    const { userIds, callbacks } = collectGarminUserIdsAndCallbacks(log.payload)
    const primaryGarminUserId = userIds[0] || null

    // Ensure the log is linked to the correct Helfi user when possible.
    let resolvedUserId: string | null = log.userId || null
    if (!resolvedUserId && primaryGarminUserId) {
      const account = await prisma.account.findFirst({
        where: { provider: 'garmin', providerAccountId: primaryGarminUserId },
        select: { userId: true },
      })
      resolvedUserId = account?.userId || null
      if (resolvedUserId) {
        await prisma.garminWebhookLog.update({ where: { id: log.id }, data: { userId: resolvedUserId } })
      }
    }

    // Pull callback URLs (PING/PULL model) and store results as additional logs.
    const pulledPayloads: any[] = []
    for (const cb of callbacks.slice(0, 10)) {
      let cbUserId: string | null = resolvedUserId
      if (!cbUserId && cb.userId) {
        const account = await prisma.account.findFirst({
          where: { provider: 'garmin', providerAccountId: cb.userId },
          select: { userId: true },
        })
        cbUserId = account?.userId || null
      }

      try {
        const pulled = await pullGarminCallbackUrl(cb.url, clientId, 10_000)
        pulledPayloads.push(pulled.payload)
        await prisma.garminWebhookLog.create({
          data: {
            userId: cbUserId,
            oauthToken: log.oauthToken,
            dataType: `${log.dataType || 'default'}/pulled`,
            payload: {
              callbackUrl: cb.url,
              ok: pulled.ok,
              status: pulled.status,
              data: pulled.payload,
            },
          },
        })
      } catch (error) {
        await prisma.garminWebhookLog.create({
          data: {
            userId: cbUserId,
            oauthToken: log.oauthToken,
            dataType: `${log.dataType || 'default'}/pull_error`,
            payload: {
              callbackUrl: cb.url,
              error: (error as Error)?.message || String(error),
            },
          },
        })
      }
    }

    // Best-effort exercise ingestion (from the original payload + any pulled payloads).
    if (resolvedUserId) {
      try {
        const combined = [log.payload, ...pulledPayloads]
        for (const payload of combined) {
          const workouts = extractGarminWorkouts(payload).slice(0, 25)
          for (const w of workouts) {
            if (!w.startTime) continue
            const localDate = `${w.startTime.getUTCFullYear()}-${String(w.startTime.getUTCMonth() + 1).padStart(2, '0')}-${String(w.startTime.getUTCDate()).padStart(2, '0')}`
            await ingestExerciseEntry({
              userId: resolvedUserId,
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
        }
      } catch (error) {
        console.warn('⚠️ Garmin process exercise ingest failed:', error)
      }
    }

    return NextResponse.json({ ok: true, pulled: callbacks.length })
  } catch (error: any) {
    console.error('[GARMIN_PROCESS] error', error?.stack || error)
    return NextResponse.json({ error: 'process_error', message: error?.message || String(error) }, { status: 500 })
  }
}

