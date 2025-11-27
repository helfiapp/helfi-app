'use client'

import { useNutritionContext } from '../NutritionShell'

export default function NutritionWorkingPage() {
  const { extras } = useNutritionContext()
  const items = extras.workingFocus ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        We don’t yet see foods in your log that directly support this issue. Check the “Suggested Foods” tab for ideas and log meals so we can track wins.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((focus, index) => (
        <div key={`${focus.title}-${index}`} className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{focus.title}</h3>
          <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{focus.reason}</p>
          <dl className="mt-4 text-sm text-gray-700">
            <dt className="text-xs uppercase text-gray-500 tracking-wide">Example from your log</dt>
            <dd>{focus.example}</dd>
          </dl>
        </div>
      ))}
    </div>
  )
}
