'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

type SymptomHistoryItem = {
  id: string
  symptoms: any
  duration?: string | null
  notes?: string | null
  summary?: string | null
  analysisText?: string | null
  analysisData?: {
    possibleCauses?: Array<{ name: string; whyLikely?: string; confidence?: string }>
    redFlags?: string[]
    nextSteps?: string[]
  } | null
  createdAt: string
}

export default function SymptomHistoryPage() {
  const pathname = usePathname()
  const [historyItems, setHistoryItems] = useState<SymptomHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null)
  const [historyClearing, setHistoryClearing] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      setHistoryError(null)
      const res = await fetch('/api/symptoms/history', { cache: 'no-store' as any })
      if (!res.ok) {
        throw new Error('Failed to load history')
      }
      const data = await res.json()
      const nextHistory = Array.isArray(data?.history) ? data.history : []
      setHistoryItems(nextHistory)
    } catch (err) {
      setHistoryError((err as Error).message || 'Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleDeleteHistoryItem = async (id: string) => {
    if (!window.confirm('Delete this symptom analysis? This cannot be undone.')) return
    try {
      setHistoryDeletingId(id)
      setHistoryError(null)
      const res = await fetch(`/api/symptoms/history/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error('Failed to delete analysis')
      }
      setHistoryItems((prev) => prev.filter((item) => item.id !== id))
      setExpandedHistoryId((prev) => (prev === id ? null : prev))
    } catch (err) {
      setHistoryError((err as Error).message || 'Failed to delete analysis')
    } finally {
      setHistoryDeletingId(null)
    }
  }

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all symptom analyses? This cannot be undone.')) return
    try {
      setHistoryClearing(true)
      setHistoryError(null)
      const res = await fetch('/api/symptoms/history', { method: 'DELETE' })
      if (!res.ok) {
        throw new Error('Failed to clear history')
      }
      setHistoryItems([])
      setExpandedHistoryId(null)
    } catch (err) {
      setHistoryError((err as Error).message || 'Failed to clear history')
    } finally {
      setHistoryClearing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="Symptom Analysis" />

      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="bg-white rounded-t-xl border-b border-gray-200">
          <div className="flex">
            <Link
              href="/symptoms"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                pathname !== '/symptoms/history'
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Symptom Analysis
            </Link>
            <Link
              href="/symptoms/history"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                pathname === '/symptoms/history'
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History
            </Link>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-b-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Symptom History</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Review your previous symptom analyses. You can delete any entry at any time.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {historyItems.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-red-600 hover:text-red-700 disabled:opacity-60"
                    type="button"
                    disabled={historyClearing}
                  >
                    {historyClearing ? 'Clearing...' : 'Clear all'}
                  </button>
                )}
                <button
                  onClick={loadHistory}
                  className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
                  type="button"
                  disabled={historyLoading}
                >
                  Refresh
                </button>
              </div>
            </div>

            {historyLoading && <div className="text-sm text-gray-500">Loading history...</div>}
            {historyError && <div className="text-sm text-red-700">{historyError}</div>}
            {!historyLoading && !historyError && historyItems.length === 0 && (
              <div className="text-sm text-gray-500">No saved analyses yet.</div>
            )}

            <div className="mt-4 space-y-4">
              {historyItems.map((item) => {
                const symptoms = Array.isArray(item.symptoms) ? item.symptoms : []
                const analysisData = item.analysisData || null
                const possibleCauses = Array.isArray(analysisData?.possibleCauses)
                  ? analysisData?.possibleCauses
                  : []
                const redFlags = Array.isArray(analysisData?.redFlags) ? analysisData?.redFlags : []
                const nextSteps = Array.isArray(analysisData?.nextSteps) ? analysisData?.nextSteps : []
                const isExpanded = expandedHistoryId === item.id
                const createdAtLabel = item.createdAt
                  ? new Date(item.createdAt).toLocaleString()
                  : 'Unknown date'

                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-500">{createdAtLabel}</div>
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          className="text-helfi-green hover:text-helfi-green/80"
                        >
                          {isExpanded ? 'Hide details' : 'View details'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryItem(item.id)}
                          className="text-red-600 hover:text-red-700 disabled:opacity-60"
                          disabled={historyDeletingId === item.id || historyClearing}
                        >
                          {historyDeletingId === item.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {symptoms.length > 0 && (
                        <div className="text-sm text-gray-900">
                          <span className="font-medium">Symptoms:</span> {symptoms.join(', ')}
                        </div>
                      )}
                      {item.duration && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Duration:</span> {item.duration}
                        </div>
                      )}
                      {item.summary && (
                        <p className="text-sm text-gray-800">{item.summary}</p>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="pt-3 space-y-3 text-sm text-gray-700">
                        {item.notes && (
                          <div>
                            <div className="font-medium text-gray-900 mb-1">Notes</div>
                            <p className="whitespace-pre-line">{item.notes}</p>
                          </div>
                        )}
                        {possibleCauses.length > 0 && (
                          <div>
                            <div className="font-medium text-gray-900 mb-1">Likely causes</div>
                            <ul className="space-y-1">
                              {possibleCauses.map((cause: any, idx: number) => (
                                <li key={`${cause.name}-${idx}`} className="flex items-center gap-2">
                                  <span className="text-gray-900">{cause.name}</span>
                                  {cause.confidence && (
                                    <span className="text-xs text-gray-500">({cause.confidence})</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {redFlags.length > 0 && (
                          <div>
                            <div className="font-medium text-red-700 mb-1">Red-flag signs</div>
                            <ul className="list-disc list-inside space-y-1 text-red-800">
                              {redFlags.map((flag: string, idx: number) => (
                                <li key={idx}>{flag}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {nextSteps.length > 0 && (
                          <div>
                            <div className="font-medium text-gray-900 mb-1">Next steps</div>
                            <ul className="list-disc list-inside space-y-1">
                              {nextSteps.map((step: string, idx: number) => (
                                <li key={idx}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.analysisText && (
                          <div>
                            <div className="font-medium text-gray-900 mb-1">Full notes</div>
                            <p className="whitespace-pre-line">{item.analysisText}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
