'use client'

import InsightMoreInfo from '@/components/InsightMoreInfo'
import { buildDetailBullets } from '@/lib/insights/detail-bullets'
import { useMedicationsContext } from '../MedicationsShell'

export default function MedicationsAvoidPage() {
  const { extras } = useMedicationsContext()
  const items = extras.avoidList ?? []

  if (!items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-700">
        No medications in your current regimen are flagging as risky for this issue. Continue logging updates so we can keep monitoring interactions.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((medication, index) => (
        <div key={`${medication.name}-${index}`} className="border border-rose-200 bg-rose-50/70 rounded-2xl p-5">
          <h3 className="text-base font-semibold text-rose-700">{medication.name}</h3>
          <p className="text-sm text-rose-700 mt-1 leading-relaxed">{medication.reason}</p>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-rose-700">
            <div>
              <dt className="text-xs uppercase tracking-wide">Dose</dt>
              <dd>{medication.dosage || 'Not logged'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Timing</dt>
              <dd>
                {Array.isArray(medication.timing) && medication.timing.length
                  ? medication.timing.join(', ')
                  : 'Timing not logged'}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-rose-700 mt-3">Review this with your clinician as soon as possible.</p>
          <InsightMoreInfo
            tone="warning"
            bullets={buildDetailBullets({
              variant: 'avoid',
              reason: medication.reason,
              dosage: medication.dosage,
              timing: medication.timing,
            })}
          />
        </div>
      ))}
    </div>
  )
}
