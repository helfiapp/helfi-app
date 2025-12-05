'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import SectionChat from '../SectionChat'
import type { IssueSectionResult } from '@/lib/insights/issue-engine'

// Progress bar component: indeterminate shimmer to avoid misleading “stuck” states
function ProgressBar() {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-r from-helfi-green/30 via-helfi-green to-helfi-green/30 animate-pulse" />
    </div>
  )
}

type TabKey = 'working' | 'suggested' | 'avoid'

type NutritionExtras = {
  workingFocus?: Array<{ title: string; reason: string; example: string }>
  suggestedFocus?: Array<{ title: string; reason: string }>
  avoidFoods?: Array<{ name: string; reason: string }>
  totalLogged?: number
}

interface NutritionContextValue {
  result: IssueSectionResult
  loading: boolean
  error: string | null
  handleGenerate: () => Promise<void>
  isRefreshing: boolean
  issueSlug: string
  extras: NutritionExtras
}

const NutritionContext = createContext<NutritionContextValue | null>(null)

export function useNutritionContext() {
  const ctx = useContext(NutritionContext)
  if (!ctx) {
    throw new Error('useNutritionContext must be used within NutritionShell')
  }
  return ctx
}

interface NutritionShellProps {
  children: ReactNode
  initialResult: IssueSectionResult | null
  issueSlug: string
}

