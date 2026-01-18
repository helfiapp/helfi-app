'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'

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
}

function SectionBucket({ title, items }: { title: string; items: Array<{ name?: string; reason?: string }> }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        No data yet for this area.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={`${title}-${idx}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="font-semibold text-gray-900">{item.name || 'Insight'}</div>
          <p className="text-sm text-gray-600 mt-1">{item.reason || 'Keep logging for more detail.'}</p>
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

export default function WeeklyReportClient({ report, reports, nextReportDueAt }: WeeklyReportClientProps) {
  const [activeTab, setActiveTab] = useState<SectionKey>('overview')
  const router = useRouter()
  const [manualStatus, setManualStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [manualMessage, setManualMessage] = useState<string | null>(null)

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
      }
    | undefined
  const dailyStats = (parsedSummary as any)?.dailyStats as
    | Array<{
        date?: string
        foodEntries?: number
        calories?: number
        waterMl?: number
        exerciseMinutes?: number
        moodAvg?: number | null
        symptomEntries?: number
        checkinCount?: number
        topFoods?: Array<{ name?: string; count?: number }>
      }>
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

  const runManualReport = async () => {
    if (manualStatus === 'running') return
    setManualStatus('running')
    setManualMessage(null)
    let navigated = false
    try {
      const res = await fetch('/api/reports/weekly/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' }),
      })
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
      if (!navigated) {
        setManualStatus('idle')
      }
    }
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
              Next report due: {new Date(nextReportDueAt).toLocaleDateString()}
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
          <button
            onClick={runManualReport}
            disabled={manualStatus === 'running'}
            className="inline-flex mt-4 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
          >
            {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
          </button>
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
          <button
            onClick={runManualReport}
            disabled={manualStatus === 'running'}
            className="inline-flex mt-4 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
          >
            {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
          </button>
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
  const dailyRows = Array.isArray(dailyStats) ? dailyStats : []
  const logLinks = [
    { label: 'Food diary', href: '/food' },
    { label: 'Water log', href: '/food/water' },
    { label: 'Exercise log', href: '/health-tracking' },
    { label: 'Mood history', href: '/mood/history' },
    { label: 'Symptom history', href: '/symptoms/history' },
    { label: 'Check-in history', href: '/check-in/history' },
    { label: 'Lab reports', href: '/lab-reports' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10 pb-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
            <p className="text-sm text-gray-600 mt-1">
              {report.periodStart} to {report.periodEnd}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runManualReport}
              disabled={manualStatus === 'running'}
              className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
            >
              {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
            </button>
          {pdfHref && (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-helfi-green px-4 py-2 text-sm font-medium text-helfi-green hover:bg-helfi-green/10"
              >
                Download PDF
              </a>
            )}
            <Link
              href="/insights"
              className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
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

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Weekly summary</h2>
          <p className="text-sm text-gray-600 mt-2">{report.summary || payload?.summary || 'Summary coming soon.'}</p>
          {estimatedCost && (
            <p className="text-xs text-gray-500 mt-2">
              Estimated AI cost for this report: ${estimatedCost}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Open your logs</h2>
          <p className="text-sm text-gray-600 mt-2">
            These links open the pages where your last 7 days are stored.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {logLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {dailyRows.length > 0 && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Last 7 days breakdown</h2>
            <p className="text-sm text-gray-600 mt-2">
              Each day below shows exactly what was logged.
            </p>
            <div className="mt-4 space-y-3">
              {dailyRows.map((day, idx) => {
                const topFoods = Array.isArray(day.topFoods) ? day.topFoods : []
                const topFoodText = topFoods.length
                  ? `Top foods: ${topFoods
                      .map((food) => food.name)
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ')}.`
                  : ''
                return (
                  <div key={`${day.date || idx}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900">
                        {day.date ? new Date(day.date).toLocaleDateString() : 'Day'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Food {day.foodEntries ?? 0} • Water {formatMl(day.waterMl ?? 0)} • Exercise {day.exerciseMinutes ?? 0} mins
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Calories {day.calories ?? 0} kcal • Mood {day.moodAvg ?? 'n/a'} • Symptoms {day.symptomEntries ?? 0} • Check-ins {day.checkinCount ?? 0}
                    </div>
                    {topFoodText && (
                      <div className="mt-2 text-xs text-gray-500">{topFoodText}</div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {logLinks.map((link) => (
                        <Link
                          key={`${day.date || idx}-${link.href}`}
                          href={link.href}
                          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
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
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-emerald-900">Areas improving</h3>
              <p className="text-xs text-emerald-700 mt-1">What moved in the right direction this week.</p>
              <div className="mt-4 space-y-3">
                {wins.length === 0 && (
                  <div className="text-sm text-emerald-700">Keep logging to highlight real wins here.</div>
                )}
                {wins.map((item: any, idx: number) => (
                  <div key={`win-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4">
                    <div className="font-semibold text-emerald-900">{item.name || 'Win'}</div>
                    <p className="text-sm text-emerald-800 mt-1">{item.reason || ''}</p>
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
                    <div className="font-semibold text-amber-900">{item.name || 'Gap'}</div>
                    <p className="text-sm text-amber-800 mt-1">{item.reason || ''}</p>
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

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">What's working</h3>
              <SectionBucket title="working" items={sections?.[activeTab]?.working || []} />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Suggestions</h3>
              <SectionBucket title="suggested" items={sections?.[activeTab]?.suggested || []} />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Things to avoid</h3>
              <SectionBucket title="avoid" items={sections?.[activeTab]?.avoid || []} />
            </div>
          </div>
        </div>

        {reports.length > 1 && (
          <div className="mt-10">
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
                    <div className="font-semibold">{item.periodStart} to {item.periodEnd}</div>
                    <div className="text-xs text-gray-500 mt-1">Generated {new Date(item.createdAt).toLocaleDateString()}</div>
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
    </div>
  )
}
