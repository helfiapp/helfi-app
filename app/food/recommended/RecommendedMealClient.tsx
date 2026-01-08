'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import RecommendedIngredientCard from '@/components/food/RecommendedIngredientCard'
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
  recipe?: {
    servings?: number | null
    prepMinutes?: number | null
    cookMinutes?: number | null
    steps: string[]
  } | null
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
  seenExplain?: boolean
}

type ApiPostResponse = {
  costCredits: number
  context: RecommendationContext
  history: RecommendedMealRecord[]
  recommendation: RecommendedMealRecord
  seenExplain?: boolean
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

const formatMacroValue = (value: number | null | undefined, unit: string, decimals = 0) => {
  const base = formatNumber(value, decimals)
  if (base === '—') return '—'
  return unit ? `${base} ${unit}` : base
}

export default function RecommendedMealClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData, updateUserData } = useUserData()

  const date = searchParams.get('date') || buildTodayIso()
  const category = normalizeMealCategory(searchParams.get('category'))
  const categoryLabel = CATEGORY_LABELS[category]

  const [loadingContext, setLoadingContext] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<RecommendedMealRecord[]>([])
  const [active, setActive] = useState<RecommendedMealRecord | null>(null)
  const [itemsDraft, setItemsDraft] = useState<RecommendedItem[] | null>(null)
  const [savingDiary, setSavingDiary] = useState(false)
  const [seenExplain, setSeenExplain] = useState<boolean | null>(null)
  const [commitSaving, setCommitSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'ingredients' | 'recipe' | 'why'>('ingredients')

  const tzOffsetMin = useMemo(() => String(new Date().getTimezoneOffset()), [])

  const draftTotals = useMemo(() => {
    const items = itemsDraft || active?.items || []
    return computeTotalsFromItems(items)
  }, [itemsDraft, active?.items])

  const costCredits = AI_MEAL_RECOMMENDATION_CREDITS
  const hasRecommendation = Boolean(active)
  const activeIsCommitted = useMemo(() => {
    if (!active?.id) return false
    return history.some((h) => h && h.id === active.id)
  }, [active?.id, history])

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
      setSeenExplain(typeof data.seenExplain === 'boolean' ? data.seenExplain : null)
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
        const payload = await res.json().catch(() => null)
        const msgFromJson =
          typeof payload?.error === 'string'
            ? payload.error
            : typeof payload?.message === 'string'
              ? payload.message
              : null
        if (msgFromJson) throw new Error(msgFromJson)
        const txt = await res.text().catch(() => '')
        try {
          const parsed = txt ? JSON.parse(txt) : null
          const msgFromText =
            typeof parsed?.error === 'string'
              ? parsed.error
              : typeof parsed?.message === 'string'
                ? parsed.message
                : null
          if (msgFromText) throw new Error(msgFromText)
        } catch {}
        throw new Error(txt || `Generate failed (${res.status})`)
      }
      const data = (await res.json()) as ApiPostResponse
      setHistory(Array.isArray(data.history) ? data.history : [])
      setActive(data.recommendation || null)
      setSeenExplain(true)
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
    setError(null)
    setActive(record)
    setItemsDraft(null)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, category])

  useEffect(() => {
    // New date/category should be treated as a fresh screen.
    setActiveTab('ingredients')
  }, [date, category])

  useEffect(() => {
    if (loadingContext) return
    if (seenExplain === null) return
    if (seenExplain) return
    // First-time: force the disclosure screen before generating anything.
    const qs = new URLSearchParams()
    qs.set('date', date)
    qs.set('category', category)
    qs.set('returnTo', `/food/recommended?date=${encodeURIComponent(date)}&category=${encodeURIComponent(category)}`)
    router.replace(`/food/recommended/explain?${qs.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingContext, seenExplain, date, category])

  useEffect(() => {
    setItemsDraft(null)
    setActiveTab('ingredients')
  }, [active?.id])

  const currentItems = itemsDraft || active?.items || []

  const mealMacroRows = useMemo(() => {
    const calories = typeof draftTotals.calories === 'number' ? Math.round(draftTotals.calories) : null
    const protein = typeof draftTotals.protein_g === 'number' ? draftTotals.protein_g : null
    const carbs = typeof draftTotals.carbs_g === 'number' ? draftTotals.carbs_g : null
    const fat = typeof draftTotals.fat_g === 'number' ? draftTotals.fat_g : null
    const fiber = typeof draftTotals.fiber_g === 'number' ? draftTotals.fiber_g : null
    const sugar = typeof draftTotals.sugar_g === 'number' ? draftTotals.sugar_g : null

    const macroValues = [protein, carbs, fat, fiber, sugar].filter((v): v is number => typeof v === 'number' && v > 0)
    const maxMacro = macroValues.length > 0 ? Math.max(...macroValues) : 0

    return [
      {
        key: 'calories',
        label: 'Calories',
        display: formatMacroValue(calories, 'kcal'),
        color: '#10b981',
        percent: calories && calories > 0 ? 1 : 0,
      },
      {
        key: 'protein',
        label: 'Protein',
        display: formatMacroValue(protein, 'g', 1),
        color: '#ef4444',
        percent: maxMacro > 0 && typeof protein === 'number' ? protein / maxMacro : 0,
      },
      {
        key: 'carbs',
        label: 'Carbs',
        display: formatMacroValue(carbs, 'g', 1),
        color: '#22c55e',
        percent: maxMacro > 0 && typeof carbs === 'number' ? carbs / maxMacro : 0,
      },
      {
        key: 'fat',
        label: 'Fat',
        display: formatMacroValue(fat, 'g', 1),
        color: '#6366f1',
        percent: maxMacro > 0 && typeof fat === 'number' ? fat / maxMacro : 0,
      },
      {
        key: 'fiber',
        label: 'Fiber',
        display: formatMacroValue(fiber, 'g', 1),
        color: '#12adc9',
        percent: maxMacro > 0 && typeof fiber === 'number' ? fiber / maxMacro : 0,
      },
      {
        key: 'sugar',
        label: 'Sugar',
        display: formatMacroValue(sugar, 'g', 1),
        color: '#f97316',
        percent: maxMacro > 0 && typeof sugar === 'number' ? sugar / maxMacro : 0,
      },
    ].filter((row) => row.display !== '—')
  }, [draftTotals])

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
      recipe: active.recipe || null,
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

    // Persist this recommendation into AI history only after the user saves.
    try {
      setCommitSaving(true)
      const res = await fetch('/api/ai-meal-recommendation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          recommendation: {
            ...active,
            items: currentItems,
            totals: draftTotals,
            date,
            category,
          },
        }),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as any
        if (data?.history && Array.isArray(data.history)) setHistory(data.history)
      }
    } catch {
    } finally {
      setCommitSaving(false)
    }
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

      // Persist this recommendation into AI history only after the user saves.
      try {
        setCommitSaving(true)
        const commitRes = await fetch('/api/ai-meal-recommendation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'commit',
            recommendation: {
              ...active,
              items: currentItems,
              totals: draftTotals,
              date,
              category,
            },
          }),
        })
        if (commitRes.ok) {
          const data = (await commitRes.json().catch(() => null)) as any
          if (data?.history && Array.isArray(data.history)) setHistory(data.history)
        }
      } catch {}

      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setCommitSaving(false)
      setSavingDiary(false)
    }
  }

  const pageTitle = `AI Recommended ${categoryLabel}`

  const recipeMeta = useMemo(() => {
    const recipe = active?.recipe
    if (!recipe) return null
    const parts: string[] = []
    if (typeof recipe.prepMinutes === 'number' && Number.isFinite(recipe.prepMinutes)) parts.push(`Prep ${Math.round(recipe.prepMinutes)} min`)
    if (typeof recipe.cookMinutes === 'number' && Number.isFinite(recipe.cookMinutes)) parts.push(`Cook ${Math.round(recipe.cookMinutes)} min`)
    if (typeof recipe.servings === 'number' && Number.isFinite(recipe.servings)) parts.push(`${Math.round(recipe.servings)} serving${Math.round(recipe.servings) === 1 ? '' : 's'}`)
    return parts.length > 0 ? parts.join(' • ') : null
  }, [active?.recipe])

  const ActionButtons = ({ className }: { className?: string }) => (
    <div className={`flex items-center gap-2 w-full flex-nowrap ${className || ''}`}>
      <button
        type="button"
        onClick={addToDiary}
        disabled={savingDiary || generating || commitSaving}
        className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-semibold whitespace-nowrap disabled:opacity-60"
      >
        {savingDiary ? 'Saving…' : 'Save this meal'}
      </button>
      <button
        type="button"
        onClick={saveToFavorites}
        disabled={generating || commitSaving}
        className="flex-1 px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-xs sm:text-sm font-semibold hover:bg-gray-200 whitespace-nowrap disabled:opacity-60"
      >
        Save to favorites
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => router.push('/food')}
                className="p-2.5 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-100"
                aria-label="Back"
              >
                <span aria-hidden>←</span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-base sm:text-lg font-semibold text-gray-900 break-words leading-tight">{pageTitle}</div>
                <div className="text-xs text-gray-500">{date}</div>
              </div>
            </div>
            {hasRecommendation ? (
              <button
                type="button"
                onClick={generate}
                disabled={generating || loadingContext}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                aria-label="Generate another recommendation"
              >
                {generating ? 'Generating…' : `Generate another (${costCredits} credits)`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-4xl mx-auto space-y-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">Couldn’t generate</div>
              <div className="mt-1">{error}</div>
              {activeIsCommitted && (
                <div className="mt-2 text-xs text-red-700">
                  Showing your last saved recommendation below.
                </div>
              )}
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
                onClick={() =>
                  router.push(
                    `/food/recommended/explain?date=${encodeURIComponent(date)}&category=${encodeURIComponent(
                      category,
                    )}&returnTo=${encodeURIComponent(`/food/recommended?date=${encodeURIComponent(date)}&category=${encodeURIComponent(category)}`)}`,
                  )
                }
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
              {active ? (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Meal</div>
                        <div className="text-xl font-semibold text-gray-900 break-words">{active.mealName || pageTitle}</div>
                        <div className="mt-2 text-sm text-gray-700">
                          <span className="font-semibold">{formatNumber(draftTotals.calories)}</span> kcal •{' '}
                          Protein {formatNumber(draftTotals.protein_g, 1)}g • Carbs {formatNumber(draftTotals.carbs_g, 1)}g • Fat {formatNumber(draftTotals.fat_g, 1)}g
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Fiber {formatNumber(draftTotals.fiber_g, 1)}g • Sugar {formatNumber(draftTotals.sugar_g, 1)}g
                        </div>
                      </div>
                      <ActionButtons />
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
                    <div className="text-sm font-semibold text-gray-900">Meal macro summary</div>
                    <div className="mt-3 space-y-3">
                      {mealMacroRows.map((row) => (
                        <div key={row.key} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="text-gray-900 font-semibold flex items-center gap-2">
                              <span>{row.label}</span>
                              <span className="text-gray-700 font-normal">{row.display}</span>
                            </div>
                            <div className="text-xs font-semibold text-gray-900">
                              {row.percent > 0 ? `${Math.round(row.percent * 100)}%` : '0%'}
                            </div>
                          </div>
                          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, row.percent * 100))}%`, backgroundColor: row.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white">
                    <div className="flex items-center justify-center flex-wrap gap-2 border-b border-gray-200 px-3 pt-3">
                      {[
                        { key: 'ingredients' as const, label: 'Ingredients' },
                        { key: 'recipe' as const, label: 'Recipe' },
                        { key: 'why' as const, label: 'Reason' },
                      ].map((tab) => {
                        const isActive = activeTab === tab.key
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-3 py-2 text-sm font-semibold rounded-xl ${
                              isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            aria-pressed={isActive}
                          >
                            {tab.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="p-4">
                      {activeTab === 'ingredients' && (
                        <div className="space-y-3">
                          {currentItems.length === 0 ? (
                            <div className="text-sm text-gray-600">No ingredients returned.</div>
                          ) : (
                            currentItems.map((item, idx) => (
                              <RecommendedIngredientCard
                                key={`${item.name}-${idx}`}
                                item={item}
                                index={idx}
                                onServingsChange={updateServings}
                              />
                            ))
                          )}
                        </div>
                      )}
                      {activeTab === 'recipe' && (
                        <div>
                          {recipeMeta && <div className="text-xs text-gray-500 mb-2">{recipeMeta}</div>}
                          {active.recipe?.steps?.length ? (
                            <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5">
                              {active.recipe.steps.slice(0, 12).map((step, i) => (
                                <li key={i} className="leading-relaxed">
                                  {step}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <div className="text-sm text-gray-600">No recipe steps returned.</div>
                          )}
                        </div>
                      )}
                      {activeTab === 'why' && (
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Why this meal was chosen</div>
                          <div className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{active.why || '—'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="text-sm font-semibold text-gray-900">Get a recommendation</div>
                  <div className="mt-1 text-sm text-gray-600">
                    Generate an AI meal suggestion for {categoryLabel.toLowerCase()}.
                  </div>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating}
                    className="mt-4 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {generating ? 'Generating…' : `Generate (${costCredits} credits)`}
                  </button>
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
                            <div className="text-sm font-semibold text-gray-900 break-words">{rec.mealName || `AI Recommended ${CATEGORY_LABELS[rec.category]}`}</div>
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

              {active ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <ActionButtons />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
