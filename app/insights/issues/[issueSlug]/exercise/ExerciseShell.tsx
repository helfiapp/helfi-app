'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSelectedLayoutSegments } from 'next/navigation'
import SectionChat from '../SectionChat'
import type { IssueSectionResult } from '@/lib/insights/issue-engine'

type TabKey = 'working' | 'suggested' | 'avoid'

type ExerciseExtras = {
  workingActivities?: Array<{ title: string; reason: string; summary: string; lastLogged: string }>
  suggestedActivities?: Array<{ title: string; reason: string }>
  avoidActivities?: Array<{ title: string; reason: string }>
  totalLogged?: number
}

interface ExerciseContextValue {
  result: IssueSectionResult
  loading: boolean
  error: string | null
  handleGenerate: (mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) => Promise<void>
  issueSlug: string
  extras: ExerciseExtras
}

const ExerciseContext = createContext<ExerciseContextValue | null>(null)

export function useExerciseContext() {
  const ctx = useContext(ExerciseContext)
  if (!ctx) {
    throw new Error('useExerciseContext must be used within ExerciseShell')
  }
  return ctx
}

interface ExerciseShellProps {
  children: ReactNode
  initialResult: IssueSectionResult | null
  issueSlug: string
}

export default function ExerciseShell({ children, initialResult, issueSlug }: ExerciseShellProps) {
  const [result, setResult] = useState<IssueSectionResult | null>(initialResult)
  const [loading, setLoading] = useState(!initialResult)
  const [error, setError] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const segments = useSelectedLayoutSegments()
  const activeTab = (segments?.[0] as TabKey | undefined) ?? 'working'

  // Fetch data client-side if SSR returned null (cache miss)
  useEffect(() => {
    if (!initialResult) {
      setLoading(true)
      fetch(`/api/insights/issues/${issueSlug}/sections/exercise`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to load section')
          }
          return res.json()
        })
        .then((data) => {
          setResult(data)
          setLoading(false)
        })
        .catch((err) => {
          setError((err as Error).message)
          setLoading(false)
        })
    }
  }, [initialResult, issueSlug])

  async function handleGenerate(mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/insights/issues/${issueSlug}/sections/exercise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, range }),
      })
      if (!response.ok) {
        throw new Error('Unable to generate report right now.')
      }
      const data = await response.json()
      if (data?.result) {
        setResult(data.result as IssueSectionResult)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const extras = useMemo<ExerciseExtras>(() => {
    if (!result) {
      return {
        workingActivities: [],
        suggestedActivities: [],
        avoidActivities: [],
        totalLogged: 0,
      }
    }
    const raw = (result.extras ?? {}) as ExerciseExtras
    return {
      workingActivities: raw.workingActivities ?? [],
      suggestedActivities: raw.suggestedActivities ?? [],
      avoidActivities: raw.avoidActivities ?? [],
      totalLogged: raw.totalLogged ?? 0,
    }
  }, [result])

  const tabs: Array<{ key: TabKey; label: string; href: string }> = [
    { key: 'working', label: "Exercise That's Working", href: `/insights/issues/${issueSlug}/exercise/working` },
    { key: 'suggested', label: 'Suggested Exercise', href: `/insights/issues/${issueSlug}/exercise/suggested` },
    { key: 'avoid', label: 'Exercise to Avoid', href: `/insights/issues/${issueSlug}/exercise/avoid` },
  ]

  const contextValue = useMemo<ExerciseContextValue>(() => {
    // Create minimal dummy result when null to satisfy context type
    const dummyResult: IssueSectionResult = result || {
      issue: { id: '', slug: issueSlug, name: '', polarity: 'negative', severityLabel: '', severityScore: null, currentRating: null, ratingScaleMax: null, trend: 'stable', trendDelta: null, lastUpdated: null, highlight: '', blockers: [], status: 'monitor' },
      section: 'exercise',
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
      <ExerciseContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Exercise report</h2>
                <p className="text-sm text-gray-700 leading-relaxed">Preparing initial guidance...</p>
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
      </ExerciseContext.Provider>
    )
  }

  if (!result) {
    return (
      <ExerciseContext.Provider value={contextValue}>
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Exercise report</h2>
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
      </ExerciseContext.Provider>
    )
  }

  return (
    <ExerciseContext.Provider value={contextValue}>
      <div className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Exercise report</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              <p className="text-xs text-gray-500 mt-3">
                Generated {new Date(result.generatedAt).toLocaleString()} • Confidence {(result.confidence * 100).toFixed(0)}%
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleGenerate('daily')}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-helfi-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? 'Generating…' : 'Daily report'}
                </button>
                <button
                  onClick={() => handleGenerate('weekly')}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-helfi-green/40 px-4 py-2 text-sm font-semibold text-helfi-green disabled:opacity-60"
                >
                  Weekly report
                </button>
                <button
                  onClick={() => setCustomOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  Custom range
                </button>
              </div>
              {error && <p className="text-xs text-rose-600 max-w-xs">{error}</p>}
            </div>
          </div>
          {customOpen && (
            <form
              className="mt-4 flex flex-col gap-3 md:flex-row md:items-end"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!customFrom || !customTo) {
                  setError('Select both start and end dates for a custom report.')
                  return
                }
                await handleGenerate('custom', { from: customFrom, to: customTo })
                setCustomOpen(false)
              }}
            >
              <label className="text-xs uppercase text-gray-500 tracking-wide">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  required
                />
              </label>
              <label className="text-xs uppercase text-gray-500 tracking-wide">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </form>
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

        <SectionChat issueSlug={issueSlug} section="exercise" issueName={result?.issue?.name ?? ''} />
      </div>
    </ExerciseContext.Provider>
  )
}
