'use client'

import { useMedicationsContext } from '../MedicationsShell'

export default function MedicationsSuggestedPage() {
  const { extras } = useMedicationsContext()
  const suggestions = extras.suggestedAdditions ?? []

  if (!suggestions.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        No additional medications are commonly recommended based on your current log. Keep collaborating with your clinician and update Helfi after any prescription changes.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {suggestions.map((item, index) => (
        <div key={`${item.title}-${index}`} className="border border-gray-200 bg-white rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">{item.reason}</p>
          {item.suggestion && (
            <p className="mt-3 text-sm text-helfi-green font-semibold">
              Suggested protocol: {item.suggestion}
            </p>
          )}
        </div>
      ))}
      <p className="text-xs text-gray-500 mt-4">
        Discuss any new medication ideas with your clinician before starting, then update Helfi so the AI can monitor responses and interactions.
      </p>
    </div>
  )
}
