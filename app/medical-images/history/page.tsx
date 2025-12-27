'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

type MedicalAnalysisResult = {
  summary?: string | null
  possibleCauses?: Array<{ name: string; whyLikely?: string; confidence?: string }>
  redFlags?: string[]
  nextSteps?: string[]
  analysisText?: string | null
}

type MedicalHistoryItem = {
  id: string
  summary?: string | null
  analysisText?: string | null
  analysisData?: MedicalAnalysisResult | null
  createdAt: string
  imageUrl?: string | null
}

export default function MedicalImagesHistoryPage() {
  const pathname = usePathname()
  const [historyItems, setHistoryItems] = useState<MedicalHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState<boolean>(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null)
  const [historyClearing, setHistoryClearing] = useState<boolean>(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      setHistoryError(null)
      const res = await fetch('/api/medical-images/history', { cache: 'no-store' as any })
      if (!res.ok) {
        throw new Error('Failed to load history')
      }
      const data = await res.json()
      const nextHistory = Array.isArray(data?.history)
        ? data.history.map((item: any) => ({
            ...item,
            analysisData: item?.analysisData && typeof item.analysisData === 'object' ? item.analysisData : null,
          }))
        : []
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
    if (!window.confirm('Delete this saved scan? This cannot be undone.')) return
    try {
      setHistoryDeletingId(id)
      setHistoryError(null)
      const res = await fetch(`/api/medical-images/history/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error('Failed to delete saved scan')
      }
      setHistoryItems((prev) => prev.filter((item) => item.id !== id))
      setExpandedHistoryId((prev) => (prev === id ? null : prev))
    } catch (err) {
      setHistoryError((err as Error).message || 'Failed to delete saved scan')
    } finally {
      setHistoryDeletingId(null)
    }
  }

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all saved scans? This cannot be undone.')) return
    try {
      setHistoryClearing(true)
      setHistoryError(null)
      const res = await fetch('/api/medical-images/history', { method: 'DELETE' })
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
      <PageHeader title="Medical Image Analyzer" />

      {/* Tabs */}
      <div className="max-w-7xl mx-auto w-full px-4 pt-4">
        <div className="bg-white rounded-t-xl border-b border-gray-200">
          <div className="flex">
            <Link
              href="/medical-images"
              style={{ width: '100%' }}
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                pathname !== '/medical-images/history'
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Medical Image Analyzer
            </Link>
            <Link
              href="/medical-images/history"
              style={{ width: '100%' }}
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                pathname === '/medical-images/history'
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
                <h1 className="text-2xl font-bold text-gray-900">Medical Image History</h1>
                <p className="text-xs text-gray-500 mt-1">Only scans you chose to save appear here.</p>
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
              <div className="text-sm text-gray-500">No saved scans yet.</div>
            )}

            <div className="mt-4 space-y-4">
              {historyItems.map((item) => {
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
                    <div className="flex flex-col gap-4 md:flex-row">
                      <div className="w-full md:w-36 flex-shrink-0">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt="Saved medical scan"
                            width={144}
                            height={144}
                            className="h-36 w-full rounded-lg object-cover border border-gray-100"
                          />
                        ) : (
                          <div className="h-36 w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
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
                        {item.summary && <p className="text-sm text-gray-800">{item.summary}</p>}
                        {!item.summary && item.analysisText && (
                          <p className="text-sm text-gray-800 whitespace-pre-line">{item.analysisText}</p>
                        )}

                        {isExpanded && (
                          <div className="pt-2 space-y-3 text-sm text-gray-700">
                            {possibleCauses.length > 0 && (
                              <div>
                                <div className="font-medium text-gray-900 mb-1">Likely conditions</div>
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
                            {item.analysisText && item.summary && (
                              <div>
                                <div className="font-medium text-gray-900 mb-1">Full notes</div>
                                <p className="whitespace-pre-line">{item.analysisText}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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
