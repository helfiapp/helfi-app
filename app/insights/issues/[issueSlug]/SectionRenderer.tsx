'use client'

import { useState } from 'react'
import type { IssueSectionKey, IssueSectionResult } from '@/lib/insights/issue-engine'
import SectionChat from './SectionChat'

interface SectionRendererProps {
  issueSlug: string
  section: IssueSectionKey
  initialResult: IssueSectionResult
  view?: 'overview' | 'working'
  tabs?: Array<{ label: string; href: string; active: boolean }>
}

export default function SectionRenderer({ issueSlug, section, initialResult, view = 'overview', tabs }: SectionRendererProps) {
  const [result, setResult] = useState<IssueSectionResult>(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  async function handleGenerate(mode: 'daily' | 'weekly' | 'custom', range?: { from?: string; to?: string }) {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode, range }),
      })
      if (!response.ok) {
        throw new Error('Unable to generate report right now.')
      }
      const data = await response.json()
      setResult(data?.result ?? data)
      if (mode === 'custom') {
        setCustomOpen(false)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const supplementsExtras =
    section === 'supplements' && typeof result.extras === 'object'
      ? (result.extras as {
          supportiveDetails?: Array<{ name: string; reason: string; dosage: string | null; timing: string[] }>
          otherSupplements?: Array<{ name: string; dosage: string | null; timing: string[] }>
          missingDose?: string[]
          missingTiming?: string[]
          totalLogged?: number
        })
      : undefined

  return (
    <div className="space-y-8">
      {tabs && tabs.length > 0 && (
        <nav className="bg-white border border-gray-200 rounded-2xl shadow-sm p-2 flex gap-2">
          {tabs.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className={`flex-1 text-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab.active ? 'bg-helfi-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      )}

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2 capitalize">
              {view === 'working' ? "What's working" : section === 'overview' ? 'Section summary' : `${section} insights`}
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
            <p className="text-xs text-gray-500 mt-3">
              Mode: {formatReportMode(result.mode)}
              {result.range?.from || result.range?.to ? ` • ${formatRange(result.range)}` : ''}
            </p>
            <p className="text-xs text-gray-500 mt-1">
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
            {customOpen && (
              <form
                className="flex flex-col md:flex-row md:items-center gap-2 mt-2"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!customFrom || !customTo) {
                    setError('Select both start and end dates for a custom report.')
                    return
                  }
                  await handleGenerate('custom', { from: customFrom, to: customTo })
                }}
              >
                <label className="text-xs uppercase text-gray-500 tracking-wide">
                  From
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs uppercase text-gray-500 tracking-wide">
                  To
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Generate
                </button>
              </form>
            )}
            {error && <p className="text-xs text-rose-600 max-w-xs">{error}</p>}
          </div>
        </div>
      </section>

      {result.highlights.length > 0 && view !== 'working' && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Key signals</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {result.highlights.map((highlight, idx) => (
              <div
                key={`${highlight.title}-${idx}`}
                className={`rounded-xl border p-4 ${
                  highlight.tone === 'warning'
                    ? 'border-rose-200 bg-rose-50/60 text-rose-700'
                    : highlight.tone === 'positive'
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                <h4 className="text-sm font-semibold mb-1">{highlight.title}</h4>
                <p className="text-sm leading-relaxed">{highlight.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {result.dataPoints.length > 0 && view !== 'working' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Data points</h3>
          <dl className="grid gap-4 md:grid-cols-2">
            {result.dataPoints.map((datum, idx) => (
              <div key={`${datum.label}-${idx}`} className="bg-gray-50/70 rounded-lg p-4">
                <dt className="text-xs uppercase text-gray-500 tracking-wide">{datum.label}</dt>
                <dd className="text-base font-semibold text-gray-900">{datum.value}</dd>
                {datum.context && <p className="text-xs text-gray-500 mt-1">{datum.context}</p>}
              </div>
            ))}
          </dl>
        </section>
      )}

      {result.recommendations.length > 0 && view !== 'working' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Recommendations</h3>
          <div className="space-y-4">
            {result.recommendations.map((recommendation, idx) => (
              <div key={`${recommendation.title}-${idx}`} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">{recommendation.title}</h4>
                    <p className="text-sm text-gray-700 mt-1 leading-relaxed">{recommendation.description}</p>
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${priorityBadgeColor(recommendation.priority)}`}>
                    {recommendation.priority === 'now' ? 'High Priority' : recommendation.priority === 'soon' ? 'Next Focus' : 'Monitor'}
                  </span>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
                  {recommendation.actions.map((action, actionIdx) => (
                    <li key={actionIdx}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === 'working' && supplementsExtras?.supportiveDetails && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <header>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Supplements that are helping</h3>
            <p className="mt-1 text-sm text-gray-600">
              These supplements match research-backed patterns for {result.issue.name.toLowerCase()} support. Staying consistent and tracking symptoms will help confirm their impact.
            </p>
          </header>
          <div className="space-y-3">
            {supplementsExtras.supportiveDetails.length > 0 ? (
              supplementsExtras.supportiveDetails.map((supplement, index) => (
                <div key={`${supplement.name}-${index}`} className="border border-emerald-200 bg-emerald-50/70 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{supplement.name}</h4>
                      <p className="text-sm text-emerald-700 mt-1 leading-relaxed">{supplement.reason}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
                    <div>
                      <dt className="text-xs uppercase text-gray-500 tracking-wide">Dose</dt>
                      <dd>{supplement.dosage || 'Not logged yet'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-gray-500 tracking-wide">Timing</dt>
                      <dd>{supplement.timing.length ? supplement.timing.join(', ') : 'Add timing so we can flag spacing tips'}</dd>
                    </div>
                  </dl>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-600">Nothing in your stack currently lines up with common supportive nutrients for this issue. Add or update supplements to see targeted guidance here.</p>
            )}
          </div>

          {supplementsExtras?.otherSupplements && supplementsExtras.otherSupplements.length > 0 && (
            <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Other supplements in your stack</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                {supplementsExtras.otherSupplements.map((supplement, index) => (
                  <li key={`${supplement.name}-${index}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span>{supplement.name}</span>
                    <span className="text-xs text-gray-500">
                      {supplement.dosage || 'dose not logged'} • {supplement.timing?.length ? supplement.timing.join(', ') : 'timing not logged'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(supplementsExtras?.missingDose?.length || supplementsExtras?.missingTiming?.length) && (
            <div className="border border-amber-200 bg-amber-50/70 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-1">Complete your logs</h4>
              <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                {supplementsExtras?.missingDose?.length ? (
                  <li>Log dose amounts for {summariesList(supplementsExtras.missingDose)}</li>
                ) : null}
                {supplementsExtras?.missingTiming?.length ? (
                  <li>Add timing details for {summariesList(supplementsExtras.missingTiming)}</li>
                ) : null}
              </ul>
            </div>
          )}
        </section>
      )}

      <SectionChat issueSlug={issueSlug} section={section} issueName={result.issue.name} />
    </div>
  )
}

function priorityBadgeColor(priority: 'now' | 'soon' | 'monitor') {
  switch (priority) {
    case 'now':
      return 'text-rose-600'
    case 'soon':
      return 'text-amber-600'
    default:
      return 'text-emerald-600'
  }
}

function formatReportMode(mode?: IssueSectionResult['mode']) {
  switch (mode) {
    case 'daily':
      return 'Daily snapshot'
    case 'weekly':
      return 'Weekly roll-up'
    case 'custom':
      return 'Custom range'
    default:
      return 'Latest available data'
  }
}

function formatRange(range?: { from?: string; to?: string }) {
  if (!range) return ''
  const fromLabel = range.from ? new Date(range.from).toLocaleDateString() : null
  const toLabel = range.to ? new Date(range.to).toLocaleDateString() : null
  if (fromLabel && toLabel) return `${fromLabel} → ${toLabel}`
  if (fromLabel) return `since ${fromLabel}`
  if (toLabel) return `through ${toLabel}`
  return ''
}

function summariesList(items: string[]) {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, 2).join(', ')} and ${items.length - 2} more`
}
