'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'

export default function QuietHoursNotificationsPage() {
  const [enabled, setEnabled] = useState(false)
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('07:00')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem('quietHoursEnabled')
      const savedStart = localStorage.getItem('quietHoursStart')
      const savedEnd = localStorage.getItem('quietHoursEnd')
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true')
      if (savedStart) setStartTime(savedStart)
      if (savedEnd) setEndTime(savedEnd)
    } catch {}
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem('quietHoursEnabled', enabled.toString())
    localStorage.setItem('quietHoursStart', startTime)
    localStorage.setItem('quietHoursEnd', endTime)
  }, [enabled, startTime, endTime, loaded])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Quiet hours" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quiet hours</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pause reminders during set hours. Stored on this device for now.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Enable quiet hours</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pause notifications overnight</p>
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
        </div>
      </main>
    </div>
  )
}
