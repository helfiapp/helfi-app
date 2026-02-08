'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'
import ReportVisuals from './ReportVisuals'

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'medications', label: 'Medications' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'labs', label: 'Labs' },
  { key: 'mood', label: 'Mood' },
  { key: 'symptoms', label: 'Symptoms' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

type WeeklyReportClientProps = {
  report: WeeklyReportRecord | null
  reports: WeeklyReportRecord[]
  nextReportDueAt: string | null
  canManualReport: boolean
  reportsEnabled?: boolean
}

function SectionBucket({ title, items }: { title: string; items: Array<{ name?: string; reason?: string }> }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        No items here yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={`${title}-${idx}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="font-semibold text-gray-900">{replaceIsoDates(item.name || 'Insight')}</div>
          <div className="mt-1 space-y-1 text-sm text-gray-600">
            {(splitIntoLines(item.reason || 'Keep logging for more detail.') || []).map((line, lineIdx) => (
              <p key={`${title}-${idx}-line-${lineIdx}`}>{line}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatMl(value: number | null | undefined) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) {
    const liters = Math.round((ml / 1000) * 100) / 100
    return `${liters.toString().replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')} L`
  }
  return `${Math.round(ml)} ml`
}

function formatDateForLocale(value?: string | Date | null) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateRange(start?: string | null, end?: string | null) {
  const startText = start ? formatDateForLocale(start) : ''
  const endText = end ? formatDateForLocale(end) : ''
  if (startText && endText) return `${startText} to ${endText}`
  return startText || endText || ''
}

function replaceIsoDates(text: string) {
  if (!text) return ''
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(date.getTime())) return `${y}-${m}-${d}`
    return formatDateForLocale(date)
  })
}

function splitIntoPoints(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\n+/)
  const points = lines.flatMap((line) => {
    const normalized = line.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1|')
    return normalized.split('|')
  })
  return points.map((line) => line.trim()).filter(Boolean)
}

function splitIntoLines(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\n+/)
  return lines.map((line) => line.trim()).filter(Boolean)
}

