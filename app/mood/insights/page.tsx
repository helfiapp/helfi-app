'use client'

import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

export const dynamic = 'force-dynamic'

type Insight = {
  id: string
  title: string
  detail: string
  confidence: 'low' | 'medium' | 'high'
  sampleSize: number
}

type InsightsResponse = {
  range: { start: string; end: string }
  insights: {
    sleep: Insight[]
    nutrition: Insight[]
    supplements: Insight[]
    activity: Insight[]
    stress: Insight[]
  }
  meta: { sampleSize: number }
}

type Card = { id: string; title: string; detail: string; icon: string; color: string }

function pickFirst(map: InsightsResponse['insights']) {
  const cards: Card[] = []
  const add = (key: keyof InsightsResponse['insights'], icon: string, color: string) => {
    const arr = map[key]
    if (!Array.isArray(arr) || arr.length === 0) return
    cards.push({ id: `${key}-${arr[0].id}`, title: arr[0].title, detail: arr[0].detail, icon, color })
  }
  add('sleep', 'bedtime', 'bg-purple-100 text-purple-600')
  add('nutrition', 'restaurant', 'bg-green-100 text-green-600')
  add('activity', 'directions_walk', 'bg-emerald-100 text-emerald-700')
  add('stress', 'schedule', 'bg-blue-100 text-blue-600')
  return cards
}

export default function MoodInsightsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('month')
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/mood/insights?period=${period}`, { cache: 'no-store' as any })
        if (!res.ok) throw new Error('Failed to load insights')
        const j = (await res.json()) as InsightsResponse
        if (!ignore) setData(j)
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'Failed to load insights')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [period])

  const carousel = useMemo(() => {
    if (!data) return []
    return pickFirst(data.insights)
  }, [data])

  const allGroups = useMemo(() => {
    if (!data) return [] as Array<{ label: string; items: Insight[] }>
    return [
      { label: 'Sleep', items: data.insights.sleep || [] },
      { label: 'Meals', items: data.insights.nutrition || [] },
      { label: 'Activity', items: data.insights.activity || [] },
      { label: 'Timing', items: data.insights.stress || [] },
    ]
  }, [data])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood Insights" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Insights</div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPeriod('week')}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                  period === 'week'
                    ? 'bg-helfi-green text-white border-helfi-green'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setPeriod('month')}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                  period === 'month'
                    ? 'bg-helfi-green text-white border-helfi-green'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                Month
              </button>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-300">
            This is a simple “pattern finder” using your mood check‑ins alongside things like sleep, meals, and activity. It’s not medical advice.
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The more you check in, the clearer this becomes.
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green"></div>
            </div>
          ) : error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : !data || carousel.length === 0 ? (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              No insights yet. Add a few mood check‑ins first.
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-900 dark:text-white text-xl font-bold">Highlights</h3>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-helfi-green text-xs font-bold uppercase tracking-wide hover:underline"
                >
                  {showAll ? 'Hide details' : 'View all'}
                </button>
              </div>
              <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Based on {data.meta?.sampleSize ?? 0} day(s) of mood history in this view.
              </div>
              <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2">
                {carousel.map((c) => (
                  <div key={c.id} className="min-w-[260px] bg-white dark:bg-gray-800 rounded-2xl p-5 flex flex-col gap-3 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${c.color}`}>
                        <span className="material-symbols-outlined text-lg">{c.icon}</span>
                      </div>
                      <span className="text-gray-900 dark:text-white font-bold text-sm">Insight</span>
                    </div>
                    <div className="text-gray-900 dark:text-white font-bold text-sm">
                      {c.title}
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                      {c.detail}
                    </p>
                  </div>
                ))}
              </div>

              {showAll && (
                <div className="mt-6 space-y-4">
                  {allGroups.map((g) => (
                    <div key={g.label}>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300 mb-2">
                        {g.label}
                      </div>
                      <div className="space-y-3">
                        {g.items.map((it) => (
                          <div key={it.id} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm">
                            <div className="text-sm font-bold text-gray-900 dark:text-white">{it.title}</div>
                            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{it.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <a
        href="/mood"
        className="md:hidden fixed bottom-28 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-helfi-green text-white shadow-[0_0_15px_rgba(77,175,80,0.4)] flex items-center justify-center"
        aria-label="Add mood"
      >
        <span className="material-symbols-outlined text-[32px]">add</span>
      </a>

      <InsightsBottomNav />
    </div>
  )
}
