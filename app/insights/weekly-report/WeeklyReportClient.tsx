'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'medications', label: 'Medications' },
  { key: 'nutrition', label: 'Nutrition' },
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

export default function WeeklyReportClient({ report, reports, nextReportDueAt }: WeeklyReportClientProps) {
  const [activeTab, setActiveTab] = useState<SectionKey>('overview')

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
  const dataWarning = (report?.dataSummary as any)?.dataWarning as string | null
  const pdfHref = useMemo(() => {
    if (!report) return null
    const params = new URLSearchParams()
    if (report.periodStart) params.set('from', `${report.periodStart}T00:00:00`)
    if (report.periodEnd) params.set('to', `${report.periodEnd}T23:59:59`)
    const query = params.toString()
    return query ? `/api/export/pdf?${query}` : '/api/export/pdf'
  }, [report])

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

        {dataWarning && (
          <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {dataWarning}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Weekly summary</h2>
          <p className="text-sm text-gray-600 mt-2">{report.summary || payload?.summary || 'Summary coming soon.'}</p>
        </div>

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
              {reports.slice(0, 4).map((item) => (
                <Link
                  key={item.id}
                  href={`/insights/weekly-report?id=${encodeURIComponent(item.id)}`}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 hover:border-helfi-green"
                >
                  <div className="font-semibold">{item.periodStart} to {item.periodEnd}</div>
                  <div className="text-xs text-gray-500 mt-1">Generated {new Date(item.createdAt).toLocaleDateString()}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
