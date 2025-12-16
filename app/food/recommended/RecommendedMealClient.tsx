'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import {
  AI_MEAL_RECOMMENDATION_CREDITS,
  CATEGORY_LABELS,
  MealCategory,
  normalizeMealCategory,
} from '@/lib/ai-meal-recommendation'

type MacroTotals = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
}

type RecommendedItem = {
  id?: string
  name: string
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  servings: number
}

type RecommendedMealRecord = {
  id: string
  createdAt: string
  date: string
  category: MealCategory
  mealName: string
  tags: string[]
  why: string
  items: RecommendedItem[]
  totals: MacroTotals
}

type RecommendationContext = {
  targets: MacroTotals
  used: MacroTotals
  remaining: MacroTotals
}

type ApiGetResponse = {
  costCredits: number
  context: RecommendationContext
  history: RecommendedMealRecord[]
}

type ApiPostResponse = {
  costCredits: number
  context: RecommendationContext
  history: RecommendedMealRecord[]
  recommendation: RecommendedMealRecord
}

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const computeTotalsFromItems = (items: RecommendedItem[]): MacroTotals => {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  for (const item of items) {
    const servings = typeof item.servings === 'number' && Number.isFinite(item.servings) ? item.servings : 0
    total.calories += macroOrZero(item.calories) * servings
    total.protein_g += macroOrZero(item.protein_g) * servings
    total.carbs_g += macroOrZero(item.carbs_g) * servings
    total.fat_g += macroOrZero(item.fat_g) * servings
    total.fiber_g += macroOrZero(item.fiber_g) * servings
    total.sugar_g += macroOrZero(item.sugar_g) * servings
  }
  return {
    calories: Math.round(total.calories),
    protein_g: round3(total.protein_g),
    carbs_g: round3(total.carbs_g),
    fat_g: round3(total.fat_g),
    fiber_g: round3(total.fiber_g),
    sugar_g: round3(total.sugar_g),
  }
}

const alignTimestampToLocalDate = (iso: string, localDate: string) => {
  try {
    if (!localDate || localDate.length < 8) return iso
    const base = new Date(iso)
    if (Number.isNaN(base.getTime())) return iso
    const [y, m, d] = localDate.split('-').map((v) => parseInt(v, 10))
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
    const anchored = new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds())
    return anchored.toISOString()
  } catch {
    return iso
  }
}

const normalizeTotalsForFoodLog = (totals: MacroTotals) => ({
  calories: typeof totals.calories === 'number' ? Math.round(totals.calories) : 0,
  protein: typeof totals.protein_g === 'number' ? round3(totals.protein_g) : 0,
  carbs: typeof totals.carbs_g === 'number' ? round3(totals.carbs_g) : 0,
  fat: typeof totals.fat_g === 'number' ? round3(totals.fat_g) : 0,
  fiber: typeof totals.fiber_g === 'number' ? round3(totals.fiber_g) : 0,
  sugar: typeof totals.sugar_g === 'number' ? round3(totals.sugar_g) : 0,
})

const formatNumber = (value: number | null | undefined, decimals = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const ProgressBar = ({ used, target, extraLabel }: { used: number | null; target: number | null; extraLabel?: string }) => {
  const percent = target && target > 0 && used !== null ? clamp01(used / target) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{extraLabel || 'Today'}</span>
        <span>
          {formatNumber(used)} / {formatNumber(target)}
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div className="h-2 bg-emerald-600" style={{ width: `${Math.round(percent * 100)}%` }} />
      </div>
    </div>
  )
}

