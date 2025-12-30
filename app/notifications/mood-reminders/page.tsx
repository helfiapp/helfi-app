'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import PageHeader from '@/components/PageHeader'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'
import { useSaveOnLeave } from '@/lib/use-save-on-leave'

const baseTimezones = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Amsterdam','Europe/Zurich','Europe/Stockholm','Europe/Athens',
  'Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Kuala_Lumpur','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Asia/Shanghai',
  'Australia/Perth','Australia/Adelaide','Australia/Melbourne','Australia/Sydney','Pacific/Auckland',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Bogota','America/Sao_Paulo'
]

const MOOD_CACHE_TTL_MS = 5 * 60_000

function normalizeTime(input: string): string {
  if (!input) return '00:00'
  const s = input.trim().toLowerCase()
  const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1].padStart(2,'0')}:${m24[2]}`
  const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const mm = m12[2]
    const ap = m12[3]
    if (ap === 'pm' && h !== 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return `${String(h).padStart(2,'0')}:${mm}`
  }
  const digits = s.replace(/[^0-9]/g, '')
  if (digits.length >= 3) {
    const h = digits.slice(0, digits.length - 2)
    const mm = digits.slice(-2)
    const hh = Math.max(0, Math.min(23, parseInt(h, 10)))
    const m = Math.max(0, Math.min(59, parseInt(mm, 10)))
    return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  return '00:00'
}

export default function MoodReminderSettingsPage() {
  const { data: session } = useSession()
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState(1)
  const [time1, setTime1] = useState('20:00')
  const [time2, setTime2] = useState('12:00')
  const [time3, setTime3] = useState('18:00')
  const [timezone, setTimezone] = useState('UTC')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [deviceTimezone, setDeviceTimezone] = useState('UTC')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const settingsSnapshotRef = useRef<string>('')
  const settingsRef = useRef({
    enabled: false,
    frequency: 1,
    time1: '20:00',
    time2: '12:00',
    time3: '18:00',
    timezone: 'UTC',
  })
  const dirtyRef = useRef(false)
  const cacheKey = session?.user?.email ? `mood-reminders:${session.user.email}` : ''

  const saveSettings = useCallback(async (options?: { silent?: boolean; keepalive?: boolean; payload?: typeof settingsRef.current }) => {
    if (saving && !options?.silent) return
    const payload = options?.payload ?? {
      enabled,
      frequency,
      time1,
      time2,
      time3,
      timezone,
    }
    if (!options?.silent) setSaving(true)
    try {
      const res = await fetch('/api/mood/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: payload.enabled,
          frequency: payload.frequency,
          time1: payload.time1,
          time2: payload.time2,
          time3: payload.time3,
          timezone: payload.timezone,
        }),
        keepalive: !!options?.keepalive,
      })
      if (res.ok) {
        const snapshot = JSON.stringify(payload)
        settingsSnapshotRef.current = snapshot
        dirtyRef.current = false
        setHasUnsavedChanges(false)
        if (cacheKey) {
          writeClientCache(cacheKey, {
            enabled: payload.enabled,
            frequency: payload.frequency,
            time1: payload.time1,
            time2: payload.time2,
            time3: payload.time3,
            timezone: payload.timezone,
          })
        }
        if (!options?.silent) alert('Mood reminders saved successfully!')
      } else {
        const data = await res.json().catch(() => ({}))
        if (!options?.silent) alert(`Failed to save: ${data.error || 'Unknown error'}`)
      }
    } catch (e) {
      if (!options?.silent) alert('Failed to save mood reminders. Please try again.')
    } finally {
      if (!options?.silent) setSaving(false)
    }
  }, [cacheKey, saving, enabled, frequency, time1, time2, time3, timezone])

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      setDeviceTimezone(tz)
    } catch {
      setDeviceTimezone('UTC')
    }
  }, [])

  useEffect(() => {
    const cached = cacheKey ? readClientCache<any>(cacheKey) : null
    if (cached?.data) {
      const data = cached.data
      setEnabled(!!data.enabled)
      setFrequency(Number(data.frequency) || 1)
      setTime1(normalizeTime(data.time1 || '20:00'))
      setTime2(normalizeTime(data.time2 || '12:00'))
      setTime3(normalizeTime(data.time3 || '18:00'))
      setTimezone((data.timezone && String(data.timezone).trim()) || deviceTimezone || 'UTC')
      setLoading(false)
    }
    if (cached && isCacheFresh(cached, MOOD_CACHE_TTL_MS)) return

    ;(async () => {
      try {
        const res = await fetch('/api/mood/reminders', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          setEnabled(!!data.enabled)
          setFrequency(Number(data.frequency) || 1)
          setTime1(normalizeTime(data.time1 || '20:00'))
          setTime2(normalizeTime(data.time2 || '12:00'))
          setTime3(normalizeTime(data.time3 || '18:00'))
          setTimezone((data.timezone && String(data.timezone).trim()) || deviceTimezone || 'UTC')
          if (cacheKey) {
            writeClientCache(cacheKey, data)
          }
        }
      } catch (e) {
        console.error('Failed to load mood reminder settings', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [cacheKey, deviceTimezone])

  useEffect(() => {
    if (loading) return
    const nextSettings = {
      enabled,
      frequency,
      time1,
      time2,
      time3,
      timezone,
    }
    settingsRef.current = nextSettings
    const snapshot = JSON.stringify(nextSettings)
    if (!settingsSnapshotRef.current) {
      settingsSnapshotRef.current = snapshot
      dirtyRef.current = false
      setHasUnsavedChanges(false)
      return
    }
    const dirty = snapshot !== settingsSnapshotRef.current
    dirtyRef.current = dirty
    setHasUnsavedChanges(dirty)
  }, [enabled, frequency, time1, time2, time3, timezone, loading])

  useSaveOnLeave(() => {
    if (!dirtyRef.current) return
    void saveSettings({ silent: true, keepalive: true, payload: settingsRef.current })
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Mood reminders" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mood check-in reminders</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Uses push notifications on this device.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled}
                disabled={loading || saving}
                onChange={(e) => {
                  const nextEnabled = e.target.checked
                  setEnabled(nextEnabled)
                }}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green"></div>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of reminders per day
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  >
                    <option value={1}>1 reminder</option>
                    <option value={2}>2 reminders</option>
                    <option value={3}>3 reminders</option>
                  </select>
                </div>

                {frequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 1
                    </label>
                    <input
                      type="time"
                      value={time1}
                      onChange={(e) => setTime1(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!enabled}
                    />
                  </div>
                )}

                {frequency >= 2 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 2
                    </label>
                    <input
                      type="time"
                      value={time2}
                      onChange={(e) => setTime2(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!enabled}
                    />
                  </div>
                )}

                {frequency >= 3 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 3
                    </label>
                    <input
                      type="time"
                      value={time3}
                      onChange={(e) => setTime3(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={!enabled}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  >
                    {baseTimezones.map((tzOption) => (
                      <option key={tzOption} value={tzOption}>
                        {tzOption}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Detected on this device: {deviceTimezone}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={async () => {
                    await saveSettings()
                  }}
                  disabled={saving}
                  className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                >
                  {saving ? 'Saving...' : 'Save Mood Reminders'}
                </button>
                {hasUnsavedChanges && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Changes save automatically when you leave this page.
                  </p>
                )}
                <button
                  onClick={async () => {
                    setSendingNow(true)
                    try {
                      if (Notification.permission !== 'granted') {
                        alert('Notifications are not enabled. Please enable them in your browser settings.')
                        return
                      }
                      const res = await fetch('/api/mood/send-reminder-now', { method: 'POST' })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        alert(data?.error || 'Failed to send reminder')
                        return
                      }
                      alert('Reminder sent. Check your notifications.')
                    } catch (e: any) {
                      alert(e?.message || 'Could not send reminder.')
                    } finally {
                      setSendingNow(false)
                    }
                  }}
                  disabled={sendingNow}
                  className="w-full border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                >
                  {sendingNow ? 'Sending...' : 'Send reminder now'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
