'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import VoiceChat from '@/components/VoiceChat'
import { useSaveOnLeave } from '@/lib/use-save-on-leave'

type HealthTip = {
  id: string
  tipDate: string
  sentAt: string
  title: string
  body: string
  category: string
  safetyNote?: string
  suggestedQuestions?: string[]
}

type HealthTipSettings = {
  enabled: boolean
  time1: string
  time2: string
  time3: string
  timezone: string
  timezoneManual?: boolean
  frequency: number
}

type TipBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'label'; label: string; text: string }
  | { type: 'list'; items: string[] }
const TIPS_CACHE_KEY = 'helfi:health-tips:today'
const CLEARED_TIPS_KEY = 'helfi:health-tips:cleared'

const detectBrowserTimezone = () => {
  if (typeof window === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const splitSentences = (value: string) => {
  const matches = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  if (!matches) return [value]
  return matches.map((part) => part.trim()).filter(Boolean)
}

const buildTipBlocks = (body: string): TipBlock[] => {
  const cleaned = body.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []
  const rawLines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)
  const lines = rawLines.length > 1 ? rawLines : splitSentences(cleaned)
  const blocks: TipBlock[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.*)$/)
    if (bulletMatch) {
      listItems.push(bulletMatch[1].trim())
      continue
    }
    flushList()
    const labelMatch = line.match(/^([A-Za-z][A-Za-z ]{0,18}):\s+(.*)$/)
    if (labelMatch) {
      blocks.push({ type: 'label', label: labelMatch[1], text: labelMatch[2].trim() })
      continue
    }
    blocks.push({ type: 'paragraph', text: line })
  }
  flushList()

  return blocks
}

const normalizeTipTitle = (title: string) =>
  String(title || '').replace(/^Smart Health Coach:\s*/i, 'Health Coach: ')

