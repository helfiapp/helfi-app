'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import VoiceChat from '@/components/VoiceChat'

type HealthTip = {
  id: string
  tipDate: string
  sentAt: string
  title: string
  body: string
  category: string
  suggestedQuestions?: string[]
}

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

export default function HealthTipsPage() {
  const pathname = usePathname()
  const [tips, setTips] = useState<HealthTip[]>([])
  const [loadingTips, setLoadingTips] = useState(true)
  const [settings, setSettings] = useState<HealthTipSettings | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)

  // Local editable copies of settings
  const [enabled, setEnabled] = useState(false)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [timezone, setTimezone] = useState('Australia/Melbourne')
  const [frequency, setFrequency] = useState(1)
  const [focusFood, setFocusFood] = useState(true)
  const [focusSupplements, setFocusSupplements] = useState(true)
  const [focusLifestyle, setFocusLifestyle] = useState(true)
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([])
  const [timezoneQuery, setTimezoneQuery] = useState('')
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false)
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/health-tips/today', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          setTips(Array.isArray(data?.tips) ? data.tips : [])
        }
      } catch {
        // ignore – UI will show friendly message
      } finally {
        setLoadingTips(false)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/health-tips/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = (await res.json()) as HealthTipSettings
          setSettings(data)
          setEnabled(data.enabled)
          setTime1(data.time1)
          setTime2(data.time2)
          setTime3(data.time3)
          setTimezone(data.timezone)
          setTimezoneQuery(data.timezone)
          setFrequency(data.frequency)
          setFocusFood(data.focusFood)
          setFocusSupplements(data.focusSupplements)
          setFocusLifestyle(data.focusLifestyle)
        }
      } catch {
        // ignore – UI will show fallback defaults
      } finally {
        setLoadingSettings(false)
      }
    })()
  }, [])

  // Populate timezone dropdown with all supported IANA timezones (with a safe fallback list)
  useEffect(() => {
    try {
      const anyIntl = Intl as any
      if (anyIntl && typeof anyIntl.supportedValuesOf === 'function') {
        const supported = anyIntl.supportedValuesOf('timeZone') as string[]
        if (Array.isArray(supported) && supported.length > 0) {
          const sorted = [...supported].sort((a, b) => a.localeCompare(b))
          setTimezoneOptions(sorted)
          // If current timezone is not set, default to the environment's best guess
          if (!timezone) {
            const guessed =
              Intl.DateTimeFormat().resolvedOptions().timeZone || sorted[0] || 'UTC'
            setTimezone(guessed)
          }
          return
        }
      }
    } catch {
      // fall through to static fallback list
    }

    // Static curated fallback list (mirrors Settings page selection)
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
      setTimezone(fallback[0])
      setTimezoneQuery(fallback[0])
    }
  }, [timezone])

  const filteredTimezones = useMemo(() => {
    if (!timezoneOptions.length) return []
    const query = (timezoneQuery || '').trim().toLowerCase()
    if (!query) {
      return timezoneOptions.slice(0, 50)
    }
    return timezoneOptions
      .filter((tz) => tz.toLowerCase().includes(query))
      .slice(0, 50)
  }, [timezoneOptions, timezoneQuery])

  const handleSaveSettings = async () => {
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
        const msg = (data && (data.error || data.detail)) || 'Failed to save settings'
        alert(msg)
        return
      }
      alert('Health tip settings saved. Your next AI tips will follow this schedule.')
    } catch {
      alert('Could not save health tip settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isHistoryPage = pathname === '/health-tips/history'

  const sortedTips = useMemo(() => {
    return [...tips].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime()
      const bTime = new Date(b.sentAt).getTime()
      return bTime - aTime
    })
  }, [tips])
  const visibleTips = sortedTips.slice(0, 2)
  const hasMoreTips = sortedTips.length > 2

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Health Tips" backHref="/more" />

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="bg-white dark:bg-gray-800 rounded-t-xl border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <Link
              href="/health-tips"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                !isHistoryPage
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Today&apos;s Tips
            </Link>
            <Link
              href="/health-tips/history"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                isHistoryPage
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Tip History
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Today’s Tips */}
        <section className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Today&apos;s AI health tips
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            When you receive a notification and tap it, you&apos;ll land here to see the full tip,
            plus any others sent today.
          </p>

          {loadingTips ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green" />
            </div>
          ) : tips.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300">
              No AI tips have been sent yet today. Once your schedule is set and you have credits,
              Helfi will send you personalised health tips here.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleTips.map((tip) => (
                <article
                  key={tip.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800/70"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                      {tip.title}
                    </h2>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                      {tip.category === 'supplement'
                        ? 'Supplement tip'
                        : tip.category === 'lifestyle'
                        ? 'Lifestyle tip'
                        : 'Food tip'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line">
                    {tip.body}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Do you have any questions about this tip?
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTipId((current) => (current === tip.id ? null : tip.id))
                      }
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-helfi-green text-white hover:bg-helfi-green/90 transition-colors"
                    >
                      Ask AI
                    </button>
                  </div>
                  {expandedTipId === tip.id && (
                    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900/60 overflow-hidden">
                      <VoiceChat
                        className="h-80"
                        context={{
                          healthTipSummary: `${tip.title}. ${tip.body}`,
                          healthTipTitle: tip.title,
                          healthTipCategory: tip.category,
                          healthTipSuggestedQuestions: tip.suggestedQuestions,
                        }}
                      />
                    </div>
                  )}
                </article>
              ))}
              {hasMoreTips && (
                <div className="pt-2">
                  <Link
                    href="/health-tips/history"
                    className="block w-full text-center text-sm font-medium text-helfi-green hover:text-helfi-green/80 border border-helfi-green/40 rounded-lg py-2 bg-emerald-50/40 hover:bg-emerald-50 transition-colors"
                  >
                    View more tips
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Health tip schedule
            </h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose how many AI health tips you&apos;d like each day and when you&apos;d like to
            receive them. Each tip uses your Helfi credits (we always charge more credits than the
            raw AI cost so things stay in line with your subscription and top-ups).
          </p>

          {/* Credits usage for Health Tips */}
          <div className="mb-4">
            <UsageMeter inline={true} />
            <FeatureUsageDisplay featureName="healthTips" featureLabel="Health Tips" />
          </div>

          {loadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">AI Health Tips</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Turn daily AI health tips on or off for this account.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green" />
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of tips per day
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  >
                    <option value={1}>1 tip per day</option>
                    <option value={2}>2 tips per day</option>
                    <option value={3}>3 tips per day</option>
                  </select>
                </div>

                {frequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tip 1 time
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
                      Tip 2 time
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
                      Tip 3 time
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
                  <div className="relative">
                    <input
                      type="text"
                      value={timezoneQuery}
                      onChange={(e) => {
                        setTimezoneQuery(e.target.value)
                        setShowTimezoneDropdown(true)
                      }}
                      onFocus={() => {
                        if (enabled && timezoneOptions.length > 0) {
                          setShowTimezoneDropdown(true)
                        }
                      }}
                      placeholder="Start typing e.g. Australia/Melbourne"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      disabled={!enabled}
                    />
                    {enabled && showTimezoneDropdown && filteredTimezones.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                        {filteredTimezones.map((tzValue) => (
                          <button
                            key={tzValue}
                            type="button"
                            onClick={() => {
                              setTimezone(tzValue)
                              setTimezoneQuery(tzValue)
                              setShowTimezoneDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {tzValue}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Start typing your city or region and pick the closest match (for example:{' '}
                    <span className="font-mono">Australia/Melbourne</span> or{' '}
                    <span className="font-mono">America/New_York</span>).
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                  What would you like tips about?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Helfi will always look at your whole health picture, but you can gently steer the
                  types of tips you receive.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={focusFood}
                      onChange={(e) => setFocusFood(e.target.checked)}
                      disabled={!enabled}
                    />
                    Food & meals
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={focusSupplements}
                      onChange={(e) => setFocusSupplements(e.target.checked)}
                      disabled={!enabled}
                    />
                    Supplements (with safety wording)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={focusLifestyle}
                      onChange={(e) => setFocusLifestyle(e.target.checked)}
                      disabled={!enabled}
                    />
                    Lifestyle & daily habits
                  </label>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium mt-2"
              >
                {saving ? 'Saving…' : 'Save health tip settings'}
              </button>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                These AI tips are educational and do not replace medical advice. Always consider
                your medications, allergies, and personal circumstances, and talk to your clinician
                before making big changes or starting new supplements.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}


