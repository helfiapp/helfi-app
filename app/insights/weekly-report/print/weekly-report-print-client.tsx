'use client'

import { useEffect, useMemo, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'
import ReportVisuals from '../ReportVisuals'

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
    .split(/(?:^|\s)\u2022\s+/g)
    .map(stripListPrefix)
    .filter(Boolean)
  if (inlineParts.length >= 3) return inlineParts

  return [stripListPrefix(raw)]
}

export default function WeeklyReportPrintClient({ report }: { report: WeeklyReportRecord }) {
  const [autoPrinted, setAutoPrinted] = useState(false)

  const payload = useMemo(() => parseMaybeJson(report.report), [report.report])
  const parsedSummary = useMemo(() => parseMaybeJson(report.dataSummary), [report.dataSummary])

  const summaryText = String(report.summary || (payload as any)?.summary || '').trim()
  const summaryPoints = useMemo(() => splitSummaryForPrint(summaryText), [summaryText])

  const coverage = (parsedSummary as any)?.coverage
  const nutritionSummary = (parsedSummary as any)?.nutritionSummary
  const hydrationSummary = (parsedSummary as any)?.hydrationSummary
  const dailyStats = (parsedSummary as any)?.dailyStats
  const symptomSummary = (parsedSummary as any)?.symptomSummary
  const exerciseSummary = (parsedSummary as any)?.exerciseSummary

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

        {summaryPoints.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Weekly summary</h2>
            {summaryPoints.length === 1 ? (
              <p className="mt-2 text-sm text-slate-700">{summaryPoints[0]}</p>
            ) : (
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {summaryPoints.map((point, idx) => (
                  <li key={`summary-${idx}`}>{point}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-semibold">Visual snapshot</h2>
          <p className="mt-1 text-sm text-slate-600">
            Charts that summarize your last 7 days. They improve as you log more.
          </p>
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

        <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 print:mt-6">
          Generated from the live report view (best-looking charts). If you want a one-click download later, we can add
          it once the design is locked.
        </div>
      </div>
    </div>
  )
}

