'use client'

import React, { useEffect, useMemo, useState } from 'react'

type CustomIcon = {
  type: 'badge' | 'image'
  value: string
  color?: string
}

type Tile = {
  id: string
  label: string
  imageUrl?: string
  badgeMark?: string
  badgeColor?: string
  fallbackIcon?: string
  isCustom?: boolean
}

const CUSTOM_ICON_KEY = 'moodCustomIconsV1'

const BADGE_COLORS = [
  '#E8F5E9',
  '#E3F2FD',
  '#FCE4EC',
  '#FFF3E0',
  '#E8EAF6',
  '#E0F7FA',
  '#F3E5F5',
  '#F1F8E9',
] as const

const ICON_URLS = {
  work: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/5f20be-computer/dynamic/200/color.webp',
  family: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1acc3d-heart/dynamic/200/color.webp',
  sleep: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/a63030-moon/dynamic/200/color.webp',
  food: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7fb19c-cup/dynamic/200/color.webp',
  weather: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/801da3-sun/dynamic/200/color.webp',
  exercise: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/10c35a-gym/dynamic/200/color.webp',
  travel: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/fa6099-travel/dynamic/200/color.webp',
  social: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/eec43d-chat-bubble/dynamic/200/color.webp',
  music: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/331e9c-music/dynamic/200/color.webp',
  movies: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/b1dccf-video-cam/dynamic/200/color.webp',
  gaming: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/a68576-puzzle/dynamic/200/color.webp',
  reading: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/628100-notebook/dynamic/200/color.webp',
  shopping: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/f71a3e-bag/dynamic/200/color.webp',
  cleaning: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/368c50-broom/dynamic/200/color.webp',
  cooking: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/544d0d-cauldron/dynamic/200/color.webp',
  tea: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/845bf0-tea-cup/dynamic/200/color.webp',
  photography: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/5656e5-camera/dynamic/200/color.webp',
  art: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/fcbbf1-painting-kit/dynamic/200/color.webp',
  nature: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/2c84d9-leaf/dynamic/200/color.webp',
  pets: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1dec68-bone/dynamic/200/color.webp',
  money: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7d956f-wallet/dynamic/200/color.webp',
  goals: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/49b6f4-target/dynamic/200/color.webp',
  calendar: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/f32794-calendar/dynamic/200/color.webp',
  walk: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1858b9-map-pin/dynamic/200/color.webp',
  study: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/66b0f8-pencil/dynamic/200/color.webp',
  relax: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/6e6a21-candle/dynamic/200/color.webp',
  calls: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/87c2c5-call-out/dynamic/200/color.webp',
  sports: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7db5bc-ball/dynamic/200/color.webp',
  diy: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/ff5be0-tools/dynamic/200/color.webp',
  chores: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/add2ea-trash-can/dynamic/200/color.webp',
  rainy: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/3f82a3-umbrella/dynamic/200/color.webp',
  audio: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/b81ead-headphone/dynamic/200/color.webp',
  achievement: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/39121b-medal/dynamic/200/color.webp',
  motivation: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/744cc0-rocket/dynamic/200/color.webp',
  time: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/8ef1fa-clock/dynamic/200/color.webp',
} as const

