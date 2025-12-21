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
  gaming:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA2nXnYiQfNHSBiVEu-HaFggmNOlA2TdYUxM_XVwEZI8sbF9Ont2IaMrs8R19tk6XzNbRTTcLPbgy0ZLGwUWWfDOkX6wFTYleLHomldLuBKhVnhumomMLaMCbItPlU5DRivcVBKnMOKsNIVxFljV-ikQTevIo0UjsHZ_FrmSDwF7yOu3gnssoDhhnAXTS4D_o1AlkgbfhDXKcuIQizlOZt4Qiz3R0QfN-xqQYXbSJqBMLQe4vKr_lAKQl1PLfdUridrEmDMNQ4TfOA',
  run:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAhvYFOcwX8QGNzMGg4wYhv2VvhLbfwNAr4KTwI9iidowf_rIuHZTVy-3P8DiI-SA2V2M-q1lVLWN7rqtRxh_kar5l2mv6DXMyoXY8ZCfw-Y3sSY0Z5ybGeRy30W2dcyR1eMbrT9I0cwtDouT8wY_dUa4jXNevcS8hzSFoRU8l1vlJBgjBPvNiPt559EX8SvirrwRhIbW4ArL7xyIUzCq1rPjj45bJnP9U4sN-O45jqEYoo8e7eswUWnblYfcjnKG12UFLuTlmPOVc',
  pizza:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBJeCZkxjX2tSE8rRhscSbvaIpNwCJKRPAbCIDnoFWk0Q0V56TyQ7ZfpkDgTq91_TuiarEbi-_zVDz7nR7g0gnM8H6VwhTRrqkDhm1nx1oBxUSUZa-lWLTxm0Aqkj4MvNKfu_sJhI2Hg629kWUI4j2MscHdKCSU58OMVibL-z1t-BOuV7OskK1e76G-CA0zMR1tPaft79Qr_E_omVJ7y-T7weFU-Q0_nkiXMQt326LTLZLtHc8dkmshPiQRL0oiyY0SOBTlGuWmvbI',
  nap:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDtGAgOKnCVYJfkDyWYA5lKBMGk6sGNuqe_jo5hm4eijXmGVMjKX1QxWMHmkFnKYXlaKcr77XIKHyx9RLt7QSpxObtnwM_Iz79SPb43apfLr8EcTYyLmeLJ6hYtyDxAPwHVvfC_vRV5Sxp_KOD_gWa6E79agdhplo9cfTnOe8fHw6sHuX_kBCb_R5sPY3niNFsPxt4YUQMucnpzzFfbs9ahLTKe4GknbWnQf4KI0tj4NyXUfaqXz8WmwJ83XloXPWK_hxo3Pi-AZZw',
  friends:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCzKlTivvkzaZTKg89nAPxkFbF-k1ZpCT56FMz6vXsxmPH_rwJlzPhgRwYP8kUlu-UktbuCocVTBNPb6i7X8meq_e9e_N8-hIpNGY35lzEj4uph_-NukcRDlPui0e7c400wtxIHEPnWUFYG7RkuaU373l4ZARfjMx2sBfJNDVOVL3KuExsdeDZAvYd6mo7o2vvXy37NP3c17MjOs3aQWx5U_RkB20N-7qcD361fkTYobIQw05bSsoQ3yUtR-OygSQRrVF_zSq-OgSQ',
  reading:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCR1ibOxp0qTJnkUyr-6VOZMpo6rFwM3nRbEu6QJiMLe_A751MFdv-YSt5-YtVJg5L-8eZEQbdXJojMV6Lc5obTacjD8NeuzwRHVZrtK9kiMPBZIpTBPibrMtSCErbPjaewyY0zyOqlu_ep5BOGcib0z3L_sEO4fSyRQF40Lv3aJQhWfQu5ut29sOWRMMqCiOZIxo5NZ9mO01zXIaT65A5bmosbzh2GZMlsyd1D3IAbE-7jzR_1HQewCU8srLMrpdaUMIQg8D_elj4',
  work:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCicmhoakhgzV9c4LR9WKsy5IKcjOCJBVhevmq5DAQSQQWlFRFv2v_Dy7yQk99aP3VCd-94GJczw6gCUNLiwr2Ox6-R3jTcUXd3TnTF_YCF6D8qw7DOTnWyFgi2vyYILMZAXOqlGCIWvRBjsqd0HJhhToNLyOrTONWGZt0tZkDJGHFGfJuK5gOwJsDrbtlDv5z3tENM9mPMnBEo7NQvu4x2YUaItdeDg44d3MAki1GaeD6celTMYmwoohMv7u1rEAy1CTuCKl3lal0',
  weather:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDIIgC8nRMT5zXSzUZC_mDTySMiOXVk5d3AgLat0BEC_Q4qmHsZ5yUR2H_PGd6YimUDRlFoHhNB0mt9T8YEeuW0hkTgLhaPzr8JjySynUttMt-WhWe0IM6W4wQaQrwRW8DAIOeI9YY7TXlLw0iJqowWOPFNbMztknWGCWGIASHJx2PXuVz2kK88rPC2IRSANHk8pIer3U65Jrl6wje7e1Su6q9wTQCnO0b-0ilmL0oDDPnIT7sqzBeGoyb9G3Uat6Gbeo5sW8OeIjA',
  music:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDJQvO7dUCgV9JDUlogcNc-5YAhtS0tYavitB_lQLLpJERbYJhLr24RI0pxJEPO-xT2HqrZlhP1kUs0oO3hX8tpL-B9DaCoJfAxc4m_HtOAedrL4BgMXe1lcRxmB5fevuWhtnmxFp7_AcT6byUP3KahNVp-2YS89bUeuCzPKC3ny7k2pA0dS_0lDf3yrbPglwUsLr817I_jAEUyKG_b3R8c-hrtZt5fx0ZGrKCYyTOdWt_hZ72CkVbZL-TFIztaOnja-yOwEPHIFxg',
  movies:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuD5dWR5lIJCiXSGCsS0JEyeMF0q0yBmY0j8EZISjVIeHh7z1CpE415Pjm8VPYbw4k39LyV-hIaUoLnCPrK1zd2IeGedQxyUPCYSP94XwB0qGFTSN3G0UxmmGQDTSau6bQElMZeHf5QCBrvGppZwoNy5JjI77FWDUNcXFrQFsFSt7cYzrXGuVMuHFrU7Cr7UKxzeOYABwtd4Lflr8iqD5m7p8k19nhfeRq3orVXBAun6Lb9kbEFoQnLXc_DAat_R3wfrk4q3u6oq1Dc',
  shopping:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCB6om4_DrD8c7QgUNFmlh1vvWcv4_HKyPAEyb8KrwBsrN46Vkt0WPPriJZeiJESnx34VZBYD_qUe3ihVHvb4FKDy4F1vyDat289b2lksmQ-372yUzeGt_U7VdYOxpxSbG_CHmBF-Dd1td1NGp-aMtU91zsIjmaZaafHuUnvCnZbInAK3OpqCGkUmfOwVSIQtzFhqkzRpYc4D-dEbWDNzKiW4Ucv6xHXGWgxUJ5eWe4DTM0k_ZrzmEEm8xEuEWyGboUhdjc4XuO29A',
  cleaning:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBZ94RO9gg7tfuQolGGmqg1x_-6VLPNS3W2S9qFrS2Phm7vNUx6afLKrZ1haBHrjJvfeV3EeGCGqtjJPSBHwx_ZSWGwpxkCjLraYb22JTPcFCsAmWvF8WuH4qYSY4YPB1obI-GPrZNSKF9TNrMVE41MwMsxjs3xcJ-Y0C8vjyg5VAYEmQ2kJMMMuOCRdxKtlpQeolMUlI0fCJHI0YwxzYHkenFZeuPr_nwYAGlgwUl-0iOIhQc1FQD1xpmgo4GdHA6vKJVEVaJqpfk',
} as const

