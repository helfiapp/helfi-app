'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IssueSummary, IssueSectionKey } from '@/lib/insights/issue-engine'
import InsightsTopNav from './InsightsTopNav'

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

interface PreviewInsight {
  id: string
  title: string
  summary: string
  tags?: string[]
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
  const [previewInsights, setPreviewInsights] = useState<PreviewInsight[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  const tagStyles = useMemo(() => ({
    goals: 'bg-green-100 text-green-800 border border-green-200',
    supplement: 'bg-purple-100 text-purple-800 border border-purple-200',
    medication: 'bg-rose-100 text-rose-800 border border-rose-200',
    nutrition: 'bg-amber-100 text-amber-800 border border-amber-200',
    timing: 'bg-blue-100 text-blue-800 border border-blue-200',
    safety: 'bg-red-100 text-red-700 border border-red-200',
    energy: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
    sleep: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  }), [])

  async function loadPreview() {
    try {
      setLoadingPreview(true)
      const response = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
      if (!response.ok) {
        throw new Error('Failed to load preview insights')
      }
      const data = await response.json().catch(() => ({}))
      setPreviewInsights(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      console.error('Preview insights load error', err)
      setPreviewInsights([])
    } finally {
      setLoadingPreview(false)
    }
  }

  useEffect(() => {
    loadPreview().catch(() => {})
  }, [])

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
      await loadPreview()
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
          <div className="space-y-6">
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

            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span role="img" aria-hidden>🤖</span>
                Preview insights
              </h2>
              {previewInsights.length > 0 ? (
                <div className="space-y-4">
                  {previewInsights.map((item) => (
                    <div key={item.id} className="border border-blue-200 bg-blue-50/60 rounded-xl p-4">
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {item.tags.slice(0, 4).map((tag) => {
                            const badgeClass = (tagStyles as Record<string, string>)[tag] || 'bg-gray-100 text-gray-700 border border-gray-200'
                            return (
                              <span key={tag} className={`px-2 py-0.5 text-xs font-semibold rounded-md ${badgeClass}`}>
                              {tag}
                              </span>
                            )
                          })}
                        </div>
                      )}
                      <h3 className="font-semibold text-blue-900">{item.title}</h3>
                      <p className="text-sm text-blue-900/90 mt-1 leading-relaxed">{item.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600">{loadingPreview ? 'Loading preview…' : 'No insights yet.'}</div>
              )}
            </section>
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

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link
            href="/dashboard"
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={() => {
              try {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
                const pref = localStorage.getItem('hapticsEnabled')
                const enabled = pref === null ? true : pref === 'true'
                if (!reduced && enabled && 'vibrate' in navigator) {
                  navigator.vibrate(10)
                }
              } catch {
                // ignore haptics errors
              }
            }}
          >
            <div className={`icon ${pathname === '/dashboard' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/dashboard' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Dashboard</span>
          </Link>

          <Link
            href="/insights"
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={() => {
              try {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
                const pref = localStorage.getItem('hapticsEnabled')
                const enabled = pref === null ? true : pref === 'true'
                if (!reduced && enabled && 'vibrate' in navigator) {
                  navigator.vibrate(10)
                }
              } catch {
                // ignore
              }
            }}
          >
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          <Link
            href="/food"
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={() => {
              try {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
                const pref = localStorage.getItem('hapticsEnabled')
                const enabled = pref === null ? true : pref === 'true'
                if (!reduced && enabled && 'vibrate' in navigator) {
                  navigator.vibrate(10)
                }
              } catch {
                // ignore
              }
            }}
          >
            <div className={`icon ${pathname === '/food' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/food' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Food</span>
          </Link>

          <Link
            href="/onboarding?step=1"
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={() => {
              try {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
                const pref = localStorage.getItem('hapticsEnabled')
                const enabled = pref === null ? true : pref === 'true'
                if (!reduced && enabled && 'vibrate' in navigator) {
                  navigator.vibrate(10)
                }
              } catch {
                // ignore
              }
            }}
          >
            <div className={`icon ${pathname?.startsWith('/onboarding') ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname?.startsWith('/onboarding') ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Intake</span>
          </Link>

          <Link
            href="/settings"
            className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1"
            onClick={() => {
              try {
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
                const pref = localStorage.getItem('hapticsEnabled')
                const enabled = pref === null ? true : pref === 'true'
                if (!reduced && enabled && 'vibrate' in navigator) {
                  navigator.vibrate(10)
                }
              } catch {
                // ignore
              }
            }}
          >
            <div className={`icon ${pathname === '/settings' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
