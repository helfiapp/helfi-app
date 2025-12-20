'use client'

import React, { useMemo } from 'react'
import MoodFaceIcon from '@/components/mood/MoodFaceIcon'
import { MOOD_LEVELS, type MoodValue } from '@/components/mood/moodScale'

function triggerHaptic() {
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  } catch {}
}

export default function MoodSlider({
  value,
  onChange,
}: {
  value: MoodValue | null
  onChange: (next: MoodValue) => void
}) {
  const selected = useMemo(() => MOOD_LEVELS.find((m) => m.value === value) ?? null, [value])

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Mood</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {selected ? selected.label : 'Select'}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <div className="rounded-xl bg-gradient-to-r from-red-400 via-yellow-300 to-green-500 p-[2px]">
          <div className="rounded-[10px] bg-white/80 dark:bg-gray-900/70 backdrop-blur px-2 py-3">
            <div className="grid grid-cols-7 gap-1">
              {MOOD_LEVELS.map((m) => {
                const isSelected = m.value === value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      onChange(m.value)
                      triggerHaptic()
                    }}
                    className={[
                      'touch-manipulation select-none rounded-xl py-2 flex flex-col items-center justify-center',
                      'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-helfi-green focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                      isSelected ? 'bg-white dark:bg-gray-800 shadow-sm' : 'bg-transparent hover:bg-white/50 dark:hover:bg-white/5',
                    ].join(' ')}
                    aria-pressed={isSelected}
                    aria-label={m.label}
                  >
                    <div style={{ color: m.color }} className="leading-none">
                      <MoodFaceIcon level={m.value} selected={isSelected} />
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-gray-700 dark:text-gray-200">
                      {m.value}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <input
            type="range"
            min={MOOD_LEVELS[0].value}
            max={MOOD_LEVELS[MOOD_LEVELS.length - 1].value}
            step={1}
            value={value ?? 4}
            onChange={(e) => {
              const next = Number(e.target.value) as MoodValue
              onChange(next)
              triggerHaptic()
            }}
            className="w-full accent-helfi-green"
            aria-label="Mood slider"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{MOOD_LEVELS[0].label}</span>
            <span>{MOOD_LEVELS[MOOD_LEVELS.length - 1].label}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

