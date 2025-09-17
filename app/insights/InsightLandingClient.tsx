'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IssueSummary, IssueSectionKey } from '@/lib/insights/issue-engine'
import InsightsTopNav from './InsightsTopNav'
import InsightsMobileNav from './InsightsMobileNav'

interface InsightsLandingClientProps {
  sessionUser: {
    name: string | null
    email: string | null
    image: string | null
  }
  initialIssues: IssueSummary[]
  initialSections: IssueSectionKey[]
  generatedAt: string
}

function trendBadge(trend: IssueSummary['trend']) {
  switch (trend) {
    case 'improving':
      return { label: 'Improving', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' }
    case 'declining':
      return { label: 'Declining', className: 'bg-rose-100 text-rose-700 border border-rose-200' }
    case 'stable':
      return { label: 'Stable', className: 'bg-blue-100 text-blue-700 border border-blue-200' }
    default:
      return { label: 'Needs Data', className: 'bg-gray-100 text-gray-600 border border-gray-200' }
  }
}

function severityTone(severity: string) {
  if (/severe/i.test(severity)) return 'text-rose-600'
  if (/moderate|support|needs/i.test(severity)) return 'text-amber-600'
  if (/on track|excellent|resolved/i.test(severity)) return 'text-emerald-600'
  return 'text-slate-600'
}

function blockerTone(label: string) {
  if (/missing|no |gap|skip/i.test(label)) return 'text-rose-600'
  if (/frequency|log|track/i.test(label)) return 'text-amber-600'
  return 'text-slate-600'
}

export default function InsightsLandingClient({ sessionUser, initialIssues, initialSections, generatedAt }: InsightsLandingClientProps) {
  const pathname = usePathname()
  const [issues, setIssues] = useState<IssueSummary[]>(initialIssues)
  const [refreshing, setRefreshing] = useState(false)
  const [lastLoaded, setLastLoaded] = useState(generatedAt)
  const [error, setError] = useState<string | null>(null)

  async function refreshIssues() {
    try {
      setRefreshing(true)
      setError(null)
      const response = await fetch('/api/insights/issues', { cache: 'no-cache' })
      if (!response.ok) {
        throw new Error('Failed to refresh insights')
      }
      const payload = await response.json()
      setIssues(Array.isArray(payload?.issues) ? payload.issues : [])
      setLastLoaded(payload?.generatedAt || new Date().toISOString())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InsightsTopNav sessionUser={sessionUser} />

      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-helfi-green font-semibold mb-2">AI Health Command Centre</p>
          <h1 className="text-3xl font-bold text-gray-900">Insights tailored to your priorities</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl mx-auto">
            Each health issue gets its own deep dive across exercise, supplements, labs, nutrition, and lifestyle so you know exactly where to focus next.
          </p>
          <div className="flex items-center justify-center gap-3 mt-4 text-xs text-gray-500">
            <button
              onClick={refreshIssues}
              className="px-3 py-1.5 bg-helfi-green text-white rounded-md text-xs font-semibold disabled:opacity-60"
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh insights'}
            </button>
            <span>Last updated {new Date(lastLoaded).toLocaleString()}</span>
          </div>
          {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {issues.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No tracked issues yet</h2>
            <p className="text-gray-600 mb-4">
              Head to Health Tracking to add the symptoms or goals you want Helfi to analyse. Once logged, each issue gets its own insight workspace.
            </p>
            <Link href="/health-tracking" className="inline-block px-4 py-2 rounded-md bg-helfi-green text-white text-sm font-semibold">
              Go to Health Tracking
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {issues.map((issue) => {
              const trend = trendBadge(issue.trend)
              const severityClass = severityTone(issue.severityLabel)
              const sections = initialSections.map((section) => ({
                key: section,
                label: section === 'interactions' ? 'Supplements × Meds' : section.charAt(0).toUpperCase() + section.slice(1),
                href: section === 'overview' ? `/insights/issues/${issue.slug}` : `/insights/issues/${issue.slug}/${section}`,
              }))
              return (
                <div key={issue.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-helfi-green/10 text-helfi-green">Issue</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${trend.className}`}>{trend.label}</span>
                        </div>
                        <h2 className="text-2xl font-semibold text-gray-900">{issue.name}</h2>
                        <p className={`mt-2 text-sm font-medium ${severityClass}`}>{issue.severityLabel}</p>
                        <p className="mt-3 text-sm text-gray-600 leading-relaxed">{issue.highlight}</p>
                        {issue.blockers.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs uppercase font-semibold text-gray-500 tracking-wide">Current blockers</p>
                            <ul className="mt-1 flex flex-wrap gap-2">
                              {issue.blockers.map((blocker) => (
                                <li key={blocker} className={`px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold ${blockerTone(blocker)}`}>
                                  {blocker}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="w-full md:w-auto md:text-right">
                        {issue.currentRating !== null && (
                          <div className="inline-flex flex-col items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                            <span className="text-xs uppercase text-gray-500 tracking-wide">Current rating</span>
                            <span className="text-2xl font-semibold text-gray-900 mt-1">{issue.currentRating}/{issue.ratingScaleMax ?? 6}</span>
                            {typeof issue.trendDelta === 'number' && (
                              <span className={`mt-1 text-xs font-semibold ${issue.trend === 'declining' ? 'text-rose-600' : issue.trend === 'improving' ? 'text-emerald-600' : 'text-gray-500'}`}>
                                {issue.trend === 'declining' ? '▼' : issue.trend === 'improving' ? '▲' : '•'} {Math.abs(issue.trendDelta).toFixed(1)} vs prev
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-4 flex flex-col gap-2 items-stretch md:items-end">
                          <Link
                            href={`/insights/issues/${issue.slug}`}
                            className="px-4 py-2.5 rounded-lg bg-helfi-green text-white text-sm font-semibold text-center"
                          >
                            Open issue workspace
                          </Link>
                          <Link
                            href={`/insights/issues/${issue.slug}/interactions`}
                            className="px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold text-center"
                          >
                            Check supplement × medication
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50/70 px-4 md:px-6 py-4 flex flex-wrap gap-2">
                    {sections.map((section) => (
                      <Link
                        href={section.href}
                        key={section.key}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-helfi-green hover:text-helfi-green transition-colors"
                      >
                        <span>→</span> {section.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <InsightsMobileNav activePath={pathname} />
    </div>
  )
}
