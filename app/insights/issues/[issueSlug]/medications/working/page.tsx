'use client'

import { useMedicationsContext } from '../MedicationsShell'

export default function MedicationsWorkingPage() {
  const { extras } = useMedicationsContext()
  const items = extras.supportiveDetails ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        You're currently not taking any medications that clearly support this issue. Please review the “Suggested Medications” tab with your clinician before making changes.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((medication, index) => (
        <div key={`${medication.name}-${index}`} className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-gray-900">{medication.name}</h3>
          <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{medication.reason}</p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Dose</dt>
              <dd>{medication.dosage || 'Not logged yet'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500 tracking-wide">Timing</dt>
              <dd>
                {Array.isArray(medication.timing) && medication.timing.length
                  ? medication.timing.join(', ')
                  : 'Add timing so we can flag spacing tips.'}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
