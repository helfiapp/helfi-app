'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IssueSummary } from '@/lib/insights/issue-engine'
import InsightsTopNav from './InsightsTopNav'

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
  const pathname = usePathname()
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
