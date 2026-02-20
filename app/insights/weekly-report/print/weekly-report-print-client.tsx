'use client'

import { useEffect, useMemo, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'
import ReportVisuals from '../ReportVisuals'

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

function parseMaybeJson(value: any) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof value === 'object') return value
  return null
}

function replaceIsoDates(text: string) {
  if (!text) return ''
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(date.getTime())) return `${y}-${m}-${d}`
    return formatDateForLocale(date)
  })
}

function splitIntoLines(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  return cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function splitSummaryForPrint(summary: string) {
  const raw = String(summary || '').replace(/\r/g, '').trim()
  if (!raw) return []

  // Strip bullet-like prefixes so we don't render "• •".
  const bulletPrefixRe = /^\s*(?:[\u2022\u2023\u2043\u2219]|[-*\u00b7\u2013\u2014])\s+/
  const numberPrefixRe = /^\s*\d{1,3}[.)]\s+/
  const stripListPrefix = (value: string) => {
    let out = String(value || '')
    for (let i = 0; i < 3; i++) {
      const next = out.replace(bulletPrefixRe, '').replace(numberPrefixRe, '').trim()
      if (next === out.trim()) break
      out = next
    }
    return out.trim()
  }

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  const bulletish = lines.filter((l) => bulletPrefixRe.test(l) || numberPrefixRe.test(l))
  if (lines.length >= 2 && bulletish.length >= 2) {
    return bulletish.map(stripListPrefix).filter(Boolean)
  }

  // Inline bullets like: "• item • item"
  const inlineParts = raw
    .split(/(?:^|\\s)\\u2022\\s+/g)
    .map(stripListPrefix)
    .filter(Boolean)
  if (inlineParts.length >= 3) return inlineParts

  return [stripListPrefix(raw)]
}

function formatMl(value: number | null | undefined) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) {
    const liters = Math.round((ml / 1000) * 100) / 100
    return `${liters.toString().replace(/\\.0+$/, '').replace(/(\\.[1-9])0$/, '$1')} L`
  }
  return `${Math.round(ml)} ml`
}

