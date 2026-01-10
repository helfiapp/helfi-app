'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import UsageMeter from '@/components/UsageMeter'

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'
type SearchKind = 'packaged' | 'single'

type NormalizedFoodItem = {
  source: 'openfoodfacts' | 'usda' | 'fatsecret'
  id: string
  name: string
  brand?: string | null
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

type ServingOption = {
  id: string
  serving_size: string
  label?: string
  grams?: number | null
  ml?: number | null
  unit?: 'g' | 'ml' | 'oz'
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

const CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
  uncategorized: 'Other',
}

const normalizeCategory = (raw: any): MealCategory => {
  const v = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (v.includes('breakfast')) return 'breakfast'
  if (v.includes('lunch')) return 'lunch'
  if (v.includes('dinner')) return 'dinner'
  if (v.includes('snack')) return 'snacks'
  if (v.includes('uncat') || v.includes('other')) return 'uncategorized'
  return 'uncategorized'
}

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const safeNumber = (n: any) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
const round3 = (n: number) => Math.round(n * 1000) / 1000
const is100gServing = (label?: string | null) => /\b100\s*g\b/i.test(String(label || ''))
const sameNumber = (a: any, b: any) => {
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  return Number(a) === Number(b)
}

const alignTimestampToLocalDate = (iso: string, localDate: string) => {
  try {
    if (!localDate || localDate.length < 8) return iso
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const time = d.toISOString().slice(11) // HH:mm:ss.sssZ
    return `${localDate}T${time}`
  } catch {
    return iso
  }
}

const buildDefaultMealName = (names: string[]) => {
  const cleaned = names.map((n) => String(n || '').trim()).filter(Boolean)
  if (cleaned.length === 0) return 'Meal'
  const head = cleaned.slice(0, 3).join(', ')
  return cleaned.length > 3 ? `${head}…` : head
}

const triggerHaptic = (duration = 10) => {
  try {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = localStorage.getItem('hapticsEnabled')
    const enabled = pref === null ? true : pref === 'true'
    if (enabled && !reduced && 'vibrate' in navigator) (navigator as any).vibrate(duration)
  } catch {}
}

const normalizeBrandToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()

export default function AddIngredientClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedDate = searchParams.get('date') || buildTodayIso()
  const category = normalizeCategory(searchParams.get('category'))

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('packaged')
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NormalizedFoodItem[]>([])
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const servingCacheRef = useRef<Map<string, ServingOption>>(new Map())
  const servingPendingRef = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const cleanSingleFoodQuery = (value: string) =>
    value
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const singularizeToken = (value: string) => {
    const lower = value.toLowerCase()
    if (lower.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
    if (
      lower.endsWith('es') &&
      value.length > 3 &&
      !lower.endsWith('ses') &&
      !lower.endsWith('xes') &&
      !lower.endsWith('zes') &&
      !lower.endsWith('ches') &&
      !lower.endsWith('shes')
    ) {
      return value.slice(0, -2)
    }
    if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss')) return value.slice(0, -1)
    return value
  }

  const buildSingleFoodFallback = (value: string) => {
    const cleaned = cleanSingleFoodQuery(value)
    if (!cleaned) return null
    const parts = cleaned.split(' ').filter(Boolean)
    if (parts.length === 0) return null
    const last = parts[parts.length - 1]
    const singular = singularizeToken(last)
    if (singular === last) return null
    parts[parts.length - 1] = singular
    const candidate = parts.join(' ')
    if (candidate.toLowerCase() === cleaned.toLowerCase()) return null
    return candidate
  }

  const buildSearchDisplay = (item: NormalizedFoodItem, searchQuery: string) => {
    const name = String(item?.name || 'Food').trim()
    const brand = String(item?.brand || '').trim()
    if (!brand) return { title: name, showBrandSuffix: false }
    const queryFirst = String(searchQuery || '').trim().split(/\s+/)[0] || ''
    const normalizedQuery = normalizeBrandToken(queryFirst)
    const normalizedBrand = normalizeBrandToken(brand)
    const normalizedName = normalizeBrandToken(name)
    if (normalizedQuery && normalizedBrand && normalizedQuery === normalizedBrand && !normalizedName.startsWith(normalizedBrand)) {
      return { title: `${brand} ${name}`.trim(), showBrandSuffix: false }
    }
    return { title: name, showBrandSuffix: true }
  }

  useEffect(() => {
    return () => {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
    }
  }, [photoPreviewUrl])

  useEffect(() => {
    // Keep /food on the same date when the user returns.
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      const parsed = raw ? JSON.parse(raw) : {}
      const next = { ...(parsed || {}), selectedDate }
      sessionStorage.setItem('foodDiary:warmState', JSON.stringify(next))
    } catch {}
  }, [selectedDate])

  const categoryLabel = CATEGORY_LABELS[category] || 'Other'

  const scoreServingOption = (opt: ServingOption) => {
    const label = String(opt?.label || opt?.serving_size || '').toLowerCase()
    let score = 0
    if (label.includes('serving')) score += 4
    if (label.includes('piece') || label.includes('burger') || label.includes('sandwich') || label.includes('slice')) score += 3
    const grams = Number(opt?.grams)
    if (Number.isFinite(grams)) {
      if (grams >= 40 && grams <= 400) score += 3
      if (grams === 100) score -= 6
    }
    if (is100gServing(label)) score -= 10
    return score
  }

  const pickBestServingOption = (options: ServingOption[]) => {
    if (!Array.isArray(options) || options.length === 0) return null
    const non100 = options.filter((opt) => !is100gServing(opt?.serving_size))
    const pool = non100.length > 0 ? non100 : options
    const sorted = [...pool].sort((a, b) => scoreServingOption(b) - scoreServingOption(a))
    return sorted[0] || null
  }

  const applyServingOptionToResult = (r: NormalizedFoodItem, opt: ServingOption): NormalizedFoodItem => ({
    ...r,
    serving_size: opt.serving_size || r.serving_size,
    calories: safeNumber(opt.calories),
    protein_g: safeNumber(opt.protein_g),
    carbs_g: safeNumber(opt.carbs_g),
    fat_g: safeNumber(opt.fat_g),
    fiber_g: safeNumber(opt.fiber_g),
    sugar_g: safeNumber(opt.sugar_g),
  })

  const hasMeaningfulChange = (before: NormalizedFoodItem, after: NormalizedFoodItem) => {
    if (String(before.serving_size || '') !== String(after.serving_size || '')) return true
    if (!sameNumber(before.calories, after.calories)) return true
    if (!sameNumber(before.protein_g, after.protein_g)) return true
    if (!sameNumber(before.carbs_g, after.carbs_g)) return true
    if (!sameNumber(before.fat_g, after.fat_g)) return true
    if (!sameNumber(before.fiber_g, after.fiber_g)) return true
    if (!sameNumber(before.sugar_g, after.sugar_g)) return true
    return false
  }

  const loadServingOverride = async (r: NormalizedFoodItem): Promise<NormalizedFoodItem | null> => {
    if (!r || (r.source !== 'usda' && r.source !== 'fatsecret')) return null
    if (!is100gServing(r.serving_size)) return null
    const key = `${r.source}:${r.id}`
    const cached = servingCacheRef.current.get(key)
    if (cached) return applyServingOptionToResult(r, cached)
    if (servingPendingRef.current.has(key)) return null
    servingPendingRef.current.add(key)
    try {
      const params = new URLSearchParams({ source: r.source, id: String(r.id) })
      const res = await fetch(`/api/food-data/servings?${params.toString()}`, { method: 'GET' })
      if (!res.ok) return null
      const data = await res.json().catch(() => ({}))
      const options: ServingOption[] = Array.isArray(data?.options) ? data.options : []
      const best = pickBestServingOption(options)
      if (!best) return null
      servingCacheRef.current.set(key, best)
      const updated = applyServingOptionToResult(r, best)
      if (!hasMeaningfulChange(r, updated)) return null
      return updated
    } catch {
      return null
    } finally {
      servingPendingRef.current.delete(key)
    }
  }

  const runSearch = async (qOverride?: string, kindOverride?: SearchKind) => {
    const q = String(qOverride ?? query).trim()
    const k = kindOverride ?? kind
    if (!q) {
      setError('Please type a food name to search.')
      return
    }

    setError(null)
    setLoading(true)
    setResults([])

    try {
      abortRef.current?.abort()
    } catch {}
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++seqRef.current

    try {
      const sourceParam = k === 'single' ? 'usda' : 'auto'
      const fetchItems = async (searchQuery: string) => {
        const params = new URLSearchParams({
          source: sourceParam,
          q: searchQuery,
          kind: k,
          limit: '20',
        })
        const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET', signal: controller.signal })
        const data = await res.json().catch(() => ({}))
        return { res, data }
      }

      let { res, data } = await fetchItems(q)
      if (!res.ok) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
            ? data.message
            : 'Search failed. Please try again.'
        setError(msg)
        return
      }
      if (seqRef.current !== seq) return
      let nextResults = Array.isArray(data?.items) ? data.items : []
      if (k === 'single') {
        nextResults = nextResults.filter((item: NormalizedFoodItem) => item?.source === 'usda')
        if (nextResults.length === 0) {
          const fallback = buildSingleFoodFallback(q)
          if (fallback) {
            const retry = await fetchItems(fallback)
            if (retry.res.ok) {
              const retryItems = Array.isArray(retry.data?.items) ? retry.data.items : []
              nextResults = retryItems.filter((item: NormalizedFoodItem) => item?.source === 'usda')
            }
          }
        }
      }
      setResults(nextResults)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setError('Search failed. Please try again.')
    } finally {
      if (seqRef.current === seq) setLoading(false)
    }
  }

  useEffect(() => {
    if (results.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const r of results) {
        if (!is100gServing(r.serving_size)) continue
        const updated = await loadServingOverride(r)
        if (!updated || cancelled) continue
        setResults((prev) => {
          let changed = false
          const next = prev.map((item) => {
            if (item.source === updated.source && item.id === updated.id) {
              if (hasMeaningfulChange(item, updated)) {
                changed = true
                return updated
              }
            }
            return item
          })
          return changed ? next : prev
        })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [results])

  const addFoodEntry = async (payload: any) => {
    const res = await fetch('/api/food-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
          ? data.message
          : 'Saving failed. Please try again.'
      throw new Error(msg)
    }
    return data
  }

  const addFromSearchResult = async (r: NormalizedFoodItem) => {
    if (!r) return
    setError(null)
    triggerHaptic(10)
    setAddingId(`${r.source}:${r.id}`)
    try {
      const upgraded = await loadServingOverride(r)
      const final = upgraded || r
      const item = {
        name: String(final.name || 'Food'),
        brand: final.brand ?? null,
        serving_size: String(final.serving_size || '1 serving'),
        calories: safeNumber(final.calories),
        protein_g: safeNumber(final.protein_g),
        carbs_g: safeNumber(final.carbs_g),
        fat_g: safeNumber(final.fat_g),
        fiber_g: safeNumber(final.fiber_g),
        sugar_g: safeNumber(final.sugar_g),
        servings: 1,
      }

      const nutrition = {
        calories: Math.round(Number(item.calories || 0)),
        protein: round3(Number(item.protein_g || 0)),
        carbs: round3(Number(item.carbs_g || 0)),
        fat: round3(Number(item.fat_g || 0)),
        fiber: round3(Number(item.fiber_g || 0)),
        sugar: round3(Number(item.sugar_g || 0)),
      }

      const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)

      const payload = {
        description: item.name,
        nutrition,
        imageUrl: null,
        items: [item],
        localDate: selectedDate,
        meal: category,
        category,
        createdAt: createdAtIso,
      }

      const created = await addFoodEntry(payload)
      try {
        const createdId = typeof created?.id === 'string' ? created.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}
      router.push('/food')
    } catch (e: any) {
      setError(e?.message || 'Could not add that ingredient. Please try again.')
    } finally {
      setAddingId(null)
    }
  }

  const addByPhoto = async (file: File) => {
    if (!file) return
    setError(null)
    triggerHaptic(10)
    setPhotoLoading(true)
    try {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
      try {
        setPhotoPreviewUrl(URL.createObjectURL(file))
      } catch {}
    } catch {}
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('analysisMode', 'meal')
      const res = await fetch('/api/analyze-food', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data?.message === 'string'
            ? data.message
            : typeof data?.error === 'string'
            ? data.error
            : 'Photo analysis failed. Please try again.'
        setError(msg)
        return
      }

      const items = Array.isArray(data?.items) ? data.items : []
      const total = data?.total || data?.nutrition || null

      if (!items.length) {
        setError('No ingredients were detected from that photo. Try a clearer photo or use search.')
        return
      }

      const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)
      const title = buildDefaultMealName(items.map((it: any) => it?.name || it?.food || 'Food'))

      const nutrition = {
        calories: Math.round(Number(total?.calories || 0)),
        protein: round3(Number(total?.protein ?? total?.protein_g ?? 0)),
        carbs: round3(Number(total?.carbs ?? total?.carbs_g ?? 0)),
        fat: round3(Number(total?.fat ?? total?.fat_g ?? 0)),
        fiber: round3(Number(total?.fiber ?? total?.fiber_g ?? 0)),
        sugar: round3(Number(total?.sugar ?? total?.sugar_g ?? 0)),
      }

      const payload = {
        description: title,
        nutrition,
        imageUrl: null,
        items,
        localDate: selectedDate,
        meal: category,
        category,
        createdAt: createdAtIso,
      }

      const created = await addFoodEntry(payload)
      try {
        const createdId = typeof created?.id === 'string' ? created.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
      router.push('/food')
    } catch (e: any) {
      setError(e?.message || 'Photo analysis failed. Please try again.')
    } finally {
      setPhotoLoading(false)
      try {
        if (photoInputRef.current) photoInputRef.current.value = ''
      } catch {}
    }
  }

  const headerSubtitle = useMemo(() => `Add to ${categoryLabel}`, [categoryLabel])

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="w-full max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="flex-1 text-center">
            <div className="text-lg font-semibold text-gray-900">Add ingredient</div>
            <div className="text-xs text-gray-500">{headerSubtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-3xl mx-auto space-y-4">
          {/* PROTECTED: ADD_INGREDIENT_SEARCH START */}
          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900">
              Search foods (USDA for single foods, FatSecret + OpenFoodFacts for packaged)
            </div>

            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. pizza"
                className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                aria-label="Search"
                disabled={loading || query.trim().length === 0}
                onClick={() => runSearch()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
                  </svg>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setKind('packaged')
                  if (query.trim().length >= 2) runSearch(query, 'packaged')
                }}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  kind === 'packaged' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
                } disabled:opacity-60`}
              >
                Packaged
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setKind('single')
                  if (query.trim().length >= 2) runSearch(query, 'single')
                }}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  kind === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-200'
                } disabled:opacity-60`}
              >
                Single food
              </button>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            {!loading && !error && results.length === 0 && query.trim() && (
              <div className="text-sm text-gray-500">
                No results yet. Try a different search. Plurals are OK — we auto-try the single word.
              </div>
            )}

            {results.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pt-1">
                {results.map((r, idx) => {
                  const id = `${r.source}:${r.id}:${idx}`
                  const busy = addingId === `${r.source}:${r.id}`
                  const display = buildSearchDisplay(r, query)
                  return (
                    <div key={id} className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {display.title}
                          {display.showBrandSuffix && r.brand ? ` – ${r.brand}` : ''}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-600">
                          {r.serving_size ? `Serving: ${r.serving_size} • ` : ''}
                          {r.calories != null && !Number.isNaN(Number(r.calories)) && <span>{Math.round(Number(r.calories))} kcal</span>}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-400">
                          Source: {r.source === 'usda' ? 'USDA' : r.source === 'fatsecret' ? 'FatSecret' : 'OpenFoodFacts'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => addFromSearchResult(r)}
                        className="ml-3 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busy ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* PROTECTED: ADD_INGREDIENT_SEARCH END */}

          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-900">Or use AI photo analysis</div>
            <div className="text-sm text-gray-600">Take a clear photo of the food or package.</div>

            <div>
              <UsageMeter inline={true} feature="foodAnalysis" />
            </div>

            {photoPreviewUrl && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreviewUrl} alt="Selected food photo" className="w-full max-h-64 object-cover" />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={photoLoading}
                onClick={() => photoInputRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {photoLoading ? 'Analyzing…' : 'Add image'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setError(null)
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) addByPhoto(f)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
