'use client'

import { useEffect } from 'react'
import { useExerciseContext } from '../ExerciseShell'

export default function ExerciseWorkingPage() {
  const { extras } = useExerciseContext()
  const items = extras.workingActivities ?? []
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_INSIGHTS === '1' || process.env.NEXT_PUBLIC_DEBUG_INSIGHTS === 'true'

  useEffect(() => {
    if (DEBUG) {
      try {
        // Log minimal, safe snapshot for debugging
        // eslint-disable-next-line no-console
        console.log('[ExerciseWorkingPage] workingActivities', { count: items.length, titles: items.map((i) => i.title) })
      } catch {}
    }
  }, [DEBUG, items])

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        We haven't spotted any logged workouts that clearly support this issue yet. Explore the “Suggested Exercise” tab to plan your next sessions.
        {DEBUG && (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
            DEBUG: workingActivities empty
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((activity, index) => (
        <div key={`${activity.title}-${index}`} className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{activity.title}</h3>
          <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{activity.reason}</p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Most recent session</dt>
              <dd>{activity.summary}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Logged</dt>
              <dd>{activity.lastLogged}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
