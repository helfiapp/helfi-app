'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'

export default function QuietHoursNotificationsPage() {
  const [enabled, setEnabled] = useState(false)
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('07:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/notifications/quiet-hours', { cache: 'no-store' as any })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        setEnabled(!!data.enabled)
        setStartTime(data.startTime || '22:00')
        setEndTime(data.endTime || '07:00')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const saveQuietHours = async () => {
    setSaving(true)
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const res = await fetch('/api/notifications/quiet-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          startTime,
          endTime,
          timezone,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error || 'Could not save quiet hours.')
        return
      }
      alert('Quiet hours saved.')
    } catch {
      alert('Could not save quiet hours.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Quiet hours" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quiet hours</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pause Health Coach alerts during your chosen hours.
            </p>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Loading quiet hours…</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Enable quiet hours</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pause alerts overnight.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Quiet hours start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Quiet hours end
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!enabled}
                  />
                </div>
              </div>

              <button
                onClick={saveQuietHours}
                disabled={saving}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save quiet hours'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
