'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import VoiceChat from '@/components/VoiceChat'

type HealthTip = {
  id: string
  tipDate: string
  sentAt: string
  title: string
  body: string
  category: string
}

export default function HealthTipHistoryPage() {
  const pathname = usePathname()
  const [tips, setTips] = useState<HealthTip[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/health-tips/history', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          setTips(Array.isArray(data?.tips) ? data.tips : [])
        }
      } catch {
        // ignore – UI will show friendly fallback
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, HealthTip[]>()
    for (const tip of tips) {
      const dateKey = tip.tipDate?.slice(0, 10) || 'Unknown date'
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(tip)
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1))
  }, [tips])

  const isHistoryPage = pathname === '/health-tips/history'

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
        <section className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-sm p-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Past AI health tips
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scroll back through previous days to revisit useful suggestions you&apos;ve already
              received.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300">
              No health tips have been recorded yet. Once Helfi has sent you some daily tips,
              they&apos;ll appear here.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([date, dayTips]) => (
                <div key={date}>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {date}
                  </h2>
                  <div className="space-y-3">
                    {dayTips.map((tip) => (
                      <article
                        key={tip.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800/70"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                            {tip.title}
                          </h3>
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
                              }}
                            />
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}


