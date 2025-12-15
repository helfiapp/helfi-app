'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

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
      const params = new URLSearchParams({
        source: 'auto',
        q,
        kind: k,
        limit: '20',
      })
      const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET', signal: controller.signal })
      const data = await res.json().catch(() => ({}))
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
      setResults(Array.isArray(data?.items) ? data.items : [])
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setError('Search failed. Please try again.')
    } finally {
      if (seqRef.current === seq) setLoading(false)
    }
  }

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
    setAddingId(`${r.source}:${r.id}`)
    try {
      const item = {
        name: String(r.name || 'Food'),
        brand: r.brand ?? null,
        serving_size: String(r.serving_size || '1 serving'),
        calories: safeNumber(r.calories),
        protein_g: safeNumber(r.protein_g),
        carbs_g: safeNumber(r.carbs_g),
        fat_g: safeNumber(r.fat_g),
        fiber_g: safeNumber(r.fiber_g),
        sugar_g: safeNumber(r.sugar_g),
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

      await addFoodEntry(payload)
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
    setPhotoLoading(true)
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

      await addFoodEntry(payload)
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
          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900">
              Search foods (USDA + FatSecret + OpenFoodFacts)
            </div>

            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. pizza"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                disabled={loading || query.trim().length === 0}
                onClick={() => runSearch()}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Searching…' : 'Search'}
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
              <div className="text-sm text-gray-500">No results yet. Try a different search.</div>
            )}

            {results.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pt-1">
                {results.map((r, idx) => {
                  const id = `${r.source}:${r.id}:${idx}`
                  const busy = addingId === `${r.source}:${r.id}`
                  return (
                    <div key={id} className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {r.name}
                          {r.brand ? ` – ${r.brand}` : ''}
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

          <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-900">Or use AI photo analysis</div>
            <div className="text-sm text-gray-600">Take a clear photo of the food or package.</div>

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

