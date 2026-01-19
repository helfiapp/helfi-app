'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type WeeklyStatus = {
  reportId: string | null
  status: string | null
  showPopup: boolean
  summary: string | null
  periodStart: string | null
  periodEnd: string | null
  dataSummary: any
}

const DISABLED_PREFIXES = ['/onboarding', '/auth', '/privacy', '/terms', '/help', '/faq', '/insights/weekly-report']

export default function WeeklyReportReadyModal() {
  const pathname = usePathname()
  const router = useRouter()
  const [status, setStatus] = useState<WeeklyStatus | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [dismissNote, setDismissNote] = useState<string | null>(null)

  const formatDateForLocale = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
  }

  useEffect(() => {
    if (!pathname) return
    if (DISABLED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return

    let mounted = true
    fetch('/api/reports/weekly/status', { method: 'GET' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return
        if (data.showPopup && data.reportId) {
          const viewedKey = `helfi-weekly-report-viewed:${data.reportId}`
          const dismissedKey = `helfi-weekly-report-dismissed:${data.reportId}`
          try {
            if (window.sessionStorage.getItem(viewedKey) || window.sessionStorage.getItem(dismissedKey)) {
              return
            }
          } catch {
            // ignore storage errors
          }
          setStatus(data)
          setIsOpen(true)
          fetch('/api/reports/weekly/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: data.reportId, action: 'shown' }),
          }).catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [pathname])

  if (!isOpen || !status?.reportId) return null

  const dataWarning = status?.dataSummary?.dataWarning as string | undefined
  const isLocked = status?.status === 'LOCKED'

  const handleView = async () => {
    await fetch('/api/reports/weekly/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: status.reportId, action: 'viewed' }),
    }).catch(() => {})
    try {
      window.sessionStorage.setItem(`helfi-weekly-report-viewed:${status.reportId}`, '1')
    } catch {
      // ignore
    }
    setIsOpen(false)
    router.push(
      isLocked ? '/billing' : `/insights/weekly-report?id=${encodeURIComponent(status.reportId ?? '')}`
    )
  }

  const handleDontShow = async () => {
    await fetch('/api/reports/weekly/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: status.reportId, action: 'dont_show' }),
    }).catch(() => {})
    try {
      window.sessionStorage.setItem(`helfi-weekly-report-dismissed:${status.reportId}`, '1')
    } catch {
      // ignore
    }
    setDismissNote('All good - this report stays in your Insights section whenever you need it.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isLocked ? 'Your 7-day health report is ready to unlock' : 'Your 7-day health report is ready'}
            </h2>
            {status.periodStart && status.periodEnd && (
              <p className="text-xs text-gray-500 mt-1">
                {formatDateForLocale(status.periodStart)} to {formatDateForLocale(status.periodEnd)}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-600 mt-4">
          {isLocked
            ? 'Unlock your report to see what is working, what to focus on next, and what to avoid this week.'
            : 'Open the report to see what is working, what to focus on next, and what to avoid this week.'}
        </p>
        {dataWarning && (
          <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
            {dataWarning}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleView}
            className="w-full rounded-lg bg-helfi-green px-4 py-2 text-sm font-semibold text-white hover:bg-helfi-green/90"
          >
            {isLocked ? 'Unlock report' : 'View report'}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Not now
          </button>
          <button
            onClick={handleDontShow}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Don&apos;t show this again
          </button>
        </div>

        {dismissNote && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {dismissNote}
          </div>
        )}
      </div>
    </div>
  )
}