const ICON_CHOICES = [
  { id: 'work', label: 'Work', imageUrl: ICON_URLS.work },
  { id: 'family', label: 'Family', imageUrl: ICON_URLS.family },
  { id: 'sleep', label: 'Sleep', imageUrl: ICON_URLS.sleep },
  { id: 'food', label: 'Food & Drink', imageUrl: ICON_URLS.food },
  { id: 'weather', label: 'Weather', imageUrl: ICON_URLS.weather },
  { id: 'exercise', label: 'Exercise', imageUrl: ICON_URLS.exercise },
  { id: 'travel', label: 'Travel', imageUrl: ICON_URLS.travel },
  { id: 'social', label: 'Social', imageUrl: ICON_URLS.social },
  { id: 'music', label: 'Music', imageUrl: ICON_URLS.music },
  { id: 'movies', label: 'Movies', imageUrl: ICON_URLS.movies },
  { id: 'gaming', label: 'Gaming', imageUrl: ICON_URLS.gaming },
  { id: 'reading', label: 'Reading', imageUrl: ICON_URLS.reading },
  { id: 'shopping', label: 'Shopping', imageUrl: ICON_URLS.shopping },
  { id: 'cleaning', label: 'Cleaning', imageUrl: ICON_URLS.cleaning },
  { id: 'cooking', label: 'Cooking', imageUrl: ICON_URLS.cooking },
  { id: 'tea', label: 'Tea/Coffee', imageUrl: ICON_URLS.tea },
  { id: 'photography', label: 'Photography', imageUrl: ICON_URLS.photography },
  { id: 'art', label: 'Art', imageUrl: ICON_URLS.art },
  { id: 'nature', label: 'Nature', imageUrl: ICON_URLS.nature },
  { id: 'pets', label: 'Pets', imageUrl: ICON_URLS.pets },
  { id: 'money', label: 'Money', imageUrl: ICON_URLS.money },
  { id: 'goals', label: 'Goals', imageUrl: ICON_URLS.goals },
  { id: 'calendar', label: 'Schedule', imageUrl: ICON_URLS.calendar },
  { id: 'walk', label: 'Walk', imageUrl: ICON_URLS.walk },
  { id: 'study', label: 'Study', imageUrl: ICON_URLS.study },
  { id: 'relax', label: 'Relax', imageUrl: ICON_URLS.relax },
  { id: 'calls', label: 'Calls', imageUrl: ICON_URLS.calls },
  { id: 'sports', label: 'Sports', imageUrl: ICON_URLS.sports },
  { id: 'diy', label: 'DIY', imageUrl: ICON_URLS.diy },
  { id: 'chores', label: 'Chores', imageUrl: ICON_URLS.chores },
  { id: 'rainy', label: 'Rainy day', imageUrl: ICON_URLS.rainy },
  { id: 'audio', label: 'Podcasts', imageUrl: ICON_URLS.audio },
  { id: 'achievement', label: 'Achievement', imageUrl: ICON_URLS.achievement },
  { id: 'motivation', label: 'Motivation', imageUrl: ICON_URLS.motivation },
  { id: 'time', label: 'Time', imageUrl: ICON_URLS.time },
] as const

function normalize(tag: string) {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 24)
}

function colorForLabel(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) % 997
  }
  return BADGE_COLORS[hash % BADGE_COLORS.length]
}

function firstMark(label: string): string {
  const s = label.trim()
  if (!s) return '•'
  try {
    const Seg = (Intl as any)?.Segmenter
    if (Seg) {
      const seg = new Seg(undefined, { granularity: 'grapheme' })
      const it = seg.segment(s)[Symbol.iterator]()
      const first = it.next()?.value
      const val = first?.segment
      if (val) return String(val)
    }
  } catch {}
  return Array.from(s)[0] || '•'
}

function defaultBadge(label: string): CustomIcon {
  return {
    type: 'badge',
    value: firstMark(label),
    color: colorForLabel(label),
  }
}

