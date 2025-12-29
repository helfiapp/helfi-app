'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'

const baseTimezones = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Amsterdam','Europe/Zurich','Europe/Stockholm','Europe/Athens',
  'Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Kuala_Lumpur','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Asia/Shanghai',
  'Australia/Perth','Australia/Adelaide','Australia/Melbourne','Australia/Sydney','Pacific/Auckland',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Bogota','America/Sao_Paulo'
]

function normalizeTime(input: string): string {
  if (!input) return '00:00'
  const s = input.trim().toLowerCase()
  const m24 = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1].padStart(2,'0')}:${m24[2]}`
  const m12 = s.match(/^([0-1]?\d):([0-5]\d)\s*(am|pm)$/)
  if (m12) {
    let h = parseInt(m12[1], 10)
    const mm = m12[2]
    const ap = m12[3]
    if (ap === 'pm' && h !== 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return `${String(h).padStart(2,'0')}:${mm}`
  }
  const digits = s.replace(/[^0-9]/g, '')
  if (digits.length >= 3) {
    const h = digits.slice(0, digits.length - 2)
    const mm = digits.slice(-2)
    const hh = Math.max(0, Math.min(23, parseInt(h, 10)))
    const m = Math.max(0, Math.min(59, parseInt(mm, 10)))
    return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  return '00:00'
}

export default function HealthReminderSettingsPage() {
  const [time1, setTime1] = useState('12:30')
  const [time2, setTime2] = useState('18:30')
  const [time3, setTime3] = useState('21:30')
  const [tz, setTz] = useState('Australia/Melbourne')
  const [frequency, setFrequency] = useState(3)
  const [savingTimes, setSavingTimes] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/checkins/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const data = await res.json()
          if (data.time1) setTime1(normalizeTime(data.time1))
          if (data.time2) setTime2(normalizeTime(data.time2))
          if (data.time3) setTime3(normalizeTime(data.time3))
          if (data.timezone) setTz(String(data.timezone))
          if (data.frequency !== undefined) setFrequency(data.frequency)
        }
      } catch (e) {
        console.error('Failed to load reminder settings', e)
      } finally {
        setLoadingSettings(false)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Health reminders" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daily check-in reminders</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Set up to 3 reminders per day to complete your check-ins.
          </p>

          {loadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-helfi-green"></div>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of reminders per day
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={1}>1 reminder</option>
                    <option value={2}>2 reminders</option>
                    <option value={3}>3 reminders</option>
                  </select>
                </div>

                {frequency >= 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 1
                    </label>
                    <input
                      type="time"
                      value={time1}
                      onChange={(e) => setTime1(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}

                {frequency >= 2 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 2
                    </label>
                    <input
                      type="time"
                      value={time2}
                      onChange={(e) => setTime2(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}

                {frequency >= 3 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Reminder 3
                    </label>
                    <input
                      type="time"
                      value={time3}
                      onChange={(e) => setTime3(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Timezone
                  </label>
                  <select
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {baseTimezones.map((tzOption) => (
                      <option key={tzOption} value={tzOption}>
                        {tzOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={async () => {
                  setSavingTimes(true)
                  try {
                    const res = await fetch('/api/checkins/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ time1, time2, time3, timezone: tz, frequency })
                    })
                    if (res.ok) {
                      alert('Reminder times saved successfully!')
                    } else {
                      const data = await res.json().catch(() => ({}))
                      alert(`Failed to save: ${data.error || 'Unknown error'}`)
                    }
                  } catch (e) {
                    alert('Failed to save reminder times. Please try again.')
                  } finally {
                    setSavingTimes(false)
                  }
                }}
                disabled={savingTimes}
                className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              >
                {savingTimes ? 'Saving...' : 'Save Reminder Times'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
