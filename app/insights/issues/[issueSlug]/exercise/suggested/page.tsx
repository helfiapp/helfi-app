'use client'

import { useExerciseContext } from '../ExerciseShell'

export default function ExerciseSuggestedPage() {
  const { extras } = useExerciseContext()
  const items = extras.suggestedActivities ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        Nice work—your current training covers the key movements we recommend. Keep logging intensity and recovery notes.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((activity, index) => (
        <div key={`${activity.title}-${index}`} className="border border-gray-200 bg-white rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{activity.title}</h3>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">{activity.reason}</p>
          <p className="mt-3 text-xs text-gray-500">Schedule this for the coming week and log how you feel afterwards.</p>
        </div>
      ))}
    </div>
  )
}
