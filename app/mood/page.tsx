'use client'

import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodSlider from '@/components/mood/MoodSlider'
import MoodTagChips from '@/components/mood/MoodTagChips'
import ExpandableContextRow from '@/components/mood/ExpandableContextRow'
import FivePointScale from '@/components/mood/FivePointScale'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'
import { ArrowTrendingUpIcon, BeakerIcon, BoltIcon, MoonIcon, SparklesIcon } from '@heroicons/react/24/outline'

type ContextResponse = {
  localDate: string
  meals: { todayCount: number; last: { name: string; meal: string | null; at: string } | null }
  supplements: { count: number }
  activity: { stepsToday: number | null; exerciseMinutesToday: number | null; exerciseCaloriesToday: number | null }
  sleep: { minutes: number | null; date: string | null }
}

function localDateToday() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function minutesToHours(minutes: number | null) {
  if (!minutes) return null
  const hrs = minutes / 60
  return `${hrs.toFixed(1)} h`
}

export default function MoodCheckInPage() {
  const [mood, setMood] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [context, setContext] = useState<ContextResponse | null>(null)
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [sleepQuality, setSleepQuality] = useState<number | null>(null)
  const [nutrition, setNutrition] = useState<number | null>(null)
  const [supplements, setSupplements] = useState<number | null>(null)
  const [physicalActivity, setPhysicalActivity] = useState<number | null>(null)

  const localDate = useMemo(() => localDateToday(), [])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const res = await fetch(`/api/mood/context?localDate=${encodeURIComponent(localDate)}`, { cache: 'no-store' as any })
        if (!res.ok) return
        const j = (await res.json()) as ContextResponse
        if (!ignore) setContext(j)
      } catch {}
    }
    load()
    return () => { ignore = true }
  }, [localDate])

  const save = async () => {
    if (mood == null) return
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch('/api/mood/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          tags,
          note,
          localDate,
          context: {
            localHour: new Date().getHours(),
            ...(energyLevel == null ? {} : { energyLevel }),
            ...(sleepQuality == null ? {} : { sleepQuality }),
            ...(nutrition == null ? {} : { nutrition }),
            ...(supplements == null ? {} : { supplements }),
            ...(physicalActivity == null ? {} : { physicalActivity }),
          },
        }),
      })
      if (!res.ok) throw new Error('save failed')
      setBanner({ type: 'success', message: 'Saved.' })
      setMood(null)
      setTags([])
      setNote('')
      setEnergyLevel(null)
      setSleepQuality(null)
      setNutrition(null)
      setSupplements(null)
      setPhysicalActivity(null)
      setTimeout(() => { window.location.assign('/mood/history?saved=1') }, 400)
    } catch {
      setBanner({ type: 'error', message: 'Could not save. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const sleepValue = context?.sleep?.minutes ? minutesToHours(context.sleep.minutes) : null
  const activityValue =
    context?.activity?.stepsToday != null ? `${context.activity.stepsToday.toLocaleString()} steps` :
    context?.activity?.exerciseMinutesToday != null ? `${context.activity.exerciseMinutesToday} min` :
    null
  const nutritionValue =
    context ? `${context.meals.todayCount} meal${context.meals.todayCount === 1 ? '' : 's'} logged` : null
  const supplementsValue = context ? `${context.supplements.count} saved` : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood" backHref="/more" />
      <MoodTabs />

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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">How are you feeling?</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">A quick check-in to spot patterns over time.</p>
          </div>

          <MoodSlider value={mood as any} onChange={(v) => setMood(v)} />

          <div className="mt-6 space-y-4">
            <details className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <summary className="cursor-pointer select-none text-sm font-medium text-gray-900 dark:text-white">
                Mood tags (optional)
              </summary>
              <div className="mt-3">
                <MoodTagChips value={tags} onChange={setTags} />
              </div>
            </details>

            <details className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <summary className="cursor-pointer select-none text-sm font-medium text-gray-900 dark:text-white">
                Context (optional)
              </summary>
              <div className="mt-3 space-y-3">
                <ExpandableContextRow
                  label="Energy level"
                  value={energyLevel ? `Level ${energyLevel}/5` : 'Optional'}
                  icon={<BoltIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <FivePointScale label="Energy" value={energyLevel} onChange={setEnergyLevel} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Sleep quality"
                  value={sleepQuality ? `Level ${sleepQuality}/5` : (sleepValue ? `Last sleep: ${sleepValue}` : 'Optional')}
                  icon={<MoonIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {sleepValue ? `Recent sleep: ${sleepValue}.` : 'Connect a device for automatic sleep context.'}
                  </div>
                  <FivePointScale label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Nutrition"
                  value={nutrition ? `Level ${nutrition}/5` : (nutritionValue || 'Optional')}
                  icon={<SparklesIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  {context?.meals?.last && (
                    <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      Last meal: {context.meals.last.name}
                    </div>
                  )}
                  <FivePointScale label="Nutrition quality" value={nutrition} onChange={setNutrition} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Supplements"
                  value={supplements ? `Level ${supplements}/5` : (supplementsValue || 'Optional')}
                  icon={<BeakerIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    Supplement intake timing isn’t tracked yet; you can still add a quick rating for context.
                  </div>
                  <FivePointScale label="Supplements impact" value={supplements} onChange={setSupplements} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Physical activity"
                  value={physicalActivity ? `Level ${physicalActivity}/5` : (activityValue || 'Optional')}
                  icon={<ArrowTrendingUpIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {activityValue ? `Today: ${activityValue}.` : 'Log an exercise entry or sync a device for activity context.'}
                  </div>
                  <FivePointScale label="Activity level" value={physicalActivity} onChange={setPhysicalActivity} />
                </ExpandableContextRow>
              </div>
            </details>

            <details className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <summary className="cursor-pointer select-none text-sm font-medium text-gray-900 dark:text-white">
                Note (optional)
              </summary>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Write a note…"
                className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {note.length}/600
              </div>
            </details>

            <button
              type="button"
              onClick={save}
              disabled={mood == null || saving}
              className="w-full rounded-xl bg-helfi-green px-4 py-3 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Mood is required. Everything else is optional.
            </div>
          </div>
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}
