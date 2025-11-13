import { prisma } from '@/lib/prisma'

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
export async function scheduleReminderWithQStash(userId: string, timeHHMM: string, timeZone: string): Promise<{ scheduled: boolean; reason?: string }> {
  const token = process.env.QSTASH_TOKEN || ''
  if (!token) return { scheduled: false, reason: 'missing_qstash_token' }

  const base =
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (!base) return { scheduled: false, reason: 'missing_base_url' }

  const deltaMinutes = minutesUntilNext(timeHHMM, timeZone)
  const notBeforeEpochSeconds = Math.floor((Date.now() + deltaMinutes * 60_000) / 1000)

  const callbackUrl = `${base}/api/push/dispatch`
  const url = `https://qstash.upstash.io/v2/publish/${encodeURIComponent(callbackUrl)}`

  const body = JSON.stringify({ userId, reminderTime: timeHHMM, timezone: timeZone })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Not-Before': String(notBeforeEpochSeconds),
    },
    body,
  })

  if (!res.ok) {
    return { scheduled: false, reason: `qstash_http_${res.status}` }
  }
  return { scheduled: true }
}

/**
 * Schedule all active reminders for a user based on frequency (1-3).
 */
export async function scheduleAllActiveReminders(userId: string, settings: { time1: string; time2: string; time3: string; timezone: string; frequency: number }) {
  const { time1, time2, time3, timezone, frequency } = settings
  const tasks: Array<Promise<any>> = []
  if (frequency >= 1) tasks.push(scheduleReminderWithQStash(userId, time1, timezone))
  if (frequency >= 2) tasks.push(scheduleReminderWithQStash(userId, time2, timezone))
  if (frequency >= 3) tasks.push(scheduleReminderWithQStash(userId, time3, timezone))
  try {
    await Promise.all(tasks)
  } catch {}
}


