'use client'

import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightCard from '@/components/mood/InsightCard'
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

const TABS = [
  { key: 'sleep', label: 'Sleep' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'activity', label: 'Activity' },
  { key: 'stress', label: 'Stress' },
] as const

export default function MoodInsightsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('month')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('sleep')
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const cards = useMemo(() => {
    const list = (data?.insights as any)?.[tab]
    return Array.isArray(list) ? (list as Insight[]) : []
  }, [data, tab])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood Insights" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">Insights</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Patterns are shown as tendencies — not guarantees.
              </div>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
              aria-label="Time range"
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const active = t.key === tab
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={[
                    'shrink-0 rounded-full px-4 py-2 text-sm border touch-manipulation',
                    active
                      ? 'bg-helfi-green/10 border-helfi-green/30 text-helfi-green-dark dark:text-helfi-green-light'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green"></div>
            </div>
          ) : error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : cards.length === 0 ? (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              No insights yet. Add a few mood check‑ins first.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {cards.map((c) => (
                <InsightCard key={c.id} title={c.title} detail={c.detail} confidence={c.confidence} />
              ))}
            </div>
          )}
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}

