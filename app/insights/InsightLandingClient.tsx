'use client'

import Link from 'next/link'
import type { IssueSummary, InsightDataNeed } from '@/lib/insights/issue-engine'
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
  dataNeeds: InsightDataNeed[]
}

export default function InsightsLandingClient({ sessionUser, issues, generatedAt, onboardingComplete, dataNeeds }: InsightsLandingClientProps) {
  const lastLoaded = generatedAt

  const actionableNeeds = dataNeeds.filter((need) => need.status !== 'complete')
  const completedNeeds = dataNeeds.filter((need) => need.status === 'complete')
  const primaryIssueSlug = issues[0]?.slug

  const deepDiveSections = [
    {
      key: 'nutrition',
      title: 'Nutrition & Food',
      description: 'See how meals and macros support each issue.',
      href: '/insights/nutrition',
    },
    {
      key: 'supplements',
      title: 'Supplements & Medications',
      description: 'Track timing, gaps, and backup plans.',
      href: '/insights/supplements',
    },
    {
      key: 'sleep',
      title: 'Sleep & Recovery',
      description: 'Review sleep trends tied to your goals.',
      href: '/insights/sleep',
    },
    {
      key: 'safety',
      title: 'Safety Flags',
      description: 'Spot potential interactions or red flags early.',
      href: '/insights/safety',
    },
  ]

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

      <header className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="max-w-7xl mx-auto text-center md:text-left">
          <p className="text-xs uppercase tracking-[0.2em] text-helfi-green font-semibold mb-2">Insights</p>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Your health focus areas</h1>
              <p className="text-sm text-gray-500 mt-2">Start with your tracked issues, then unlock deeper reports.</p>
            </div>
            <div className="text-xs text-gray-400 md:text-right">
              Updated {new Date(lastLoaded).toLocaleString()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {issues.length === 0 ? (
          !onboardingComplete ? (
            <EmptyState
              emoji="📝"
              title="Finish onboarding to unlock insights"
              description="Complete your intake so we can analyse the health concerns that matter most to you."
              actionLabel="Resume onboarding"
              actionHref="/onboarding"
            />
          ) : (
            <EmptyState
              emoji="🔍"
              title="No health issues tracked yet"
              description="Add issues through onboarding or Health Tracking so we can generate focused insights for you."
            />
          )
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Tracked issues</h2>
              <span className="text-xs uppercase tracking-wide text-gray-500">Tap to open workspace</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl divide-y">
              {issues.map((issue, index) => (
                <Link
                  key={issue.id}
                  href={`/insights/issues/${issue.slug}`}
                  className="flex flex-col gap-3 px-5 py-5 transition-colors hover:bg-gray-50 md:flex-row md:items-center md:justify-between"
                  onClick={triggerHaptic}
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-helfi-green/10 text-lg">💡</span>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide font-semibold">
                        <StatusBadge issue={issue} />
                        {issue.currentRating !== null && (
                          <span className="text-gray-400">{issue.currentRating}/{issue.ratingScaleMax ?? 6}</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{issue.name}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {issue.highlight || 'Open the workspace to see personalised guidance.'}
                      </p>
                      {issue.lastUpdated && (
                        <p className="text-xs text-gray-400">Last updated {new Date(issue.lastUpdated).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between md:justify-end md:gap-4">
                    {issue.blockers.length > 0 && (
                      <p className="text-xs text-amber-600 max-w-xs md:text-right">Next step: {issue.blockers[0]}</p>
                    )}
                    <span className="text-2xl text-gray-400">›</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {actionableNeeds.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Unlock more insights</h2>
              <span className="text-xs uppercase tracking-wide text-gray-500">Complete these to add richer data</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {actionableNeeds.map((need) => (
                <Link
                  key={need.key}
                  href={resolveNeedHref(need, primaryIssueSlug)}
                  className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3 transition-colors hover:border-helfi-green/60 hover:shadow-sm"
                  onClick={triggerHaptic}
                >
                  <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">{formatNeedStatus(need.status)}</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{need.title}</h3>
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">{need.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-helfi-green">{need.actionLabel} →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {completedNeeds.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Already covered</h2>
            <div className="flex flex-wrap gap-2">
              {completedNeeds.map((need) => (
                <span key={need.key} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-xs font-semibold">
                  ✅ {need.title}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Deep-dive workspaces</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {deepDiveSections.map((section) => (
              <Link
                key={section.key}
                href={section.href}
                className="bg-white border border-gray-200 rounded-2xl p-5 transition-colors hover:border-helfi-green/60 hover:shadow-sm"
                onClick={triggerHaptic}
              >
                <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">{section.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-helfi-green">Open workspace →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <InsightsBottomNav />
    </div>
  )
}

function formatNeedStatus(status: InsightDataNeed['status']) {
  switch (status) {
    case 'complete':
      return 'Complete'
    case 'in-progress':
      return 'In progress'
    default:
      return 'Needs attention'
  }
}

function EmptyState({ emoji, title, description, actionLabel, actionHref }: { emoji: string; title: string; description: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center">
      <div className="text-5xl mb-4" aria-hidden>{emoji}</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 mb-6 max-w-xl mx-auto">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="inline-block px-4 py-2 rounded-md bg-helfi-green text-white text-sm font-semibold">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

function StatusBadge({ issue }: { issue: IssueSummary }) {
  const palette: Record<IssueSummary['status'], string> = {
    'focus': 'bg-rose-100 text-rose-700 border border-rose-200',
    'monitor': 'bg-amber-100 text-amber-700 border border-amber-200',
    'on-track': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    'needs-data': 'bg-gray-100 text-gray-600 border border-gray-200',
  }

  const className = palette[issue.status] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
  const label = issue.severityLabel || 'Needs data'

  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>
}

function resolveNeedHref(need: InsightDataNeed, firstIssueSlug?: string) {
  if (!firstIssueSlug) {
    return need.href
  }
  switch (need.key) {
    case 'blood-results':
      return `/insights/issues/${firstIssueSlug}/labs`
    case 'supplements-backup':
    case 'supplements-emergency':
      return `/insights/issues/${firstIssueSlug}/supplements`
    default:
      return need.href
  }
}
