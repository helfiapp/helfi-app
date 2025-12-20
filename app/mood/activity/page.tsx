'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Category = 'All' | 'Social' | 'Rest' | 'Hobbies' | 'Work' | 'Health'

type ActivityItem = {
  id: string
  label: string
  category: Exclude<Category, 'All'>
  imageUrl: string
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'gaming',
    label: 'Gaming',
    category: 'Hobbies',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA2nXnYiQfNHSBiVEu-HaFggmNOlA2TdYUxM_XVwEZI8sbF9Ont2IaMrs8R19tk6XzNbRTTcLPbgy0ZLGwUWWfDOkX6wFTYleLHomldLuBKhVnhumomMLaMCbItPlU5DRivcVBKnMOKsNIVxFljV-ikQTevIo0UjsHZ_FrmSDwF7yOu3gnssoDhhnAXTS4D_o1AlkgbfhDXKcuIQizlOZt4Qiz3R0QfN-xqQYXbSJqBMLQe4vKr_lAKQl1PLfdUridrEmDMNQ4TfOA',
  },
  {
    id: 'run',
    label: 'Run',
    category: 'Health',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAhvYFOcwX8QGNzMGg4wYhv2VvhLbfwNAr4KTwI9iidowf_rIuHZTVy-3P8DiI-SA2V2M-q1lVLWN7rqtRxh_kar5l2mv6DXMyoXY8ZCfw-Y3sSY0Z5ybGeRy30W2dcyR1eMbrT9I0cwtDouT8wY_dUa4jXNevcS8hzSFoRU8l1vlJBgjBPvNiPt559EX8SvirrwRhIbW4ArL7xyIUzCq1rPjj45bJnP9U4sN-O45jqEYoo8e7eswUWnblYfcjnKG12UFLuTlmPOVc',
  },
  {
    id: 'pizza',
    label: 'Pizza',
    category: 'Health',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBJeCZkxjX2tSE8rRhscSbvaIpNwCJKRPAbCIDnoFWk0Q0V56TyQ7ZfpkDgTq91_TuiarEbi-_zVDz7nR7g0gnM8H6VwhTRrqkDhm1nx1oBxUSUZa-lWLTxm0Aqkj4MvNKfu_sJhI2Hg629kWUI4j2MscHdKCSU58OMVibL-z1t-BOuV7OskK1e76G-CA0zMR1tPaft79Qr_E_omVJ7y-T7weFU-Q0_nkiXMQt326LTLZLtHc8dkmshPiQRL0oiyY0SOBTlGuWmvbI',
  },
  {
    id: 'nap',
    label: 'Nap',
    category: 'Rest',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDtGAgOKnCVYJfkDyWYA5lKBMGk6sGNuqe_jo5hm4eijXmGVMjKX1QxWMHmkFnKYXlaKcr77XIKHyx9RLt7QSpxObtnwM_Iz79SPb43apfLr8EcTYyLmeLJ6hYtyDxAPwHVvfC_vRV5Sxp_KOD_gWa6E79agdhplo9cfTnOe8fHw6sHuX_kBCb_R5sPY3niNFsPxt4YUQMucnpzzFfbs9ahLTKe4GknbWnQf4KI0tj4NyXUfaqXz8WmwJ83XloXPWK_hxo3Pi-AZZw',
  },
  {
    id: 'friends',
    label: 'Friends',
    category: 'Social',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCzKlTivvkzaZTKg89nAPxkFbF-k1ZpCT56FMz6vXsxmPH_rwJlzPhgRwYP8kUlu-UktbuCocVTBNPb6i7X8meq_e9e_N8-hIpNGY35lzEj4uph_-NukcRDlPui0e7c400wtxIHEPnWUFYG7RkuaU373l4ZARfjMx2sBfJNDVOVL3KuExsdeDZAvYd6mo7o2vvXy37NP3c17MjOs3aQWx5U_RkB20N-7qcD361fkTYobIQw05bSsoQ3yUtR-OygSQRrVF_zSq-OgSQ',
  },
  {
    id: 'reading',
    label: 'Reading',
    category: 'Hobbies',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCR1ibOxp0qTJnkUyr-6VOZMpo6rFwM3nRbEu6QJiMLe_A751MFdv-YSt5-YtVJg5L-8eZEQbdXJojMV6Lc5obTacjD8NeuzwRHVZrtK9kiMPBZIpTBPibrMtSCErbPjaewyY0zyOqlu_ep5BOGcib0z3L_sEO4fSyRQF40Lv3aJQhWfQu5ut29sOWRMMqCiOZIxo5NZ9mO01zXIaT65A5bmosbzh2GZMlsyd1D3IAbE-7jzR_1HQewCU8srLMrpdaUMIQg8D_elj4',
  },
  {
    id: 'work',
    label: 'Work',
    category: 'Work',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCicmhoakhgzV9c4LR9WKsy5IKcjOCJBVhevmq5DAQSQQWlFRFv2v_Dy7yQk99aP3VCd-94GJczw6gCUNLiwr2Ox6-R3jTcUXd3TnTF_YCF6D8qw7DOTnWyFgi2vyYILMZAXOqlGCIWvRBjsqd0HJhhToNLyOrTONWGZt0tZkDJGHFGfJuK5gOwJsDrbtlDv5z3tENM9mPMnBEo7NQvu4x2YUaItdeDg44d3MAki1GaeD6celTMYmwoohMv7u1rEAy1CTuCKl3lal0',
  },
  {
    id: 'weather',
    label: 'Weather',
    category: 'Health',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDIIgC8nRMT5zXSzUZC_mDTySMiOXVk5d3AgLat0BEC_Q4qmHsZ5yUR2H_PGd6YimUDRlFoHhNB0mt9T8YEeuW0hkTgLhaPzr8JjySynUttMt-WhWe0IM6W4wQaQrwRW8DAIOeI9YY7TXlLw0iJqowWOPFNbMztknWGCWGIASHJx2PXuVz2kK88rPC2IRSANHk8pIer3U65Jrl6wje7e1Su6q9wTQCnO0b-0ilmL0oDDPnIT7sqzBeGoyb9G3Uat6Gbeo5sW8OeIjA',
  },
  {
    id: 'music',
    label: 'Music',
    category: 'Hobbies',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDJQvO7dUCgV9JDUlogcNc-5YAhtS0tYavitB_lQLLpJERbYJhLr24RI0pxJEPO-xT2HqrZlhP1kUs0oO3hX8tpL-B9DaCoJfAxc4m_HtOAedrL4BgMXe1lcRxmB5fevuWhtnmxFp7_AcT6byUP3KahNVp-2YS89bUeuCzPKC3ny7k2pA0dS_0lDf3yrbPglwUsLr817I_jAEUyKG_b3R8c-hrtZt5fx0ZGrKCYyTOdWt_hZ72CkVbZL-TFIztaOnja-yOwEPHIFxg',
  },
  {
    id: 'movies',
    label: 'Movies',
    category: 'Hobbies',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD5dWR5lIJCiXSGCsS0JEyeMF0q0yBmY0j8EZISjVIeHh7z1CpE415Pjm8VPYbw4k39LyV-hIaUoLnCPrK1zd2IeGedQxyUPCYSP94XwB0qGFTSN3G0UxmmGQDTSau6bQElMZeHf5QCBrvGppZwoNy5JjI77FWDUNcXFrQFsFSt7cYzrXGuVMuHFrU7Cr7UKxzeOYABwtd4Lflr8iqD5m7p8k19nhfeRq3orVXBAun6Lb9kbEFoQnLXc_DAat_R3wfrk4q3u6oq1Dc',
  },
  {
    id: 'shopping',
    label: 'Shopping',
    category: 'Hobbies',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCB6om4_DrD8c7QgUNFmlh1vvWcv4_HKyPAEyb8KrwBsrN46Vkt0WPPriJZeiJESnx34VZBYD_qUe3ihVHvb4FKDy4F1vyDat289b2lksmQ-372yUzeGt_U7VdYOxpxSbG_CHmBF-Dd1td1NGp-aMtU91zsIjmaZaafHuUnvCnZbInAK3OpqCGkUmfOwVSIQtzFhqkzRpYc4D-dEbWDNzKiW4Ucv6xHXGWgxUJ5eWe4DTM0k_ZrzmEEm8xEuEWyGboUhdjc4XuO29A',
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    category: 'Rest',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBZ94RO9gg7tfuQolGGmqg1x_-6VLPNS3W2S9qFrS2Phm7vNUx6afLKrZ1haBHrjJvfeV3EeGCGqtjJPSBHwx_ZSWGwpxkCjLraYb22JTPcFCsAmWvF8WuH4qYSY4YPB1obI-GPrZNSKF9TNrMVE41MwMsxjs3xcJ-Y0C8vjyg5VAYEmQ2kJMMMuOCRdxKtlpQeolMUlI0fCJHI0YwxzYHkenFZeuPr_nwYAGlgwUl-0iOIhQc1FQD1xpmgo4GdHA6vKJVEVaJqpfk',
  },
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
    <div className="min-h-screen bg-[#f8f7f5] dark:bg-gray-900 pb-24">
      <div className="max-w-md mx-auto min-h-screen bg-[#f8f7f5] dark:bg-gray-900 shadow-2xl">
        <div className="sticky top-0 z-40 bg-[#f8f7f5]/95 dark:bg-gray-900/95 backdrop-blur-md px-4 py-3 flex items-center justify-between">
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

      <div className="px-5 pt-4 pb-2">
        <h2 className="tracking-tight text-[28px] font-bold leading-tight text-left text-slate-800 dark:text-white">
          What influenced your mood?
        </h2>
        <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">Select activities or create a new tag.</p>
      </div>

      <div className="px-5 py-4">
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

      <div className="flex gap-3 px-5 py-2 overflow-x-auto no-scrollbar scroll-smooth">
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

      <div className="grid grid-cols-3 gap-y-6 gap-x-4 p-5 pb-24">
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
                    ? 'ring-2 ring-helfi-green ring-offset-2 ring-offset-[#f8f7f5] dark:ring-offset-gray-900'
                    : 'hover:bg-black/5 dark:hover:bg-white/5',
                ].join(' ')}
              >
                <img
                  src={item.imageUrl}
                  alt={item.label}
                  loading="lazy"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#e3e6e8] dark:bg-[#2f2a1d] object-cover"
                />
                {isSelected && (
                  <div className="absolute -bottom-1 -right-1 bg-helfi-green text-[#0b2b10] rounded-full p-0.5 border-2 border-[#f8f7f5] dark:border-gray-900">
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
    </div>
  )
}
