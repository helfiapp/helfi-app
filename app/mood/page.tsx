'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodPicker from '@/components/mood/MoodPicker'
import IntensitySlider from '@/components/mood/IntensitySlider'
import InfluenceChips from '@/components/mood/InfluenceChips'
import ExpandableContextRow from '@/components/mood/ExpandableContextRow'
import FivePointScale from '@/components/mood/FivePointScale'
import MoodTabs from '@/components/mood/MoodTabs'
import MoodTagChips from '@/components/mood/MoodTagChips'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'
import { ArrowTrendingUpIcon, BeakerIcon, BoltIcon, MoonIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useSession } from 'next-auth/react'

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
  const { data: session } = useSession()
  const [mood, setMood] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [feelings, setFeelings] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [intensityPercent, setIntensityPercent] = useState<number>(35)
  const pendingIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('notificationId')?.trim() || null
      : null
  )

  const [context, setContext] = useState<ContextResponse | null>(null)
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [sleepQuality, setSleepQuality] = useState<number | null>(null)
  const [nutrition, setNutrition] = useState<number | null>(null)
  const [supplements, setSupplements] = useState<number | null>(null)
  const [physicalActivity, setPhysicalActivity] = useState<number | null>(null)

  const localDate = useMemo(() => localDateToday(), [])

  useEffect(() => {
    if (!pendingIdRef.current) return
    try {
      sessionStorage.setItem('helfi:pending-notification-id', pendingIdRef.current)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('moodActivitySelections')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      setTags((prev) => {
        const next = new Set<string>(prev || [])
        for (const t of parsed) {
          const s = String(t ?? '').trim()
          if (!s) continue
          next.add(s)
        }
        return Array.from(next).slice(0, 12)
      })
      sessionStorage.removeItem('moodActivitySelections')
    } catch {}
  }, [])

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
    const pendingId =
      pendingIdRef.current ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('helfi:pending-notification-id') : null)
    try {
      const res = await fetch('/api/mood/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          tags,
          note,
          localDate,
          notificationId: pendingId || undefined,
          context: {
            localHour: new Date().getHours(),
            intensityPercent,
            ...(feelings.length ? { feelings } : {}),
            ...(energyLevel == null ? {} : { energyLevel }),
            ...(sleepQuality == null ? {} : { sleepQuality }),
            ...(nutrition == null ? {} : { nutrition }),
            ...(supplements == null ? {} : { supplements }),
            ...(physicalActivity == null ? {} : { physicalActivity }),
          },
        }),
      })
      if (!res.ok) throw new Error('save failed')
      if (pendingId) {
        try {
          sessionStorage.removeItem('helfi:pending-notification-id')
        } catch {}
        pendingIdRef.current = null
      }
      setBanner({ type: 'success', message: 'Saved.' })
      setMood(null)
      setTags([])
      setFeelings([])
      setNote('')
      setIntensityPercent(35)
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
  const supplementsValue = context ? (context.supplements.count > 0 ? 'Saved in Helfi' : 'None saved') : null

  const firstName = (() => {
    const raw = String(session?.user?.name || '').trim()
    if (!raw) return ''
    return raw.split(' ')[0] || raw
  })()

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-gray-900 pb-28">
      <PageHeader title="Daily Check‑In" backHref="/more" />
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

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 border border-slate-100 dark:border-gray-700">
          <div className="mb-6 text-center px-2">
            <h1 className="tracking-tight text-[30px] sm:text-[32px] font-bold leading-tight text-slate-800 dark:text-white">
              How are you feeling{firstName ? `, ${firstName}` : ''}?
            </h1>
            <p className="text-slate-500 dark:text-gray-300 text-base font-medium leading-normal mt-2">
              Pick the face that matches your vibe.
            </p>
          </div>

          <MoodPicker value={mood} onChange={setMood} />

          <div className="mt-6">
            <IntensitySlider value={intensityPercent} onChange={setIntensityPercent} />
          </div>

          <div className="mt-6">
            <MoodTagChips value={feelings} onChange={setFeelings} title="Emotions (optional)" />
          </div>

          <div className="mt-8">
            <InfluenceChips value={tags} onChange={setTags} />
          </div>

          <div className="mt-8">
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-base font-bold text-slate-800 dark:text-white px-1">
                Optional details
              </summary>
              <div className="mt-4 space-y-3">
                <ExpandableContextRow
                  label="Energy"
                  value={energyLevel ? `Level ${energyLevel}/5` : 'Optional'}
                  icon={<BoltIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <FivePointScale label="Energy" value={energyLevel} onChange={setEnergyLevel} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Sleep"
                  value={sleepQuality ? `Level ${sleepQuality}/5` : (sleepValue ? `Recent: ${sleepValue}` : 'Optional')}
                  icon={<MoonIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {sleepValue ? `Recent sleep: ${sleepValue}.` : 'If you connect a device, sleep can fill in automatically.'}
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
                  <FivePointScale label="Supplements impact" value={supplements} onChange={setSupplements} />
                </ExpandableContextRow>

                <ExpandableContextRow
                  label="Activity"
                  value={physicalActivity ? `Level ${physicalActivity}/5` : (activityValue || 'Optional')}
                  icon={<ArrowTrendingUpIcon className="w-5 h-5" aria-hidden="true" />}
                >
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {activityValue ? `Today: ${activityValue}.` : 'If you log activity, it can show up here automatically.'}
                  </div>
                  <FivePointScale label="Activity level" value={physicalActivity} onChange={setPhysicalActivity} />
                </ExpandableContextRow>

                <div className="px-1">
                  <div className="text-sm font-bold text-slate-800 dark:text-white">Note (optional)</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={600}
                    placeholder="Write a quick note…"
                    className="mt-3 w-full rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-helfi-green/10"
                  />
                  <div className="mt-1 text-xs text-slate-400 dark:text-gray-400">
                    {note.length}/600
                  </div>
                </div>
              </div>
            </details>

            <div className="mt-4 text-xs text-slate-500 dark:text-gray-400 px-1">
              Mood is required. Everything else is optional.
            </div>

            <div className="hidden md:block mt-6">
              <button
                type="button"
                onClick={save}
                disabled={mood == null || saving}
                className="w-full bg-helfi-green hover:bg-helfi-green-dark active:scale-[0.98] text-white text-lg font-bold py-4 rounded-2xl shadow-lg shadow-green-200/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Log Mood'}
                <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <div className="md:hidden fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-900 dark:via-gray-900/90 pt-10 z-40">
        <div className="max-w-3xl mx-auto px-4">
          <button
            type="button"
            onClick={save}
            disabled={mood == null || saving}
            className="w-full bg-helfi-green hover:bg-helfi-green-dark active:scale-[0.98] text-white text-lg font-bold py-4 rounded-2xl shadow-lg shadow-green-200/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Log Mood'}
            <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
          </button>
        </div>
      </div>

      <InsightsBottomNav />
    </div>
  )
}
