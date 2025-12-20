'use client'

import React, { useMemo } from 'react'

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export default function IntensitySlider({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  const pct = useMemo(() => clampInt(value, 0, 100), [value])

  return (
    <div className="rounded-2xl p-5 shadow-sm border border-slate-100 bg-slate-50 dark:bg-gray-800/60 dark:border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-helfi-green/10 text-helfi-green flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">bolt</span>
          </div>
          <p className="text-base font-bold text-slate-700 dark:text-gray-100">Intensity</p>
        </div>
        <p className="text-2xl font-bold text-helfi-green">{pct}%</p>
      </div>

      <div className="relative w-full">
        <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-300 to-helfi-green"
            style={{ width: `${pct}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => onChange(clampInt(Number(e.target.value), 0, 100))}
          className="absolute inset-0 w-full h-8 -top-2 opacity-0 cursor-pointer"
          aria-label="Intensity"
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 w-7 h-7 bg-white dark:bg-gray-200 border-4 border-helfi-green rounded-full shadow-md transition-transform pointer-events-none"
          style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>

      <div className="flex justify-between mt-3 px-1">
        <span className="text-xs font-semibold text-slate-400 dark:text-gray-400 uppercase tracking-wider">Low</span>
        <span className="text-xs font-semibold text-slate-400 dark:text-gray-400 uppercase tracking-wider">High</span>
      </div>
    </div>
  )
}

