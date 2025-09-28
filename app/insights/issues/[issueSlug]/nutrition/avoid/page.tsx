'use client'

import { useNutritionContext } from '../NutritionShell'

export default function NutritionAvoidPage() {
  const { extras } = useNutritionContext()
  const items = extras.avoidFoods ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        None of your recent meals are raising red flags. Keep balancing plates with protein, fiber, and colour.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((food, index) => (
        <div key={`${food.name}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-rose-700">{food.name}</h3>
          <p className="text-sm text-rose-700 mt-1 leading-relaxed">{food.reason}</p>
          <p className="text-xs text-rose-700 mt-3">Swap in a steadier option from the suggested tab and monitor how you feel.</p>
        </div>
      ))}
    </div>
  )
}
