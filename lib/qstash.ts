import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * Compute minutes from now (UTC clock) until the next occurrence of HH:MM in the given IANA timezone.
 * We avoid heavy tz libs by comparing only local HH:MM within the zone, then applying the delta to Date.now().
 */
export function minutesUntilNext(timeHHMM: string, timeZone: string): number {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
  const nowMins = hh * 60 + mm

  const [tH, tM] = timeHHMM.split(':').map((v) => parseInt(v, 10))
  const targetMins = (tH % 24) * 60 + (tM % 60)

  let delta = (targetMins - nowMins) % 1440
  if (delta < 0) delta += 1440
  if (delta === 0) delta = 1440 // schedule next day if exact same minute
  return delta
}

/**
 * Schedule a QStash callback to our /api/push/dispatch endpoint.
 * Requires: QSTASH_TOKEN, and base URL derivable from PUBLIC_BASE_URL or VERCEL_URL.
 */
type ScheduleLogRecord = {
  userId: string
  reminderTime: string
  timezone: string
  deltaMinutes: number
  notBeforeEpochSeconds: number | null
  scheduled: boolean
  httpStatus?: number | null
  reason?: string
  responseSnippet?: string | null
  callbackUrl?: string | null
}

async function logScheduleAttempt(entry: ScheduleLogRecord) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS QstashScheduleLog (
        id TEXT PRIMARY KEY,
        createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
        userId TEXT,
        reminderTime TEXT,
        timezone TEXT,
        deltaMinutes INTEGER,
        notBeforeEpochSeconds BIGINT,
        scheduled BOOLEAN NOT NULL,
        httpStatus INTEGER,
        reason TEXT,
        responseSnippet TEXT,
        callbackUrl TEXT
      )
    `)
    await prisma.$executeRawUnsafe(`ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS callbackUrl TEXT`).catch(
      () => {}
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS responseSnippet TEXT`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS reason TEXT`).catch(
      () => {}
    )
    await prisma.$executeRawUnsafe(`ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS httpStatus INTEGER`).catch(
      () => {}
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS notBeforeEpochSeconds BIGINT`
    ).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS deltaMinutes INTEGER`).catch(
      () => {}
    )
    await prisma.$executeRawUnsafe(`ALTER TABLE QstashScheduleLog ADD COLUMN IF NOT EXISTS scheduled BOOLEAN`).catch(
      () => {}
    )

    await prisma.$executeRawUnsafe(
      `INSERT INTO QstashScheduleLog (
        id,
        createdAt,
        userId,
        reminderTime,
        timezone,
        deltaMinutes,
        notBeforeEpochSeconds,
        scheduled,
        httpStatus,
        reason,
        responseSnippet,
        callbackUrl
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      randomUUID(),
      entry.userId,
      entry.reminderTime,
      entry.timezone,
      entry.deltaMinutes,
      entry.notBeforeEpochSeconds,
      entry.scheduled,
      entry.httpStatus ?? null,
      entry.reason ?? null,
      entry.responseSnippet ?? null,
      entry.callbackUrl ?? null
    )
  } catch (error) {
    console.error('[QSTASH_LOG] failed to persist schedule attempt', error)
  }
}

export async function scheduleReminderWithQStash(
  userId: string,
  timeHHMM: string,
  timeZone: string
): Promise<{ scheduled: boolean; reason?: string; status?: number; responseBody?: string }> {
  const token = process.env.QSTASH_TOKEN || ''
  const deltaMinutes = minutesUntilNext(timeHHMM, timeZone)
  const notBeforeEpochSeconds = Math.floor((Date.now() + deltaMinutes * 60_000) / 1000)

  if (!token) {
    await logScheduleAttempt({
      userId,
      reminderTime: timeHHMM,
      timezone: timeZone,
      deltaMinutes,
      notBeforeEpochSeconds: null,
      scheduled: false,
      reason: 'missing_qstash_token',
      callbackUrl: null,
    })
    return { scheduled: false, reason: 'missing_qstash_token' }
  }

  let base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (base) {
    base = base.trim()
    if (base && !/^https?:\/\//i.test(base)) {
      base = `https://${base}`
    }
    // Remove any trailing slash to avoid double slashes in callback
    base = base.replace(/\/+$/, '')
  }
  if (!base) {
    await logScheduleAttempt({
      userId,
      reminderTime: timeHHMM,
      timezone: timeZone,
      deltaMinutes,
      notBeforeEpochSeconds: null,
      scheduled: false,
      reason: 'missing_base_url',
      callbackUrl: null,
    })
    return { scheduled: false, reason: 'missing_base_url' }
  }

  const callbackUrl = `${base}/api/push/dispatch`
  const url = `https://qstash.upstash.io/v2/publish/${callbackUrl}`

  const body = JSON.stringify({ userId, reminderTime: timeHHMM, timezone: timeZone })
  let responseBody = ''
  let status: number | undefined

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Not-Before': String(notBeforeEpochSeconds),
      },
      body,
    })

    status = res.status
    responseBody = await res.text()

    if (!res.ok) {
      const reason = `qstash_http_${res.status}`
      await logScheduleAttempt({
        userId,
        reminderTime: timeHHMM,
        timezone: timeZone,
        deltaMinutes,
        notBeforeEpochSeconds,
        scheduled: false,
        httpStatus: res.status,
        reason,
        responseSnippet: responseBody.slice(0, 500),
        callbackUrl,
      })
      return { scheduled: false, reason, status: res.status, responseBody }
    }

    await logScheduleAttempt({
      userId,
      reminderTime: timeHHMM,
      timezone: timeZone,
      deltaMinutes,
      notBeforeEpochSeconds,
      scheduled: true,
      httpStatus: res.status,
      responseSnippet: responseBody.slice(0, 500),
      callbackUrl,
    })
    return { scheduled: true, status: res.status, responseBody }
  } catch (error: any) {
    const reason = error?.message ? `fetch_error:${error.message}` : 'fetch_error'
    await logScheduleAttempt({
      userId,
      reminderTime: timeHHMM,
      timezone: timeZone,
      deltaMinutes,
      notBeforeEpochSeconds,
      scheduled: false,
      reason,
      callbackUrl,
      responseSnippet: (error?.stack || String(error)).slice(0, 500),
    })
    return { scheduled: false, reason, status, responseBody }
  }
}

/**
 * Schedule all active reminders for a user based on frequency (1-3).
 */
export async function scheduleAllActiveReminders(
  userId: string,
  settings: { time1: string; time2: string; time3: string; timezone: string; frequency: number }
) {
  const { time1, time2, time3, timezone, frequency } = settings
  const reminders: string[] = []
  if (frequency >= 1) reminders.push(time1)
  if (frequency >= 2) reminders.push(time2)
  if (frequency >= 3) reminders.push(time3)

  const tasks = reminders.map((reminderTime) =>
    scheduleReminderWithQStash(userId, reminderTime, timezone).then((result) => ({
      reminderTime,
      ...result,
    }))
  )

  try {
    return await Promise.all(tasks)
  } catch (error) {
    console.error('[QSTASH] scheduleAllActiveReminders encountered an error', error)
    return []
  }
}