export default function RecommendedMealClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData, updateUserData } = useUserData()

  const date = searchParams.get('date') || buildTodayIso()
  const category = normalizeMealCategory(searchParams.get('category'))
  const generateFlag = searchParams.get('generate') === '1'
  const categoryLabel = CATEGORY_LABELS[category]

  const [loadingContext, setLoadingContext] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<RecommendationContext | null>(null)
  const [history, setHistory] = useState<RecommendedMealRecord[]>([])
  const [active, setActive] = useState<RecommendedMealRecord | null>(null)
  const [itemsDraft, setItemsDraft] = useState<RecommendedItem[] | null>(null)
  const [savingDiary, setSavingDiary] = useState(false)

  const hasAutoGeneratedRef = useRef(false)

  const tzOffsetMin = useMemo(() => String(new Date().getTimezoneOffset()), [])

  const draftTotals = useMemo(() => {
    const items = itemsDraft || active?.items || []
    return computeTotalsFromItems(items)
  }, [itemsDraft, active?.items])

  const costCredits = AI_MEAL_RECOMMENDATION_CREDITS

  const load = async () => {
    setLoadingContext(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('date', date)
      qs.set('category', category)
      qs.set('tz', tzOffsetMin)
      const res = await fetch(`/api/ai-meal-recommendation?${qs.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `Load failed (${res.status})`)
      }
      const data = (await res.json()) as ApiGetResponse
      setContext(data.context)
      const nextHistory = Array.isArray(data.history) ? data.history : []
      setHistory(nextHistory)
      const defaultActive =
        nextHistory.find((h) => h && h.category === category) || nextHistory[0] || null
      setActive(defaultActive)
    } catch (e: any) {
      setError(e?.message || 'Unable to load recommendations right now.')
    } finally {
      setLoadingContext(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-meal-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, tz: tzOffsetMin }),
      })
      if (res.status === 402) {
        setError(`Not enough credits to generate. This costs ${costCredits} credits.`)
        return
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `Generate failed (${res.status})`)
      }
      const data = (await res.json()) as ApiPostResponse
      setContext(data.context)
      setHistory(Array.isArray(data.history) ? data.history : [])
      setActive(data.recommendation || null)
      setItemsDraft(null)
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Unable to generate a recommendation right now.')
    } finally {
      setGenerating(false)
    }
  }

  const setActiveFromHistory = (record: RecommendedMealRecord) => {
    setActive(record)
    setItemsDraft(null)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, category])

  useEffect(() => {
    if (!generateFlag) return
    if (loadingContext) return
    if (hasAutoGeneratedRef.current) return
    hasAutoGeneratedRef.current = true
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateFlag, loadingContext])

  useEffect(() => {
    setItemsDraft(null)
  }, [active?.id])

  const currentItems = itemsDraft || active?.items || []

  const updateServings = (index: number, next: number) => {
    const safe = Number.isFinite(next) ? Math.max(0, Math.min(20, next)) : 0
    setItemsDraft((prev) => {
      const base = prev ? [...prev] : currentItems.map((it) => ({ ...it }))
      const nextItems = base.map((it, idx) => (idx === index ? { ...it, servings: safe } : it))
      return nextItems
    })
  }

  const saveToFavorites = async () => {
    if (!active) return
    const totals = draftTotals
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const payload = {
      id: `fav-${Date.now()}`,
      sourceId: null,
      label: active.mealName || `AI Recommended ${categoryLabel}`,
      description: active.mealName || `AI Recommended ${categoryLabel}`,
      nutrition: normalizeTotalsForFoodLog(totals),
      total: normalizeTotalsForFoodLog(totals),
      items: currentItems,
      photo: null,
      method: 'ai-recommended',
      meal: category,
      createdAt: Date.now(),
    }
    const existingIndex = favorites.findIndex((fav: any) => fav?.label && payload.label && fav.label === payload.label)
    const nextFavorites = existingIndex >= 0 ? favorites.map((f: any, i: number) => (i === existingIndex ? { ...payload, id: f.id || payload.id } : f)) : [...favorites, payload]
    updateUserData({ favorites: nextFavorites })
    try {
      await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: nextFavorites }),
      })
    } catch {}
  }

  const addToDiary = async () => {
    if (!active) return
    const totals = normalizeTotalsForFoodLog(draftTotals)
    const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), date)
    const payload = {
      description: active.mealName || `AI Recommended ${categoryLabel}`,
      nutrition: totals,
      imageUrl: null,
      items: currentItems,
      localDate: date,
      meal: category,
      category,
      createdAt: createdAtIso,
    }
    setSavingDiary(true)
    try {
      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError('Saving failed. Please try again.')
        return
      }
      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setSavingDiary(false)
    }
  }

  const pageTitle = `AI Recommended ${categoryLabel}`

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => router.push('/food')} className="p-2 rounded-full hover:bg-gray-100" aria-label="Back">
            <span aria-hidden>←</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-900 truncate">{pageTitle}</div>
            <div className="text-xs text-gray-500">{date}</div>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating || loadingContext}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-4xl mx-auto space-y-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">Couldn’t generate</div>
              <div className="mt-1">{error}</div>
              {error.toLowerCase().includes('credits') && (
                <div className="mt-2">
                  <Link href="/billing" className="text-red-800 underline font-semibold">
                    Go to billing
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Credit usage</div>
                <div className="text-sm font-semibold text-gray-900">
                  {costCredits} credits per recommendation
                </div>
                <div className="text-xs text-gray-500 mt-1">Credits are only spent when a recommendation is generated.</div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/food/recommended/explain?date=${encodeURIComponent(date)}&category=${encodeURIComponent(category)}`)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm font-semibold hover:bg-gray-200"
              >
                About
              </button>
            </div>
          </div>

          {loadingContext ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Loading…</div>
          ) : (
            <>
              {context && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="text-sm font-semibold text-gray-900">Daily alignment</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ProgressBar used={context.used.calories} target={context.targets.calories} extraLabel="Calories" />
                    <div className="text-xs text-gray-600 rounded-xl bg-gray-50 p-3">
                      <div className="font-semibold text-gray-900">Remaining today</div>
                      <div className="mt-1">
                        Calories: <span className="font-semibold">{formatNumber(context.remaining.calories)}</span>
                      </div>
                      <div className="mt-1">
                        Protein: <span className="font-semibold">{formatNumber(context.remaining.protein_g, 1)}</span>g • Carbs:{' '}
                        <span className="font-semibold">{formatNumber(context.remaining.carbs_g, 1)}</span>g • Fat:{' '}
                        <span className="font-semibold">{formatNumber(context.remaining.fat_g, 1)}</span>g
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {active ? (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Meal</div>
                        <div className="text-xl font-semibold text-gray-900 truncate">{active.mealName || pageTitle}</div>
                        <div className="mt-2 text-sm text-gray-700">
                          <span className="font-semibold">{formatNumber(draftTotals.calories)}</span> kcal •{' '}
                          P {formatNumber(draftTotals.protein_g, 1)}g • C {formatNumber(draftTotals.carbs_g, 1)}g • F {formatNumber(draftTotals.fat_g, 1)}g
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Fiber {formatNumber(draftTotals.fiber_g, 1)}g • Sugar {formatNumber(draftTotals.sugar_g, 1)}g
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={addToDiary}
                          disabled={savingDiary || generating}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                        >
                          {savingDiary ? 'Adding…' : 'Add to diary'}
                        </button>
                        <button
                          type="button"
                          onClick={saveToFavorites}
                          disabled={generating}
                          className="px-4 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm font-semibold hover:bg-gray-200 disabled:opacity-60"
                        >
                          Save to favorites
                        </button>
                      </div>
                    </div>

                    {Array.isArray(active.tags) && active.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {active.tags.slice(0, 10).map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900">Ingredients</div>
                    <div className="mt-3 space-y-3">
                      {currentItems.length === 0 ? (
                        <div className="text-sm text-gray-600">No ingredients returned.</div>
                      ) : (
                        currentItems.map((item, idx) => (
                          <div key={`${item.name}-${idx}`} className="rounded-xl border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
                                <div className="text-xs text-gray-500">
                                  {item.serving_size ? item.serving_size : '1 serving'} • {formatNumber(item.calories)} kcal per serving
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Servings</span>
                                <input
                                  value={String(item.servings)}
                                  onChange={(e) => updateServings(idx, Number(e.target.value))}
                                  inputMode="decimal"
                                  className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-sm text-gray-900"
                                />
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-600">
                              P {formatNumber(item.protein_g, 1)}g • C {formatNumber(item.carbs_g, 1)}g • F {formatNumber(item.fat_g, 1)}g • Fiber {formatNumber(item.fiber_g, 1)}g • Sugar {formatNumber(item.sugar_g, 1)}g
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900">Why this meal was chosen</div>
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{active.why || '—'}</p>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                  Generate a recommendation to see an AI meal suggestion for {categoryLabel.toLowerCase()}.
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">History</div>
                    <div className="text-xs text-gray-500">Previously generated AI meals</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {history.length === 0 ? (
                    <div className="text-sm text-gray-600">No recommendations yet.</div>
                  ) : (
                    history.slice(0, 12).map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => setActiveFromHistory(rec)}
                        className="w-full text-left rounded-xl border border-gray-200 px-3 py-3 hover:bg-gray-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{rec.mealName || `AI Recommended ${CATEGORY_LABELS[rec.category]}`}</div>
                            <div className="text-xs text-gray-500">
                              {CATEGORY_LABELS[rec.category]} • {new Date(rec.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {typeof rec.totals?.calories === 'number' ? `${Math.round(rec.totals.calories)} kcal` : ''}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
