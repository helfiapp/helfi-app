'use client'

import React, { useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodSlider from '@/components/mood/MoodSlider'
import MoodTagChips from '@/components/mood/MoodTagChips'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

function localDateToday() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function QuickMoodCheckInPage() {
  const [mood, setMood] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const localDate = useMemo(() => localDateToday(), [])

  const save = async () => {
    if (mood == null) return
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch('/api/mood/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood, tags, localDate, context: { localHour: new Date().getHours() } }),
      })
      if (!res.ok) throw new Error('save failed')
      setBanner({ type: 'success', message: 'Saved.' })
      setTimeout(() => window.location.assign('/dashboard'), 400)
    } catch {
      setBanner({ type: 'error', message: 'Could not save. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Quick Check‑In" backHref="/dashboard" />

      <main className="max-w-3xl mx-auto px-4 py-6">
        {banner && (
          <div
            className={[
              'mb-4 rounded-xl border px-4 py-3 text-sm',
              banner.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700',
            ].join(' ')}
          >
            {banner.message}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">How are you feeling right now?</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">One slider, optional tags, done.</p>
          </div>

          <MoodSlider value={mood as any} onChange={(v) => setMood(v)} />

          <div className="mt-5">
            <MoodTagChips value={tags} onChange={setTags} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 font-semibold text-gray-800 dark:text-gray-200"
            >
              Remind me later
            </button>
            <button
              type="button"
              onClick={save}
              disabled={mood == null || saving}
              className="rounded-xl bg-helfi-green px-4 py-3 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}
