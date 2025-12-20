'use client'

import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import MoodTrendGraph from '@/components/mood/MoodTrendGraph'
import MoodFaceIcon from '@/components/mood/MoodFaceIcon'
import { MOOD_LEVELS } from '@/components/mood/moodScale'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

export const dynamic = 'force-dynamic'

type MoodEntry = {
  id: string
  localDate: string
  timestamp: string
  mood: number
  tags: any
  note: string
  context: any
}

type EntriesResponse = {
  range: { start: string; end: string }
  entries: MoodEntry[]
}

function safeTags(tags: any): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t)).filter(Boolean)
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) return parsed.map((t) => String(t)).filter(Boolean)
    } catch {}
  }
  return []
}

function safeContext(ctx: any): Record<string, any> {
  if (!ctx) return {}
  if (typeof ctx === 'object') return ctx
  if (typeof ctx === 'string') {
    try {
      const parsed = JSON.parse(ctx)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }
  return {}
}

export default function MoodHistoryPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week')
  const [entries, setEntries] = useState<MoodEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [banner, setBanner] = useState<string | null>(null)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('saved') === '1') {
        setBanner('Saved mood check‑in.')
        const t = setTimeout(() => setBanner(null), 2500)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/mood/entries?period=${period}`, { cache: 'no-store' as any })
        if (!res.ok) throw new Error('Failed to load')
        const j = (await res.json()) as EntriesResponse
        if (!ignore) setEntries(Array.isArray(j.entries) ? j.entries : [])
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'Failed to load history')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [period])

  const points = useMemo(() => {
    const xs = entries
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((e) => ({ timestamp: e.timestamp, mood: Number(e.mood) }))
    return xs
  }, [entries])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood History" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6">
        {banner && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
            {banner}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">Mood trend</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">A visual look at your check‑ins.</div>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
              aria-label="Time range"
            >
              <option value="today">Today</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green"></div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : points.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              No mood entries yet. Add your first check‑in from the Mood tab.
            </div>
          ) : (
            <MoodTrendGraph points={points} />
          )}
        </div>

        <div className="mt-6 space-y-3">
          {entries.map((e) => {
            const tags = safeTags(e.tags)
            const ctx = safeContext(e.context)
            const when = new Date(e.timestamp)
            const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const moodLabel = MOOD_LEVELS.find((m) => m.value === Number(e.mood))?.label ?? `Mood ${e.mood}`

            const contextBits = [
              ctx.sleepMinutes ? `Sleep ${Math.round(ctx.sleepMinutes / 6) / 10}h` : null,
              ctx.stepsToday != null ? `${Number(ctx.stepsToday).toLocaleString()} steps` : null,
              ctx.mealsTodayCount != null ? `${ctx.mealsTodayCount} meals` : null,
              ctx.exerciseMinutesToday != null ? `${ctx.exerciseMinutesToday} min` : null,
            ].filter(Boolean) as string[]

            return (
              <details
                key={e.id}
                className="group rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
              >
                <summary className="list-none cursor-pointer select-none">
                  <div className="flex items-center gap-3">
                    <div className="text-helfi-green">
                      <MoodFaceIcon level={Number(e.mood)} selected />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {moodLabel}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {e.localDate} · {time}
                        </div>
                      </div>
                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tags.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-700 dark:text-gray-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {contextBits.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {contextBits.join(' · ')}
                        </div>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>

                <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                  {e.note && (
                    <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">
                      {e.note}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                    {ctx.sleepMinutes != null && <div>Sleep: {minutesToHours(ctx.sleepMinutes)}</div>}
                    {ctx.stepsToday != null && <div>Steps: {Number(ctx.stepsToday).toLocaleString()}</div>}
                    {ctx.mealsTodayCount != null && <div>Meals logged: {ctx.mealsTodayCount}</div>}
                    {ctx.exerciseMinutesToday != null && <div>Exercise: {ctx.exerciseMinutesToday} min</div>}
                    {ctx.energyLevel != null && <div>Energy: {ctx.energyLevel}/5</div>}
                    {ctx.sleepQuality != null && <div>Sleep quality: {ctx.sleepQuality}/5</div>}
                    {ctx.nutrition != null && <div>Nutrition: {ctx.nutrition}/5</div>}
                    {ctx.supplements != null && <div>Supplements: {ctx.supplements}/5</div>}
                    {ctx.physicalActivity != null && <div>Activity: {ctx.physicalActivity}/5</div>}
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}

function minutesToHours(minutes: number | null) {
  if (!minutes) return '—'
  const hrs = minutes / 60
  return `${hrs.toFixed(1)} h`
}
