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
const HISTORY_CACHE_KEY = 'helfi:health-tips:history'

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
  const [activeChatTip, setActiveChatTip] = useState<HealthTip | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(HISTORY_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            setTips(parsed)
            return
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/health-tips/history', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          const nextTips = Array.isArray(data?.tips) ? data.tips : []
          setTips(nextTips)
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(nextTips))
            } catch {
              // ignore cache errors
            }
          }
        }
      } catch {
        // ignore – UI will show friendly fallback
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const sortedTips = useMemo(() => {
    return [...tips].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime()
      const bTime = new Date(b.sentAt).getTime()
      return bTime - aTime
    })
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
          ) : sortedTips.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-300">
              No health tips have been recorded yet. Once Helfi has sent you some daily tips,
              they&apos;ll appear here.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedTips.map((tip) => {
                const blocks = buildTipBlocks(tip.body || '')
                const isExpanded = expandedTipId === tip.id
                return (
                  <article
                    key={tip.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/70"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTipId(isExpanded ? null : tip.id)}
                      className="w-full px-4 py-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {tip.title}
                          </h3>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {tip.tipDate?.slice(0, 10) || 'Unknown date'}
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3">
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
                            onClick={() => setActiveChatTip(tip)}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-helfi-green text-white shadow-sm hover:bg-helfi-green/90 transition-colors"
                          >
                            Ask AI
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

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
