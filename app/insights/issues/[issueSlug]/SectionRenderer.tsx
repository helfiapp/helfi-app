'use client'

import { useState } from 'react'
import type { IssueSectionKey, IssueSectionResult } from '@/lib/insights/issue-engine'
import SectionChat from './SectionChat'

interface SectionRendererProps {
  issueSlug: string
  section: IssueSectionKey
  initialResult: IssueSectionResult
}

export default function SectionRenderer({ issueSlug, section, initialResult }: SectionRendererProps) {
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
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2 capitalize">
              {section === 'overview' ? 'Section summary' : `${section} insights`}
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
            <p className="text-xs text-gray-500 mt-4">
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

      {result.highlights.length > 0 && (
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

      {result.dataPoints.length > 0 && (
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

      {result.recommendations.length > 0 && (
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
