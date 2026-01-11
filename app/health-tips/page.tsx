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
  frequency: number
  focusFood: boolean
  focusSupplements: boolean
  focusLifestyle: boolean
}

type TipBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'label'; label: string; text: string }
  | { type: 'list'; items: string[] }

const TIP_CATEGORIES = {
  food: {
    label: 'Food tip',
    iconText: 'F',
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700',
    icon: 'bg-emerald-600 text-white',
  },
  supplement: {
    label: 'Supplement tip',
    iconText: 'S',
    badge:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-700',
    icon: 'bg-sky-600 text-white',
  },
  lifestyle: {
    label: 'Lifestyle tip',
    iconText: 'L',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
    icon: 'bg-amber-600 text-white',
  },
} as const

const getTipCategory = (category?: string) => {
  if (category === 'supplement') return TIP_CATEGORIES.supplement
  if (category === 'lifestyle') return TIP_CATEGORIES.lifestyle
  return TIP_CATEGORIES.food
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [generatingTip, setGeneratingTip] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const settingsSnapshotRef = useRef<string>('')
  const settingsRef = useRef<HealthTipSettings>({
    enabled: false,
    time1: '11:30',
    time2: '15:30',
    time3: '20:30',
    timezone: 'Australia/Melbourne',
    frequency: 1,
    focusFood: true,
    focusSupplements: true,
    focusLifestyle: true,
  })

  const loadTips = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingTips(true)
    }
    try {
      const res = await fetch('/api/health-tips/today', { cache: 'no-store' as any })
      if (res.ok) {
        const data = await res.json()
        setTips(Array.isArray(data?.tips) ? data.tips : [])
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
    loadTips()
  }, [loadTips])

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

  const handleGenerateTip = useCallback(async () => {
    if (generatingTip) return
    setGenerateError(null)
    setGeneratingTip(true)
    try {
      const res = await fetch('/api/health-tips/generate', { method: 'POST' })
      if (res.status === 402) {
        setGenerateError('You do not have enough credits to generate a tip right now.')
        return
      }
      if (!res.ok) {
        setGenerateError('We could not generate a tip. Please try again.')
        return
      }
      await res.json().catch(() => ({}))
      await loadTips({ silent: true })
    } catch {
      setGenerateError('We could not generate a tip. Please try again.')
    } finally {
      setGeneratingTip(false)
    }
  }, [generatingTip, loadTips])

  const handleSaveSettings = useCallback(async (options?: { silent?: boolean; keepalive?: boolean; payload?: HealthTipSettings }) => {
    const payload = options?.payload ?? {
      enabled,
      time1,
      time2,
      time3,
      timezone,
      frequency,
      focusFood,
      focusSupplements,
      focusLifestyle,
    }
    if (!options?.silent) setSaving(true)
    try {
      const res = await fetch('/api/health-tips/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!options?.keepalive,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data && (data.error || data.detail)) || 'Failed to save settings'
        if (!options?.silent) alert(msg)
        return
      }
      const snapshot = JSON.stringify(payload)
      settingsSnapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      if (!options?.silent) {
        alert('Health tip settings saved. Your next AI tips will follow this schedule.')
      }
    } catch {
      if (!options?.silent) {
        alert('Could not save health tip settings. Please try again.')
      }
    } finally {
      if (!options?.silent) setSaving(false)
    }
  }, [enabled, time1, time2, time3, timezone, frequency, focusFood, focusSupplements, focusLifestyle])

  useEffect(() => {
    if (loadingSettings) return
    const nextSettings: HealthTipSettings = {
      enabled,
      time1,
      time2,
      time3,
      timezone,
      frequency,
      focusFood,
      focusSupplements,
      focusLifestyle,
    }
    settingsRef.current = nextSettings
    const snapshot = JSON.stringify(nextSettings)
    if (!settingsSnapshotRef.current) {
      settingsSnapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      return
    }
    setHasUnsavedChanges(snapshot !== settingsSnapshotRef.current)
  }, [enabled, time1, time2, time3, timezone, frequency, focusFood, focusSupplements, focusLifestyle, loadingSettings])

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
  const visibleTips = sortedTips.slice(0, 2)
  const hasMoreTips = sortedTips.length > 2

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Health Tips" backHref="/notifications/ai-insights" />

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
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGenerateTip}
              disabled={generatingTip}
              className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
            >
              {generatingTip ? 'Generating…' : 'Generate Health Tip'}
            </button>
            {generateError && (
              <p className="mt-2 text-xs text-red-600">{generateError}</p>
            )}
          </div>

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
              {visibleTips.map((tip) => {
                const category = getTipCategory(tip.category)
                const blocks = buildTipBlocks(tip.body || '')
                const tipSummary = [tip.title, tip.body, tip.safetyNote]
                  .filter((value) => value && value.trim().length > 0)
                  .join(' ')

                return (
                  <article
                    key={tip.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800/70"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        {tip.title}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${category.badge}`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${category.icon}`}
                        >
                          {category.iconText}
                        </span>
                        <span>{category.label}</span>
                      </span>
                    </div>
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
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTipId((current) => (current === tip.id ? null : tip.id))
                        }
                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-helfi-green text-white shadow-sm hover:bg-helfi-green/90 transition-colors"
                      >
                        Ask AI
                      </button>
                    </div>
                    {expandedTipId === tip.id && (
                      <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900/60 overflow-hidden">
                        <VoiceChat
                          className="h-80"
                          context={{
                            healthTipSummary: tipSummary,
                            healthTipTitle: tip.title,
                            healthTipCategory: tip.category,
                            healthTipSuggestedQuestions: tip.suggestedQuestions,
                          }}
                        />
                      </div>
                    )}
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
              Health tip schedule
            </h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose how many AI health tips you&apos;d like each day and when you&apos;d like to
            receive them. Each tip uses your Helfi credits (we always charge more credits than the
            raw AI cost so things stay in line with your subscription and top-ups).
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Cost: 2 credits per tip dispatch.
          </p>

          {/* Credits usage for Health Tips */}
          <div className="mb-4">
            <UsageMeter inline={true} feature="healthTips" />
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
                onClick={() => handleSaveSettings()}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium mt-2"
              >
                {saving ? 'Saving…' : 'Save health tip settings'}
              </button>
              {hasUnsavedChanges && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Changes save automatically when you leave this page.
                </p>
              )}

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
