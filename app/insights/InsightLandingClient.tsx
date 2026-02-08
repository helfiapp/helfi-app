'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from 'react'
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
  initialWeeklyStatus?: {
    reportReady?: boolean
    reportLocked?: boolean
    status?: string | null
    nextReportDueAt?: string | null
    reportsEnabled?: boolean
    reportsEnabledAt?: string | null
  } | null
}

export default function InsightsLandingClient({ sessionUser, issues, generatedAt, onboardingComplete, dataNeeds, initialWeeklyStatus }: InsightsLandingClientProps) {
  const router = useRouter()
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [isNavigating, startTransition] = useTransition()
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [weeklyStatus, setWeeklyStatus] = useState<any>(initialWeeklyStatus || null)
  const [isCreatingReport, setIsCreatingReport] = useState(false)
  const [createReportMessage, setCreateReportMessage] = useState<string | null>(null)
  const [createReportError, setCreateReportError] = useState(false)
  const [toggleReportsStatus, setToggleReportsStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStage, setProgressStage] = useState('Getting your data')
  const [progressActive, setProgressActive] = useState(false)
  const progressTimerRef = useRef<number | null>(null)
  const progressStartAtRef = useRef<number | null>(null)
  const [countdown, setCountdown] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    percent: number
    dueNow: boolean
    dueAtMs: number
  } | null>(null)
  const lastLoaded = generatedAt
  const isReportRunning = weeklyStatus?.status === 'RUNNING'
  const reportsEnabled = weeklyStatus?.reportsEnabled ?? false

  const actionableNeeds = dataNeeds.filter((need) => need.status !== 'complete')
  const completedNeeds = dataNeeds.filter((need) => need.status === 'complete')
  const primaryIssueSlug = issues[0]?.slug
  const pendingIssueName = useMemo(() => issues.find((issue) => issue.slug === pendingSlug)?.name ?? null, [issues, pendingSlug])
  const canManualReport = String(sessionUser?.email || '').toLowerCase() === 'info@sonicweb.com.au'

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
    if (initialWeeklyStatus) return
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
  }, [initialWeeklyStatus])

  useEffect(() => {
    const dueRaw = weeklyStatus?.nextReportDueAt
    if (!dueRaw) {
      setCountdown(null)
      return
    }
    let dueAt = new Date(dueRaw).getTime()
    if (Number.isNaN(dueAt)) {
      setCountdown(null)
      return
    }

    const periodMs = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    if (dueAt <= now) {
      dueAt = now + periodMs
    }
    const startAt = dueAt - periodMs

    const tick = () => {
      const now = Date.now()
      const remaining = dueAt - now
      const clampedRemaining = Math.max(0, remaining)
      const totalSeconds = Math.floor(clampedRemaining / 1000)
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const progressRaw = (now - startAt) / periodMs
      const percent = Math.min(100, Math.max(0, Math.round(progressRaw * 100)))
      setCountdown({
        days,
        hours,
        minutes,
        seconds,
        percent,
        dueNow: remaining <= 0,
        dueAtMs: dueAt,
      })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [weeklyStatus?.nextReportDueAt])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
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

  const updateProgressStage = (percent: number) => {
    if (percent < 25) return 'Getting your data'
    if (percent < 55) return 'Finding patterns'
    if (percent < 80) return 'Writing your report'
    return 'Final checks'
  }

  const startProgress = () => {
    setProgressActive(true)
    progressStartAtRef.current = Date.now()
    setProgressPercent(6)
    setProgressStage('Getting your data')
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
    }
    progressTimerRef.current = window.setInterval(() => {
      setProgressPercent((prev) => {
        const startedAt = progressStartAtRef.current ?? Date.now()
        const elapsedMs = Math.max(0, Date.now() - startedAt)

        // Avoid the classic "jumps to 95% then freezes" problem.
        // We intentionally asymptote below 90% and show "Working…" during the final stage.
        const cap = 88
        const base = 6
        const scale = cap - base
        const next = Math.round(base + scale * (1 - Math.exp(-elapsedMs / 16000)))
        const clamped = Math.max(base, Math.min(cap, Number.isFinite(next) ? next : prev))
        setProgressStage(updateProgressStage(clamped))
        return clamped
      })
    }, 700)
  }

  const stopProgress = (success: boolean) => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    progressStartAtRef.current = null
    if (success) {
      setProgressPercent(100)
      setProgressStage('Done')
      window.setTimeout(() => {
        setProgressActive(false)
      }, 1200)
    } else {
      setProgressActive(false)
      setProgressPercent(0)
    }
  }

  async function handleCreateReportNow() {
    if (!reportsEnabled) {
      setCreateReportError(true)
      setCreateReportMessage('Turn on weekly reports first.')
      return
    }
    if (isCreatingReport) return
    setIsCreatingReport(true)
    setCreateReportError(false)
    setCreateReportMessage('Creating your report now. This can take 1 to 2 minutes.')
    startProgress()
    try {
      const response = await fetch('/api/reports/weekly/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' }),
      })
      let data: any = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      const success = response.ok
      if (response.ok) {
        const status = String(data?.status || '').toLowerCase()
        if (status === 'locked') {
          setCreateReportMessage('Your report is ready, but it needs a subscription or credits to open.')
        } else if (status === 'ready') {
          setCreateReportMessage('Your report is ready. Refresh the page to view it.')
        } else {
          setCreateReportMessage('Your report is being created. Refresh this page or open the report in a minute.')
        }
        setTimeout(() => {
          router.refresh()
        }, 2000)
      } else {
        setCreateReportError(true)
        const raw = String(data?.error || data?.reason || data?.status || '').toLowerCase()
        const friendly =
          raw.includes('unauthorized') || raw.includes('auth')
            ? 'Please sign in again and try.'
            : raw.includes('reports_disabled') || raw.includes('disabled')
              ? 'Weekly reports are turned off for this account. Turn them on and try again.'
            : 'Sorry, we could not create the report right now. Please try again in a minute.'
        setCreateReportMessage(friendly)
      }
      stopProgress(success)
    } catch (error) {
      setCreateReportError(true)
      setCreateReportMessage('Sorry, we could not create the report right now.')
      stopProgress(false)
    } finally {
      setIsCreatingReport(false)
    }
  }

  async function handleEnableWeeklyReports() {
    if (toggleReportsStatus === 'saving') return
    setToggleReportsStatus('saving')
    setCreateReportError(false)
    setCreateReportMessage(null)
    try {
      const res = await fetch('/api/reports/weekly/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const needsUpgrade = res.status === 402
        setCreateReportError(true)
        setCreateReportMessage(
          needsUpgrade
            ? 'Weekly reports need a subscription or credits. Please upgrade to turn them on.'
            : 'Could not turn on weekly reports right now.'
        )
        return
      }
      setWeeklyStatus((prev: any) => {
        const safePrev = prev || {}
        return {
          ...safePrev,
          reportsEnabled: data?.reportsEnabled ?? true,
          reportsEnabledAt: data?.reportsEnabledAt ?? null,
          nextReportDueAt: data?.nextReportDueAt ?? safePrev?.nextReportDueAt ?? null,
          status: data?.reportsEnabled ? safePrev?.status ?? 'scheduled' : safePrev?.status ?? null,
        }
      })
      setCreateReportError(false)
      setCreateReportMessage('Weekly reports are on. We will start your first one now.')
    } catch {
      setCreateReportError(true)
      setCreateReportMessage('Could not turn on weekly reports right now.')
    } finally {
      setToggleReportsStatus('idle')
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

  const formatDateForLocale = (value?: string | number | null) => {
    if (!value) return ''
    const date = typeof value === 'number' ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
  }
  const padTime = (value: number) => String(value).padStart(2, '0')
  const dueDateLabel = countdown?.dueAtMs
    ? formatDateForLocale(countdown.dueAtMs)
    : formatDateForLocale(weeklyStatus?.nextReportDueAt || '')
    ? new Date(weeklyStatus.nextReportDueAt).toLocaleDateString()
    : null

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
        <section className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-6 flex-1">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">7-day health report</h2>
                <p className="mt-1 text-base text-gray-600 leading-relaxed">
                  We build this report automatically every 7 days based on how you use Helfi.
                </p>
                {!reportsEnabled && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Weekly reports are off by default. Turn them on to get a full, data-driven report each week. Reports
                    use credits based on how much you log.
                  </div>
                )}
                {reportsEnabled && weeklyStatus?.reportReady && (
                  <p className="text-sm text-emerald-700 mt-3">Your latest report is ready to view.</p>
                )}
                {reportsEnabled && weeklyStatus?.reportLocked && (
                  <p className="text-sm text-amber-700 mt-3">
                    Your latest report is ready, but it needs a subscription or top-up credits to unlock.
                  </p>
                )}
              </div>
              {reportsEnabled && weeklyStatus?.nextReportDueAt && countdown && (
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Current cycle progress
                    </span>
                    <span className="text-sm font-bold text-emerald-600">{countdown.percent}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full shadow-[0_0_12px_rgba(77,175,80,0.6)] transition-all duration-500"
                      style={{ width: `${countdown.percent}%`, backgroundColor: '#4DAF50' }}
                    ></div>
                  </div>
                  {(isReportRunning || countdown.dueNow) && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Your report is being prepared now. Check back soon.
                    </div>
                  )}
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="flex h-2 w-2 relative">
                        <span
                          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                          style={{ backgroundColor: '#4DAF50' }}
                        ></span>
                        <span
                          className="relative inline-flex rounded-full h-2 w-2"
                          style={{ backgroundColor: '#4DAF50' }}
                        ></span>
                      </span>
                      <span>
                        Next report due{' '}
                        <span className="text-gray-900 font-semibold ml-1">{dueDateLabel}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-2 border border-gray-100">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">
                          {padTime(countdown.days)}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Days</span>
                      </div>
                      <div className="w-px h-6 bg-gray-200"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">
                          {padTime(countdown.hours)}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Hours</span>
                      </div>
                      <div className="w-px h-6 bg-gray-200"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">
                          {padTime(countdown.minutes)}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Mins</span>
                      </div>
                      <div className="w-px h-6 bg-gray-200"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">
                          {padTime(countdown.seconds)}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Secs</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {reportsEnabled ? (
                weeklyStatus?.reportReady ? (
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
                    Edit Health Setup
                  </Link>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleEnableWeeklyReports}
                    disabled={toggleReportsStatus === 'saving'}
                    className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-70"
                  >
                    {toggleReportsStatus === 'saving' ? 'Turning on…' : 'Turn on weekly reports'}
                  </button>
                  <Link
                    href="/billing"
                    className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Upgrade for reports
                  </Link>
                </>
              )}
              {reportsEnabled && canManualReport && (
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={handleCreateReportNow}
                    disabled={isCreatingReport || isReportRunning}
                    className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isCreatingReport || isReportRunning ? 'Creating report...' : 'Create report now'}
                  </button>
                  {progressActive && (
                    <div className="w-full max-w-xs">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{progressStage === 'Final checks' ? 'Final checks (still working...)' : progressStage}</span>
                        <span>{progressStage === 'Final checks' ? 'Working…' : `${progressPercent}%`}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full bg-emerald-500 ${progressStage === 'Final checks' ? 'animate-pulse' : ''}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <span className="text-xs text-gray-400">Makes a fresh report from your last 7 days.</span>
                </div>
              )}
            </div>
          </div>
          {createReportMessage && (
            <div
              className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                createReportError
                  ? 'border border-red-200 bg-red-50 text-red-700'
                  : 'border border-emerald-100 bg-emerald-50 text-emerald-800'
              }`}
            >
              {createReportMessage}
            </div>
          )}
        </section>
        {issues.length === 0 ? (
          !onboardingComplete ? (
            <EmptyState
              emoji="📝"
              title="Finish onboarding to unlock insights"
              description="Complete your Health Intake so we can analyse the health concerns that matter most to you."
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
