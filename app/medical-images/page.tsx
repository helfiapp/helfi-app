'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import PageHeader from '@/components/PageHeader'
import MedicalImageChat from './MedicalImageChat'

type ConfidenceLevel = 'low' | 'medium' | 'high'

type MedicalPossibleCause = {
  name: string
  whyLikely: string
  confidence: ConfidenceLevel | string
}

type MedicalAnalysisResult = {
  summary?: string | null
  possibleCauses?: MedicalPossibleCause[]
  redFlags?: string[]
  nextSteps?: string[]
  disclaimer?: string
  analysisText?: string
}

type MedicalHistoryItem = {
  id: string
  summary?: string | null
  analysisText?: string | null
  analysisData?: MedicalAnalysisResult | null
  createdAt: string
  imageUrl?: string | null
}

export default function MedicalImagesPage() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<MedicalAnalysisResult | null>(null)
  const [error, setError] = useState<string>('')
  const [saveToHistory, setSaveToHistory] = useState<boolean>(false)
  const [historyItems, setHistoryItems] = useState<MedicalHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState<boolean>(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historySaveError, setHistorySaveError] = useState<string | null>(null)
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null)
  const [historyClearing, setHistoryClearing] = useState<boolean>(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false)
  const [creditInfo, setCreditInfo] = useState<any>({
    dailyUsed: 0,
    dailyLimit: 0,
    additionalCredits: 0,
    plan: 'FREE',
    creditCost: 2, // Medical image analysis costs 2 credits
    featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
  })
  const [usageMeterRefresh, setUsageMeterRefresh] = useState<number>(0) // Trigger for UsageMeter refresh
  const [hasPaidAccess, setHasPaidAccess] = useState<boolean>(false)
  const [hasAnalyzedCurrentImage, setHasAnalyzedCurrentImage] = useState<boolean>(false)
  const [analysisSessionId, setAnalysisSessionId] = useState<number>(0)
  const resultRef = useRef<HTMLDivElement | null>(null)

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setAnalysis(null)
      setAnalysisResult(null)
      setError('')
      setHistorySaveError(null)
      setHasAnalyzedCurrentImage(false)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  useEffect(() => {
    const fetchCreditStatus = async () => {
      try {
        const res = await fetch(`/api/credit/status?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const isPremium = data?.plan === 'PREMIUM'
        const hasWalletCredits =
          typeof data?.totalAvailableCents === 'number' && data.totalAvailableCents > 0
        const hasLegacyCredits =
          typeof data?.credits?.total === 'number' && data.credits.total > 0

        setHasPaidAccess(Boolean(isPremium || hasWalletCredits || hasLegacyCredits))
      } catch {
        // ignore failures – fall back to showing free banner
      }
    }
    fetchCreditStatus()
  }, [usageMeterRefresh])

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

  const handleAnalyze = async () => {
    if (!imageFile) {
      setError('Please select an image first')
      return
    }
    if (hasAnalyzedCurrentImage) {
      setError('This image has already been analyzed. Reset to analyze a new image.')
      return
    }

    setError('')
    setAnalysis(null)
    setAnalysisResult(null)
    setIsAnalyzing(true)
    setHasAnalyzedCurrentImage(false)
    setHistorySaveError(null)

    try {
      const formData = new FormData()
      formData.append('image', imageFile)
      formData.append('saveToHistory', saveToHistory ? 'true' : 'false')

      const response = await fetch('/api/test-vision', {
        method: 'POST',
        body: formData,
      })

      if (response.status === 402) {
        const data = await response.json()
        setCreditInfo({
          dailyUsed: 0,
          dailyLimit: 0,
          additionalCredits: data.additionalCredits ?? 0,
          plan: data.plan ?? 'FREE',
          creditCost: 2,
          featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
        })
        setShowCreditsModal(true)
        setIsAnalyzing(false)
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || data?.message || 'Failed to analyze image')
      }

      const result = await response.json()
      if (result.success) {
        const analysisText = typeof result.analysis === 'string' ? result.analysis : null
        const possibleCauses = Array.isArray(result.possibleCauses) ? result.possibleCauses : []
        const redFlags = Array.isArray(result.redFlags) ? result.redFlags : []
        const nextSteps = Array.isArray(result.nextSteps) ? result.nextSteps : []
        const hasStructured =
          Boolean(result.summary) ||
          possibleCauses.length > 0 ||
          redFlags.length > 0 ||
          nextSteps.length > 0

        if (!analysisText && !hasStructured) {
          throw new Error('Invalid response from server')
        }

        if (analysisText) {
          setAnalysis(analysisText)
        }

        const structured: MedicalAnalysisResult = {
          summary: result.summary ?? null,
          possibleCauses,
          redFlags,
          nextSteps,
          disclaimer:
            result.disclaimer ||
            'This analysis is for information only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition.',
          analysisText: analysisText ?? undefined,
        }
        if (analysisText || hasStructured) {
          setAnalysisResult(structured)
        }
        setAnalysisSessionId(prev => prev + 1)
        setHasAnalyzedCurrentImage(true)
        // Trigger usage meter refresh after successful analysis
        setUsageMeterRefresh(prev => prev + 1)
        try { window.dispatchEvent(new Event('credits:refresh')); } catch {}

        if (saveToHistory) {
          if (result.historySaved && result.historyItem) {
            setHistoryItems((prev) => [
              result.historyItem,
              ...prev.filter((item) => item.id !== result.historyItem.id),
            ])
          } else if (result.historyError) {
            setHistorySaveError(result.historyError)
          } else if (!result.historySaved) {
            setHistorySaveError('We could not save this scan to your history.')
          }
        }
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleReset = () => {
    setImageFile(null)
    setImagePreview(null)
    setAnalysis(null)
    setAnalysisResult(null)
    setError('')
    setHasAnalyzedCurrentImage(false)
  }

  useEffect(() => {
    if (!analysisResult) return
    const el = resultRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [analysisResult])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="Medical Image Analyzer" />

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto w-full px-0 sm:px-4 md:max-w-3xl md:px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Medical Image Analyzer</h1>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h2 className="text-sm font-semibold text-blue-900 mb-2">What is this feature?</h2>
              <p className="text-sm text-blue-800 mb-2">
                Our AI-powered Medical Image Analyzer helps you understand medical images by providing detailed analysis and insights. 
                Upload photos of various medical conditions and receive AI-generated descriptions and observations.
              </p>
              <p className="text-sm text-blue-800 font-medium mb-1">Perfect for analyzing:</p>
              <ul className="text-sm text-blue-800 list-disc list-inside space-y-1 ml-2">
                <li>Skin conditions (rashes, hives, eczema, psoriasis)</li>
                <li>Skin anomalies (moles, lesions, growths)</li>
                <li>X-rays and medical scans</li>
                <li>Wounds and injuries</li>
                <li>Eye conditions</li>
                <li>Nail abnormalities</li>
                <li>Other visible medical concerns</li>
              </ul>
              <p className="text-xs text-blue-700 mt-3 italic">
                ⚠️ This tool provides informational analysis only and is not a substitute for professional medical advice, diagnosis, or treatment.
              </p>
            </div>

            {/* Image Upload */}
            <div className="mb-4">
              {!imagePreview ? (
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-auto rounded-lg border border-gray-200 max-h-96 object-contain bg-gray-50"
                  />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                    aria-label="Remove image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">{error}</div>
            )}

            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={saveToHistory}
                  onChange={(e) => setSaveToHistory(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-helfi-green focus:ring-helfi-green"
                />
                Save this scan to my history
              </label>
              <p className="text-xs text-gray-500">
                Saved scans include the image and analysis. Stored in Vercel Blob (AES-256 at rest, HTTPS in transit) and tied to your account.
                You can delete them anytime. Leave this off to keep this scan private.
              </p>
              {historySaveError && (
                <p className="text-xs text-amber-700">{historySaveError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                disabled={!imageFile || isAnalyzing || hasAnalyzedCurrentImage}
                className={`flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                  !imageFile || isAnalyzing || hasAnalyzedCurrentImage
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-helfi-green hover:bg-helfi-green/90'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  'Analyze Image'
                )}
              </button>
              {imagePreview && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">Cost: 8 credits per analysis</p>
              {!hasPaidAccess && (
                <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-2">
                  Free accounts can try this AI feature once. After your free analysis, upgrade or buy credits to continue.
                </div>
              )}
              <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
              <FeatureUsageDisplay featureName="medicalImageAnalysis" featureLabel="Medical Image Analysis" refreshTrigger={usageMeterRefresh} />
            </div>

            {/* Analysis Results */}
            {(analysisResult || analysis) && (
              <div
                ref={resultRef}
                className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 md:p-6 space-y-4"
              >
                <h2 className="text-lg font-semibold text-gray-900">Analysis Results</h2>

                {/* Summary */}
                {analysisResult?.summary && (
                  <section>
                    <h3 className="font-medium text-gray-900 mb-1">Summary</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {analysisResult.summary}
                    </p>
                  </section>
                )}

                {/* Likely conditions (visually ranked: high → medium → low) */}
                {Array.isArray(analysisResult?.possibleCauses) &&
                  analysisResult.possibleCauses.length > 0 && (
                    <section>
                      <h3 className="font-medium text-gray-900 mb-2">Likely conditions</h3>
                      <ul className="space-y-2">
                        {(() => {
                          const sorted = [...analysisResult.possibleCauses].sort((a, b) => {
                            const weight: Record<string, number> = { high: 3, medium: 2, low: 1 }
                            const wa = weight[(a.confidence || 'medium').toLowerCase()] ?? 2
                            const wb = weight[(b.confidence || 'medium').toLowerCase()] ?? 2
                            return wb - wa
                          })

                          const hasExplicitHigh = sorted.some(
                            (c) => String(c.confidence || '').toLowerCase() === 'high'
                          )

                          return sorted.map((c, idx) => {
                            const raw = String(c.confidence || '').toLowerCase()

                            // Normalise so there is always a clear "high" at the top
                            // and a "low" at the bottom if we have more than one item.
                            let level: ConfidenceLevel
                            if (hasExplicitHigh) {
                              // Respect the model's explicit labelling when a high is present.
                              level =
                                raw === 'high' || raw === 'medium' || raw === 'low'
                                  ? (raw as ConfidenceLevel)
                                  : 'medium'
                            } else if (sorted.length === 1) {
                              level = 'high'
                            } else if (idx === 0) {
                              level = 'high'
                            } else if (idx === sorted.length - 1) {
                              level = 'low'
                            } else {
                              level = 'medium'
                            }

                            const badgeClasses =
                              level === 'high'
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : level === 'low'
                                ? 'bg-gray-100 text-gray-700 border-gray-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'

                            return (
                              <li
                                key={`${c.name}-${idx}`}
                                className="p-3 border border-gray-200 rounded-lg bg-white"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-medium text-gray-900">{c.name}</div>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full border ${badgeClasses}`}
                                  >
                                    {level}
                                  </span>
                                </div>
                                {c.whyLikely && (
                                  <div className="mt-1 text-sm text-gray-700">
                                    {c.whyLikely}
                                  </div>
                                )}
                              </li>
                            )
                          })
                        })()}
                      </ul>
                    </section>
                  )}

                {/* Red flags */}
                {Array.isArray(analysisResult?.redFlags) && analysisResult.redFlags.length > 0 && (
                  <section>
                    <h3 className="font-medium text-red-700 mb-2">Red‑flag signs to watch for</h3>
                    <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                      {analysisResult.redFlags.map((rf, idx) => (
                        <li key={idx}>{rf}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Next steps */}
                {Array.isArray(analysisResult?.nextSteps) && analysisResult.nextSteps.length > 0 && (
                  <section>
                    <h3 className="font-medium text-gray-900 mb-2">What to do next</h3>
                    <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                      {analysisResult.nextSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Fallback detailed explanation if we have raw text but no structure */}
                {!analysisResult?.summary &&
                  (!analysisResult?.possibleCauses ||
                    analysisResult.possibleCauses.length === 0) &&
                  analysis && (
                    <section>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{analysis}</p>
                    </section>
                  )}

                {/* Disclaimer */}
                <div className="mt-2 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <strong>⚠️ Important:</strong>{' '}
                  {analysisResult?.disclaimer ||
                    'This analysis is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition.'}
                </div>
              </div>
            )}

            {/* Medical image chat – follows the analysis and is pre‑aware of it.
                We key it by a simple incrementing session so the chat fully resets
                whenever a new analysis is completed. */}
            {analysisResult && (
              <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
                <MedicalImageChat key={analysisSessionId} analysisResult={analysisResult} />
              </div>
            )}

            {/* History */}
            <div className="mt-8">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">History</h2>
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
              <p className="text-xs text-gray-500 mt-1">
                Only scans you choose to save appear here.
              </p>

              {historyLoading && (
                <div className="mt-3 text-sm text-gray-500">Loading history...</div>
              )}
              {historyError && (
                <div className="mt-3 text-sm text-red-700">{historyError}</div>
              )}
              {!historyLoading && !historyError && historyItems.length === 0 && (
                <div className="mt-3 text-sm text-gray-500">No saved scans yet.</div>
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
                          {item.summary && (
                            <p className="text-sm text-gray-800">{item.summary}</p>
                          )}
                          {!item.summary && item.analysisText && (
                            <p className="text-sm text-gray-800 whitespace-pre-line">
                              {item.analysisText}
                            </p>
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
        </div>
      </main>

      {/* Mobile Bottom Spacing */}
      <div className="h-20 md:h-0" />

      {/* Credit Modal */}
      <CreditPurchaseModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        creditInfo={creditInfo}
      />

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link href="/dashboard" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Dashboard</span>
          </Link>
          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Insights</span>
          </Link>
          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Food</span>
          </Link>
          <MobileMoreMenu />
          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
