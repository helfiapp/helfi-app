'use client'

import { useSupplementsContext } from '../SupplementsShell'

export default function SupplementsSuggestedPage() {
  const { extras } = useSupplementsContext()
  const suggestions = extras.suggestedAdditions ?? []

  if (!suggestions.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        Great work—everything commonly recommended for this issue is already covered. Keep logging dose and timing so Helfi can keep tracking your response.
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
        Always review new supplements with your practitioner before adding them to your routine, then update your Helfi log so the AI can monitor changes.
      </p>
    </div>
  )
}
