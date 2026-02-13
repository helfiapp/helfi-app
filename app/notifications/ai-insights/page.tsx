'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'
import { useSaveOnLeave } from '@/lib/use-save-on-leave'

type HealthTipSettings = {
  enabled: boolean
  time1: string
  time2: string
  time3: string
  timezone: string
  timezoneManual?: boolean
  frequency: number
  pricingAcceptedAt?: string | null
}

const fallbackTimezones = [
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

const HEALTH_TIPS_CACHE_TTL_MS = 5 * 60_000

const detectBrowserTimezone = () => {
  if (typeof window === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export default function AiInsightsNotificationsPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [timezone, setTimezone] = useState(detectBrowserTimezone)
  const [timezoneManual, setTimezoneManual] = useState(false)
  const [frequency, setFrequency] = useState(1)
  const [showEnableModal, setShowEnableModal] = useState(false)
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(fallbackTimezones)
  const cacheKey = session?.user?.email ? `health-tips-settings:${session.user.email}` : ''
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const settingsSnapshotRef = useRef<string>('')
  const settingsRef = useRef<HealthTipSettings>({
    enabled: false,
    time1: '11:30',
    time2: '15:30',
    time3: '20:30',
    timezone: detectBrowserTimezone(),
    timezoneManual: false,
    frequency: 1,
  })

  useEffect(() => {
    try {
      const anyIntl = Intl as any
      if (anyIntl && typeof anyIntl.supportedValuesOf === 'function') {
        const supported = anyIntl.supportedValuesOf('timeZone') as string[]
        if (Array.isArray(supported) && supported.length > 0) {
          const sorted = [...supported].sort((a, b) => a.localeCompare(b))
          setTimezoneOptions(sorted)
          return
        }
      }
    } catch {
      // fall back to static list
    }
    setTimezoneOptions(fallbackTimezones)
  }, [])

  useEffect(() => {
    const browserTimezone = detectBrowserTimezone()
    const syncAutoTimezone = async (data: HealthTipSettings) => {
      const incomingTimezone = (data.timezone || '').trim()
      const incomingManual = !!data.timezoneManual
      if (incomingManual && incomingTimezone) return
      if (!incomingManual && incomingTimezone === browserTimezone) return

      const syncPayload: HealthTipSettings = {
        enabled: !!data.enabled,
        time1: data.time1 || '11:30',
        time2: data.time2 || '15:30',
        time3: data.time3 || '20:30',
        timezone: browserTimezone,
        timezoneManual: false,
        frequency: Number(data.frequency) || 1,
      }
      try {
        await fetch('/api/health-tips/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncPayload),
          keepalive: true,
        })
        if (cacheKey) {
          writeClientCache(cacheKey, syncPayload)
        }
      } catch {
        // ignore auto-sync errors
      }
    }

    const cached = cacheKey ? readClientCache<HealthTipSettings>(cacheKey) : null
    if (cached?.data) {
      const data = cached.data
      const manual = !!data.timezoneManual
      const resolvedTimezone = manual
        ? (data.timezone || browserTimezone)
        : browserTimezone
      setEnabled(!!data.enabled)
      setTime1(data.time1 || '11:30')
      setTime2(data.time2 || '15:30')
      setTime3(data.time3 || '20:30')
      setTimezone(resolvedTimezone)
      setTimezoneManual(manual)
      setFrequency(Number(data.frequency) || 1)
      void syncAutoTimezone(data)
      setLoading(false)
    }
    if (cached && isCacheFresh(cached, HEALTH_TIPS_CACHE_TTL_MS)) return

    ;(async () => {
      try {
        const res = await fetch('/api/health-tips/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = (await res.json()) as HealthTipSettings
          const manual = !!data.timezoneManual
          const resolvedTimezone = manual
            ? (data.timezone || browserTimezone)
            : browserTimezone
          setEnabled(!!data.enabled)
          setTime1(data.time1 || '11:30')
          setTime2(data.time2 || '15:30')
          setTime3(data.time3 || '20:30')
          setTimezone(resolvedTimezone)
          setTimezoneManual(manual)
          setFrequency(Number(data.frequency) || 1)
          if (cacheKey) {
            writeClientCache(cacheKey, {
              ...data,
              timezone: resolvedTimezone,
              timezoneManual: manual,
            })
          }
          void syncAutoTimezone(data)
        }
      } catch {
        // ignore, defaults will show
      } finally {
        setLoading(false)
      }
    })()
  }, [cacheKey])

  const handleSave = useCallback(async (options?: {
    silent?: boolean
    keepalive?: boolean
    payload?: HealthTipSettings
    acceptPricingTerms?: boolean
  }) => {
    const payload = options?.payload ?? {
      enabled,
      time1,
      time2,
      time3,
      timezone,
      timezoneManual,
      frequency,
    }
    if (!options?.silent) setSaving(true)
    try {
      const res = await fetch('/api/health-tips/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          acceptPricingTerms: !!options?.acceptPricingTerms,
        }),
        keepalive: !!options?.keepalive,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (!options?.silent) {
          alert(data?.error || data?.detail || 'Failed to save settings')
        }
        return false
      }
      const snapshot = JSON.stringify(payload)
      settingsSnapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      if (cacheKey) {
        writeClientCache(cacheKey, payload)
      }
      if (!options?.silent) alert('Smart Health Coach settings saved.')
      return true
    } catch {
      if (!options?.silent) alert('Could not save settings. Please try again.')
      return false
    } finally {
      if (!options?.silent) setSaving(false)
    }
  }, [cacheKey, enabled, time1, time2, time3, timezone, timezoneManual, frequency])

  useEffect(() => {
    if (loading) return
    const nextSettings: HealthTipSettings = {
      enabled,
      time1,
      time2,
      time3,
      timezone,
      timezoneManual,
      frequency,
    }
    settingsRef.current = nextSettings
    const snapshot = JSON.stringify(nextSettings)
    if (!settingsSnapshotRef.current) {
      settingsSnapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      return
    }
    setHasUnsavedChanges(snapshot !== settingsSnapshotRef.current)
  }, [enabled, time1, time2, time3, timezone, timezoneManual, frequency, loading])

  useSaveOnLeave(() => {
    if (!hasUnsavedChanges) return
    void handleSave({ silent: true, keepalive: true, payload: settingsRef.current })
  })

  const onToggleEnabled = (next: boolean) => {
    if (next && !enabled) {
      setShowEnableModal(true)
      return
    }
    setEnabled(next)
  }

  const confirmEnableSmartCoach = async () => {
    setShowEnableModal(false)
    const nextPayload: HealthTipSettings = {
      enabled: true,
      time1,
      time2,
      time3,
      timezone,
      timezoneManual,
      frequency,
    }
    setEnabled(true)
    const saved = await handleSave({
      silent: true,
      payload: nextPayload,
      acceptPricingTerms: true,
    })
    if (saved) {
      alert('Smart Health Coach enabled.')
    } else {
      setEnabled(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Smart Health Coach" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Smart Health Coach settings</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get proactive guidance based on your daily logs and habits.
              </p>
            </div>
            <Link
              href="/health-tips"
              className="text-sm font-semibold text-helfi-green hover:underline"
            >
              Open Smart Health Coach
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green"></div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Enable Smart Health Coach</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    10 credits per alert. Up to 50 credits per day. Charges only apply when an alert is sent.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => onToggleEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Alerts are sent automatically through the day based on your logging habits and safety limits.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value)
                      setTimezoneManual(true)
                    }}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-detected from your device. You can change it any time.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save Smart Health Coach settings'}
              </button>
              {hasUnsavedChanges && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Changes save automatically when you leave this page.
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {showEnableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Enable Smart Health Coach?
            </h3>
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <p>Get proactive health guidance based on your daily logs and habits.</p>
              <p>10 credits per alert.</p>
              <p>Up to 50 credits per day.</p>
              <p>Charges only apply when an alert is actually sent.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={() => setShowEnableModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmEnableSmartCoach()}
                className="px-4 py-2 rounded-lg bg-helfi-green text-white hover:bg-helfi-green/90"
              >
                Enable Smart Coach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
