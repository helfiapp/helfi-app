export type MoodReminderSyncPayload = {
  enabled: boolean
  frequency: number
  time1: string
  time2: string
  time3: string
  time4: string
  timezone: string
  maxFrequency?: number
  updatedAt?: number
}

const CHANNEL_NAME = 'helfi-mood-reminders'
const STORAGE_KEY = 'helfi-mood-reminders:last-update'

function parsePayload(raw: unknown): MoodReminderSyncPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const enabled = typeof data.enabled === 'boolean' ? data.enabled : null
  const frequency = Number(data.frequency)
  const time1 = typeof data.time1 === 'string' ? data.time1 : null
  const time2 = typeof data.time2 === 'string' ? data.time2 : null
  const time3 = typeof data.time3 === 'string' ? data.time3 : null
  const time4 = typeof data.time4 === 'string' ? data.time4 : null
  const timezone = typeof data.timezone === 'string' ? data.timezone : null
  const maxFrequency = Number(data.maxFrequency)
  const updatedAt = Number(data.updatedAt)

  if (
    enabled === null ||
    !Number.isFinite(frequency) ||
    !time1 ||
    !time2 ||
    !time3 ||
    !time4 ||
    !timezone
  ) {
    return null
  }

  return {
    enabled,
    frequency,
    time1,
    time2,
    time3,
    time4,
    timezone,
    maxFrequency: Number.isFinite(maxFrequency) ? maxFrequency : undefined,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
  }
}

export function publishMoodReminderSync(payload: MoodReminderSyncPayload) {
  if (typeof window === 'undefined') return

  const withTimestamp: MoodReminderSyncPayload = {
    ...payload,
    updatedAt: Date.now(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withTimestamp))
  } catch {}

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(withTimestamp)
    channel.close()
  } catch {}
}

export function subscribeMoodReminderSync(onPayload: (payload: MoodReminderSyncPayload) => void) {
  if (typeof window === 'undefined') return () => {}

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const parsed = parsePayload(JSON.parse(event.newValue))
      if (parsed) onPayload(parsed)
    } catch {}
  }

  let channel: BroadcastChannel | null = null
  const onMessage = (event: MessageEvent) => {
    const parsed = parsePayload(event.data)
    if (parsed) onPayload(parsed)
  }

  window.addEventListener('storage', onStorage)
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', onMessage)
  } catch {}

  return () => {
    window.removeEventListener('storage', onStorage)
    if (channel) {
      channel.removeEventListener('message', onMessage)
      channel.close()
    }
  }
}
