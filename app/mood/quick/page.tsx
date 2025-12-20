'use client'

import React, { useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodPicker from '@/components/mood/MoodPicker'
import InfluenceChips from '@/components/mood/InfluenceChips'
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
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-gray-900 pb-28">
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

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-slate-100 dark:border-gray-700">
          <div className="mb-6 text-center px-2">
            <h1 className="tracking-tight text-[30px] sm:text-[32px] font-bold leading-tight text-slate-800 dark:text-white">
              How are you feeling right now?
            </h1>
            <p className="text-slate-500 dark:text-gray-300 text-base font-medium leading-normal mt-2">
              Tap a face, pick what’s affecting you, done.
            </p>
          </div>

          <MoodPicker value={mood} onChange={setMood} />

          <div className="mt-8">
            <InfluenceChips value={tags} onChange={setTags} />
          </div>

          <div className="hidden md:grid grid-cols-2 gap-3 mt-6">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 font-bold text-gray-800 dark:text-gray-200 active:scale-[0.98] transition-transform"
            >
              Remind me later
            </button>
            <button
              type="button"
              onClick={save}
              disabled={mood == null || saving}
              className="w-full bg-helfi-green hover:bg-helfi-green-dark active:scale-[0.98] text-white text-lg font-bold py-4 rounded-2xl shadow-lg shadow-green-200/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
              <span className="material-symbols-outlined text-[24px]">check</span>
            </button>
          </div>
        </div>
      </main>

      <div className="md:hidden fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-900 dark:via-gray-900/90 pt-10 z-40">
        <div className="max-w-3xl mx-auto px-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 font-bold text-gray-800 dark:text-gray-200 active:scale-[0.98] transition-transform"
          >
            Remind me later
          </button>
          <button
            type="button"
            onClick={save}
            disabled={mood == null || saving}
            className="w-full bg-helfi-green hover:bg-helfi-green-dark active:scale-[0.98] text-white text-lg font-bold py-4 rounded-2xl shadow-lg shadow-green-200/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
            <span className="material-symbols-outlined text-[24px]">check</span>
          </button>
        </div>
      </div>

      <InsightsBottomNav />
    </div>
  )
}
