'use client'

import { useNutritionContext } from '../NutritionShell'

export default function NutritionAvoidPage() {
  const { extras } = useNutritionContext()
  const runs = (extras.suggestionRuns ?? []).filter((r) => (r.avoidFoods ?? []).length > 0)
  const fallbackItems = extras.avoidFoods ?? []

  if (!runs.length && !fallbackItems.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        None of your recent meals are raising red flags. Keep balancing plates with protein, fiber, and colour.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {runs.length
        ? runs.map((run, runIdx) => (
            <div key={`run-${run.generatedAt}-${runIdx}`} className="space-y-3">
              <div className="text-xs font-semibold text-gray-600">
                Generated {new Date(run.generatedAt).toLocaleString()}
              </div>
              {run.avoidFoods.map((food, index) => (
                <div key={`${food.name}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-rose-700">{food.name}</h3>
                  <p className="text-sm text-rose-700 mt-1 leading-relaxed">{food.reason}</p>
                  <p className="text-xs text-rose-700 mt-3">Swap in a steadier option from the suggested tab and monitor how you feel.</p>
                </div>
              ))}
            </div>
          ))
        : fallbackItems.map((food, index) => (
            <div key={`${food.name}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
              <h3 className="text-base font-semibold text-rose-700">{food.name}</h3>
              <p className="text-sm text-rose-700 mt-1 leading-relaxed">{food.reason}</p>
              <p className="text-xs text-rose-700 mt-3">Swap in a steadier option from the suggested tab and monitor how you feel.</p>
            </div>
          ))}
    </div>
  )
}
