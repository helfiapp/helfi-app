'use client'

import { useSupplementsContext } from '../../SupplementsShell'

export default function SupplementsAvoidPage() {
  const { extras } = useSupplementsContext()
  const items = extras.avoidList ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        No supplements in your current stack are flagging as risky for this issue. Keep logging any changes so we can continue monitoring.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((supplement, index) => (
        <div key={`${supplement.name}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-rose-700">{supplement.name}</h3>
          <p className="text-sm text-rose-700 mt-1 leading-relaxed">{supplement.reason}</p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-rose-700">
            <div>
              <dt className="text-xs uppercase tracking-wide">Dose</dt>
              <dd>{supplement.dosage || 'Not logged'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Timing</dt>
              <dd>{supplement.timing.length ? supplement.timing.join(', ') : 'Timing not logged'}</dd>
            </div>
          </dl>
          <p className="text-xs text-rose-700 mt-3">Discuss this with your practitioner before continuing.</p>
        </div>
      ))}
    </div>
  )
}
