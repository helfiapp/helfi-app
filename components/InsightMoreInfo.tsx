'use client'

import { useState } from 'react'

type InsightMoreInfoProps = {
  bullets: string[]
  tone?: 'neutral' | 'positive' | 'warning'
  label?: string
}

export default function InsightMoreInfo({
  bullets,
  tone = 'neutral',
  label = 'More info',
}: InsightMoreInfoProps) {
  const [open, setOpen] = useState(false)

  if (!bullets.length) return null

  const tonePanel =
    tone === 'positive'
      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
      : tone === 'warning'
      ? 'border-rose-200 bg-rose-50/60 text-rose-700'
      : 'border-gray-200 bg-gray-50 text-gray-700'
  const toneButton =
    tone === 'positive'
      ? 'text-emerald-700 hover:text-emerald-900'
      : tone === 'warning'
      ? 'text-rose-700 hover:text-rose-900'
      : 'text-gray-600 hover:text-gray-800'

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`text-xs font-semibold ${toneButton}`}
      >
        {open ? 'Hide info' : label}
      </button>
      {open && (
        <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${tonePanel}`}>
          <ul className="list-disc list-inside space-y-1">
            {bullets.map((bullet, idx) => (
              <li key={`${bullet}-${idx}`}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