export default function NutritionShell({ children, initialResult, issueSlug }: NutritionShellProps) {
  const [result, setResult] = useState<IssueSectionResult | null>(initialResult)
  const [loading, setLoading] = useState(!initialResult)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [chargeNotice, setChargeNotice] = useState<string | null>(null)
  const segments = useSelectedLayoutSegments()
  const activeTab = (segments?.[0] as TabKey | undefined) ?? 'working'

  // Fetch data client-side if SSR returned null (cache miss)
  useEffect(() => {
    if (!initialResult) {
      setLoading(true)
      const scrollPosition = window.scrollY || document.documentElement.scrollTop
      // Save scroll position to prevent any scrolling
      sessionStorage.setItem(`scroll-${issueSlug}-nutrition`, scrollPosition.toString())
      
      fetch(`/api/insights/issues/${issueSlug}/sections/nutrition`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to load section')
          }
          return res.json()
        })
        .then((data) => {
          setResult(data)
          setLoading(false)
          // Prevent scroll - restore original position multiple times to ensure it sticks
          const preventScroll = () => {
            window.scrollTo(0, scrollPosition)
            document.documentElement.scrollTop = scrollPosition
            document.body.scrollTop = scrollPosition
          }
          preventScroll()
          requestAnimationFrame(preventScroll)
          setTimeout(preventScroll, 0)
          setTimeout(preventScroll, 50)
          setTimeout(preventScroll, 100)
          setTimeout(preventScroll, 200)
        })
        .catch((err) => {
          setError((err as Error).message)
          setLoading(false)
          const preventScroll = () => {
            window.scrollTo(0, scrollPosition)
            document.documentElement.scrollTop = scrollPosition
            document.body.scrollTop = scrollPosition
          }
          preventScroll()
          requestAnimationFrame(preventScroll)
          setTimeout(preventScroll, 0)
          setTimeout(preventScroll, 50)
        })
    }
  }, [initialResult, issueSlug])
  
  // Additional scroll prevention when result loads
  useEffect(() => {
    if (result && !loading) {
      // Prevent any auto-scrolling when result finishes loading
      const preventScroll = () => {
        const savedPosition = sessionStorage.getItem(`scroll-${issueSlug}-nutrition`)
        if (savedPosition) {
          const position = parseInt(savedPosition, 10)
          window.scrollTo(0, position)
          document.documentElement.scrollTop = position
          document.body.scrollTop = position
        }
      }
      preventScroll()
      requestAnimationFrame(preventScroll)
      setTimeout(preventScroll, 0)
      setTimeout(preventScroll, 100)
      setTimeout(preventScroll, 200)
    }
  }, [result, loading, issueSlug])

  async function handleGenerate() {
    setIsRefreshing(true)
    setError(null)
    setChargeNotice(null)
    try {
      const runId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `run_${Math.random().toString(36).slice(2)}`

      const regenResponse = await fetch('/api/insights/regenerate-targeted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeTypes: ['food'], runId }),
      })
      const regenData = await regenResponse.json().catch(() => null)
      if (!regenResponse.ok || !regenData?.success) {
        throw new Error(regenData?.message || 'Failed to refresh nutrition insights')
      }

      const res = await fetch(`/api/insights/issues/${issueSlug}/sections/nutrition`)
      if (!res.ok) throw new Error('Failed to load nutrition insights')
      const data = await res.json()
      setResult(data)

      if (typeof regenData.chargedCredits === 'number') {
        const costPart =
          typeof regenData.costCents === 'number'
            ? ` (AI cost ~$${(regenData.costCents / 100).toFixed(2)})`
            : ''
        setChargeNotice(
          regenData.chargedCredits > 0
            ? `Charged ${regenData.chargedCredits} credits${costPart}.`
            : 'Insights updated without any AI charges.'
        )
      }
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {
        // non-blocking
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to refresh nutrition insights')
    } finally {
      setIsRefreshing(false)
      setLoading(false)
    }
  }

  const extras = useMemo<NutritionExtras>(() => {
    if (!result) {
      return {
        workingFocus: [],
        suggestedFocus: [],
        avoidFoods: [],
        totalLogged: 0,
      }
    }
    const raw = (result.extras ?? {}) as NutritionExtras
    return {
      workingFocus: raw.workingFocus ?? [],
      suggestedFocus: raw.suggestedFocus ?? [],
      avoidFoods: raw.avoidFoods ?? [],
      totalLogged: raw.totalLogged ?? 0,
    }
  }, [result])

  const tabs: Array<{ key: TabKey; label: string; href: string }> = [
    { key: 'working', label: 'Foods That Are Working', href: `/insights/issues/${issueSlug}/nutrition/working` },
    { key: 'suggested', label: 'Suggested Foods', href: `/insights/issues/${issueSlug}/nutrition/suggested` },
    { key: 'avoid', label: 'Foods to Avoid', href: `/insights/issues/${issueSlug}/nutrition/avoid` },
  ]

  const contextValue = useMemo<NutritionContextValue>(() => {
    // Create minimal dummy result when null to satisfy context type
    const dummyResult: IssueSectionResult = result || {
      issue: { id: '', slug: issueSlug, name: '', polarity: 'negative', severityLabel: '', severityScore: null, currentRating: null, ratingScaleMax: null, trend: 'stable', trendDelta: null, lastUpdated: null, highlight: '', blockers: [], status: 'monitor' },
      section: 'nutrition',
      generatedAt: new Date().toISOString(),
      confidence: 0,
      summary: '',
      highlights: [],
      dataPoints: [],
      recommendations: [],
      mode: 'latest',
      extras: {},
    }
    return {
      result: dummyResult,
      loading,
      error,
      handleGenerate,
      isRefreshing,
      issueSlug,
      extras,
    }
  }, [result, loading, error, issueSlug, extras, isRefreshing])

  if (!result && loading) {
    return (
      <NutritionContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Nutrition report</h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">Preparing initial guidance...</p>
                <ProgressBar />
              </div>
            </div>
          </section>
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={`block rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  tab.key === activeTab
                    ? 'border-helfi-green bg-helfi-green text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-helfi-green/70 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div>{children}</div>
        </div>
      </NutritionContext.Provider>
    )
  }

  if (!result) {
    return (
      <NutritionContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Nutrition report</h2>
                <p className="text-sm text-red-600">{error || 'Failed to load section data'}</p>
              </div>
            </div>
          </section>
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={`block rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  tab.key === activeTab
                    ? 'border-helfi-green bg-helfi-green text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-helfi-green/70 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div>{children}</div>
        </div>
      </NutritionContext.Provider>
    )
  }

  return (
    <NutritionContext.Provider value={contextValue}>
      <div className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Nutrition report</h2>
              <p className="text-sm text-gray-700 leading-relaxed">
                {result.summary && !result.summary.toLowerCase().includes('couldn’t generate')
                  ? result.summary
                  : 'No nutrition insights yet. Click “Generate Nutrition Insights” to create them using your latest food diary entries.'}
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Generated {new Date(result.generatedAt).toLocaleString()} • Confidence {(result.confidence * 100).toFixed(0)}%
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={handleGenerate}
                disabled={isRefreshing}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isRefreshing ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-helfi-green text-white hover:bg-helfi-green/90'
                }`}
              >
                {isRefreshing ? 'Refreshing…' : 'Generate Nutrition Insights'}
              </button>
              <p className="text-xs text-gray-500">Credits will be charged after generation based on actual AI usage.</p>
              <p className="text-xs text-gray-500">Runs only on new/changed food diary entries.</p>
              {chargeNotice && (
                <p className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-3 py-2">
                  {chargeNotice}
                </p>
              )}
            </div>
          </div>
          {(isRefreshing || loading) && (
            <div className="mt-4">
              <ProgressBar />
              <p className="text-sm text-gray-600 mt-2">Updating nutrition insights...</p>
            </div>
          )}
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}
        </section>

        <nav className="space-y-2">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`block rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                tab.key === activeTab
                  ? 'border-helfi-green bg-helfi-green text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-helfi-green/70 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div>{children}</div>

        <SectionChat issueSlug={issueSlug} section="nutrition" issueName={result?.issue?.name ?? ''} />
      </div>
    </NutritionContext.Provider>
  )
}
