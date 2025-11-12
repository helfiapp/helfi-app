'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import SectionChat from '../SectionChat'
import type { IssueSectionResult } from '@/lib/insights/issue-engine'

// Accurate progress bar that polls status endpoint
function RegenerationProgressBar({ issueSlug, onComplete }: { issueSlug: string; onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'starting' | 'generating' | 'complete'>('starting')
  const [startTime] = useState(Date.now())
  
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isComplete = false
    
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/insights/issues/${issueSlug}/sections/supplements`)
        if (!response.ok) return
        
        const data = await response.json()
        const meta = data._meta || {}
        const currentStatus = meta.status || 'missing'
        
        // Calculate progress based on elapsed time
        const elapsed = Date.now() - startTime
        const elapsedSeconds = elapsed / 1000
        
        // Realistic estimate: 60-120 seconds for full generation
        // Progress calculation:
        // - 0-10s: 0-20% (initialization)
        // - 10-60s: 20-85% (main generation phase)
        // - 60-120s: 85-95% (finalization)
        // - Only reach 100% when status is 'fresh'
        
        let timeBasedProgress = 0
        if (elapsedSeconds < 10) {
          timeBasedProgress = (elapsedSeconds / 10) * 20 // 0-20%
        } else if (elapsedSeconds < 60) {
          timeBasedProgress = 20 + ((elapsedSeconds - 10) / 50) * 65 // 20-85%
        } else if (elapsedSeconds < 120) {
          timeBasedProgress = 85 + ((elapsedSeconds - 60) / 60) * 10 // 85-95%
        } else {
          timeBasedProgress = 95 // Cap at 95% until actually complete
        }
        
        // Update status
        if (currentStatus === 'fresh' || currentStatus === 'complete') {
          setStatus('complete')
          setProgress(100)
          isComplete = true
          if (pollInterval) clearInterval(pollInterval)
          if (timeoutId) clearTimeout(timeoutId)
          // Wait a moment for UI to show 100%, then call onComplete
          setTimeout(() => {
            onComplete()
          }, 500)
          return
        } else if (currentStatus === 'generating' || currentStatus === 'stale') {
          setStatus('generating')
          setProgress(Math.min(timeBasedProgress, 95)) // Cap at 95% until complete
        } else {
          setStatus('generating')
          setProgress(Math.min(timeBasedProgress, 95))
        }
      } catch (error) {
        console.error('Error polling status:', error)
        // Continue polling even on error
      }
    }
    
    // Start polling immediately, then every 2 seconds
    pollStatus()
    pollInterval = setInterval(pollStatus, 2000)
    
    // Safety timeout: if still not complete after 3 minutes, assume complete
    timeoutId = setTimeout(() => {
      if (!isComplete) {
        console.warn('Regeneration timeout - assuming complete')
        setStatus('complete')
        setProgress(100)
        if (pollInterval) clearInterval(pollInterval)
        setTimeout(() => {
          onComplete()
        }, 500)
      }
    }, 180000) // 3 minutes max
    
    return () => {
      if (pollInterval) clearInterval(pollInterval)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [issueSlug, startTime, onComplete])
  
  return (
    <div className="w-full">
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
        <div 
          className="bg-helfi-green h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        ></div>
      </div>
      <p className="text-xs text-gray-600">
        {status === 'complete' 
          ? '✓ Regeneration complete!' 
          : `Regenerating insights... This may take 1-2 minutes.`}
      </p>
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
  const [isRegenerating, setIsRegenerating] = useState(false)
  const segments = useSelectedLayoutSegments()
  const activeTab = (segments?.[0] as TabKey | undefined) ?? 'working'

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
    try {
      setIsRegenerating(true)
      setError(null)
      
      // Start regeneration (non-blocking - returns immediately)
      const response = await fetch(`/api/insights/issues/${issueSlug}/sections/supplements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode, range, force: true }),
      })
      
      if (!response.ok) {
        throw new Error('Unable to start regeneration right now.')
      }
      
      // Note: We don't wait for completion here - the progress bar will poll for status
      // and call handleRegenerationComplete when done
    } catch (err) {
      setError((err as Error).message)
      setIsRegenerating(false)
    }
  }
  
  async function handleRegenerationComplete() {
    try {
      // Fetch the updated result
      const response = await fetch(`/api/insights/issues/${issueSlug}/sections/supplements`, {
        cache: 'no-cache',
      })
      if (response.ok) {
        const data = await response.json()
        setResult(data)
      }
    } catch (err) {
      console.error('Error fetching regenerated result:', err)
    } finally {
      setIsRegenerating(false)
    }
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
