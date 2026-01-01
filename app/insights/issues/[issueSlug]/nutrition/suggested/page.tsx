'use client'

import InsightMoreInfo from '@/components/InsightMoreInfo'
import { buildDetailBullets } from '@/lib/insights/detail-bullets'
import { useNutritionContext } from '../NutritionShell'

export default function NutritionSuggestedPage() {
  const { extras } = useNutritionContext()
  const runs = (extras.suggestionRuns ?? []).filter((r) => (r.suggestedFocus ?? []).length > 0)
  const fallbackItems = extras.suggestedFocus ?? []

  if (!runs.length && !fallbackItems.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        Your logged meals already cover the core nutrition moves for this issue. Keep noting portions and energy shifts so we can refine guidance.
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
              {run.suggestedFocus.map((focus, index) => (
                <div key={`${focus.title}-${index}`} className="border border-gray-200 bg-white rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-gray-900">{focus.title}</h3>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed">{focus.reason}</p>
                  <p className="mt-3 text-xs text-gray-500">Plan a meal this week that highlights this focus and log how you feel afterwards.</p>
                  <InsightMoreInfo
                    bullets={buildDetailBullets({
                      variant: 'nutrition-suggested',
                      reason: focus.reason,
                    })}
                  />
                </div>
              ))}
            </div>
          ))
        : fallbackItems.map((focus, index) => (
            <div key={`${focus.title}-${index}`} className="border border-gray-200 bg-white rounded-2xl p-5">
              <h3 className="text-base font-semibold text-gray-900">{focus.title}</h3>
              <p className="text-sm text-gray-700 mt-1 leading-relaxed">{focus.reason}</p>
              <p className="mt-3 text-xs text-gray-500">Plan a meal this week that highlights this focus and log how you feel afterwards.</p>
              <InsightMoreInfo
                bullets={buildDetailBullets({
                  variant: 'nutrition-suggested',
                  reason: focus.reason,
                })}
              />
            </div>
          ))}
    </div>
  )
}
