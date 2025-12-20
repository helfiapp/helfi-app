'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Category = 'All' | 'Social' | 'Rest' | 'Hobbies' | 'Work' | 'Health'

type ActivityItem = {
  id: string
  label: string
  category: Exclude<Category, 'All'>
  emoji: string
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  { id: 'friends', label: 'Friends', category: 'Social', emoji: '🫶' },
  { id: 'family', label: 'Family', category: 'Social', emoji: '👨‍👩‍👧‍👦' },
  { id: 'date', label: 'Date night', category: 'Social', emoji: '🌹' },
  { id: 'call', label: 'Call', category: 'Social', emoji: '📞' },
  { id: 'nap', label: 'Nap', category: 'Rest', emoji: '😴' },
  { id: 'relax', label: 'Relax', category: 'Rest', emoji: '🧘' },
  { id: 'bath', label: 'Bath', category: 'Rest', emoji: '🛁' },
  { id: 'time-off', label: 'Time off', category: 'Rest', emoji: '🌿' },
  { id: 'gaming', label: 'Gaming', category: 'Hobbies', emoji: '🎮' },
  { id: 'reading', label: 'Reading', category: 'Hobbies', emoji: '📚' },
  { id: 'music', label: 'Music', category: 'Hobbies', emoji: '🎵' },
  { id: 'movies', label: 'Movies', category: 'Hobbies', emoji: '🍿' },
  { id: 'creative', label: 'Creative', category: 'Hobbies', emoji: '🎨' },
  { id: 'work', label: 'Work', category: 'Work', emoji: '💼' },
  { id: 'study', label: 'Study', category: 'Work', emoji: '📝' },
  { id: 'meeting', label: 'Meeting', category: 'Work', emoji: '🧑‍💻' },
  { id: 'exercise', label: 'Exercise', category: 'Health', emoji: '🏃' },
  { id: 'walk', label: 'Walk', category: 'Health', emoji: '🚶' },
  { id: 'sunlight', label: 'Sunlight', category: 'Health', emoji: '☀️' },
  { id: 'hydration', label: 'Hydration', category: 'Health', emoji: '💧' },
  { id: 'nutrition', label: 'Food', category: 'Health', emoji: '🥗' },
] as const

function normalizeTag(input: string) {
  return input.trim().replace(/\s+/g, ' ').slice(0, 24)
}

const DRAFT_KEY = 'moodActivitySelectionsDraft'
const APPLY_KEY = 'moodActivitySelections'

export default function MoodActivityLogPage() {
  const router = useRouter()
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const next = new Set<string>()
      for (const t of parsed) {
        const n = normalizeTag(String(t ?? ''))
        if (n) next.add(n)
      }
      setSelected(next)
    } catch {}
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ACTIVITY_ITEMS.filter((item) => {
      const matchesCategory = activeCategory === 'All' ? true : item.category === activeCategory
      const matchesQuery = !q ? true : item.label.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, query])

  const toggle = (label: string) => {
    const t = normalizeTag(label)
    if (!t) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const addCustom = (value: string) => {
    const t = normalizeTag(value)
    if (!t) return
    setSelected((prev) => new Set(prev).add(t))
    setQuery('')
  }

  const done = () => {
    try {
      const arr = Array.from(selected)
      sessionStorage.setItem(APPLY_KEY, JSON.stringify(arr))
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {}
    router.push('/mood?from=activity')
  }

  const back = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {}
    router.back()
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-gray-900 pb-24">
      <div className="sticky top-0 z-40 bg-[#f8f9fa]/95 dark:bg-gray-900/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-200/60 dark:border-gray-800">
        <button
          type="button"
          onClick={back}
          className="flex size-12 shrink-0 items-center justify-start rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Back"
        >
          <span className="material-symbols-outlined text-[28px] text-slate-800 dark:text-white">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center text-slate-800 dark:text-white">
          Activity Log
        </h1>
        <button
          type="button"
          onClick={done}
          className="flex w-12 items-center justify-end rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Done"
        >
          <span className="text-helfi-green text-base font-bold leading-normal tracking-[0.015em] shrink-0">Done</span>
        </button>
      </div>

      <div className="max-w-md mx-auto px-5 pt-4 pb-2">
        <h2 className="tracking-tight text-[28px] font-bold leading-tight text-left text-slate-800 dark:text-white">
          What influenced your mood?
        </h2>
        <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">Select activities or create a new tag.</p>
      </div>

      <div className="max-w-md mx-auto px-5 py-4">
        <label className="flex flex-col h-12 w-full">
          <div className="flex w-full flex-1 items-stretch rounded-full h-full bg-white dark:bg-[#111827] shadow-sm border border-slate-200 dark:border-gray-800">
            <div className="flex items-center justify-center pl-4 pr-2">
              <span className="material-symbols-outlined text-slate-400 dark:text-gray-500" style={{ fontSize: 24 }}>
                search
              </span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-full text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-slate-400 dark:placeholder:text-gray-500 px-2 text-base font-normal leading-normal"
              placeholder="Search or create new tag"
            />
            <div className="flex items-center justify-center pr-2">
              <button
                type="button"
                onClick={() => {
                  addCustom(query)
                }}
                disabled={!normalizeTag(query)}
                className="flex items-center justify-center size-8 rounded-full bg-helfi-green hover:bg-helfi-green-dark text-white disabled:opacity-50"
                aria-label="Add tag"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  add
                </span>
              </button>
            </div>
          </div>
        </label>
      </div>

      <div className="max-w-md mx-auto flex gap-3 px-5 py-2 overflow-x-auto no-scrollbar scroll-smooth">
        {(['All', 'Social', 'Rest', 'Hobbies', 'Work', 'Health'] as Category[]).map((c) => {
          const active = c === activeCategory
          return (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={[
                'flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full px-5 transition-all',
                active
                  ? 'bg-helfi-green shadow-sm ring-1 ring-inset ring-transparent'
                  : 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700/50',
              ].join(' ')}
            >
              <span className={active ? 'text-[#0b2b10] text-sm font-bold leading-normal' : 'text-slate-700 dark:text-gray-200 text-sm font-medium leading-normal'}>
                {c}
              </span>
            </button>
          )
        })}
      </div>

      <div className="max-w-md mx-auto grid grid-cols-3 gap-y-6 gap-x-4 p-5 pb-24">
        {filtered.map((item) => {
          const isSelected = selected.has(normalizeTag(item.label))
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.label)}
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className={[
                  'relative p-1 rounded-full transition-all duration-200',
                  isSelected
                    ? 'ring-2 ring-helfi-green ring-offset-2 ring-offset-[#f8f9fa] dark:ring-offset-gray-900'
                    : 'hover:bg-black/5 dark:hover:bg-white/5',
                ].join(' ')}
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 flex items-center justify-center text-3xl">
                  {item.emoji}
                </div>
                {isSelected && (
                  <div className="absolute -bottom-1 -right-1 bg-helfi-green text-[#0b2b10] rounded-full p-0.5 border-2 border-[#f8f9fa] dark:border-gray-900">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, fontWeight: 700, display: 'block' }}>
                      check
                    </span>
                  </div>
                )}
              </div>
              <p className={isSelected ? 'text-slate-900 dark:text-white text-sm font-semibold leading-normal' : 'text-slate-500 dark:text-gray-400 text-sm font-medium leading-normal group-hover:text-helfi-green transition-colors'}>
                {item.label}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
