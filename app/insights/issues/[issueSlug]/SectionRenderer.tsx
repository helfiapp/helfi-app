'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { IssueSectionKey, IssueSectionResult } from '@/lib/insights/issue-engine'
import SectionChat from './SectionChat'

interface SectionRendererProps {
  issueSlug: string
  section: IssueSectionKey
  initialResult: IssueSectionResult
}

export default function SectionRenderer({ issueSlug, section, initialResult }: SectionRendererProps) {
  const [result, setResult] = useState<IssueSectionResult>(initialResult)
  // Daily/Weekly/Custom report functionality removed - no longer needed

  return (
    <div className="space-y-8">
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2 capitalize">
              {section === 'overview' ? 'Section summary' : `${section} insights`}
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
          {/* Daily/Weekly/Custom report buttons removed per user request - no longer needed */}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Recommendations</h3>
            {section === 'labs' && (
              <Link
                href="/onboarding?step=8"
                className="px-4 py-2 bg-helfi-green hover:bg-helfi-green/90 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Upload Blood Results
              </Link>
            )}
          </div>
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
