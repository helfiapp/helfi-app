'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import type { IssueSummary } from '@/lib/insights/issue-engine'
import InsightsTopNav from './InsightsTopNav'
import InsightsBottomNav from './InsightsBottomNav'

interface InsightsLandingClientProps {
  sessionUser: {
    name: string | null
    email: string | null
    image: string | null
  }
  issues: IssueSummary[]
  generatedAt: string
  onboardingComplete: boolean
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

export default function InsightsLandingClient({ sessionUser, issues, generatedAt, onboardingComplete }: InsightsLandingClientProps) {
  const lastLoaded = generatedAt

  const accentPalette = useMemo(
    () => [
      'bg-emerald-50 border-emerald-100 text-emerald-900',
      'bg-sky-50 border-sky-100 text-sky-900',
      'bg-amber-50 border-amber-100 text-amber-900',
      'bg-rose-50 border-rose-100 text-rose-900',
    ],
    []
  )

  function triggerHaptic() {
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      const pref = localStorage.getItem('hapticsEnabled')
      const enabled = pref === null ? true : pref === 'true'
      if (!reduced && enabled && 'vibrate' in navigator) {
        navigator.vibrate(10)
      }
    } catch {
      // ignore haptic errors
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InsightsTopNav sessionUser={sessionUser} />

      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-helfi-green font-semibold mb-2">Insights</p>
          <h1 className="text-3xl font-bold text-gray-900">Your health focus areas</h1>
          <p className="text-sm text-gray-500 mt-2">Select an issue to dive into personalised reports.</p>
          <div className="text-xs text-gray-400 mt-3">Updated {new Date(lastLoaded).toLocaleString()}</div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {issues.length === 0 ? (
          !onboardingComplete ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Finish onboarding to unlock insights</h2>
              <p className="text-gray-600 mb-4">
                Complete your health intake so Helfi knows which goals and concerns to analyse for you.
              </p>
              <Link href="/onboarding" className="inline-block px-4 py-2 rounded-md bg-helfi-green text-white text-sm font-semibold">
                Resume onboarding
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No health issues tracked yet</h2>
              <p className="text-gray-600 mb-4">
                Add issues through onboarding or Health Tracking so we can generate focused insights for you.
              </p>
            </div>
          )
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {issues.map((issue, index) => {
              const trend = trendBadge(issue.trend)
              const severityClass = severityTone(issue.severityLabel)
              const accent = accentPalette[index % accentPalette.length]
              return (
                <Link
                  key={issue.id}
                  href={`/insights/issues/${issue.slug}`}
                  className={`flex items-center justify-between gap-3 px-5 py-4 border-b last:border-b-0 transition-colors hover:bg-gray-50 ${accent.replace(/bg-[^\s]+/g, '').trim()}`}
                  onClick={triggerHaptic}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg">💡</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold text-gray-500">
                        <span>{trend.label}</span>
                        {issue.currentRating !== null && (
                          <span className="text-gray-400">· {issue.currentRating}/{issue.ratingScaleMax ?? 6}</span>
                        )}
                      </div>
                      <div className="text-lg font-semibold text-gray-900 truncate">{issue.name}</div>
                      <div className={`text-sm font-medium ${severityClass}`}>{issue.severityLabel}</div>
                      {issue.highlight && (
                        <p className="mt-1 text-sm text-gray-600 truncate">{issue.highlight}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-2xl text-gray-400">›</div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <InsightsBottomNav />
    </div>
  )
}
