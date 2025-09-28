'use client'

import { useSupplementsContext } from '../SupplementsShell'

export default function SupplementsWorkingPage() {
  const { extras } = useSupplementsContext()
  const items = extras.supportiveDetails ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        You're currently not taking any supplements that could help with this health issue. Please go back and click on the “Suggested Supplements” tab on the previous page.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((supplement, index) => (
        <div key={`${supplement.name}-${index}`} className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{supplement.name}</h3>
          <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{supplement.reason}</p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Dose</dt>
              <dd>{supplement.dosage || 'Not logged yet'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Timing</dt>
              <dd>
                {Array.isArray(supplement.timing) && supplement.timing.length
                  ? supplement.timing.join(', ')
                  : 'Add timing so we can flag spacing tips.'}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