export default function InfluenceChips({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [customIcons, setCustomIcons] = useState<Record<string, CustomIcon>>({})
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [iconPickerLabel, setIconPickerLabel] = useState<string | null>(null)
  const [pendingIcon, setPendingIcon] = useState<CustomIcon | null>(null)

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem('moodInfluencesExpanded')
      if (flag === '1') {
        setExpanded(true)
        sessionStorage.removeItem('moodInfluencesExpanded')
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_ICON_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setCustomIcons(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_ICON_KEY, JSON.stringify(customIcons))
    } catch {}
  }, [customIcons])

  const selected = useMemo(() => new Set(value.map((t) => normalize(t)).filter(Boolean)), [value])

  const toggle = (tag: string) => {
    const t = normalize(tag)
    if (!t) return
    const next = new Set(selected)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(Array.from(next))
  }

  const openPicker = (label: string | null) => {
    setIconPickerLabel(label)
    setIconPickerOpen(true)
  }

  const closePicker = () => {
    setIconPickerOpen(false)
    setIconPickerLabel(null)
  }

  const applyIcon = (label: string, icon: CustomIcon) => {
    const key = normalize(label)
    setCustomIcons((prev) => ({ ...prev, [key]: icon }))
  }

  const addCustom = () => {
    const t = normalize(custom)
    if (!t) return
    const next = new Set(selected)
    next.add(t)
    onChange(Array.from(next))
    const icon = pendingIcon || defaultBadge(t)
    applyIcon(t, icon)
    setCustom('')
    setAdding(false)
    setPendingIcon(null)
    setExpanded(true)
  }

  const getCustomIcon = (label: string) => {
    const key = normalize(label)
    return customIcons[key] || defaultBadge(label)
  }

  const tiles = useMemo((): Tile[] => {
    const main: Tile[] = [
      { id: 'work', label: 'Work', imageUrl: ICON_URLS.work, fallbackIcon: 'work' },
      { id: 'family', label: 'Family', imageUrl: ICON_URLS.family, fallbackIcon: 'family_restroom' },
      { id: 'sleep', label: 'Sleep', imageUrl: ICON_URLS.sleep, fallbackIcon: 'bedtime' },
      { id: 'food', label: 'Food & Drink', imageUrl: ICON_URLS.food, fallbackIcon: 'restaurant' },
      { id: 'weather', label: 'Weather', imageUrl: ICON_URLS.weather, fallbackIcon: 'sunny' },
      { id: 'exercise', label: 'Exercise', imageUrl: ICON_URLS.exercise, fallbackIcon: 'fitness_center' },
      { id: 'achievement', label: 'Achievement', imageUrl: ICON_URLS.achievement, fallbackIcon: 'emoji_events' },
    ]

    const more: Tile[] = [
      { id: 'travel', label: 'Travel', imageUrl: ICON_URLS.travel },
      { id: 'social', label: 'Social', imageUrl: ICON_URLS.social },
      { id: 'music', label: 'Music', imageUrl: ICON_URLS.music },
      { id: 'movies', label: 'Movies', imageUrl: ICON_URLS.movies },
      { id: 'gaming', label: 'Gaming', imageUrl: ICON_URLS.gaming },
      { id: 'reading', label: 'Reading', imageUrl: ICON_URLS.reading },
      { id: 'shopping', label: 'Shopping', imageUrl: ICON_URLS.shopping },
      { id: 'cleaning', label: 'Cleaning', imageUrl: ICON_URLS.cleaning },
      { id: 'cooking', label: 'Cooking', imageUrl: ICON_URLS.cooking },
      { id: 'tea', label: 'Tea/Coffee', imageUrl: ICON_URLS.tea },
      { id: 'photography', label: 'Photography', imageUrl: ICON_URLS.photography },
      { id: 'art', label: 'Art', imageUrl: ICON_URLS.art },
      { id: 'nature', label: 'Nature', imageUrl: ICON_URLS.nature },
      { id: 'pets', label: 'Pets', imageUrl: ICON_URLS.pets },
      { id: 'money', label: 'Money', imageUrl: ICON_URLS.money },
      { id: 'goals', label: 'Goals', imageUrl: ICON_URLS.goals },
      { id: 'calendar', label: 'Schedule', imageUrl: ICON_URLS.calendar },
      { id: 'walk', label: 'Walk', imageUrl: ICON_URLS.walk },
      { id: 'study', label: 'Study', imageUrl: ICON_URLS.study },
      { id: 'relax', label: 'Relax', imageUrl: ICON_URLS.relax },
      { id: 'calls', label: 'Calls', imageUrl: ICON_URLS.calls },
      { id: 'sports', label: 'Sports', imageUrl: ICON_URLS.sports },
      { id: 'diy', label: 'DIY', imageUrl: ICON_URLS.diy },
      { id: 'chores', label: 'Chores', imageUrl: ICON_URLS.chores },
      { id: 'rainy', label: 'Rainy day', imageUrl: ICON_URLS.rainy },
      { id: 'audio', label: 'Podcasts', imageUrl: ICON_URLS.audio },
      { id: 'motivation', label: 'Motivation', imageUrl: ICON_URLS.motivation },
      { id: 'time', label: 'Time', imageUrl: ICON_URLS.time },
    ]

    const known = new Set<string>([...main, ...more].map((t) => normalize(t.label)))
    const customTiles: Tile[] = Array.from(selected)
      .filter((t) => !known.has(normalize(t)))
      .map((t) => {
        const icon = getCustomIcon(t)
        return {
          id: `custom-${t}`,
          label: t,
          isCustom: true,
          imageUrl: icon.type === 'image' ? icon.value : undefined,
          badgeMark: icon.type === 'badge' ? icon.value : undefined,
          badgeColor: icon.type === 'badge' ? icon.color : undefined,
          fallbackIcon: 'sell',
        }
      })

    const selectedMore = more.filter((t) => selected.has(normalize(t.label)))

    const dedupe = (arr: Tile[]) => {
      const seen = new Set<string>()
      const out: Tile[] = []
      for (const item of arr) {
        const key = normalize(item.label)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
      return out
    }

    const base = expanded ? dedupe([...main, ...more]) : dedupe([...main, ...selectedMore])
    return [...base, ...customTiles]
  }, [selected, expanded, customIcons])

  const pendingPreview = useMemo(() => {
    if (pendingIcon) return pendingIcon
    if (!custom.trim()) return defaultBadge('New')
    return defaultBadge(custom)
  }, [pendingIcon, custom])

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-white">What’s affecting you?</h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-bold text-helfi-green hover:bg-slate-50 dark:hover:bg-gray-700/50"
        >
          <span className="material-symbols-outlined text-[18px]">{expanded ? 'expand_less' : 'expand_more'}</span>
          {expanded ? 'Show less' : 'More options'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-y-6 gap-x-4 px-1 pb-2">
        {tiles.map((item) => {
          const isSelected = selected.has(normalize(item.label))
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.label)}
              className="flex flex-col items-center gap-2 group"
              aria-pressed={isSelected}
            >
              <div
                className={[
                  'relative p-1 rounded-full transition-all duration-200',
                  isSelected
                    ? 'ring-2 ring-helfi-green ring-offset-2 ring-offset-[#f8f9fa] dark:ring-offset-gray-900'
                    : 'hover:bg-black/5 dark:hover:bg-white/5',
                ].join(' ')}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.label}
                    loading="lazy"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white dark:bg-gray-800 object-contain p-2"
                  />
                ) : (
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-slate-200 dark:border-gray-700 flex items-center justify-center"
                    style={{ backgroundColor: item.badgeColor || '#ffffff' }}
                  >
                    {item.badgeMark ? (
                      <span className="text-3xl leading-none text-slate-700">{item.badgeMark}</span>
                    ) : (
                      <span className="material-symbols-outlined text-[34px] text-slate-400 dark:text-gray-400">
                        {item.fallbackIcon || 'sell'}
                      </span>
                    )}
                  </div>
                )}

                {item.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openPicker(item.label)
                    }}
                    className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-full p-1 shadow-sm"
                    aria-label={`Change icon for ${item.label}`}
                  >
                    <span className="material-symbols-outlined text-[14px] text-slate-500">edit</span>
                  </button>
                )}

                {isSelected && (
                  <div className="absolute -bottom-1 -right-1 bg-helfi-green text-[#0b2b10] rounded-full p-0.5 border-2 border-[#f8f9fa] dark:border-gray-900">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, fontWeight: 700, display: 'block' }}>
                      check
                    </span>
                  </div>
                )}
              </div>
              <p
                className={
                  isSelected
                    ? 'text-slate-900 dark:text-white text-sm font-semibold leading-normal text-center'
                    : 'text-slate-500 dark:text-gray-400 text-sm font-medium leading-normal text-center group-hover:text-helfi-green transition-colors'
                }
              >
                {item.label}
              </p>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex flex-col items-center gap-2 group"
          aria-label="Add your own"
        >
          <div className="relative p-1 rounded-full transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-50 dark:bg-gray-800 border border-dashed border-slate-300 dark:border-gray-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[34px] text-slate-400">add</span>
            </div>
          </div>
          <p className="text-slate-400 dark:text-gray-500 text-sm font-medium leading-normal text-center">Add</p>
        </button>
      </div>

      {adding && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <div
              className="w-12 h-12 rounded-full border border-slate-200 dark:border-gray-700 flex items-center justify-center"
              style={{ backgroundColor: pendingPreview.color || '#ffffff' }}
            >
              {pendingPreview.type === 'image' ? (
                <img
                  src={pendingPreview.value}
                  alt="Selected icon"
                  className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 object-contain p-1"
                />
              ) : (
                <span className="text-2xl text-slate-700">{pendingPreview.value}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => openPicker('__new__')}
              className="rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-bold text-helfi-green hover:bg-slate-50 dark:hover:bg-gray-700/50"
            >
              Change icon
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type it (emoji first if you want one)"
              className="flex-1 min-w-0 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-base text-slate-900 dark:text-white"
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
        </div>
      )}

      {iconPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 p-4">
            <div className="text-base font-bold text-slate-800 dark:text-white">Choose an icon</div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {ICON_CHOICES.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => {
                    if (iconPickerLabel === '__new__') {
                      setPendingIcon({ type: 'image', value: icon.imageUrl })
                    } else if (iconPickerLabel) {
                      applyIcon(iconPickerLabel, { type: 'image', value: icon.imageUrl })
                    }
                    closePicker()
                  }}
                  className="rounded-full border border-slate-200 dark:border-gray-700 p-1 hover:border-helfi-green"
                >
                  <img
                    src={icon.imageUrl}
                    alt={icon.label}
                    className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 object-contain p-2"
                  />
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (iconPickerLabel === '__new__') {
                    setPendingIcon(null)
                  } else if (iconPickerLabel) {
                    applyIcon(iconPickerLabel, defaultBadge(iconPickerLabel))
                  }
                  closePicker()
                }}
                className="flex-1 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-bold text-slate-700 dark:text-gray-200"
              >
                Use letter badge
              </button>
              <button
                type="button"
                onClick={closePicker}
                className="flex-1 rounded-full bg-helfi-green px-4 py-2 text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
