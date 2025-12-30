'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { isCacheFresh, readClientCache, writeClientCache } from '@/lib/client-cache'

type HealthTipSettings = {
  enabled: boolean
  time1: string
  time2: string
  time3: string
  timezone: string
  frequency: number
  focusFood: boolean
  focusSupplements: boolean
  focusLifestyle: boolean
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

export default function AiInsightsNotificationsPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [timezone, setTimezone] = useState('UTC')
  const [frequency, setFrequency] = useState(1)
  const [focusFood, setFocusFood] = useState(true)
  const [focusSupplements, setFocusSupplements] = useState(true)
  const [focusLifestyle, setFocusLifestyle] = useState(true)
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(fallbackTimezones)
  const cacheKey = session?.user?.email ? `health-tips-settings:${session.user.email}` : ''

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
    const cached = cacheKey ? readClientCache<HealthTipSettings>(cacheKey) : null
    if (cached?.data) {
      const data = cached.data
      setEnabled(!!data.enabled)
      setTime1(data.time1 || '11:30')
      setTime2(data.time2 || '15:30')
      setTime3(data.time3 || '20:30')
      setTimezone(data.timezone || 'UTC')
      setFrequency(Number(data.frequency) || 1)
      setFocusFood(!!data.focusFood)
      setFocusSupplements(!!data.focusSupplements)
      setFocusLifestyle(!!data.focusLifestyle)
      setLoading(false)
    }
    if (cached && isCacheFresh(cached, HEALTH_TIPS_CACHE_TTL_MS)) return

    ;(async () => {
      try {
        const res = await fetch('/api/health-tips/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = (await res.json()) as HealthTipSettings
          setEnabled(!!data.enabled)
          setTime1(data.time1 || '11:30')
          setTime2(data.time2 || '15:30')
          setTime3(data.time3 || '20:30')
          setTimezone(data.timezone || 'UTC')
          setFrequency(Number(data.frequency) || 1)
          setFocusFood(!!data.focusFood)
          setFocusSupplements(!!data.focusSupplements)
          setFocusLifestyle(!!data.focusLifestyle)
          if (cacheKey) {
            writeClientCache(cacheKey, data)
          }
        }
      } catch {
        // ignore, defaults will show
      } finally {
        setLoading(false)
      }
    })()
  }, [cacheKey])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/health-tips/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          time1,
          time2,
          time3,
          timezone,
          frequency,
          focusFood,
          focusSupplements,
          focusLifestyle,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error || data?.detail || 'Failed to save settings')
        return
      }
      if (cacheKey) {
        writeClientCache(cacheKey, {
          enabled,
          time1,
          time2,
          time3,
          timezone,
          frequency,
          focusFood,
          focusSupplements,
          focusLifestyle,
        })
      }
      alert('AI insights schedule saved.')
    } catch {
      alert('Could not save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="AI insights" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI insights schedule</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Set when you want AI health tips and insights to arrive.
              </p>
            </div>
            <Link
              href="/health-tips"
              className="text-sm font-semibold text-helfi-green hover:underline"
            >
              View tips
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
                  <h3 className="font-medium text-gray-900 dark:text-white">Enable AI insights</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Turn AI insights on or off.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of insights per day
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  >
                    <option value={1}>1 insight</option>
                    <option value={2}>2 insights</option>
                    <option value={3}>3 insights</option>
                  </select>
                </div>

                {frequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Time 1
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
                      Time 2
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
                      Time 3
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
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Focus areas</h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={focusFood}
                      onChange={(e) => setFocusFood(e.target.checked)}
                      disabled={!enabled}
                    />
                    Food insights
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={focusSupplements}
                      onChange={(e) => setFocusSupplements(e.target.checked)}
                      disabled={!enabled}
                    />
                    Supplement insights
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={focusLifestyle}
                      onChange={(e) => setFocusLifestyle(e.target.checked)}
                      disabled={!enabled}
                    />
                    Lifestyle insights
                  </label>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save AI insight schedule'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
