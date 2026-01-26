'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MoodTabs from '@/components/mood/MoodTabs'
import { useSaveOnLeave } from '@/lib/use-save-on-leave'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function normalizeTime(input: string, fallback: string) {
  const s = (input || '').trim()
  const m24 = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1]}:${m24[2]}`
  return fallback
}

export default function MoodPreferencesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState(1)
  const [time1, setTime1] = useState('20:00')
  const [time2, setTime2] = useState('12:00')
  const [time3, setTime3] = useState('18:00')
  const [time4, setTime4] = useState('09:00')
  const [maxFrequency, setMaxFrequency] = useState(1)

  const deviceTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])
  const [timezone, setTimezone] = useState(deviceTimezone)
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([])
  const [timezoneQuery, setTimezoneQuery] = useState(deviceTimezone)
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false)

  const [notificationsReady, setNotificationsReady] = useState(false)
  const [notificationsBusy, setNotificationsBusy] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const settingsSnapshotRef = useRef<string>('')
  const settingsRef = useRef({
    enabled: false,
    frequency: 1,
    time1: '20:00',
    time2: '12:00',
    time3: '18:00',
    time4: '09:00',
    timezone: 'UTC',
  })
  const dirtyRef = useRef(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/mood/reminders', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          setEnabled(!!data.enabled)
          const maxFreq = Number(data.maxFrequency) || 1
          setMaxFrequency(maxFreq)
          setFrequency(Math.min(Math.max(1, Number(data.frequency) || 1), maxFreq))
          setTime1(normalizeTime(data.time1 || '', '20:00'))
          setTime2(normalizeTime(data.time2 || '', '12:00'))
          setTime3(normalizeTime(data.time3 || '', '18:00'))
          setTime4(normalizeTime(data.time4 || '', '09:00'))
          const savedTimezone = (data.timezone && String(data.timezone).trim()) || deviceTimezone
          setTimezone(savedTimezone)
          setTimezoneQuery(savedTimezone)
        }
      } catch {}
      setLoading(false)
    })()
  }, [deviceTimezone])

  useEffect(() => {
    ;(async () => {
      try {
        if (!('serviceWorker' in navigator) || !('Notification' in window)) return
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (sub && Notification.permission === 'granted') setNotificationsReady(true)
      } catch {}
    })()
  }, [])

  useEffect(() => {
    try {
      const anyIntl = Intl as any
      if (anyIntl && typeof anyIntl.supportedValuesOf === 'function') {
        const supported = anyIntl.supportedValuesOf('timeZone') as string[]
        if (Array.isArray(supported) && supported.length > 0) {
          const sorted = [...supported].sort((a, b) => a.localeCompare(b))
          setTimezoneOptions(sorted)
          if (!timezone) {
            const guessed = deviceTimezone || sorted[0] || 'UTC'
            setTimezone(guessed)
            setTimezoneQuery(guessed)
          }
          return
        }
      }
    } catch {}

    const fallback = [
      'UTC',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Madrid',
      'Europe/Rome',
      'Europe/Amsterdam',
      'Europe/Zurich',
      'Europe/Stockholm',
      'Europe/Athens',
      'Africa/Johannesburg',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Bangkok',
      'Asia/Singapore',
      'Asia/Kuala_Lumpur',
      'Asia/Hong_Kong',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Australia/Perth',
      'Australia/Adelaide',
      'Australia/Melbourne',
      'Australia/Sydney',
      'Pacific/Auckland',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Bogota',
      'America/Sao_Paulo',
    ]
    setTimezoneOptions(fallback)
    if (!timezone) {
      const guessed = deviceTimezone || fallback[0] || 'UTC'
      setTimezone(guessed)
      setTimezoneQuery(guessed)
    }
  }, [deviceTimezone, timezone])

  const filteredTimezones = useMemo(() => {
    if (!timezoneOptions.length) return []
    const query = (timezoneQuery || '').trim().toLowerCase()
    if (!query) return timezoneOptions.slice(0, 50)
    return timezoneOptions.filter((tz) => tz.toLowerCase().includes(query)).slice(0, 50)
  }, [timezoneOptions, timezoneQuery])

  const ensureNotifications = async (): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false
    setNotificationsBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
      const vapid = await fetch('/api/push/vapid').then((r) => r.json()).catch(() => ({ publicKey: '' }))
      if (!vapid.publicKey) return false
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
        })
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      })
      if (!res.ok) return false
      setNotificationsReady(true)
      return true
    } catch {
      return false
    } finally {
      setNotificationsBusy(false)
    }
  }

  const save = useCallback(async (options?: { silent?: boolean; keepalive?: boolean; payload?: typeof settingsRef.current }) => {
    const payload = options?.payload ?? {
      enabled,
      frequency,
      time1,
      time2,
      time3,
      time4,
      timezone,
    }
    if (!options?.silent) {
      setSaving(true)
      setBanner(null)
    }
    try {
      const res = await fetch('/api/mood/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: payload.enabled,
          frequency: payload.frequency,
          time1: normalizeTime(payload.time1, '20:00'),
          time2: normalizeTime(payload.time2, '12:00'),
          time3: normalizeTime(payload.time3, '18:00'),
          time4: normalizeTime(payload.time4, '09:00'),
          timezone: payload.timezone,
        }),
        keepalive: !!options?.keepalive,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('save failed')
      const snapshot = JSON.stringify(payload)
      settingsSnapshotRef.current = snapshot
      dirtyRef.current = false
      setHasUnsavedChanges(false)
      const failed = Array.isArray(data?.scheduleResults)
        ? data.scheduleResults.filter((result: any) => result && result.scheduled === false)
        : []
      if (!options?.silent) {
        if (failed.length > 0) {
          setBanner({ type: 'error', message: 'Saved, but scheduling failed. Tap “Send” to verify.' })
        } else {
          setBanner({ type: 'success', message: 'Saved.' })
        }
      }
    } catch {
      if (!options?.silent) {
        setBanner({ type: 'error', message: 'Could not save. Please try again.' })
      }
    } finally {
      if (!options?.silent) setSaving(false)
    }
  }, [enabled, frequency, time1, time2, time3, time4, timezone])

  const toggleEnabled = async () => {
    const next = !enabled
    if (next) {
      const ok = await ensureNotifications()
      if (!ok) {
        setBanner({ type: 'error', message: 'Notifications are not enabled on this device.' })
        return
      }
    }
    setEnabled(next)
    setBanner({ type: 'success', message: 'Changes will save when you leave this page.' })
  }

  useEffect(() => {
    if (loading) return
    const nextSettings = {
      enabled,
      frequency,
      time1,
      time2,
      time3,
      time4,
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
  }, [enabled, frequency, time1, time2, time3, time4, timezone, loading])

  useSaveOnLeave(() => {
    if (!dirtyRef.current) return
    void save({ silent: true, keepalive: true, payload: settingsRef.current })
  })

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-gray-900 pb-28">
      <div className="sticky top-0 z-40 bg-[#f8f9fa]/95 dark:bg-gray-900/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200/60 dark:border-gray-800">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-12 shrink-0 items-center justify-start rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Back"
        >
          <span className="material-symbols-outlined text-[28px] text-slate-800 dark:text-white">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center text-slate-800 dark:text-white">
          Mood Preferences
        </h1>
        <div className="w-12" />
      </div>

      <MoodTabs />

      <main className="max-w-md mx-auto px-6 pt-6">
        {banner && (
          <div
            className={[
              'mb-4 rounded-2xl px-4 py-3 text-sm font-medium border',
              banner.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800/40'
                : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800/40',
            ].join(' ')}
          >
            {banner.message}
          </div>
        )}

        <Link
          href="/notifications/reminders"
          className="mb-4 inline-flex items-center justify-center w-full rounded-xl border border-helfi-green text-helfi-green font-bold py-3 hover:bg-helfi-green/10 transition-colors"
        >
          Set your notifications
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300">
                <span className="material-symbols-outlined">notifications</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-slate-800 dark:text-white">Reminders</span>
                <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">
                  {maxFrequency >= 4 ? 'Get up to 4 reminders per day.' : 'Free plan: 1 reminder per day.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleEnabled}
              disabled={saving || loading || notificationsBusy}
              className={[
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300',
                enabled ? 'bg-helfi-green' : 'bg-slate-200 dark:bg-gray-700',
                (saving || loading || notificationsBusy) ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
              aria-pressed={enabled}
              aria-label="Toggle reminders"
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300',
                  enabled ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>

          {!notificationsReady && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 p-4">
              <div className="text-sm font-bold text-slate-800 dark:text-white">Notifications are off on this device</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                Turn them on once to receive reminders here.
              </div>
              <button
                type="button"
                onClick={async () => {
                  const ok = await ensureNotifications()
                  if (!ok) setBanner({ type: 'error', message: 'Notifications could not be enabled on this device.' })
                  else setBanner({ type: 'success', message: 'Notifications are enabled.' })
                }}
                disabled={notificationsBusy}
                className="mt-3 w-full rounded-xl bg-helfi-green hover:bg-helfi-green-dark text-white font-bold py-3 transition-colors disabled:opacity-50"
              >
                Turn on notifications
              </button>
            </div>
          )}

          <div className="mt-5">
            <div className="text-sm font-bold text-slate-800 dark:text-white mb-3">How many reminders per day?</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => {
                const active = frequency === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      if (n > maxFrequency) {
                        setBanner({
                          type: 'error',
                          message: 'Free members can set 1 reminder per day. Subscribe or buy credits to unlock up to 4.',
                        })
                        return
                      }
                      setFrequency(n)
                    }}
                    disabled={!enabled}
                    className={[
                      'flex-1 rounded-full px-4 py-2 text-sm font-bold transition-all border',
                      active
                        ? 'bg-white dark:bg-gray-900 text-helfi-green border-helfi-green shadow-sm'
                        : 'bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200 border-slate-200 dark:border-gray-700',
                      !enabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-gray-800/60',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">
              Defaults to your device time zone.
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800 dark:text-white">Reminder 1</span>
              <input
                type="time"
                value={time1}
                onChange={(e) => setTime1(e.target.value)}
                disabled={!enabled}
                className="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-800 dark:text-white disabled:opacity-50"
              />
            </div>
            {frequency >= 2 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-white">Reminder 2</span>
                <input
                  type="time"
                  value={time2}
                  onChange={(e) => setTime2(e.target.value)}
                  disabled={!enabled}
                  className="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-800 dark:text-white disabled:opacity-50"
                />
              </div>
            )}
            {frequency >= 3 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-white">Reminder 3</span>
                <input
                  type="time"
                  value={time3}
                  onChange={(e) => setTime3(e.target.value)}
                  disabled={!enabled}
                  className="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-800 dark:text-white disabled:opacity-50"
                />
              </div>
            )}
            {frequency >= 4 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-white">Reminder 4</span>
                <input
                  type="time"
                  value={time4}
                  onChange={(e) => setTime4(e.target.value)}
                  disabled={!enabled}
                  className="rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-800 dark:text-white disabled:opacity-50"
                />
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="text-sm font-bold text-slate-800 dark:text-white mb-2">Timezone</div>
            <div className="relative">
              <input
                type="text"
                value={timezoneQuery}
                onChange={(e) => {
                  setTimezoneQuery(e.target.value)
                  setShowTimezoneDropdown(true)
                }}
                onFocus={() => {
                  if (enabled && timezoneOptions.length > 0) setShowTimezoneDropdown(true)
                }}
                placeholder="Start typing e.g. Australia/Melbourne"
                disabled={!enabled}
                className="w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-800 dark:text-white disabled:opacity-50"
              />
              {enabled && showTimezoneDropdown && filteredTimezones.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                  {filteredTimezones.map((tzValue) => (
                    <button
                      key={tzValue}
                      type="button"
                      onClick={() => {
                        setTimezone(tzValue)
                        setTimezoneQuery(tzValue)
                        setShowTimezoneDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-gray-800"
                    >
                      {tzValue}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">
              Detected on this device: {deviceTimezone}
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || loading}
              className="w-full rounded-2xl bg-helfi-green hover:bg-helfi-green-dark text-white text-base font-bold py-4 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {hasUnsavedChanges && (
              <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                Changes save automatically when you leave this page.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">Send reminder now</div>
              <div className="text-xs text-slate-500 dark:text-gray-400">
                Triggers a quick mood notification to this device.
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                setSendingNow(true)
                setBanner(null)
                try {
                  const ok = await ensureNotifications()
                  if (!ok) {
                    setBanner({ type: 'error', message: 'Notifications are not enabled on this device.' })
                    return
                  }
                  const res = await fetch('/api/mood/send-reminder-now', { method: 'POST' })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok) {
                    const msg = data?.error || 'Failed to send reminder'
                    setBanner({ type: 'error', message: msg })
                    return
                  }
                  setBanner({ type: 'success', message: 'Reminder sent. Check your notifications.' })
                } catch (e: any) {
                  setBanner({ type: 'error', message: e?.message || 'Could not send reminder.' })
                } finally {
                  setSendingNow(false)
                }
              }}
              disabled={sendingNow}
              className="px-3 py-2 rounded-xl bg-helfi-green text-white text-sm font-bold hover:bg-helfi-green-dark disabled:opacity-60"
            >
              {sendingNow ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 text-sm text-slate-500 dark:text-gray-400">
            Loading…
          </div>
        )}
      </main>
    </div>
  )
}