function SectionBucket({ items }: { items: Array<{ name?: string; reason?: string }> }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
        No data yet for this section.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={`print-item-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="font-semibold text-slate-900">{replaceIsoDates(item.name || 'Insight')}</div>
          {item.reason ? (
            <div className="mt-1 space-y-1 text-sm text-slate-700">
              {splitIntoLines(item.reason).map((line, lineIdx) => (
                <p key={`print-item-${idx}-line-${lineIdx}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default function WeeklyReportPrintClient({ report }: { report: WeeklyReportRecord }) {
  const [autoPrinted, setAutoPrinted] = useState(false)

  const payload = useMemo(() => parseMaybeJson(report.report), [report.report])
  const parsedSummary = useMemo(() => parseMaybeJson(report.dataSummary), [report.dataSummary])

  const summaryText = String(report.summary || (payload as any)?.summary || '').trim()
  const summaryPoints = useMemo(() => splitSummaryForPrint(summaryText), [summaryText])

  const sections = (payload as any)?.sections || {}
  const wins = Array.isArray((payload as any)?.wins) ? (payload as any).wins : []
  const gaps = Array.isArray((payload as any)?.gaps) ? (payload as any).gaps : []

  const coverage = (parsedSummary as any)?.coverage
  const nutritionSummary = (parsedSummary as any)?.nutritionSummary
  const hydrationSummary = (parsedSummary as any)?.hydrationSummary
  const dailyStats = (parsedSummary as any)?.dailyStats
  const symptomSummary = (parsedSummary as any)?.symptomSummary
  const exerciseSummary = (parsedSummary as any)?.exerciseSummary
  const talkToAiSummary = (parsedSummary as any)?.talkToAiSummary
  const supplementsList = (parsedSummary as any)?.supplements
  const labTrends = (parsedSummary as any)?.labTrends

  const coverageItems = useMemo(() => {
    const c = coverage || {}
    return [
      { label: 'Food logs', value: Number(c.foodCount ?? 0) || 0 },
      { label: 'Water logs', value: Number(c.waterCount ?? 0) || 0 },
      { label: 'Mood entries', value: Number(c.moodCount ?? 0) || 0 },
      { label: 'Check-ins', value: Number(c.checkinCount ?? 0) || 0 },
      { label: 'Symptoms', value: Number(c.symptomCount ?? 0) || 0 },
      { label: 'Exercise', value: Number(c.exerciseCount ?? 0) || 0 },
      { label: 'Lab uploads', value: Number(c.labCount ?? 0) || 0 },
      { label: 'AI chats', value: Number(c.talkToAiCount ?? 0) || 0 },
    ]
  }, [coverage])

  const activityPercent = useMemo(() => {
    const daysActive = Math.min(7, Math.max(0, Number(coverage?.daysActive ?? 0) || 0))
    return Math.round((daysActive / 7) * 100)
  }, [coverage?.daysActive])

  useEffect(() => {
    // Give charts a moment to render before opening the print dialog.
    if (autoPrinted) return
    const t = window.setTimeout(() => {
      try {
        window.print()
      } catch {
        // ignore
      } finally {
        setAutoPrinted(true)
      }
    }, 1400)
    return () => window.clearTimeout(t)
  }, [autoPrinted])

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style jsx global>{`
        @media print {
          @page {
            margin: 14mm;
          }
          .print-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">7-day health report</h1>
            <p className="mt-1 text-sm text-slate-600">{formatDateRange(report.periodStart, report.periodEnd)}</p>
            <p className="mt-2 text-sm text-slate-600">
              Your print window should open automatically. If it doesn&apos;t, click Print.
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Print / Save as PDF
          </button>
        </div>

        <div className="hidden print:block">
          <div className="border-b border-slate-200 pb-4">
            <h1 className="text-2xl font-bold">7-day health report</h1>
            <p className="mt-1 text-sm text-slate-600">{formatDateRange(report.periodStart, report.periodEnd)}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 print-avoid-break">
          <h2 className="text-lg font-semibold">Data used this week</h2>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-700">
            <span>Activity strength</span>
            <span className="font-semibold text-emerald-700">{activityPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${Math.min(100, Math.max(0, activityPercent))}%` }}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            {coverageItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4 print-avoid-break">
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span>{item.label}</span>
                  <span className="font-semibold text-slate-900">{item.value}</span>
                </div>
              </div>
            ))}
          </div>

          {Number(hydrationSummary?.entries ?? 0) > 0 ? (
            <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50 p-4 print-avoid-break">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-sky-900">Hydration summary</div>
                <div className="text-xs text-sky-700">
                  {Number(hydrationSummary?.entries ?? 0) || 0} entries • {Number(hydrationSummary?.daysWithLogs ?? 0) || 0}{' '}
                  days
                </div>
              </div>
              <div className="mt-2 text-sm text-sky-800">
                {formatMl(Number(hydrationSummary?.totalMl ?? 0) || 0)} total •{' '}
                {formatMl(Number(hydrationSummary?.dailyAverageMl ?? 0) || 0)} per day
              </div>
              {Array.isArray(hydrationSummary?.topDrinks) && hydrationSummary.topDrinks.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {hydrationSummary.topDrinks.slice(0, 6).map((drink: any, idx: number) => (
                    <span
                      key={`${drink.label || 'drink'}-${idx}`}
                      className="rounded-full border border-sky-100 bg-white px-3 py-1 text-xs text-sky-800"
                    >
                      {(drink.label || 'Drink').toString()} {drink.count ? `• ${drink.count}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {summaryPoints.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 print-avoid-break">
            <h2 className="text-lg font-semibold">Weekly summary</h2>
            {summaryPoints.length === 1 ? (
              <p className="mt-2 text-sm text-slate-700">{replaceIsoDates(summaryPoints[0])}</p>
            ) : (
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {summaryPoints.map((point, idx) => (
                  <li key={`summary-${idx}`}>{replaceIsoDates(point)}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-lg font-semibold">Visual snapshot</h2>
          <p className="mt-1 text-sm text-slate-600">Charts that summarize your last 7 days. They improve as you log more.</p>
          <div className="mt-4">
            <ReportVisuals
              periodStart={report.periodStart}
              periodEnd={report.periodEnd}
              coverage={coverage}
              nutritionSummary={nutritionSummary}
              hydrationSummary={hydrationSummary}
              dailyStats={dailyStats}
              symptomSummary={symptomSummary}
              exerciseSummary={exerciseSummary}
            />
          </div>
        </div>

        {Array.isArray(labTrends) && labTrends.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 print-avoid-break">
            <h2 className="text-lg font-semibold">Lab results movement</h2>
            <p className="mt-2 text-sm text-slate-600">
              Changes are shown without judging good or bad. Share with your clinician if needed.
            </p>
            <div className="mt-4 space-y-3">
              {labTrends.slice(0, 10).map((trend: any, idx: number) => (
                <div key={`lab-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 print-avoid-break">
                  <div className="font-semibold text-slate-900">{trend.name || 'Lab value'}</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {trend.previousValue ?? '-'} → {trend.latestValue ?? '-'}
                    {trend.unit ? ` ${trend.unit}` : ''} (
                    {trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'})
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {talkToAiSummary?.userMessageCount ? (
          <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/40 p-6 print-avoid-break">
            <h2 className="text-lg font-semibold text-blue-900">Talk to Helfi highlights</h2>
            <p className="mt-2 text-sm text-blue-800">
              {talkToAiSummary.userMessageCount} chat {talkToAiSummary.userMessageCount === 1 ? 'prompt' : 'prompts'}
              {talkToAiSummary.activeDays ? ` across ${talkToAiSummary.activeDays} days` : ''}.
            </p>
            {Array.isArray(talkToAiSummary.topics) && talkToAiSummary.topics.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {talkToAiSummary.topics.map((topic: any, idx: number) => (
                  <span key={`topic-${idx}`} className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs text-blue-900">
                    {topic.topic}
                    {topic.count ? ` • ${topic.count}` : ''}
                  </span>
                ))}
              </div>
            ) : null}
            {Array.isArray(talkToAiSummary.highlights) && talkToAiSummary.highlights.length > 0 ? (
              <div className="mt-4 space-y-2">
                {talkToAiSummary.highlights.slice(-6).map((item: any, idx: number) => (
                  <div key={`talk-${idx}`} className="rounded-xl border border-blue-100 bg-white p-3 text-sm text-blue-900 print-avoid-break">
                    {item.content}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {(wins.length > 0 || gaps.length > 0) ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 print:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 print-avoid-break">
              <h3 className="text-lg font-semibold text-emerald-900">Areas improving</h3>
              <div className="mt-4 space-y-3">
                {wins.length === 0 ? <div className="text-sm text-emerald-700">No wins flagged this week.</div> : null}
                {wins.map((item: any, idx: number) => (
                  <div key={`win-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4 print-avoid-break">
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
            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-6 print-avoid-break">
              <h3 className="text-lg font-semibold text-amber-900">Areas to work on</h3>
              <div className="mt-4 space-y-3">
                {gaps.length === 0 ? <div className="text-sm text-amber-700">No big gaps flagged this week.</div> : null}
                {gaps.map((item: any, idx: number) => (
                  <div key={`gap-${idx}`} className="rounded-xl border border-amber-100 bg-white p-4 print-avoid-break">
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
        ) : null}

        {Array.isArray(supplementsList) && supplementsList.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 print-avoid-break">
            <h2 className="text-lg font-semibold text-emerald-900">Your supplements</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 print:grid-cols-2">
              {supplementsList.map((s: any, idx: number) => (
                <div key={`${s?.name || 'supplement'}-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4 print-avoid-break">
                  <div className="font-semibold text-emerald-950">{replaceIsoDates(String(s?.name || 'Supplement'))}</div>
                  {(s?.dosage || s?.timing) ? (
                    <div className="mt-1 text-sm text-emerald-900/80">
                      {s?.dosage ? `Dose: ${s.dosage}` : 'Dose: -'} {' • '}
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

        <div className="mt-10 border-t border-slate-200 pt-6">
          <h2 className="text-xl font-semibold">Full report details</h2>
          <p className="mt-2 text-sm text-slate-600">Everything below matches what you see online, but in a print-friendly layout.</p>

          <div className="mt-6 space-y-10">
            {SECTIONS.map((section) => {
              const bucket = sections?.[section.key] || {}
              const working = Array.isArray(bucket.working) ? bucket.working : []
              const suggested = Array.isArray(bucket.suggested) ? bucket.suggested : []
              const avoid = Array.isArray(bucket.avoid) ? bucket.avoid : []

              return (
                <div key={section.key} className="print-avoid-break">
                  <h3 className="text-lg font-semibold text-slate-900">{section.label}</h3>
                  <div className="mt-3 grid gap-5 lg:grid-cols-3 print:grid-cols-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-700 mb-2">What&apos;s working</div>
                      <SectionBucket items={working} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700 mb-2">Suggestions</div>
                      <SectionBucket items={suggested} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700 mb-2">Things to avoid</div>
                      <SectionBucket items={avoid} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
