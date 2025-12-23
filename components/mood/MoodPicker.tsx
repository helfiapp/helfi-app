'use client'

import React, { useMemo } from 'react'
import { MOOD_FACE_OPTIONS } from '@/components/mood/moodScale'

function triggerHaptic() {
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
    const enabled = pref === null ? true : pref === 'true'
    if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12)
    }
  } catch {}
}

export default function MoodPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (next: number) => void
}) {
  const selected = useMemo(() => MOOD_FACE_OPTIONS.find((o) => o.value === value) ?? null, [value])

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Pick your mood</div>
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {selected ? selected.label : 'Tap a face'}
        </div>
      </div>

      <div className="mt-4 w-full overflow-x-auto no-scrollbar">
        <div className="flex items-end gap-4 min-w-max px-1 pb-2">
          {MOOD_FACE_OPTIONS.map((o) => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  triggerHaptic()
                }}
                className={[
                  'group flex flex-col items-center gap-3 select-none touch-manipulation',
                  'transition-transform active:scale-95',
                  isSelected ? 'scale-110' : '',
                ].join(' ')}
                aria-pressed={isSelected}
                aria-label={o.label}
              >
                <div
                  className={[
                    'relative overflow-hidden rounded-full bg-transparent',
                    'border-2 border-transparent',
                    'flex items-center justify-center',
                    isSelected
                      ? 'w-[96px] h-[96px] border-helfi-green/0 ring-4 ring-helfi-green/25 shadow-[0_0_20px_rgba(77,175,80,0.25)]'
                      : 'w-[80px] h-[80px] group-hover:ring-2 group-hover:ring-helfi-green/15',
                  ].join(' ')}
                >
                  <span
                    className={[
                      isSelected ? 'text-6xl' : 'text-5xl',
                      'leading-none',
                      isSelected ? '' : 'opacity-80 group-hover:opacity-100',
                      'transition-all',
                    ].join(' ')}
                  >
                    {o.emoji}
                  </span>
                </div>
                <span
                  className={[
                    'text-sm font-semibold transition-colors',
                    isSelected ? 'text-helfi-green' : 'text-slate-500 dark:text-gray-300 group-hover:text-helfi-green',
                  ].join(' ')}
                >
                  {o.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
