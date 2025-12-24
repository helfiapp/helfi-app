'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import MoodTrendGraph from '@/components/mood/MoodTrendGraph'
import { emojiForMoodValue } from '@/components/mood/moodScale'
import MoodPieChart from '@/components/mood/MoodPieChart'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

export const dynamic = 'force-dynamic'

type MoodEntry = {
  id: string
  localDate: string
  timestamp: string
  mood: number
  tags: any
  note: string
  context: any
}

type EntriesResponse = {
  range: { start: string; end: string }
  entries: MoodEntry[]
}

type InsightsResponse = { insights: any }

function safeTags(tags: any): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t)).filter(Boolean)
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) return parsed.map((t) => String(t)).filter(Boolean)
    } catch {}
  }
  return []
}

function safeContext(ctx: any): Record<string, any> {
  if (!ctx) return {}
  if (typeof ctx === 'object') return ctx
  if (typeof ctx === 'string') {
    try {
      const parsed = JSON.parse(ctx)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
  }
  return {}
}

function asDateString(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseLocalDate(localDate: string) {
  return new Date(`${localDate}T00:00:00.000Z`)
}

function shiftDays(localDate: string, deltaDays: number) {
  const d = parseLocalDate(localDate)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return asDateString(d)
}

function daysBetweenInclusive(start: string, end: string) {
  const a = parseLocalDate(start)
  const b = parseLocalDate(end)
  const diff = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
  return Math.max(1, diff + 1)
}

function moodSummaryFromAverage(avg: number) {
  if (avg >= 6.3) return 'Mostly Amazing'
  if (avg >= 5.5) return 'Mostly Great'
  if (avg >= 4.7) return 'Mostly Good'
  if (avg >= 3.8) return 'Mostly Okay'
  if (avg >= 2.8) return 'Mostly Meh'
  if (avg >= 1.8) return 'Mostly Bad'
  return 'Mostly Terrible'
}

function dotColorForAvg(avg: number | null) {
  if (avg == null) return 'bg-gray-300 dark:bg-gray-600'
  if (avg >= 5) return 'bg-green-400'
  if (avg >= 3.5) return 'bg-yellow-400'
  return 'bg-red-400'
}

function firstDayOfMonth(localDate: string) {
  const d = parseLocalDate(localDate)
  d.setUTCDate(1)
  return asDateString(d)
}

function lastDayOfMonth(localDate: string) {
  const d = parseLocalDate(localDate)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return asDateString(d)
}

function mondayIndexFromUtcDate(localDate: string) {
  // 0..6 where 0 is Monday
  const d = parseLocalDate(localDate)
  const dow = d.getUTCDay() // 0 Sun ... 6 Sat
  return (dow + 6) % 7
}

function formatDayLabel(localDate: string) {
  const today = asDateString(new Date())
  const yesterday = shiftDays(today, -1)
  if (localDate === today) return 'Today'
  if (localDate === yesterday) return 'Yesterday'
  const d = new Date(`${localDate}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function entryDayKey(entry: MoodEntry) {
  const localDate = String(entry.localDate || '').slice(0, 10)
  if (localDate) return localDate
  const ts = new Date(entry.timestamp)
  if (!Number.isNaN(ts.getTime())) return asDateString(ts)
  return ''
}

export default function MoodHistoryPage() {
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'year'>('week')
  const [chartMode, setChartMode] = useState<'pie' | 'wave'>('pie')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [entries, setEntries] = useState<MoodEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trendPct, setTrendPct] = useState<number | null>(null)
  const [monthMap, setMonthMap] = useState(() => new Map())
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [streakDays, setStreakDays] = useState<number>(0)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})
  const [recentEntries, setRecentEntries] = useState<MoodEntry[]>([])
  const weekScrollRef = useRef<HTMLDivElement | null>(null)

  const [banner, setBanner] = useState<string | null>(null)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('saved') === '1') {
        setBanner('Saved mood check‑in.')
        const t = setTimeout(() => setBanner(null), 2500)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const storedTimeframe = localStorage.getItem('moodHistoryTimeframe') as any
      const storedChartMode = localStorage.getItem('moodHistoryChartMode') as any
      if (storedTimeframe === 'day' || storedTimeframe === 'week' || storedTimeframe === 'month' || storedTimeframe === 'year') {
        setTimeframe(storedTimeframe)
      }
      if (storedChartMode === 'pie' || storedChartMode === 'wave') {
        setChartMode(storedChartMode)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('moodHistoryTimeframe', timeframe)
    } catch {}
  }, [timeframe])

  useEffect(() => {
    try {
      localStorage.setItem('moodHistoryChartMode', chartMode)
    } catch {}
  }, [chartMode])

  useEffect(() => {
    let ignore = false
    const today = asDateString(new Date())

    const range = (() => {
      if (timeframe === 'day') {
        const base = selectedDay || today
        return { start: shiftDays(base, -6), end: base }
      }
      if (timeframe === 'week') return { start: shiftDays(today, -6), end: today }
      if (timeframe === 'month') return { start: shiftDays(today, -29), end: today }
      return { start: shiftDays(today, -364), end: today }
    })()

    const load = async () => {
      let hasCache = false
      try {
        const cacheKey = `moodHistoryCache:${range.start}:${range.end}`
        const cachedRaw = sessionStorage.getItem(cacheKey)
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw)
          if (Array.isArray(cached?.entries)) {
            setEntries(cached.entries)
            hasCache = true
          }
        }
      } catch {}

      setLoading(!hasCache)
      setError(null)
      try {
        const curRes = await fetch(`/api/mood/entries?start=${range.start}&end=${range.end}`, { cache: 'no-store' as any })
        if (!curRes.ok) throw new Error('Failed to load')
        const cur = (await curRes.json()) as EntriesResponse
        if (ignore) return
        setEntries(Array.isArray(cur.entries) ? cur.entries : [])
        try {
          const cacheKey = `moodHistoryCache:${range.start}:${range.end}`
          sessionStorage.setItem(cacheKey, JSON.stringify({ entries: cur.entries, cachedAt: Date.now() }))
        } catch {}
        if (!ignore) setLoading(false)

        const days = daysBetweenInclusive(range.start, range.end)
        const prev = {
          start: shiftDays(range.start, -days),
          end: shiftDays(range.start, -1),
        }

        void (async () => {
          try {
            const prevRes = await fetch(`/api/mood/entries?start=${prev.start}&end=${prev.end}`, { cache: 'no-store' as any })
            if (!prevRes.ok) throw new Error('Failed to load previous')
            const prevData = (await prevRes.json()) as EntriesResponse
            if (ignore) return
            const avgMood = (list: MoodEntry[]) => {
              const nums = list.map((e) => Number(e.mood)).filter((n) => Number.isFinite(n))
              if (nums.length === 0) return null
              return nums.reduce((a, b) => a + b, 0) / nums.length
            }
            const curAvg = avgMood(cur.entries || [])
            const prevAvg = avgMood(prevData.entries || [])
            if (curAvg != null && prevAvg != null && prevAvg > 0) {
              setTrendPct(((curAvg - prevAvg) / prevAvg) * 100)
            } else {
              setTrendPct(null)
            }
          } catch {
            if (!ignore) setTrendPct(null)
          }
        })()

        void (async () => {
          try {
            const insightPeriod = timeframe === 'week' || timeframe === 'day' ? 'week' : 'month'
            const insRes = await fetch(`/api/mood/insights?period=${insightPeriod}`, { cache: 'no-store' as any }).catch(() => null)
            if (insRes && insRes.ok) {
              const ins = (await insRes.json()) as InsightsResponse
              if (!ignore) setInsights(ins)
            }
          } catch {}
        })()
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'Failed to load history')
      } finally {
        if (!ignore && !hasCache) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [timeframe, selectedDay])

  useEffect(() => {
    let ignore = false
    const today = asDateString(new Date())
    const start = shiftDays(today, -6)
    const end = today
    const loadRecent = async () => {
      try {
        const res = await fetch(`/api/mood/entries?start=${start}&end=${end}`, { cache: 'no-store' as any })
        if (!res.ok) return
        const j = (await res.json()) as EntriesResponse
        if (!ignore) setRecentEntries(Array.isArray(j.entries) ? j.entries : [])
      } catch {}
    }
    loadRecent()
    return () => { ignore = true }
  }, [entries])

  useEffect(() => {
    let ignore = false
    const today = asDateString(new Date())
    const start = firstDayOfMonth(today)
    const end = lastDayOfMonth(today)
    const loadMonth = async () => {
      try {
        const res = await fetch(`/api/mood/entries?start=${start}&end=${end}`, { cache: 'no-store' as any })
        if (!res.ok) return
        const j = (await res.json()) as EntriesResponse
        if (ignore) return
        const m = new Map()
        for (const e of j.entries || []) {
          const d = String(e.localDate || '').slice(0, 10)
          const v = Number(e.mood)
          if (!d || !Number.isFinite(v)) continue
          if (!m.has(d)) m.set(d, 0)
          // store sum in temp map and count separately
        }
        // build averages
        const sums = new Map()
        for (const e of j.entries || []) {
          const d = String(e.localDate || '').slice(0, 10)
          const v = Number(e.mood)
          if (!d || !Number.isFinite(v)) continue
          const cur = sums.get(d) || { sum: 0, n: 0 }
          cur.sum += v
          cur.n += 1
          sums.set(d, cur)
        }
        const avgs = new Map()
        sums.forEach((v, d) => avgs.set(d, v.sum / v.n))
        setMonthMap(avgs)
      } catch {}
    }
    loadMonth()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    const today = asDateString(new Date())
    const start = shiftDays(today, -364)
    const end = today
    const loadStreak = async () => {
      try {
        const res = await fetch(`/api/mood/entries?start=${start}&end=${end}`, { cache: 'no-store' as any })
        if (!res.ok) return
        const j = (await res.json()) as EntriesResponse
        if (ignore) return
        const daysWithEntries = new Set<string>()
        for (const e of j.entries || []) {
          const d = String(e.localDate || '').slice(0, 10)
          if (d) daysWithEntries.add(d)
        }
        let streak = 0
        let cursor = today
        while (daysWithEntries.has(cursor)) {
          streak += 1
          cursor = shiftDays(cursor, -1)
          if (streak > 365) break
        }
        setStreakDays(streak)
      } catch {}
    }
    loadStreak()
    return () => { ignore = true }
  }, [])

  const chartEntries = useMemo(() => {
    if (timeframe !== 'day' && timeframe !== 'week') return entries
    if (timeframe === 'day' && selectedDay) return entries
    if (recentEntries.length === 0) return entries
    const merged = new Map<string, MoodEntry>()
    for (const entry of entries) merged.set(entry.id, entry)
    for (const entry of recentEntries) merged.set(entry.id, entry)
    return Array.from(merged.values())
  }, [entries, recentEntries, timeframe, selectedDay])

  const points = useMemo(() => {
    const xs = chartEntries
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((e) => ({ timestamp: e.timestamp, mood: Number(e.mood) }))
    return xs
  }, [chartEntries])

  const daySeries = useMemo(() => {
    const map = new Map<string, MoodEntry[]>()
    for (const entry of chartEntries) {
      const day = entryDayKey(entry)
      if (!day) continue
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(entry)
    }

    const today = asDateString(new Date())
    const base = timeframe === 'day' ? (selectedDay || today) : today
    const days = (timeframe === 'week' || timeframe === 'day')
      ? Array.from({ length: 7 }, (_, i) => shiftDays(base, i - 6))
      : Array.from(map.keys()).sort((a, b) => parseLocalDate(a).getTime() - parseLocalDate(b).getTime())

    return days.map((day) => {
      const items = (map.get(day) || []).slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      return {
        day,
        label: formatDayLabel(day),
        points: items.map((e) => ({ timestamp: e.timestamp, mood: Number(e.mood) })),
      }
    })
  }, [chartEntries, timeframe, selectedDay])

  useEffect(() => {
    if (timeframe !== 'week' && timeframe !== 'day') return
    if (loading) return
    const el = weekScrollRef.current
    if (!el) return
    const scrollToEnd = () => {
      const target = Math.max(0, el.scrollWidth - el.clientWidth)
      el.scrollLeft = target
    }
    requestAnimationFrame(() => {
      scrollToEnd()
      setTimeout(scrollToEnd, 160)
      setTimeout(scrollToEnd, 320)
    })
  }, [timeframe, daySeries.length, loading])

  const recentGroups = useMemo(() => {
    const source = timeframe === 'day'
      ? (recentEntries.length ? recentEntries : chartEntries)
      : chartEntries
    const sorted = source
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const map = new Map<string, MoodEntry[]>()
    const order: string[] = []
    for (const entry of sorted) {
      const day = entryDayKey(entry)
      if (!day) continue
      if (!map.has(day)) {
        map.set(day, [])
        order.push(day)
      }
      map.get(day)!.push(entry)
    }
    return order.slice(0, 3).map((day) => ({
      day,
      entries: (map.get(day) || []).slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    }))
  }, [chartEntries, recentEntries, timeframe])

  const formatTime = (ts: any) => {
    try {
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) return ''
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const dailyAverages = useMemo(() => {
    const sums = new Map()
    for (const e of chartEntries) {
      const d = String(e.localDate || '').slice(0, 10)
      const v = Number(e.mood)
      if (!d || !Number.isFinite(v)) continue
      const cur = sums.get(d) || { sum: 0, n: 0 }
      cur.sum += v
      cur.n += 1
      sums.set(d, cur)
    }
    const avg = new Map()
    sums.forEach((v, d) => avg.set(d, v.sum / v.n))
    return avg
  }, [chartEntries])

  const overallAverage = useMemo(() => {
    const nums = chartEntries.map((e) => Number(e.mood)).filter((n) => Number.isFinite(n))
    if (nums.length === 0) return null
    return nums.reduce((a, b) => a + b, 0) / nums.length
  }, [chartEntries])

  const topMood = useMemo(() => {
    const counts = new Map()
    for (const e of chartEntries) {
      const v = Number(e.mood)
      if (!Number.isFinite(v)) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    let best: { mood: number; n: number } | null = null
    counts.forEach((n, mood) => {
      if (!best || n > best.n) best = { mood, n }
    })
    return best
  }, [chartEntries])

  const topMoodValue = (topMood as any)?.mood as number | null
  const topMoodCount = (topMood as any)?.n as number | null

  const monthGrid = useMemo(() => {
    const today = asDateString(new Date())
    const start = firstDayOfMonth(today)
    const end = lastDayOfMonth(today)
    const daysInMonth = Number(end.slice(8, 10))
    const pad = mondayIndexFromUtcDate(start)
    const cells: any[] = []
    for (let i = 0; i < pad; i++) cells.push({ type: 'pad' })
    for (let day = 1; day <= daysInMonth; day++) {
      const d = start.slice(0, 8) + String(day).padStart(2, '0')
      cells.push({ type: 'day', date: d, day, avg: monthMap.get(d) ?? null })
    }
    return { cells, today }
  }, [monthMap])

  const insightCards = useMemo(() => {
    const list: any[] = []
    const by = insights?.insights || {}
    const pushFirst = (key: string, icon: string, color: string) => {
      const arr = (by as any)?.[key]
      if (!Array.isArray(arr) || arr.length === 0) return
      list.push({ title: arr[0].title, detail: arr[0].detail, icon, color })
    }
    pushFirst('sleep', 'bedtime', 'bg-purple-100 text-purple-600')
    pushFirst('nutrition', 'restaurant', 'bg-green-100 text-green-600')
    pushFirst('activity', 'directions_walk', 'bg-emerald-100 text-emerald-700')
    pushFirst('stress', 'schedule', 'bg-blue-100 text-blue-600')
    return list.slice(0, 6)
  }, [insights])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6">
        {banner && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
            {banner}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex h-12 w-full items-center justify-between rounded-full bg-white dark:bg-gray-800 p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
            {(['day', 'week', 'month', 'year'] as const).map((t) => {
              const active = timeframe === t
              const label = t === 'day' ? 'Day' : t[0].toUpperCase() + t.slice(1)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTimeframe(t)
                    if (t !== 'day') setSelectedDay(null)
                  }}
                  className="relative flex flex-1 h-full items-center justify-center rounded-full transition-all"
                >
                  <span className={`z-10 text-sm font-semibold ${active ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                    {label}
                  </span>
                  <span className={`absolute inset-0 rounded-full bg-helfi-green transition-all duration-300 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} />
                </button>
              )
            })}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-gray-500 dark:text-gray-300 text-sm font-bold uppercase tracking-wider">
                  {chartMode === 'pie' ? 'Mood Breakdown' : 'Mood Wave'}
                </h3>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {overallAverage == null ? 'No data yet' : moodSummaryFromAverage(overallAverage)}
                  </p>
                  {trendPct != null && (
                    <span className="inline-flex items-center gap-1 text-helfi-green text-sm font-bold bg-helfi-green/10 px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-sm leading-none">trending_up</span>
                      {Math.abs(trendPct).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
                {(['pie', 'wave'] as const).map((mode) => {
                  const active = chartMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setChartMode(mode)}
                      className={[
                        'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                        active ? 'bg-helfi-green text-white' : 'text-gray-600 dark:text-gray-300',
                      ].join(' ')}
                    >
                      {mode === 'pie' ? 'Pie' : 'Wave'}
                    </button>
                  )
                })}
              </div>
            </div>

	            {loading ? (
	              <div className="flex items-center justify-center py-12">
	                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green"></div>
	              </div>
	            ) : error ? (
	              <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
	                {error}
	              </div>
            ) : points.length === 0 ? (
	              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
	                No mood entries yet. Add your first check‑in from the Mood tab.
	              </div>
	            ) : (
                <div className="space-y-4">
                  {timeframe === 'week' || timeframe === 'day' ? (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Swipe left or right to view each day.
                      </div>
                      <div
                        ref={weekScrollRef}
                        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 touch-pan-x"
                      >
                        {daySeries.map((day) => (
                          <div key={day.day} className="min-w-full snap-center">
                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                              {day.label}
                            </div>
                            <div className="relative h-[220px] w-full rounded-2xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-700 p-4 overflow-visible">
                              {chartMode === 'pie' ? (
                                <MoodPieChart entries={day.points} />
                              ) : (
                                <MoodTrendGraph points={day.points} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-[220px] w-full rounded-2xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-700 p-4 overflow-visible">
                      {chartMode === 'pie' ? (
                        <MoodPieChart entries={entries} />
                      ) : (
                        <MoodTrendGraph points={points} />
                      )}
                    </div>
                  )}
                  <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300 mb-3">
                      Recent check‑ins
                    </div>
                    {recentGroups.length === 0 ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No check‑ins yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentGroups.map((group) => {
                          const expanded = !!expandedDays[group.day]
                          return (
                            <div
                              key={group.day}
                              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDays((prev) => ({
                                    ...prev,
                                    [group.day]: !prev[group.day],
                                  }))
                                }
                                className="w-full flex items-center justify-between px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                    {formatDayLabel(group.day)}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {group.entries.length} check‑in{group.entries.length === 1 ? '' : 's'}
                                  </span>
                                </div>
                                <span
                                  className={[
                                    'material-symbols-outlined text-base text-gray-500 transition-transform',
                                    expanded ? 'rotate-180' : '',
                                  ].join(' ')}
                                >
                                  expand_more
                                </span>
                              </button>
                              {expanded && (
                                <div className="flex flex-wrap gap-2 px-3 pb-3">
                                  {group.entries.map((e) => (
                                    <div
                                      key={e.id}
                                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2"
                                    >
                                      <span className="text-lg leading-none">{emojiForMoodValue(Number(e.mood))}</span>
                                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                        {formatTime(e.timestamp)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
	            )}
	          </div>
	        </div>

        <div className="px-1 mt-6">
          <h3 className="text-gray-900 dark:text-white text-xl font-bold mb-4">Highlights</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 flex flex-col justify-between aspect-[4/3] relative overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <span className="text-6xl grayscale opacity-50">{topMoodValue ? emojiForMoodValue(topMoodValue) : '🙂'}</span>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-300 text-xs font-bold uppercase tracking-wider mb-1">Top Mood</p>
                <p className="text-gray-900 dark:text-white text-lg font-bold leading-tight">
                  {topMoodValue ? `“${emojiForMoodValue(topMoodValue)}”` : '—'}
                </p>
              </div>
              <div className="flex items-end justify-between relative z-10">
                <span className="text-4xl">{topMoodValue ? emojiForMoodValue(topMoodValue) : '🙂'}</span>
                <span className="text-xs font-medium text-helfi-green bg-helfi-green/10 px-2 py-1 rounded-lg">
                  {topMoodCount ? `${topMoodCount}x` : '0x'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 flex flex-col justify-between aspect-[4/3] relative overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="absolute -right-4 -bottom-4 bg-helfi-green/10 w-24 h-24 rounded-full blur-2xl"></div>
              <div>
                <p className="text-gray-500 dark:text-gray-300 text-xs font-bold uppercase tracking-wider mb-1">Streak</p>
                <p className="text-gray-900 dark:text-white text-lg font-bold leading-tight">On fire</p>
              </div>
              <div className="flex items-end gap-2 relative z-10">
                <span className="text-4xl">🔥</span>
                <span className="text-2xl font-bold text-helfi-green">
                  {streakDays} <span className="text-sm text-gray-500 dark:text-gray-300 font-normal">days</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="text-gray-900 dark:text-white text-xl font-bold">Insights</h3>
            <a className="text-helfi-green text-xs font-bold uppercase tracking-wide hover:underline" href="/mood/insights">
              View All
            </a>
          </div>
          <div className="px-1 mb-3 text-sm text-gray-600 dark:text-gray-300">
            A quick look at possible patterns between your mood and things like sleep, meals, and activity.
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-4 px-1 pb-2">
            {insightCards.length === 0 ? (
              <div className="min-w-[260px] bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm text-sm text-gray-600 dark:text-gray-300">
                Add a few mood check‑ins to unlock insights.
              </div>
            ) : (
              insightCards.map((c, idx) => (
                <div key={idx} className="min-w-[260px] bg-white dark:bg-gray-800 rounded-2xl p-5 flex flex-col gap-3 border border-gray-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${c.color}`}>
                      <span className="material-symbols-outlined text-lg">{c.icon}</span>
                    </div>
                    <span className="text-gray-900 dark:text-white font-bold text-sm">Pattern</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                    {c.detail}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-1 mt-8">
          <h3 className="text-gray-900 dark:text-white text-xl font-bold mb-4">This Month</h3>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-center mb-2">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => (
                <span key={d} className="text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase">{d}</span>
              ))}
              {monthGrid.cells.map((cell, idx) => {
                if (cell.type === 'pad') {
                  return <div key={`pad-${idx}`} className="aspect-square rounded-full flex items-center justify-center text-xs text-gray-300" />
                }
                const isToday = cell.date === monthGrid.today
                const avg = cell.avg
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => {
                      setTimeframe('day')
                      setSelectedDay(cell.date)
                    }}
                    className={[
                      'aspect-square rounded-full flex items-center justify-center border transition-colors cursor-pointer',
                      isToday ? 'bg-white dark:bg-gray-800 border-helfi-green ring-2 ring-helfi-green/20' : 'bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-700 hover:border-helfi-green',
                    ].join(' ')}
                    aria-label={`Select ${cell.date}`}
                  >
                    {avg == null ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{cell.day}</span>
                    ) : (
                      <div className={`w-2 h-2 rounded-full ${dotColorForAvg(avg)}`} />
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-gray-500 dark:text-gray-300">Good</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-[10px] text-gray-500 dark:text-gray-300">Okay</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] text-gray-500 dark:text-gray-300">Bad</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-gray-900 dark:text-white text-xl font-bold mb-3 px-1">Recent entries</h3>
          <div className="space-y-3">
            {entries.slice(0, 12).map((e) => {
              const tags = safeTags(e.tags)
              const ctx = safeContext(e.context)
              const when = new Date(e.timestamp)
              const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const quick = [
                ctx.intensityPercent != null ? `Intensity ${ctx.intensityPercent}%` : null,
                ctx.sleepMinutes ? `Sleep ${Math.round(ctx.sleepMinutes / 6) / 10}h` : null,
                ctx.stepsToday != null ? `${Number(ctx.stepsToday).toLocaleString()} steps` : null,
              ].filter(Boolean) as string[]
              return (
                <details key={e.id} className="group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <summary className="list-none cursor-pointer select-none">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-helfi-green/10 flex items-center justify-center">
                        <span className="text-2xl">{emojiForMoodValue(Number(e.mood))}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                            {e.localDate}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-300">
                            {time}
                          </div>
                        </div>
                        {tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {tags.slice(0, 4).map((t) => (
                              <span key={t} className="px-3 py-1 rounded-full bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-200">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {quick.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                            {quick.join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="material-symbols-outlined text-gray-400 transition-transform group-open:rotate-180">expand_more</span>
                    </div>
                  </summary>

                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    {e.note && (
                      <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">
                        {e.note}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                      {ctx.sleepMinutes != null && <div>Sleep: {minutesToHours(ctx.sleepMinutes)}</div>}
                      {ctx.stepsToday != null && <div>Steps: {Number(ctx.stepsToday).toLocaleString()}</div>}
                      {ctx.mealsTodayCount != null && <div>Meals logged: {ctx.mealsTodayCount}</div>}
                      {ctx.exerciseMinutesToday != null && <div>Exercise: {ctx.exerciseMinutesToday} min</div>}
                      {ctx.intensityPercent != null && <div>Intensity: {ctx.intensityPercent}%</div>}
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}

function minutesToHours(minutes: number | null) {
  if (!minutes) return '—'
  const hrs = minutes / 60
  return `${hrs.toFixed(1)} h`
}
