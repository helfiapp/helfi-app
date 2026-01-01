'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [isNavigating, startTransition] = useTransition()
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [weeklyStatus, setWeeklyStatus] = useState<any>(null)
  const lastLoaded = generatedAt

  const actionableNeeds = dataNeeds.filter((need) => need.status !== 'complete')
  const completedNeeds = dataNeeds.filter((need) => need.status === 'complete')
  const primaryIssueSlug = issues[0]?.slug
  const pendingIssueName = useMemo(() => issues.find((issue) => issue.slug === pendingSlug)?.name ?? null, [issues, pendingSlug])

  useEffect(() => {
    if (issues.length === 0) return
    issues.slice(0, 3).forEach((issue) => {
      try {
        router.prefetch(`/insights/issues/${issue.slug}`)
      } catch {
        // prefetch failures are non-blocking
      }
    })
  }, [issues, router])

  useEffect(() => {
    let mounted = true
    fetch('/api/reports/weekly/status', { method: 'GET' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return
        setWeeklyStatus(data)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function handleUpdateInsights() {
    if (isUpdating) return
    
    setIsUpdating(true)
    setUpdateMessage('Regenerating insights...')
    
    try {
      const response = await fetch('/api/insights/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setUpdateMessage('Insights are being regenerated. This may take a few minutes. Refresh the page to see updates.')
        // Refresh the page after a delay to show updated insights
        setTimeout(() => {
          router.refresh()
        }, 3000)
      } else {
        setUpdateMessage(data.message || 'Failed to regenerate insights. Please try again.')
        setIsUpdating(false)
      }
    } catch (error) {
      setUpdateMessage('Failed to regenerate insights. Please try again.')
      setIsUpdating(false)
    }
  }

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

  function handleIssueClick(event: MouseEvent<HTMLAnchorElement>, slug: string) {
    event.preventDefault()
    triggerHaptic()
    const href = `/insights/issues/${slug}`
    setPendingSlug(slug)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50" aria-busy={isNavigating}>
      <InsightsTopNav sessionUser={sessionUser} />

      <header className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="max-w-7xl mx-auto text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Your health focus areas</h1>
              <p className="text-sm text-gray-500 mt-2">Start with your tracked issues, then unlock deeper reports.</p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-2">
              {/* Update Insights button removed - insights update automatically when health data changes */}
              <div className="text-xs text-gray-400 md:text-right">
                Updated {new Date(lastLoaded).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 pb-24 md:pb-10 space-y-10">
        <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">7-day health report</h2>
              <p className="text-sm text-gray-600 mt-1">
                We build this report automatically every 7 days based on how you use Helfi. No action needed.
              </p>
              {weeklyStatus?.reportReady && (
                <p className="text-sm text-emerald-700 mt-2">Your latest report is ready to view.</p>
              )}
              {weeklyStatus?.reportLocked && (
                <p className="text-sm text-amber-700 mt-2">
                  Your latest report is ready, but it needs a subscription or top-up credits to unlock.
                </p>
              )}
              {!weeklyStatus?.reportReady && !weeklyStatus?.reportLocked && weeklyStatus?.nextReportDueAt && (
                <p className="text-sm text-gray-500 mt-2">
                  Next report due {new Date(weeklyStatus.nextReportDueAt).toLocaleDateString()}.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              {weeklyStatus?.reportReady ? (
                <Link
                  href="/insights/weekly-report"
                  className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
                >
                  View report
                </Link>
              ) : weeklyStatus?.reportLocked ? (
                <Link
                  href="/billing"
                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Unlock report
                </Link>
              ) : (
                <Link
                  href="/onboarding?step=1"
                  className="inline-flex items-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit Health Setup (optional)
                </Link>
              )}
            </div>
          </div>
        </section>
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
              {issues.map((issue) => (
                <Link
                  key={issue.id}
                  href={`/insights/issues/${issue.slug}`}
                  className={`flex flex-col gap-3 px-5 py-5 transition-colors md:flex-row md:items-center md:justify-between ${
                    isNavigating ? 'pointer-events-none opacity-60' : 'hover:bg-gray-50'
                  }`}
                  onClick={(event) => handleIssueClick(event, issue.slug)}
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

        {/* Unlock / Deep-dive sections removed per request */}
      </main>

        <InsightsBottomNav />
      {isNavigating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-helfi-green border-t-transparent" />
          <p className="mt-3 text-sm font-semibold text-gray-700">
            {pendingIssueName ? `Opening ${pendingIssueName} workspace…` : 'Loading workspace…'}
          </p>
        </div>
      )}
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
  // Health-setup related needs should always go to Health Setup pages.
  if (need.key === 'blood-results') return '/onboarding?step=9'
  if (need.key === 'health-situations') return '/onboarding?step=health-situations'
  if (need.key === 'supplements-backup' || need.key === 'supplements-emergency') return '/onboarding?step=1'
  return need.href
}