export default function WeeklyReportClient({ report, reports, nextReportDueAt, canManualReport, reportsEnabled = true }: WeeklyReportClientProps) {
  const [activeTab, setActiveTab] = useState<SectionKey>('overview')
  const router = useRouter()
  const [manualStatus, setManualStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStage, setProgressStage] = useState('Getting your data')
  const [progressActive, setProgressActive] = useState(false)
  const progressTimerRef = useRef<number | null>(null)

  const scrollTo = useCallback((id: string) => {
    try {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      // ignore
    }
  }, [])

  const payload = useMemo(() => {
    if (!report || !report.report) return null
    if (typeof report.report === 'string') {
      try {
        return JSON.parse(report.report)
      } catch {
        return null
      }
    }
    if (typeof report.report !== 'object') return null
    return report.report as any
  }, [report])

  const sections = payload?.sections || {}
  const wins = Array.isArray(payload?.wins) ? payload.wins : []
  const gaps = Array.isArray(payload?.gaps) ? payload.gaps : []
  const keyInsights = useMemo(() => {
    const picks: Array<{ label: string; name?: string; reason?: string }> = []
    const tryPick = (sectionKey: SectionKey, label: string, bucket: 'suggested' | 'avoid' | 'working') => {
      const item = sections?.[sectionKey]?.[bucket]?.[0]
      if (item?.name || item?.reason) {
        picks.push({ label, name: item.name, reason: item.reason })
      }
    }
    const priority: Array<{ key: SectionKey; label: string }> = [
      { key: 'overview', label: 'Overview' },
      { key: 'nutrition', label: 'Nutrition' },
      { key: 'hydration', label: 'Hydration' },
      { key: 'exercise', label: 'Exercise' },
      { key: 'mood', label: 'Mood' },
      { key: 'symptoms', label: 'Symptoms' },
      { key: 'labs', label: 'Labs' },
      { key: 'lifestyle', label: 'Lifestyle' },
      { key: 'supplements', label: 'Supplements' },
      { key: 'medications', label: 'Medications' },
    ]
    priority.forEach((section) => {
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Suggestion`, 'suggested')
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Avoid`, 'avoid')
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Working`, 'working')
    })
    return picks.slice(0, 6)
  }, [sections])
  const parsedSummary = useMemo(() => {
    if (!report?.dataSummary) return null
    if (typeof report.dataSummary === 'string') {
      try {
        return JSON.parse(report.dataSummary)
      } catch {
        return null
      }
    }
    if (typeof report.dataSummary !== 'object') return null
    return report.dataSummary as any
  }, [report])

  const supplementCopy = {
    workingTitle: 'Your plan',
    suggestedTitle: 'Possible additions (optional)',
    avoidTitle: 'Review with doctor',
    emptySuggested:
      "No new additions suggested this week. If you're already on a large stack, the next best step is a clinician review for overlap, dose, and timing.",
    emptyAvoid: 'No review flags detected for supplements in this report.',
  }

  const dataWarning = (parsedSummary as any)?.dataWarning as string | null
  const talkToAiSummary = (parsedSummary as any)?.talkToAiSummary as
    | {
        messageCount?: number
        userMessageCount?: number
        assistantMessageCount?: number
        activeDays?: number
        topics?: Array<{ topic?: string; section?: string; count?: number }>
        highlights?: Array<{ content?: string; createdAt?: string }>
      }
    | undefined
  const coverage = (parsedSummary as any)?.coverage as
    | {
        daysActive?: number
        totalEvents?: number
        foodCount?: number
        waterCount?: number
        moodCount?: number
        checkinCount?: number
        symptomCount?: number
        exerciseCount?: number
        labCount?: number
        talkToAiCount?: number
      }
    | undefined
  const hydrationSummary = (parsedSummary as any)?.hydrationSummary as
    | {
        entries?: number
        totalMl?: number
        dailyAverageMl?: number
        daysWithLogs?: number
        topDrinks?: Array<{ label?: string; count?: number }>
        dailyTotals?: Array<{ date?: string; entries?: number; totalMl?: number }>
      }
    | undefined
  const nutritionSummary = (parsedSummary as any)?.nutritionSummary as
    | {
        entriesWithNutrients?: number
        totals?: any
        dailyAverages?: any
        daysWithLogs?: number
        dailyTotals?: Array<{ date?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }>
        topFoods?: Array<{ name?: string; count?: number }>
      }
    | undefined
  const dailyStats = (parsedSummary as any)?.dailyStats as Array<any> | undefined
  const symptomSummary = (parsedSummary as any)?.symptomSummary as any
  const exerciseSummary = (parsedSummary as any)?.exerciseSummary as any
  const supplementsList = (parsedSummary as any)?.supplements as
    | Array<{ name?: string; dosage?: string; timing?: string }>
    | undefined
  const labTrends = (parsedSummary as any)?.labTrends as
    | Array<{
        name?: string
        latestValue?: number
        previousValue?: number
        unit?: string | null
        change?: number
        direction?: 'up' | 'down' | 'flat'
        latestDate?: string
        previousDate?: string
      }>
    | undefined
  const llmUsage = (parsedSummary as any)?.llmUsage as
    | { costCents?: number; model?: string }
    | undefined
  const estimatedCost =
    llmUsage?.costCents != null && Number.isFinite(Number(llmUsage.costCents))
      ? (Number(llmUsage.costCents) / 100).toFixed(2)
      : null
  const pdfHref = useMemo(() => {
    if (!report?.id) return null
    return `/api/reports/weekly/pdf?reportId=${encodeURIComponent(report.id)}`
  }, [report])

  const updateProgressStage = (percent: number) => {
    if (percent < 25) return 'Getting your data'
    if (percent < 55) return 'Finding patterns'
    if (percent < 80) return 'Writing your report'
    return 'Final checks'
  }

  const startProgress = () => {
    setProgressActive(true)
    setProgressPercent(10)
    setProgressStage('Getting your data')
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
    }
    progressTimerRef.current = window.setInterval(() => {
      setProgressPercent((prev) => {
        const next = Math.min(prev + 4, 95)
        setProgressStage(updateProgressStage(next))
        return next
      })
    }, 900)
  }

  const stopProgress = (success: boolean) => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
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

  const runManualReport = async () => {
    if (manualStatus === 'running') return
    setManualStatus('running')
    setManualMessage('Creating your report now. This can take a minute.')
    startProgress()
    let navigated = false
    let success = false
    try {
      const res = await fetch('/api/reports/weekly/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' }),
      })
      success = res.ok
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to start report')
      }
      if (data?.reportId) {
        navigated = true
        window.location.href = `/insights/weekly-report?id=${encodeURIComponent(data.reportId)}`
        return
      }
      router.refresh()
    } catch {
      setManualStatus('error')
      setManualMessage('Could not start the report. Please try again in a moment.')
      return
    } finally {
      stopProgress(success && !navigated)
      if (!navigated) {
        setManualStatus('idle')
      }
    }
  }

  useEffect(() => {
    if (!report?.id) return
    const storageKey = `helfi-weekly-report-viewed:${report.id}`
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem(storageKey)) return
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
    fetch('/api/reports/weekly/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, action: 'viewed' }),
    }).catch(() => {})
  }, [report?.id])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [])

  if (!reportsEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Weekly reports are turned off for this account. Turn them on to get your weekly insights and PDF.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
            >
              Go to settings
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Upgrade to enable reports
            </Link>
          </div>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your weekly report will appear here once your first 7 days of data are complete.
          </p>
          {nextReportDueAt && (
            <p className="text-sm text-gray-500 mt-4">
              Next report due: {formatDateForLocale(nextReportDueAt)}
            </p>
          )}
          <a
            href="/api/export/pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex mt-4 items-center rounded-lg border border-helfi-green px-4 py-2 text-sm font-medium text-helfi-green hover:bg-helfi-green/10"
          >
            Download PDF (current data)
          </a>
          {canManualReport && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={runManualReport}
                disabled={manualStatus === 'running'}
                className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
              >
                {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
              </button>
              {progressActive && (
                <div className="w-full max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{progressStage}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {manualMessage && (
            <p className="text-sm text-red-600 mt-3">{manualMessage}</p>
          )}
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'LOCKED') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your weekly report is ready, but it requires an active subscription or top-up credits.
          </p>
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm text-blue-900">
              Upgrade to unlock your full 7-day report and keep receiving weekly updates.
            </p>
            <Link
              href="/billing"
              className="inline-flex mt-4 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              View plans
            </Link>
          </div>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'RUNNING') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your report is being generated in the background. Check back in a few minutes.
          </p>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'FAILED') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            We could not generate this report. Please try again later.
          </p>
          {canManualReport && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={runManualReport}
                disabled={manualStatus === 'running'}
                className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
              >
                {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
              </button>
              {progressActive && (
                <div className="w-full max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{progressStage}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {manualMessage && (
            <p className="text-sm text-red-600 mt-3">{manualMessage}</p>
          )}
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  const coverageItems = [
    { label: 'Food logs', value: coverage?.foodCount ?? 0 },
    { label: 'Water logs', value: coverage?.waterCount ?? 0 },
    { label: 'Check-ins', value: coverage?.checkinCount ?? 0 },
    { label: 'Mood entries', value: coverage?.moodCount ?? 0 },
    { label: 'Symptoms', value: coverage?.symptomCount ?? 0 },
    { label: 'Exercise', value: coverage?.exerciseCount ?? 0 },
    { label: 'Lab uploads', value: coverage?.labCount ?? 0 },
    { label: 'AI chats', value: coverage?.talkToAiCount ?? 0 },
  ]
  const maxCoverage = Math.max(1, ...coverageItems.map((item) => item.value))
  const daysActive = Math.min(7, Math.max(0, coverage?.daysActive ?? 0))
  const activityPercent = Math.round((daysActive / 7) * 100)
  const hydrationEntries = hydrationSummary?.entries ?? 0
  const hydrationDays = hydrationSummary?.daysWithLogs ?? 0
  const hydrationTotal = hydrationSummary?.totalMl ?? 0
  const hydrationAverage = hydrationSummary?.dailyAverageMl ?? 0
  const hydrationTop = Array.isArray(hydrationSummary?.topDrinks) ? hydrationSummary?.topDrinks : []
  const summaryText = report.summary || payload?.summary || 'Summary coming soon.'
  const summaryPoints = splitIntoPoints(summaryText)
  const periodRangeLabel = formatDateRange(report.periodStart, report.periodEnd)

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* Mobile app-style header */}
      <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push('/insights')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
          <div className="text-sm font-semibold text-slate-900">7-day report</div>
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800"
            >
              PDF
            </a>
          ) : (
            <div className="w-[68px]" />
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 pb-28 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">7-day health report</h1>
            <p className="text-sm text-slate-600 mt-1">{periodRangeLabel}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canManualReport && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={runManualReport}
                  disabled={manualStatus === 'running'}
                  className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
                >
                  {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
                </button>
                {progressActive && (
                  <div className="w-full max-w-xs">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{progressStage}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          {pdfHref && (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
                className="hidden md:inline-flex items-center rounded-lg border border-helfi-green px-4 py-2 text-sm font-medium text-helfi-green hover:bg-helfi-green/10"
              >
                Download PDF
              </a>
            )}
            <Link
              href="/insights"
              className="hidden md:inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
            >
              Back to Insights
            </Link>
          </div>
        </div>

        {manualMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {manualMessage}
          </div>
        )}

        {dataWarning && (
          <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {dataWarning}
          </div>
        )}

        <div id="data" className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Data used this week</h2>
              <p className="text-sm text-gray-600 mt-1">
                Last 7 days • {daysActive} active days • {coverage?.totalEvents ?? 0} total entries
              </p>
            </div>
            <div className="text-sm font-semibold text-emerald-600">
              {activityPercent}% activity strength
            </div>
          </div>
          <div className="mt-4 h-3 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-500"
              style={{ width: `${activityPercent}%` }}
            ></div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {coverageItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm text-gray-700">
                  <span>{item.label}</span>
                  <span className="font-semibold text-gray-900">{item.value}</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${Math.round((item.value / maxCoverage) * 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          {hydrationEntries > 0 && (
            <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-sky-900">Hydration summary</div>
                <div className="text-xs text-sky-700">
                  {hydrationEntries} {hydrationEntries === 1 ? 'entry' : 'entries'} • {hydrationDays} days
                </div>
              </div>
              <div className="mt-2 text-sm text-sky-800">
                {formatMl(hydrationTotal)} total • {formatMl(hydrationAverage)} per day
              </div>
              {hydrationTop.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {hydrationTop.map((drink, idx) => (
                    <span
                      key={`${drink.label || 'drink'}-${idx}`}
                      className="rounded-full border border-sky-100 bg-white px-3 py-1 text-xs text-sky-800"
                    >
                      {(drink.label || 'Drink').toString()} {drink.count ? `• ${drink.count}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div id="summary" className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Weekly summary</h2>
          {summaryPoints.length > 0 ? (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-gray-600">
              {summaryPoints.map((point, idx) => (
                <li key={`summary-point-${idx}`}>{point}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600 mt-2">{replaceIsoDates(summaryText)}</p>
          )}
          {estimatedCost && (
            <p className="text-xs text-gray-500 mt-2">
              Estimated AI cost for this report: ${estimatedCost}
            </p>
          )}
        </div>

        <div id="visuals" className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Visual snapshot</h2>
              <p className="text-sm text-slate-600 mt-1">
                Simple charts that summarize your last 7 days. They get better as you log more.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ReportVisuals
              periodStart={report.periodStart}
              periodEnd={report.periodEnd}
              coverage={coverage}
              nutritionSummary={nutritionSummary as any}
              hydrationSummary={hydrationSummary as any}
              dailyStats={dailyStats as any}
              symptomSummary={symptomSummary as any}
              exerciseSummary={exerciseSummary as any}
            />
          </div>
        </div>

        {keyInsights.length > 0 && (
          <div id="insights" className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Key insights this week</h2>
            <p className="text-sm text-gray-600 mt-2">
              These are the most important signals from your last 7 days.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {keyInsights.map((insight, idx) => (
                <div key={`${insight.label}-${idx}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {insight.label}
                  </div>
                  <div className="mt-2 font-semibold text-gray-900">{replaceIsoDates(insight.name || 'Insight')}</div>
                  <div className="mt-1 space-y-1 text-sm text-gray-600">
                    {splitIntoLines(insight.reason || '').map((line, lineIdx) => (
                      <p key={`key-insight-${idx}-line-${lineIdx}`}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {talkToAiSummary?.userMessageCount ? (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-blue-900">Talk to Helfi highlights</h2>
            <p className="text-sm text-blue-800 mt-2">
              {talkToAiSummary.userMessageCount} chat {talkToAiSummary.userMessageCount === 1 ? 'prompt' : 'prompts'}
              {talkToAiSummary.activeDays ? ` across ${talkToAiSummary.activeDays} days` : ''}.
            </p>
            <div className="mt-3">
              <Link
                href="/chat-log"
                className="inline-flex items-center rounded-full border border-blue-200 bg-white px-4 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
              >
                Open chat log
              </Link>
            </div>
            {talkToAiSummary.topics && talkToAiSummary.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {talkToAiSummary.topics.map((topic, idx) => (
                  <span key={`${topic.topic}-${idx}`} className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs text-blue-900">
                    {topic.topic}
                    {topic.count ? ` • ${topic.count}` : ''}
                  </span>
                ))}
              </div>
            )}
            {talkToAiSummary.highlights && talkToAiSummary.highlights.length > 0 && (
              <div className="mt-4 space-y-2">
                {talkToAiSummary.highlights.slice(-3).map((item, idx) => (
                  <div key={`talk-${idx}`} className="rounded-xl border border-blue-100 bg-white p-3 text-sm text-blue-900">
                    {item.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {labTrends && labTrends.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Lab results movement</h2>
            <p className="text-sm text-slate-600 mt-2">
              Changes are shown without judging good or bad. Share with your clinician if needed.
            </p>
            <div className="mt-4 space-y-3">
              {labTrends.slice(0, 6).map((trend, idx) => (
                <div key={`lab-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-900">{trend.name || 'Lab value'}</div>
                  <div className="text-sm text-slate-700 mt-1">
                    {trend.previousValue ?? '-'} → {trend.latestValue ?? '-'}
                    {trend.unit ? ` ${trend.unit}` : ''} (
                    {trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(wins.length > 0 || gaps.length > 0) && (
          <div id="wins-gaps" className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-emerald-900">Areas improving</h3>
              <p className="text-xs text-emerald-700 mt-1">What moved in the right direction this week.</p>
              <div className="mt-4 space-y-3">
                {wins.length === 0 && (
                  <div className="text-sm text-emerald-700">Keep logging to highlight real wins here.</div>
                )}
                {wins.map((item: any, idx: number) => (
                  <div key={`win-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4">
                    <div className="font-semibold text-emerald-900">{replaceIsoDates(item.name || 'Win')}</div>
                    <div className="mt-1 space-y-1 text-sm text-emerald-800">
                      {splitIntoLines(item.reason || '').map((line, lineIdx) => (
                        <p key={`win-${idx}-line-${lineIdx}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-amber-900">Areas to work on</h3>
              <p className="text-xs text-amber-700 mt-1">The biggest gaps holding back the report.</p>
              <div className="mt-4 space-y-3">
                {gaps.length === 0 && (
                  <div className="text-sm text-amber-700">No big gaps flagged this week.</div>
                )}
                {gaps.map((item: any, idx: number) => (
                  <div key={`gap-${idx}`} className="rounded-xl border border-amber-100 bg-white p-4">
                    <div className="font-semibold text-amber-900">{replaceIsoDates(item.name || 'Gap')}</div>
                    <div className="mt-1 space-y-1 text-sm text-amber-800">
                      {splitIntoLines(item.reason || '').map((line, lineIdx) => (
                        <p key={`gap-${idx}-line-${lineIdx}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveTab(section.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === section.key
                  ? 'bg-helfi-green text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeTab === 'supplements' && Array.isArray(supplementsList) && supplementsList.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-900">Your supplements</h2>
            <p className="mt-2 text-sm text-emerald-800">
              This is your current supplement list. The report text below should explain what looks helpful for your goals.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {supplementsList.map((s, idx) => (
                <div key={`${s?.name || 'supplement'}-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4">
                  <div className="font-semibold text-emerald-950">{replaceIsoDates(String(s?.name || 'Supplement'))}</div>
                  {(s?.dosage || s?.timing) ? (
                    <div className="mt-1 text-sm text-emerald-900/80">
                      {s?.dosage ? `Dose: ${s.dosage}` : 'Dose: -'}
                      {' • '}
                      {s?.timing ? `Timing: ${s.timing}` : 'Timing: -'}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-emerald-900/80">Dose/timing not set</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div id="sections" className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {activeTab === 'supplements' ? supplementCopy.workingTitle : "What's working"}
              </h3>
              <SectionBucket title="working" items={sections?.[activeTab]?.working || []} />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {activeTab === 'supplements' ? supplementCopy.suggestedTitle : 'Suggestions'}
              </h3>
              {activeTab === 'supplements' && !(sections?.[activeTab]?.suggested || []).length ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {supplementCopy.emptySuggested}
                </div>
              ) : (
                <SectionBucket title="suggested" items={sections?.[activeTab]?.suggested || []} />
              )}
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {activeTab === 'supplements' ? supplementCopy.avoidTitle : 'Things to avoid'}
              </h3>
              {activeTab === 'supplements' && !(sections?.[activeTab]?.avoid || []).length ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {supplementCopy.emptyAvoid}
                </div>
              ) : (
                <SectionBucket title="avoid" items={sections?.[activeTab]?.avoid || []} />
              )}
            </div>
          </div>
        </div>

        {reports.length > 1 && (
          <div id="archive" className="mt-10">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous reports</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {reports.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700"
                >
                  <Link
                    href={`/insights/weekly-report?id=${encodeURIComponent(item.id)}`}
                    className="block hover:text-helfi-green"
                  >
                    <div className="font-semibold">{formatDateRange(item.periodStart, item.periodEnd)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Generated {formatDateForLocale(item.createdAt)}
                    </div>
                  </Link>
                  <div className="mt-3 flex items-center gap-3">
                    <a
                      href={`/api/reports/weekly/pdf?reportId=${encodeURIComponent(item.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-helfi-green px-3 py-1.5 text-xs font-semibold text-helfi-green hover:bg-helfi-green/10"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile app-style bottom nav for the report */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2">
          <button
            onClick={() => scrollTo('summary')}
            className="flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Summary
          </button>
          <button
            onClick={() => scrollTo('visuals')}
            className="flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Charts
          </button>
          <button
            onClick={() => scrollTo('insights')}
            className="flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Insights
          </button>
          <button
            onClick={() => scrollTo('sections')}
            className="flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}
