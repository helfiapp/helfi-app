'use client'

import React from 'react'

const LEVELS = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Low‑mid' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'High‑mid' },
  { value: 5, label: 'High' },
] as const

export default function FivePointScale({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (next: number | null) => void
}) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {LEVELS.map((l) => {
          const isSelected = l.value === value
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => onChange(isSelected ? null : l.value)}
              className={[
                'rounded-lg border px-2 py-2 text-xs font-medium touch-manipulation',
                isSelected
                  ? 'bg-helfi-green/10 border-helfi-green/30 text-helfi-green-dark dark:text-helfi-green-light'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              {l.value}
            </button>
          )
        })}
      </div>
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {value ? LEVELS.find((l) => l.value === value)?.label : 'Optional'}
      </div>
    </div>
  )
}

