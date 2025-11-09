'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import SectionChat from '../SectionChat'
import type { IssueSectionResult } from '@/lib/insights/issue-engine'

// Progress bar component that animates through stages
function ProgressBar() {
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    // Animate progress bar through stages: 0% -> 30% -> 60% -> 85% -> 95% -> 100%
    const stages = [30, 60, 85, 95, 100]
    let currentStage = 0
    
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgress(stages[currentStage])
        currentStage++
      } else {
        // Once at 100%, pulse between 95-100% to show it's still working
        setProgress(prev => prev === 100 ? 95 : 100)
      }
    }, 800) // Change stage every 800ms
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className="bg-helfi-green h-2 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      ></div>
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
  handleGenerate: (mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) => Promise<void>
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

  async function handleGenerate(mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) {
    // This function is kept for backward compatibility but is no longer used
    // Insights are now updated via Update button on health data pages
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
      issueSlug,
      extras,
    }
  }, [result, loading, error, issueSlug, extras])

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
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              <p className="text-xs text-gray-500 mt-3">
                Generated {new Date(result.generatedAt).toLocaleString()} • Confidence {(result.confidence * 100).toFixed(0)}%
              </p>
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

        <SectionChat issueSlug={issueSlug} section="nutrition" issueName={result?.issue?.name ?? ''} />
      </div>
    </NutritionContext.Provider>
  )
}
