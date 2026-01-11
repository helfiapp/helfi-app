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
  safetyNote?: string
  suggestedQuestions?: string[]
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
                    {dayTips.map((tip) => {
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
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                              {tip.title}
                            </h3>
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
