'use client'

import { useNutritionContext } from '../NutritionShell'

export default function NutritionSuggestedPage() {
  const { extras } = useNutritionContext()
  const items = extras.suggestedFocus ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        Your logged meals already cover the core nutrition moves for this issue. Keep noting portions and energy shifts so we can refine guidance.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((focus, index) => (
        <div key={`${focus.title}-${index}`} className="border border-gray-200 bg-white rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{focus.title}</h3>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">{focus.reason}</p>
          <p className="mt-3 text-xs text-gray-500">Plan a meal this week that highlights this focus and log how you feel afterwards.</p>
        </div>
      ))}
    </div>
  )
}
