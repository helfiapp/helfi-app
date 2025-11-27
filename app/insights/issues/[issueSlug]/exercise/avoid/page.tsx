'use client'

import { useExerciseContext } from '../ExerciseShell'

export default function ExerciseAvoidPage() {
  const { extras } = useExerciseContext()
  const items = extras.avoidActivities ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        Nothing in your current log is signalling as counterproductive. Keep spacing intense sessions with recovery days.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((activity, index) => (
        <div key={`${activity.title}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-rose-700">{activity.title}</h3>
          <p className="text-sm text-rose-700 mt-1 leading-relaxed">{activity.reason}</p>
          <p className="text-xs text-rose-700 mt-3">Check in with your coach or clinician before continuing this pattern.</p>
        </div>
      ))}
    </div>
  )
}
