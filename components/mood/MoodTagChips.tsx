'use client'

import React, { useMemo, useState } from 'react'
import { DEFAULT_MOOD_TAGS } from '@/components/mood/moodScale'

function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 24)
}

export default function MoodTagChips({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')

  const selected = useMemo(() => new Set(value.map((t) => normalizeTag(t)).filter(Boolean)), [value])

  const toggle = (tag: string) => {
    const t = normalizeTag(tag)
    if (!t) return
    const next = new Set(selected)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(Array.from(next))
  }

  const addCustom = () => {
    const t = normalizeTag(custom)
    if (!t) return
    const next = new Set(selected)
    next.add(t)
    onChange(Array.from(next))
    setCustom('')
    setAdding(false)
  }

  const allTags = useMemo(() => {
    const merged = new Set<string>(DEFAULT_MOOD_TAGS as any)
    selected.forEach((t) => merged.add(t))
    return Array.from(merged)
  }, [selected])

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Mood tags</div>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isSelected = selected.has(normalizeTag(tag))
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={[
                'px-3 py-1.5 rounded-full border text-sm touch-manipulation',
                'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-helfi-green focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                isSelected
                  ? 'bg-helfi-green/10 border-helfi-green/30 text-helfi-green-dark dark:text-helfi-green-light'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              {tag}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 touch-manipulation"
        >
          + Add tag
        </button>
      </div>

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom tag"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            maxLength={24}
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!normalizeTag(custom)}
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
