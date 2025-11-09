'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import SectionChat from '../SectionChat'
import type { IssueSectionResult } from '@/lib/insights/issue-engine'

// Progress bar component that animates smoothly to 100%
function ProgressBar() {
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    // Smooth animation: start at 0%, gradually increase to 100%
    // Use a more realistic curve that slows down as it approaches 100%
    let startTime: number | null = null
    const duration = 3000 // 3 seconds total animation
    const targetProgress = 100
    
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const elapsed = timestamp - startTime
      const progressRatio = Math.min(elapsed / duration, 1)
      
      // Ease-out curve: fast start, slow end
      const eased = 1 - Math.pow(1 - progressRatio, 3)
      const currentProgress = eased * targetProgress
      
      setProgress(currentProgress)
      
      if (progressRatio < 1) {
        requestAnimationFrame(animate)
      } else {
        // Once at 100%, stay there (no pulsing)
        setProgress(100)
      }
    }
    
    requestAnimationFrame(animate)
  }, [])
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className="bg-helfi-green h-2 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(progress, 100)}%` }}
      ></div>
    </div>
  )
}

type TabKey = 'working' | 'suggested' | 'avoid'

type SupplementsExtras = {
  supportiveDetails?: Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>
  suggestedAdditions?: Array<{ title: string; reason: string; suggestion: string | null; alreadyCovered?: boolean }>
  avoidList?: Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>
  missingDose?: string[]
  missingTiming?: string[]
  totalLogged?: number
  source?: 'llm' | 'llm-error'
}

interface SupplementsContextValue {
  result: IssueSectionResult
  loading: boolean
  error: string | null
  handleGenerate: (mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) => Promise<void>
  issueSlug: string
  extras: SupplementsExtras
}

const SupplementsContext = createContext<SupplementsContextValue | null>(null)

export function useSupplementsContext() {
  const ctx = useContext(SupplementsContext)
  if (!ctx) {
    throw new Error('useSupplementsContext must be used within SupplementsShell')
  }
  return ctx
}

interface SupplementsShellProps {
  children: ReactNode
  initialResult: IssueSectionResult | null
  issueSlug: string
}

export default function SupplementsShell({ children, initialResult, issueSlug }: SupplementsShellProps) {
  const [result, setResult] = useState<IssueSectionResult | null>(initialResult)
  const [loading, setLoading] = useState(!initialResult)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const segments = useSelectedLayoutSegments()
  const activeTab = (segments?.[0] as TabKey | undefined) ?? 'working'

  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsUpdating(true)
    try {
      const response = await fetch('/api/insights/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (response.ok) {
        // Wait a moment, then refresh the page to show updated insights
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to update insights. Please try again.')
        setIsUpdating(false)
      }
    } catch (error) {
      console.error('Error updating insights:', error)
      alert('Failed to update insights. Please try again.')
      setIsUpdating(false)
    }
  }

  // Fetch data client-side if SSR returned null (cache miss)
  useEffect(() => {
    if (!initialResult) {
      setLoading(true)
      const scrollPosition = window.scrollY || document.documentElement.scrollTop
      // Save scroll position to prevent any scrolling
      sessionStorage.setItem(`scroll-${issueSlug}-supplements`, scrollPosition.toString())
      
      fetch(`/api/insights/issues/${issueSlug}/sections/supplements`)
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
        const savedPosition = sessionStorage.getItem(`scroll-${issueSlug}-supplements`)
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

  const extras = useMemo<SupplementsExtras>(() => {
    if (!result) {
      return {
        supportiveDetails: [],
        suggestedAdditions: [],
        avoidList: [],
        missingDose: [],
        missingTiming: [],
        totalLogged: 0,
      }
    }
    const raw = (result.extras ?? {}) as SupplementsExtras
    return {
      supportiveDetails: raw.supportiveDetails ?? [],
      suggestedAdditions: raw.suggestedAdditions ?? [],
      avoidList: raw.avoidList ?? [],
      missingDose: raw.missingDose ?? [],
      missingTiming: raw.missingTiming ?? [],
      totalLogged: raw.totalLogged ?? 0,
    }
  }, [result])

  const tabs: Array<{ key: TabKey; label: string; href: string }>
    = [
      { key: 'working', label: "What's Working", href: `/insights/issues/${issueSlug}/supplements/working` },
      { key: 'suggested', label: 'Suggested Supplements', href: `/insights/issues/${issueSlug}/supplements/suggested` },
      { key: 'avoid', label: 'Supplements to Avoid', href: `/insights/issues/${issueSlug}/supplements/avoid` },
    ]

  const contextValue = useMemo<SupplementsContextValue>(() => {
    // Create minimal dummy result when null to satisfy context type
    const dummyResult: IssueSectionResult = result || {
      issue: { id: '', slug: issueSlug, name: '', polarity: 'negative', severityLabel: '', severityScore: null, currentRating: null, ratingScaleMax: null, trend: 'stable', trendDelta: null, lastUpdated: null, highlight: '', blockers: [], status: 'monitor' },
      section: 'supplements',
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
      <SupplementsContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Supplements report</h2>
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
      </SupplementsContext.Provider>
    )
  }

  if (!result) {
    return (
      <SupplementsContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Supplements report</h2>
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
      </SupplementsContext.Provider>
    )
  }

  return (
    <SupplementsContext.Provider value={contextValue}>
      <div className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Supplements report</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              <p className="text-xs text-gray-500 mt-3">
                Generated {new Date(result.generatedAt).toLocaleString()} • Confidence {(result.confidence * 100).toFixed(0)}%
              </p>
            </div>
            <button
              onClick={handleUpdateInsights}
              disabled={isUpdating}
              className="px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed font-medium text-sm whitespace-nowrap"
            >
              {isUpdating ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                  Updating...
                </>
              ) : (
                'Update Insights'
              )}
            </button>
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

        <SectionChat issueSlug={issueSlug} section="supplements" issueName={result?.issue?.name ?? ''} />
      </div>
    </SupplementsContext.Provider>
  )
}