export default function HealthTipsPage() {
  const pathname = usePathname()
  const [tips, setTips] = useState<HealthTip[]>([])
  const [loadingTips, setLoadingTips] = useState(true)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)

  // Local editable copies of settings
  const [enabled, setEnabled] = useState(false)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [timezone, setTimezone] = useState(detectBrowserTimezone)
  const [timezoneManual, setTimezoneManual] = useState(false)
  const [frequency, setFrequency] = useState(1)
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([])
  const [timezoneQuery, setTimezoneQuery] = useState(detectBrowserTimezone)
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showEnableModal, setShowEnableModal] = useState(false)
  const [activeChatTip, setActiveChatTip] = useState<HealthTip | null>(null)
  const [clearedTipIds, setClearedTipIds] = useState<Set<string>>(new Set())
  const clearedTipIdsRef = useRef<Set<string>>(new Set())
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

  const loadTips = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingTips(true)
    }
    try {
      const res = await fetch('/api/health-tips/today', { cache: 'no-store' as any })
      if (res.ok) {
        const data = await res.json()
        const nextTips = Array.isArray(data?.tips) ? data.tips : []
        setTips(nextTips)
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(TIPS_CACHE_KEY, JSON.stringify(nextTips))
          } catch {
            // ignore cache errors
          }
        }
      }
    } catch {
      // ignore – UI will show friendly message
    } finally {
      if (!options?.silent) {
        setLoadingTips(false)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      loadTips()
      return
    }
    let cached: HealthTip[] | null = null
    try {
      const raw = sessionStorage.getItem(TIPS_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          cached = parsed
        }
      }
    } catch {
      cached = null
    }
    if (cached && cached.length > 0) {
      setTips(cached)
      setLoadingTips(false)
      return
    }
    loadTips()
  }, [loadTips])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(CLEARED_TIPS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const nextSet = new Set(parsed.filter((id) => typeof id === 'string' && id))
        clearedTipIdsRef.current = nextSet
        setClearedTipIds(new Set(nextSet))
      }
    } catch {
      // ignore storage issues
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const browserTimezone = detectBrowserTimezone()
        const res = await fetch('/api/health-tips/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = (await res.json()) as HealthTipSettings
          const manual = !!data.timezoneManual
          const resolvedTimezone = manual
            ? (data.timezone || browserTimezone)
            : browserTimezone

          setEnabled(data.enabled)
          setTime1(data.time1)
          setTime2(data.time2)
          setTime3(data.time3)
          setTimezone(resolvedTimezone)
          setTimezoneManual(manual)
          setTimezoneQuery(resolvedTimezone)
          setFrequency(data.frequency)

          if (!manual && (data.timezone || '').trim() !== browserTimezone) {
            const syncPayload: HealthTipSettings = {
              enabled: !!data.enabled,
              time1: data.time1 || '11:30',
              time2: data.time2 || '15:30',
              time3: data.time3 || '20:30',
              timezone: browserTimezone,
              timezoneManual: false,
              frequency: Number(data.frequency) || 1,
            }
            void fetch('/api/health-tips/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(syncPayload),
              keepalive: true,
            }).catch(() => {})
          }
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

  const handleClearTip = useCallback((tipId: string) => {
    if (!tipId) return
    const nextSet = new Set(clearedTipIdsRef.current)
    nextSet.add(tipId)
    clearedTipIdsRef.current = nextSet
    setClearedTipIds(new Set(nextSet))
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CLEARED_TIPS_KEY, JSON.stringify(Array.from(nextSet)))
      } catch {
        // ignore storage errors
      }
    }
  }, [])

  const handleSaveSettings = useCallback(async (options?: {
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
        const msg = (data && (data.error || data.detail)) || 'Failed to save settings'
        if (!options?.silent) alert(msg)
        return false
      }
      const snapshot = JSON.stringify(payload)
      settingsSnapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      if (!options?.silent) {
        alert('Health Coach settings saved.')
      }
      return true
    } catch {
      if (!options?.silent) {
        alert('Could not save Health Coach settings. Please try again.')
      }
      return false
    } finally {
      if (!options?.silent) setSaving(false)
    }
  }, [enabled, time1, time2, time3, timezone, timezoneManual, frequency])

  useEffect(() => {
    if (loadingSettings) return
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
  }, [enabled, time1, time2, time3, timezone, timezoneManual, frequency, loadingSettings])

  useSaveOnLeave(() => {
    if (!hasUnsavedChanges) return
    void handleSaveSettings({ silent: true, keepalive: true, payload: settingsRef.current })
  })

  const isHistoryPage = pathname === '/health-tips/history'

  const sortedTips = useMemo(() => {
    return [...tips].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime()
      const bTime = new Date(b.sentAt).getTime()
      return bTime - aTime
    })
  }, [tips])
  const filteredTips = useMemo(
    () => sortedTips.filter((tip) => !clearedTipIds.has(tip.id)),
    [sortedTips, clearedTipIds]
  )
  const visibleTips = filteredTips.slice(0, 2)
  const hasMoreTips = filteredTips.length > 2

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
    const saved = await handleSaveSettings({
      silent: true,
      payload: nextPayload,
      acceptPricingTerms: true,
    })
    if (saved) {
      alert('Health Coach enabled.')
    } else {
      setEnabled(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Health Coach" backHref="/notifications/ai-insights" />

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
            Today&apos;s Health Coach alerts
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            When you receive a Health Coach alert and tap it, you&apos;ll land here to see
            the full message and any others sent today.
          </p>

          {loadingTips ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green" />
            </div>
          ) : filteredTips.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300">
              {tips.length === 0
                ? "No Health Coach alerts have been sent yet today. Once enabled, alerts that match your logs will show here."
                : "You cleared today’s tips. They’re still saved in your tip history."}
            </div>
          ) : (
            <div className="space-y-4">
              {visibleTips.map((tip) => {
                const blocks = buildTipBlocks(tip.body || '')

                return (
                  <article
                    key={tip.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800/70"
                  >
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                      {normalizeTipTitle(tip.title)}
                    </h2>
                    <div className="space-y-2 text-sm text-gray-800 dark:text-gray-100 leading-relaxed">
                      {blocks.length > 0 ? (
                        blocks.map((block, index) => {
                          if (block.type === 'list') {
                            return (
                              <ul key={`list-${index}`} className="list-disc pl-5 space-y-1">
                                {block.items.map((item, itemIndex) => (
                                  <li key={`item-${index}-${itemIndex}`}>{item}</li>
                                ))}
                              </ul>
                            )
                          }
                          if (block.type === 'label') {
                            return (
                              <p key={`label-${index}`}>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {block.label}:
                                </span>{' '}
                                {block.text}
                              </p>
                            )
                          }
                          return <p key={`para-${index}`}>{block.text}</p>
                        })
                      ) : (
                        <p>{tip.body}</p>
                      )}
                    </div>
                    {tip.safetyNote && tip.safetyNote.trim().length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
                        <span className="font-semibold">Safety note:</span>{' '}
                        {tip.safetyNote}
                      </div>
                    )}
                    <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Do you have any questions about this tip?
                      </span>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => setActiveChatTip(tip)}
                          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-helfi-green text-white shadow-sm hover:bg-helfi-green/90 transition-colors"
                        >
                          Ask AI
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClearTip(tip.id)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Clear from today
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
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
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Health Coach settings
            </h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Health Coach checks your logs and can send proactive alerts.
            Charges only apply when an alert is actually sent.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Cost: 10 credits per alert. Daily cap: 50 credits (max 5 charged alerts).
          </p>

          {/* Credits usage for Health Coach */}
          <div className="mb-4">
            <UsageMeter inline={true} feature="healthTips" />
            <FeatureUsageDisplay featureName="healthTips" featureLabel="Health Coach" />
          </div>

          {loadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Enable Health Coach</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Get proactive guidance based on your daily logs and habits.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => onToggleEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green" />
                </label>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We check your food, water, activity, and mood logs. If we spot patterns like low hydration, poor food balance, low activity, or missed check-ins, we may send up to 5 alerts in your local timezone.
                </p>

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
                              setTimezoneManual(true)
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
                    Auto-detected from your device. You can still change it here (for example:{' '}
                    <span className="font-mono">Australia/Melbourne</span> or{' '}
                    <span className="font-mono">America/New_York</span>).
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleSaveSettings()}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium mt-2"
              >
                {saving ? 'Saving…' : 'Save Health Coach settings'}
              </button>
              {hasUnsavedChanges && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Changes save automatically when you leave this page.
                </p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Health Coach alerts are educational and do not replace medical advice.
                Always consider your medications, allergies, and personal circumstances, and talk
                to your clinician before making big changes or starting new supplements.
              </p>
            </div>
          )}
        </section>
      </main>

      {showEnableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Enable Health Coach?
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
                Enable Health Coach
              </button>
            </div>
          </div>
        </div>
      )}

      {activeChatTip && (
        <VoiceChat
          className="flex-1"
          startExpanded={true}
          hideExpandToggle={true}
          onExit={() => setActiveChatTip(null)}
          context={{
            healthTipSummary: [activeChatTip.title, activeChatTip.body, activeChatTip.safetyNote]
              .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              .join(' '),
            healthTipTitle: activeChatTip.title,
            healthTipCategory: activeChatTip.category,
            healthTipSuggestedQuestions: activeChatTip.suggestedQuestions,
          }}
        />
      )}
    </div>
  )
}
