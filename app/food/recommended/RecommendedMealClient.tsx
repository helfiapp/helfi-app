'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import RecommendedIngredientCard from '@/components/food/RecommendedIngredientCard'
import DailyMacroSummary from '@/components/food/DailyMacroSummary'
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
  const [seenExplain, setSeenExplain] = useState<boolean | null>(null)
  const [commitSaving, setCommitSaving] = useState(false)

  const hasAutoGeneratedRef = useRef(false)
  const hasReferrerAutoGeneratedRef = useRef(false)
  const referrerRef = useRef<string>('')
  const autoGenerateRequestedRef = useRef(false)
  const hasStrippedGenerateFlagRef = useRef(false)

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
      setContext(data.context)
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
      setContext(data.context)
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
    hasAutoGeneratedRef.current = false
    hasReferrerAutoGeneratedRef.current = false
    autoGenerateRequestedRef.current = false
    hasStrippedGenerateFlagRef.current = false
  }, [date, category])

  useEffect(() => {
    if (typeof document === 'undefined') return
    try {
      referrerRef.current = String(document.referrer || '')
    } catch {}
  }, [])

  useEffect(() => {
    if (!generateFlag) return
    autoGenerateRequestedRef.current = true
    if (hasStrippedGenerateFlagRef.current) return
    hasStrippedGenerateFlagRef.current = true
    // Strip ?generate=1 immediately so browser back/refresh can't repeatedly auto-trigger.
    try {
      const qs = new URLSearchParams()
      qs.set('date', date)
      qs.set('category', category)
      router.replace(`/food/recommended?${qs.toString()}`)
    } catch {}
  }, [generateFlag, date, category, router])

  useEffect(() => {
    if (!autoGenerateRequestedRef.current) return
    if (loadingContext) return
    if (seenExplain === false) return
    if (hasAutoGeneratedRef.current) return
    if (hasRecommendation) return
    if (history.length > 0) return
    hasAutoGeneratedRef.current = true
    autoGenerateRequestedRef.current = false
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingContext, seenExplain, hasRecommendation, history.length])

  useEffect(() => {
    // UX: if the user navigated here from the Food Diary (same-origin referrer),
    // auto-generate the first recommendation so there isn't a second "Generate" step.
    if (generateFlag) return
    if (loadingContext) return
    if (generating) return
    if (seenExplain === false) return
    if (hasRecommendation) return
    if (history.length > 0) return
    if (hasReferrerAutoGeneratedRef.current) return

    const ref = (referrerRef.current || '').toLowerCase()
    const cameFromFoodDiary = ref.includes('/food')
    if (!cameFromFoodDiary) return

    hasReferrerAutoGeneratedRef.current = true
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateFlag, loadingContext, generating, seenExplain, hasRecommendation, history.length])

  useEffect(() => {
    if (loadingContext) return
    if (seenExplain === null) return
    if (seenExplain) return
    // First-time: force the disclosure screen before generating anything.
    const qs = new URLSearchParams()
    qs.set('date', date)
    qs.set('category', category)
    qs.set('returnTo', `/food/recommended?date=${encodeURIComponent(date)}&category=${encodeURIComponent(category)}&generate=1`)
    router.replace(`/food/recommended/explain?${qs.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingContext, seenExplain, date, category])

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
          {hasRecommendation ? (
            <button
              type="button"
              onClick={generate}
              disabled={generating || loadingContext}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
              aria-label="Generate another recommendation"
            >
              {generating ? 'Generating…' : `Generate another (${costCredits} credits)`}
            </button>
          ) : null}
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
              {context && <DailyMacroSummary used={context.used} targets={context.targets} />}

              {active ? (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Meal</div>
                        <div className="text-xl font-semibold text-gray-900 truncate">{active.mealName || pageTitle}</div>
                        <div className="mt-2 text-sm text-gray-700">
                          <span className="font-semibold">{formatNumber(draftTotals.calories)}</span> kcal •{' '}
                          Protein {formatNumber(draftTotals.protein_g, 1)}g • Carbs {formatNumber(draftTotals.carbs_g, 1)}g • Fat {formatNumber(draftTotals.fat_g, 1)}g
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
                          <RecommendedIngredientCard
                            key={`${item.name}-${idx}`}
                            item={item}
                            index={idx}
                            onServingsChange={updateServings}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Recipe</div>
                        {recipeMeta && <div className="text-xs text-gray-500 mt-1">{recipeMeta}</div>}
                      </div>
                    </div>
                    {active.recipe?.steps?.length ? (
                      <ol className="mt-3 space-y-2 text-sm text-gray-700 list-decimal pl-5">
                        {active.recipe.steps.slice(0, 12).map((step, i) => (
                          <li key={i} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="mt-2 text-sm text-gray-600">No recipe steps returned.</div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900">Why this meal was chosen</div>
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{active.why || '—'}</p>
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