const ICON_CHOICES = [
  { id: 'work', label: 'Work', imageUrl: ICON_URLS.work },
  { id: 'family', label: 'Family', imageUrl: ICON_URLS.friends },
  { id: 'sleep', label: 'Sleep', imageUrl: ICON_URLS.nap },
  { id: 'food', label: 'Food', imageUrl: ICON_URLS.pizza },
  { id: 'weather', label: 'Weather', imageUrl: ICON_URLS.weather },
  { id: 'exercise', label: 'Exercise', imageUrl: ICON_URLS.run },
  { id: 'gaming', label: 'Gaming', imageUrl: ICON_URLS.gaming },
  { id: 'reading', label: 'Reading', imageUrl: ICON_URLS.reading },
  { id: 'music', label: 'Music', imageUrl: ICON_URLS.music },
  { id: 'movies', label: 'Movies', imageUrl: ICON_URLS.movies },
  { id: 'shopping', label: 'Shopping', imageUrl: ICON_URLS.shopping },
  { id: 'cleaning', label: 'Cleaning', imageUrl: ICON_URLS.cleaning },
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
      { id: 'family', label: 'Family', imageUrl: ICON_URLS.friends, fallbackIcon: 'family_restroom' },
      { id: 'sleep', label: 'Sleep', imageUrl: ICON_URLS.nap, fallbackIcon: 'bedtime' },
      { id: 'food', label: 'Food', imageUrl: ICON_URLS.pizza, fallbackIcon: 'restaurant' },
      { id: 'weather', label: 'Weather', imageUrl: ICON_URLS.weather, fallbackIcon: 'sunny' },
      { id: 'exercise', label: 'Exercise', imageUrl: ICON_URLS.run, fallbackIcon: 'fitness_center' },
    ]

    const more: Tile[] = [
      { id: 'gaming', label: 'Gaming', imageUrl: ICON_URLS.gaming },
      { id: 'reading', label: 'Reading', imageUrl: ICON_URLS.reading },
      { id: 'music', label: 'Music', imageUrl: ICON_URLS.music },
      { id: 'movies', label: 'Movies', imageUrl: ICON_URLS.movies },
      { id: 'shopping', label: 'Shopping', imageUrl: ICON_URLS.shopping },
      { id: 'cleaning', label: 'Cleaning', imageUrl: ICON_URLS.cleaning },
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
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#e3e6e8] dark:bg-[#2f2a1d] object-cover"
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
                  className="w-12 h-12 rounded-full object-cover"
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
                  <img src={icon.imageUrl} alt={icon.label} className="w-14 h-14 rounded-full object-cover" />
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
