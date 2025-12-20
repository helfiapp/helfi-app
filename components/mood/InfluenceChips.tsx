'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Influence = {
  label: string
  icon: string
}

const DEFAULT_INFLUENCES: Influence[] = [
  { label: 'Work', icon: 'work' },
  { label: 'Family', icon: 'family_restroom' },
  { label: 'Sleep', icon: 'bedtime' },
  { label: 'Food', icon: 'restaurant' },
  { label: 'Weather', icon: 'sunny' },
  { label: 'Exercise', icon: 'fitness_center' },
] as const

function normalize(tag: string) {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 24)
}

export default function InfluenceChips({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')

  const selected = useMemo(() => new Set(value.map((t) => normalize(t)).filter(Boolean)), [value])

  const toggle = (tag: string) => {
    const t = normalize(tag)
    if (!t) return
    const next = new Set(selected)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(Array.from(next))
  }

  const addCustom = () => {
    const t = normalize(custom)
    if (!t) return
    const next = new Set(selected)
    next.add(t)
    onChange(Array.from(next))
    setCustom('')
    setAdding(false)
  }

  const all = useMemo(() => {
    const base = DEFAULT_INFLUENCES.map((i) => i.label)
    const extra = Array.from(selected).filter((t) => !base.includes(t))
    return [...DEFAULT_INFLUENCES, ...extra.map((t) => ({ label: t, icon: 'sell' } as Influence))]
  }, [selected])

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-white">What’s affecting you?</h3>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem('moodActivitySelectionsDraft', JSON.stringify(value || []))
            } catch {}
            router.push('/mood/activity')
          }}
          className="text-sm font-bold text-helfi-green hover:underline"
        >
          Browse
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {all.map((item) => {
          const isSelected = selected.has(normalize(item.label))
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => toggle(item.label)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-all touch-manipulation active:scale-95',
                'border shadow-sm',
                isSelected
                  ? 'bg-helfi-green text-white border-helfi-green'
                  : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700/50 hover:border-slate-300',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-white' : 'text-slate-400 dark:text-gray-400'}`}>
                {item.icon}
              </span>
              <span className={isSelected ? 'font-bold' : 'font-medium'}>{item.label}</span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center justify-center w-10 h-[42px] bg-slate-50 dark:bg-gray-800 border border-dashed border-slate-300 dark:border-gray-600 rounded-full font-medium text-sm text-slate-400 hover:text-helfi-green hover:border-helfi-green transition-all active:scale-95"
          aria-label="Add custom tag"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </div>

      {adding && (
        <div className="mt-4 flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Add your own"
            className="flex-1 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-900 dark:text-white"
            maxLength={24}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!normalize(custom)}
            className="rounded-full bg-helfi-green px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
