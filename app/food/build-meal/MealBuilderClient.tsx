'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import UsageMeter from '@/components/UsageMeter'

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'

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

type BuilderUnit = 'g' | 'oz' | 'ml'

type BuilderItem = {
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
  servings: number
  __baseAmount: number | null
  __baseUnit: BuilderUnit | null
  __amount: number
  __amountInput: string
  __unit: BuilderUnit | null
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

const toNumber = (v: any): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

const triggerHaptic = (duration = 10) => {
  try {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
    const pref = localStorage.getItem('hapticsEnabled')
    const enabled = pref === null ? true : pref === 'true'
    if (enabled && !reduced && 'vibrate' in navigator) (navigator as any).vibrate(duration)
  } catch {}
}

const parseServingBase = (servingSize: any): { amount: number | null; unit: BuilderUnit | null } => {
  const raw = String(servingSize || '').trim()
  if (!raw) return { amount: null, unit: null }

  // Prefer values inside parentheses: "1 breast (187 g)"
  const paren = raw.match(/\(([^)]*)\)/)
  const target = paren?.[1] ? paren[1] : raw

  const m = target.match(/(\d+(?:\.\d+)?)\s*(g|grams?|ml|mL|oz|ounces?)/i)
  if (!m) return { amount: null, unit: null }
  const amount = parseFloat(m[1])
  if (!Number.isFinite(amount) || amount <= 0) return { amount: null, unit: null }
  const unitRaw = String(m[2] || '').toLowerCase()

  if (unitRaw.startsWith('g')) return { amount, unit: 'g' }
  if (unitRaw === 'ml' || unitRaw === 'ml'.toLowerCase() || unitRaw === 'mL'.toLowerCase()) return { amount, unit: 'ml' }
  if (unitRaw.startsWith('oz') || unitRaw.startsWith('ounce')) return { amount, unit: 'oz' }
  return { amount: null, unit: null }
}

const convertAmount = (amount: number, from: BuilderUnit, to: BuilderUnit) => {
  if (!Number.isFinite(amount)) return amount
  if (from === to) return amount

  // Weight conversions
  if (from === 'g' && to === 'oz') return amount / 28.3495
  if (from === 'oz' && to === 'g') return amount * 28.3495

  // Volume conversions (US fl oz)
  if (from === 'ml' && to === 'oz') return amount / 29.5735
  if (from === 'oz' && to === 'ml') return amount * 29.5735

  // Cross (g <-> ml) is not safe without density; keep as-is
  return amount
}

const allowedUnitsForBase = (baseUnit: BuilderUnit | null): BuilderUnit[] => {
  if (baseUnit === 'g') return ['g', 'oz']
  if (baseUnit === 'ml') return ['ml', 'oz']
  if (baseUnit === 'oz') return ['oz', 'ml']
  return []
}

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const computeItemTotals = (item: BuilderItem) => {
  const servings = typeof item.servings === 'number' && Number.isFinite(item.servings) ? item.servings : 0
  return {
    calories: macroOrZero(item.calories) * servings,
    protein: macroOrZero(item.protein_g) * servings,
    carbs: macroOrZero(item.carbs_g) * servings,
    fat: macroOrZero(item.fat_g) * servings,
    fiber: macroOrZero(item.fiber_g) * servings,
    sugar: macroOrZero(item.sugar_g) * servings,
  }
}

const sanitizeMealTitle = (v: string) => v.replace(/\s+/g, ' ').trim()

const buildDefaultMealName = (items: BuilderItem[]) => {
  const names = items.map((i) => String(i?.name || '').trim()).filter(Boolean)
  if (names.length === 0) return 'Meal'
  const head = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${head}…` : head
}

export default function MealBuilderClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userData, updateUserData } = useUserData()

  const initialDate = searchParams.get('date') || buildTodayIso()
  const initialCategory = normalizeCategory(searchParams.get('category'))
  const editFavoriteId = (searchParams.get('editFavoriteId') || '').trim()
  const sourceLogId = (searchParams.get('sourceLogId') || '').trim()

  const [selectedDate] = useState<string>(initialDate)
  const [category] = useState<MealCategory>(initialCategory)

  const [mealName, setMealName] = useState('')
  const mealNameBackupRef = useRef<string>('')
  const mealNameEditedRef = useRef(false)
  const mealNameWasClearedOnFocusRef = useRef(false)

  const [query, setQuery] = useState('')
  const queryBackupRef = useRef<string>('')
  const queryEditedRef = useRef(false)
  const queryWasClearedOnFocusRef = useRef(false)
  const [kind, setKind] = useState<'packaged' | 'single'>('packaged')
  const [searchLoading, setSearchLoading] = useState(false)
  const [savingMeal, setSavingMeal] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NormalizedFoodItem[]>([])
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [loadedFavoriteId, setLoadedFavoriteId] = useState<string | null>(null)
  const [linkedFavoriteId, setLinkedFavoriteId] = useState<string>('')
  const [favoriteSaving, setFavoriteSaving] = useState(false)

  const [items, setItems] = useState<BuilderItem[]>([])
  const itemsRef = useRef<BuilderItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lastRemoved, setLastRemoved] = useState<{ item: BuilderItem; index: number } | null>(null)
  const undoRemoveTimeoutRef = useRef<any>(null)

  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeStatusHint, setBarcodeStatusHint] = useState<string>('Ready')
  const [manualBarcode, setManualBarcode] = useState('')
  const manualBarcodeBackupRef = useRef<string>('')
  const manualBarcodeEditedRef = useRef(false)
  const manualBarcodeWasClearedOnFocusRef = useRef(false)
  const barcodeScannerRef = useRef<any>(null)

  const [showFavoritesPicker, setShowFavoritesPicker] = useState(false)
  const [favoritesSearch, setFavoritesSearch] = useState('')
  const [favoritesActiveTab, setFavoritesActiveTab] = useState<'all' | 'favorites' | 'custom'>('all')
  const [favoritesToast, setFavoritesToast] = useState<string | null>(null)

  const busy = searchLoading || savingMeal || photoLoading || barcodeLoading

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    // Cleanup blob preview URLs.
    return () => {
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
    }
  }, [photoPreviewUrl])

  const parseFavoriteItems = (fav: any): any[] | null => {
    const candidate = fav?.items
    if (Array.isArray(candidate)) return candidate
    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  }

  const convertToBuilderItems = (rawItems: any[]): BuilderItem[] => {
    const next: BuilderItem[] = []
    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const name = String(raw?.name || raw?.food || 'Food').trim() || 'Food'
      const brand = raw?.brand ?? null
      const serving_size = raw?.serving_size || raw?.servingSize || raw?.serving || ''
      const servings = toNumber(raw?.servings) ?? 1
      const base = parseServingBase(serving_size)
      const baseAmount = base.amount
      const baseUnit = base.unit
      const id = `edit:${Date.now()}:${Math.random().toString(16).slice(2)}`
      const resolvedServings = Number.isFinite(servings) && servings > 0 ? servings : 1
      next.push({
        id,
        name,
        brand,
        serving_size: serving_size || null,
        calories: toNumber(raw?.calories),
        protein_g: toNumber(raw?.protein_g),
        carbs_g: toNumber(raw?.carbs_g),
        fat_g: toNumber(raw?.fat_g),
        fiber_g: toNumber(raw?.fiber_g),
        sugar_g: toNumber(raw?.sugar_g),
        servings: resolvedServings,
        __baseAmount: baseAmount,
        __baseUnit: baseUnit,
        __amount: baseAmount && baseUnit ? round3(baseAmount * resolvedServings) : round3(resolvedServings),
        __amountInput: String(baseAmount && baseUnit ? round3(baseAmount * resolvedServings) : round3(resolvedServings)),
        __unit: baseUnit,
      })
    }
    return next
  }

  useEffect(() => {
    // Editing mode: load a favorite meal into the builder for edits.
    if (!editFavoriteId) return
    if (loadedFavoriteId === editFavoriteId) return
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const fav = favorites.find((f: any) => String(f?.id || '') === editFavoriteId) || null
    if (!fav) return

    const label = normalizeMealLabel(fav?.label || fav?.description || '').trim()
    if (label) setMealName(label)

    const favItems = parseFavoriteItems(fav)
    if (favItems && favItems.length > 0) {
      const converted = convertToBuilderItems(favItems)
      setItems(converted)
      setExpandedId(converted[0]?.id || null)
    }

    setLoadedFavoriteId(editFavoriteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFavoriteId, loadedFavoriteId, userData?.favorites])

  useEffect(() => {
    // Editing mode (diary): load a FoodLog row directly when a Build-a-meal diary entry is edited.
    if (!sourceLogId) return
    if (editFavoriteId) return
    if (loadedFavoriteId === `log:${sourceLogId}`) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/food-log?id=${encodeURIComponent(sourceLogId)}`, { method: 'GET' })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) return
        const log = (data as any)?.log || null
        if (!log) return

        const linked = (() => {
          const n = log?.nutrients
          if (n && typeof n === 'object') {
            const raw = (n as any).__favoriteId
            return typeof raw === 'string' ? raw.trim() : ''
          }
          return ''
        })()
        if (!cancelled) setLinkedFavoriteId(linked)

        const label = normalizeMealLabel(log?.description || log?.name || '').trim()
        if (!cancelled && label) setMealName(label)

        const rawItems = Array.isArray(log?.items) ? log.items : null
        if (!cancelled && rawItems && rawItems.length > 0) {
          const converted = convertToBuilderItems(rawItems)
          setItems(converted)
          setExpandedId(converted[0]?.id || null)
        }

        if (!cancelled) setLoadedFavoriteId(`log:${sourceLogId}`)
      } catch {
        // non-blocking
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLogId, editFavoriteId, loadedFavoriteId])

  useEffect(() => {
    // Keep /food on the same date when the user returns.
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      const parsed = raw ? JSON.parse(raw) : {}
      const next = { ...(parsed || {}), selectedDate }
      sessionStorage.setItem('foodDiary:warmState', JSON.stringify(next))
    } catch {}
  }, [selectedDate])

  const mealTotals = useMemo(() => {
    const total = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    for (const it of items) {
      const t = computeItemTotals(it)
      total.calories += t.calories
      total.protein += t.protein
      total.carbs += t.carbs
      total.fat += t.fat
      total.fiber += t.fiber
      total.sugar += t.sugar
    }
    return total
  }, [items])

  const addBuilderItem = (next: BuilderItem) => {
    setItems((prev) => [...prev, next])
    setExpandedId(next.id)
    try {
      if (typeof window !== 'undefined') {
        const id = String(next.id || '')
        const start = Date.now()
        const escape = (v: string) => {
          try {
            return (window as any).CSS?.escape ? (window as any).CSS.escape(v) : v.replace(/["\\]/g, '\\$&')
          } catch {
            return v.replace(/["\\]/g, '\\$&')
          }
        }
        const tick = () => {
          const el = document.querySelector(`[data-builder-item-id="${escape(id)}"]`) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          if (Date.now() - start < 1500) window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }
    } catch {}
  }

  const runSearch = async () => {
    const q = query.trim()
    if (!q) {
      setError('Please type a food name to search.')
      return
    }

    setError(null)
    setSearchLoading(true)
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
        q: q,
        kind,
        limit: '20',
      })
      const res = await fetch(`/api/food-data?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      })
      if (!res.ok) {
        setError('Search failed. Please try again.')
        return
      }
      const data = await res.json()
      if (seqRef.current !== seq) return
      setResults(Array.isArray(data?.items) ? data.items : [])
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setError('Search failed. Please try again.')
    } finally {
      if (seqRef.current === seq) setSearchLoading(false)
    }
  }

  const addItem = (r: NormalizedFoodItem) => {
    triggerHaptic(10)
    const base = parseServingBase(r?.serving_size)
    const baseAmount = base.amount
    const baseUnit = base.unit

    const defaultAmount =
      baseAmount && baseUnit
        ? baseAmount
        : 1

    const id = `${r.source}:${r.id}:${Date.now()}`

    const next: BuilderItem = {
      id,
      name: r.name || 'Food',
      brand: r.brand ?? null,
      serving_size: r.serving_size ?? null,
      calories: toNumber(r.calories),
      protein_g: toNumber(r.protein_g),
      carbs_g: toNumber(r.carbs_g),
      fat_g: toNumber(r.fat_g),
      fiber_g: toNumber(r.fiber_g),
      sugar_g: toNumber(r.sugar_g),
      servings: 1,
      __baseAmount: baseAmount,
      __baseUnit: baseUnit,
      __amount: defaultAmount,
      __amountInput: String(defaultAmount),
      __unit: baseUnit,
    }

    // If we know the base amount, treat the amount as units in the base and compute servings.
    if (baseAmount && baseUnit) {
      next.servings = 1
    }

    addBuilderItem(next)
  }

  const addItemsFromAi = (aiItems: any[]) => {
    if (!Array.isArray(aiItems) || aiItems.length === 0) return
    // Add each detected ingredient as its own expandable card.
    for (const ai of aiItems) {
      const name = String(ai?.name || ai?.food || 'Food').trim() || 'Food'
      const brand = ai?.brand ?? null
      const serving_size = ai?.serving_size || ai?.servingSize || ai?.serving || ''
      const servings = toNumber(ai?.servings) ?? 1

      const base = parseServingBase(serving_size)
      const baseAmount = base.amount
      const baseUnit = base.unit

      const id = `ai:${Date.now()}:${Math.random().toString(16).slice(2)}`
      const next: BuilderItem = {
        id,
        name,
        brand,
        serving_size: serving_size || null,
        calories: toNumber(ai?.calories),
        protein_g: toNumber(ai?.protein_g),
        carbs_g: toNumber(ai?.carbs_g),
        fat_g: toNumber(ai?.fat_g),
        fiber_g: toNumber(ai?.fiber_g),
        sugar_g: toNumber(ai?.sugar_g),
        servings: Number.isFinite(servings) && servings > 0 ? servings : 1,
        __baseAmount: baseAmount,
        __baseUnit: baseUnit,
        __amount: baseAmount && baseUnit ? round3(baseAmount * (Number.isFinite(servings) ? servings : 1)) : round3(Number.isFinite(servings) ? servings : 1),
        __amountInput: String(baseAmount && baseUnit ? round3(baseAmount * (Number.isFinite(servings) ? servings : 1)) : round3(Number.isFinite(servings) ? servings : 1)),
        __unit: baseUnit,
      }
      addBuilderItem(next)
    }
  }

  const addFromFavorite = (fav: any) => {
    if (!fav) return
    // Favorites are saved meals; prefer their ingredient cards when available.
    let favItems: any[] | null = null
    const candidate = (fav as any)?.items
    if (Array.isArray(candidate)) {
      favItems = candidate
    } else if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate)
        favItems = Array.isArray(parsed) ? parsed : null
      } catch {
        favItems = null
      }
    }

    if (favItems && favItems.length > 0) {
      addItemsFromAi(favItems)
      return
    }

    // Fallback: add as a single ingredient using the favorite's totals.
    const total = (fav as any)?.total || (fav as any)?.nutrition || null
    const label = String((fav as any)?.label || (fav as any)?.description || 'Favorite').trim() || 'Favorite'
    addItemsFromAi([
      {
        name: label,
        brand: 'Favorite',
        serving_size: '1 serving',
        servings: 1,
        calories: total?.calories ?? null,
        protein_g: total?.protein ?? total?.protein_g ?? null,
        carbs_g: total?.carbs ?? total?.carbs_g ?? null,
        fat_g: total?.fat ?? total?.fat_g ?? null,
        fiber_g: total?.fiber ?? total?.fiber_g ?? null,
        sugar_g: total?.sugar ?? total?.sugar_g ?? null,
      },
    ])
  }

  const HISTORY_RESET_EPOCH_MS = 1765532876309 // Dec 12, 2025 09:47:56 UTC

  const normalizeMealLabel = (raw: any) => {
    const s = String(raw || '').trim()
    if (!s) return ''
    const firstLine = s.split('\n')[0] || s
    return firstLine.split('Calories:')[0].trim()
  }

  const favoriteDisplayLabel = (fav: any) => {
    const raw = (fav?.label || fav?.description || '').toString()
    return normalizeMealLabel(raw)
  }

  const looksLikeMealBuilderCreatedItemId = (rawId: any) => {
    const id = typeof rawId === 'string' ? rawId : ''
    if (!id) return false
    if (/^(openfoodfacts|usda|fatsecret):[^:]+:\d{9,}$/i.test(id)) return true
    if (/^ai:\d{9,}:[0-9a-f]+$/i.test(id)) return true
    return false
  }

  const isLegacyMealBuilderFavorite = (fav: any) => {
    if (!fav) return false
    const items = parseFavoriteItems(fav)
    if (!items || items.length === 0) return false
    return items.some((it: any) => looksLikeMealBuilderCreatedItemId(it?.id))
  }

  const isCustomMealFavorite = (fav: any) => {
    if (!fav) return false
    if ((fav as any)?.customMeal === true) return true
    const method = String((fav as any)?.method || '').toLowerCase()
    if (method === 'meal-builder' || method === 'combined') return true
    return false
  }

  const buildSourceTag = (entry: any) => {
    if (!entry) return 'Custom'
    if (entry?.sourceTag) return String(entry.sourceTag)
    if ((entry as any)?.source) return String((entry as any).source).toUpperCase()
    if ((entry as any)?.method === 'photo') return 'CRDB'
    if ((entry as any)?.method === 'text') return 'Manual'
    return 'CRDB'
  }

  const extractCalories = (entry: any) => {
    const n = (entry?.total || entry?.nutrition || null) as any
    const c = n?.calories
    return typeof c === 'number' && Number.isFinite(c) ? Math.round(c) : null
  }

  const readWarmDiaryState = (): any | null => {
    try {
      const raw = sessionStorage.getItem('foodDiary:warmState')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const readPersistentDiarySnapshot = (): any | null => {
    try {
      const raw = localStorage.getItem('foodDiary:persistentSnapshot')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const buildFavoritesDatasets = () => {
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const pool: any[] = []

    const todays = Array.isArray((userData as any)?.todaysFoods) ? ((userData as any).todaysFoods as any[]) : []
    pool.push(...todays)

    const warm = readWarmDiaryState()
    const historyByDate = warm?.historyByDate
    if (historyByDate && typeof historyByDate === 'object') {
      Object.values(historyByDate).forEach((entries: any) => {
        if (Array.isArray(entries)) pool.push(...entries)
      })
    }

    const snap = readPersistentDiarySnapshot()
    if (snap?.byDate && typeof snap.byDate === 'object') {
      Object.values(snap.byDate).forEach((d: any) => {
        if (Array.isArray(d?.entries)) pool.push(...d.entries)
      })
    }

    const meetsShape = (entry: any) => {
      if (!entry) return false
      const desc = String(entry?.description || entry?.label || '').trim()
      if (!desc) return false
      const hasNutrition = Boolean(entry?.nutrition) || Boolean(entry?.total) || (Array.isArray(entry?.items) && entry.items.length > 0)
      if (!hasNutrition) return false
      const ts =
        typeof entry?.createdAt === 'string'
          ? new Date(entry.createdAt).getTime()
          : typeof entry?.createdAt === 'number'
          ? entry.createdAt
          : typeof entry?.id === 'number'
          ? entry.id
          : Number(entry?.id)
      return Number.isFinite(ts) ? ts >= HISTORY_RESET_EPOCH_MS : true
    }

    const allByKey = new Map<string, any>()
    pool.filter(meetsShape).forEach((entry) => {
      const key = normalizeMealLabel(entry?.description || entry?.label || '').toLowerCase()
      if (!key) return
      const existing = allByKey.get(key)
      const created = Number(entry?.createdAt ? new Date(entry.createdAt).getTime() : entry?.id || 0)
      const existingCreated = Number(existing?.createdAt ? new Date(existing.createdAt).getTime() : existing?.id || 0)
      if (!existing || created > existingCreated) allByKey.set(key, entry)
    })

    favorites.forEach((fav: any) => {
      const key = favoriteDisplayLabel(fav).toLowerCase()
      if (!key) return
      if (!allByKey.has(key)) allByKey.set(key, { ...fav, sourceTag: 'Favorite' })
    })

    const allMeals = Array.from(allByKey.values()).map((entry) => ({
      id: entry?.id || `all-${Math.random()}`,
      label: normalizeMealLabel(entry?.description || entry?.label || 'Meal') || 'Meal',
      entry,
      favorite: (entry as any)?.sourceTag === 'Favorite' ? entry : null,
      createdAt: entry?.createdAt || entry?.id || Date.now(),
      sourceTag: (entry as any)?.sourceTag === 'Favorite' ? 'Favorite' : buildSourceTag(entry),
      calories: extractCalories(entry),
      serving: entry?.items?.[0]?.serving_size || entry?.serving || '',
    }))

    const favoriteMeals = favorites.map((fav: any) => ({
      id: fav?.id || `fav-${Math.random()}`,
      label: favoriteDisplayLabel(fav) || normalizeMealLabel(fav?.description || fav?.label || 'Favorite meal') || 'Favorite meal',
      favorite: fav,
      createdAt: fav?.createdAt || fav?.id || Date.now(),
      sourceTag: 'Favorite',
      calories: extractCalories(fav),
      serving: fav?.items?.[0]?.serving_size || fav?.serving || '',
    }))

    // Product request: "Custom" only shows meals the user created (Build-a-meal / Combined).
    const customMeals = favoriteMeals.filter((m: any) => isCustomMealFavorite(m?.favorite))

    return { allMeals, favoriteMeals, customMeals }
  }

  const favoritesKeySet = useMemo(() => {
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const set = new Set<string>()
    favorites.forEach((fav: any) => {
      const key = favoriteDisplayLabel(fav).toLowerCase()
      if (key) set.add(key)
    })
    return set
  }, [userData])

  const persistFavorites = (nextFavorites: any[]) => {
    updateUserData({ favorites: nextFavorites })
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: nextFavorites }),
      }).catch(() => {})
    } catch {}
  }

  const saveToFavorites = (entryLike: any) => {
    const source = entryLike
    if (!source) return
    const labelRaw = source?.description || source?.label || 'Favorite meal'
    const cleanLabel = normalizeMealLabel(labelRaw) || 'Favorite meal'

    const clonedItems =
      source?.items && Array.isArray(source.items) && source.items.length > 0 ? JSON.parse(JSON.stringify(source.items)) : null

    const favoritePayload = {
      id: `fav-${Date.now()}`,
      sourceId: (source as any)?.id || (source as any)?.dbId || null,
      label: cleanLabel,
      description: String(source?.description || cleanLabel),
      nutrition: source?.nutrition || source?.total || null,
      total: source?.total || source?.nutrition || null,
      items: clonedItems,
      photo: source?.photo || null,
      method: source?.method || 'text',
      meal: normalizeCategory(source?.meal || source?.category || source?.mealType),
      createdAt: Date.now(),
    }

    const prev = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const existingIndex = prev.findIndex(
      (fav: any) =>
        (fav.sourceId && favoritePayload.sourceId && fav.sourceId === favoritePayload.sourceId) ||
        (fav.label && favoritePayload.label && fav.label === favoritePayload.label),
    )
    const next =
      existingIndex >= 0
        ? prev.map((fav: any, idx: number) => (idx === existingIndex ? { ...favoritePayload, id: fav.id || favoritePayload.id } : fav))
        : [...prev, favoritePayload]

    persistFavorites(next)
    setFavoritesToast('Saved to Favorites')
    setTimeout(() => setFavoritesToast(null), 1400)
  }

  const deleteFavorite = (id: string) => {
    const favId = String(id || '').trim()
    if (!favId) return
    const prev = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const next = prev.filter((f: any) => String(f?.id || '') !== favId)
    persistFavorites(next)
    setFavoritesToast('Removed')
    setTimeout(() => setFavoritesToast(null), 1400)
  }

  const openEditFavorite = (fav: any) => {
    const id = String(fav?.id || '').trim()
    if (!id) return
    const favCategory = normalizeCategory(fav?.meal || fav?.category || category)
    router.push(
      `/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(favCategory)}&editFavoriteId=${encodeURIComponent(id)}`,
    )
  }

  const analyzePhotoAndAdd = async (file: File) => {
    if (!file) return
    setError(null)
    setPhotoLoading(true)
    try {
      triggerHaptic(10)
      try {
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
      } catch {}
      try {
        setPhotoPreviewUrl(URL.createObjectURL(file))
      } catch {}
      const fd = new FormData()
      fd.append('image', file)
      // Use the existing Food image analyzer. This can return multiple ingredients.
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
      const detected = Array.isArray(data?.items) ? data.items : []
      if (detected.length === 0) {
        setError('No ingredients were detected from that photo. Try a clearer photo or use search/barcode.')
        return
      }
      addItemsFromAi(detected)
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
    } catch {
      setError('Photo analysis failed. Please try again.')
    } finally {
      setPhotoLoading(false)
      try {
        if (photoInputRef.current) photoInputRef.current.value = ''
      } catch {}
    }
  }

  const stopBarcodeScanner = () => {
    try {
      const current = barcodeScannerRef.current
      if (current?.controls?.stop) current.controls.stop()
      if (current?.reader?.reset) current.reader.reset()
    } catch {}
    barcodeScannerRef.current = null
  }

  const lookupBarcode = async (codeRaw: string) => {
    const code = String(codeRaw || '').trim().replace(/[^0-9A-Za-z]/g, '')
    if (!code) {
      setBarcodeError('Please enter a barcode.')
      return
    }
    setBarcodeError(null)
    setBarcodeLoading(true)
    setBarcodeStatusHint('Looking up barcode…')
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 402) {
          setBarcodeError('Not enough credits for barcode scanning.')
        } else if (res.status === 422) {
          setBarcodeError(
            data?.message ||
              data?.error ||
              'Nutrition data is missing for this barcode. Please scan the nutrition label instead.',
          )
        } else if (res.status === 404) {
          setBarcodeError('No product found for that barcode. Try photo or search.')
        } else if (res.status === 401) {
          setBarcodeError('Please sign in again, then retry.')
        } else {
          setBarcodeError('Barcode lookup failed. Please try again.')
        }
        return
      }
      if (!data?.found || !data?.food) {
        setBarcodeError('No product found for that barcode. Try photo or search.')
        return
      }
      const food = data.food
      const normalized: NormalizedFoodItem = {
        source: food.source === 'fatsecret' ? 'fatsecret' : food.source === 'usda' ? 'usda' : 'openfoodfacts',
        id: String(food.id || code),
        name: String(food.name || 'Scanned food'),
        brand: food.brand ?? null,
        serving_size: String(food.serving_size || '1 serving'),
        calories: toNumber(food.calories),
        protein_g: toNumber(food.protein_g),
        carbs_g: toNumber(food.carbs_g),
        fat_g: toNumber(food.fat_g),
        fiber_g: toNumber(food.fiber_g),
        sugar_g: toNumber(food.sugar_g),
      }
      addItem(normalized)
      setBarcodeStatusHint('Added')
      setShowBarcodeScanner(false)
    } catch {
      setBarcodeError('Barcode lookup failed. Please try again.')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const startBarcodeScanner = async () => {
    setBarcodeError(null)
    setBarcodeStatusHint('Starting camera…')
    try {
      stopBarcodeScanner()
      const region = document.getElementById('meal-builder-barcode-region')
      if (!region) {
        setBarcodeError('Camera area missing. Close and reopen the scanner.')
        setBarcodeStatusHint('Camera error')
        return
      }
      region.innerHTML = ''
      const videoEl = document.createElement('video')
      videoEl.setAttribute('playsinline', 'true')
      videoEl.setAttribute('autoplay', 'true')
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.style.width = '100%'
      videoEl.style.height = '100%'
      videoEl.style.objectFit = 'cover'
      region.appendChild(videoEl)

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
      const { DecodeHintType } = await import('@zxing/library')
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader()
      reader.setHints(hints)

      const constraints: any = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: 'continuous' }],
        },
      }

      const controls = await reader.decodeFromConstraints(constraints, videoEl, (result: any) => {
        const text = result?.getText ? result.getText() : result?.text
        if (!text) return
        // Stop quickly so we don't double-trigger.
        stopBarcodeScanner()
        lookupBarcode(text)
      })

      barcodeScannerRef.current = { reader, controls, videoEl }
      setBarcodeStatusHint('Scanning…')
    } catch {
      setBarcodeError('Could not start the camera. Please allow camera access and retry.')
      setBarcodeStatusHint('Camera error')
      stopBarcodeScanner()
    }
  }

  useEffect(() => {
    if (!showBarcodeScanner) {
      stopBarcodeScanner()
      setBarcodeError(null)
      setBarcodeStatusHint('Ready')
      return
    }
    startBarcodeScanner()
    return () => stopBarcodeScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBarcodeScanner])

  const removeItem = (id: string) => {
    const current = itemsRef.current
    const idx = current.findIndex((x) => x.id === id)
    if (idx >= 0) {
      const removed = current[idx]
      setLastRemoved({ item: removed, index: idx })
      try {
        if (undoRemoveTimeoutRef.current) clearTimeout(undoRemoveTimeoutRef.current)
      } catch {}
      undoRemoveTimeoutRef.current = setTimeout(() => setLastRemoved(null), 5000)
    }
    setItems((prev) => prev.filter((x) => x.id !== id))
    setExpandedId((prev) => (prev === id ? null : prev))
  }

  const undoRemove = () => {
    const payload = lastRemoved
    if (!payload) return
    try {
      if (undoRemoveTimeoutRef.current) clearTimeout(undoRemoveTimeoutRef.current)
    } catch {}
    setItems((prev) => {
      const next = [...prev]
      const insertAt = Math.max(0, Math.min(payload.index, next.length))
      next.splice(insertAt, 0, payload.item)
      return next
    })
    setLastRemoved(null)
  }

  const setAmount = (id: string, raw: string) => {
    const v = String(raw ?? '').replace(',', '.')
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const num = v.trim() === '' ? NaN : Number(v)
        const amount = Number.isFinite(num) && num >= 0 ? num : 0
        const baseAmount = it.__baseAmount
        const baseUnit = it.__baseUnit
        const unit = it.__unit
        let servings = it.servings

        if (baseAmount && baseUnit && unit) {
          const inBase = convertAmount(amount, unit, baseUnit)
          servings = baseAmount > 0 ? inBase / baseAmount : 0
        } else {
          // Fallback: treat amount as servings
          servings = amount
        }

        return { ...it, __amountInput: v, __amount: amount, servings: round3(Math.max(0, servings)) }
      }),
    )
  }

  const setUnit = (id: string, unit: BuilderUnit) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const baseAmount = it.__baseAmount
        const baseUnit = it.__baseUnit
        if (!baseAmount || !baseUnit) {
          return { ...it, __unit: unit }
        }
        const currentUnit = it.__unit || baseUnit
        const converted = convertAmount(it.__amount, currentUnit, unit)
        const inBase = convertAmount(converted, unit, baseUnit)
        const servings = baseAmount > 0 ? inBase / baseAmount : 0
        const nextAmount = round3(Math.max(0, converted))
        return { ...it, __unit: unit, __amount: nextAmount, __amountInput: String(nextAmount), servings: round3(Math.max(0, servings)) }
      }),
    )
  }

  const createMeal = async () => {
    if (items.length === 0) {
      setError('Add at least one ingredient first.')
      return
    }

    setError(null)

    const title = sanitizeMealTitle(mealName) || buildDefaultMealName(items)
    const description = title
    const favorites = Array.isArray((userData as any)?.favorites) ? ((userData as any).favorites as any[]) : []
    const existingWithSameTitle =
      favorites.find((f: any) => isCustomMealFavorite(f) && String(f?.label || f?.description || '').trim() === title.trim()) || null
    const favoriteLinkId = (() => {
      if (editFavoriteId) return editFavoriteId
      if (linkedFavoriteId && linkedFavoriteId.trim().length > 0) return linkedFavoriteId.trim()
      if (existingWithSameTitle?.id) return String(existingWithSameTitle.id)
      return `fav-${Date.now()}`
    })()

    const cleanedItems = items.map((it) => {
      const { __baseAmount, __baseUnit, __amount, __amountInput, __unit, ...rest } = it
      return rest
    })

    const createdAtIso = alignTimestampToLocalDate(new Date().toISOString(), selectedDate)

    const payload = {
      description,
      nutrition: {
        calories: Math.round(mealTotals.calories),
        protein: round3(mealTotals.protein),
        carbs: round3(mealTotals.carbs),
        fat: round3(mealTotals.fat),
        fiber: round3(mealTotals.fiber),
        sugar: round3(mealTotals.sugar),
        __origin: 'meal-builder',
        ...(favoriteLinkId ? { __favoriteId: favoriteLinkId } : {}),
      },
      imageUrl: null,
      items: cleanedItems,
      localDate: selectedDate,
      meal: category,
      category,
      createdAt: createdAtIso,
    }

    setSavingMeal(true)
    try {
      // Editing a diary entry directly (no favorites template involved).
      if (!editFavoriteId && sourceLogId) {
        try {
          await fetch('/api/food-log', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: sourceLogId,
              description,
              nutrition: payload.nutrition,
              items: cleanedItems,
              meal: category,
              category,
            }),
          })
        } catch {}

        // Keep the linked saved meal in sync (if one exists, or create one for future use).
        try {
          if (favoriteLinkId) {
            const favoritePayload = {
              id: favoriteLinkId,
              sourceId: sourceLogId,
              label: title,
              description,
              nutrition: payload.nutrition,
              total: payload.nutrition,
              items: cleanedItems,
              photo: null,
              method: 'meal-builder',
              customMeal: true,
              meal: category,
              createdAt: Date.now(),
            }
            const existingIndex = favorites.findIndex((f: any) => String(f?.id || '') === favoriteLinkId)
            const nextFavorites =
              existingIndex >= 0
                ? favorites.map((f: any, idx: number) => (idx === existingIndex ? { ...favoritePayload, id: f.id || favoritePayload.id } : f))
                : [...favorites, favoritePayload]
            persistFavorites(nextFavorites)
          }
        } catch {}

        try {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: sourceLogId, localDate: selectedDate, category }),
          )
        } catch {}
        router.push('/food')
        return
      }

      if (editFavoriteId) {
        setFavoriteSaving(true)
        const prev = favorites
        const existing = prev.find((f: any) => String(f?.id || '') === editFavoriteId) || null
        if (!existing) {
          setError('Could not find that saved meal to edit. Please reopen from Favorites → Custom.')
          return
        }
        if (!isCustomMealFavorite(existing)) {
          setError('Only custom meals (Build-a-meal / Combined) can be edited here.')
          return
        }

        const updatedFavorite = {
          ...existing,
          label: title,
          description,
          nutrition: payload.nutrition,
          total: payload.nutrition,
          items: cleanedItems,
          method: existing?.method || 'meal-builder',
          customMeal: true,
          meal: existing?.meal || category,
          createdAt: existing?.createdAt || Date.now(),
        }
        const nextFavorites = prev.map((f: any) => (String(f?.id || '') === editFavoriteId ? updatedFavorite : f))
        persistFavorites(nextFavorites)

        // If we were opened from a diary entry, update that FoodLog row too.
        // Do NOT use favorite.sourceId here: favorites are reusable templates and may point to an older log.
        const targetLogId = sourceLogId ? String(sourceLogId) : ''
        if (targetLogId) {
          try {
            await fetch('/api/food-log', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: targetLogId,
                description,
                nutrition: payload.nutrition,
                items: cleanedItems,
                meal: existing?.meal || category,
                category: existing?.meal || category,
              }),
            })
          } catch {}
          try {
            sessionStorage.setItem(
              'foodDiary:scrollToEntry',
              JSON.stringify({ dbId: targetLogId, localDate: selectedDate, category: existing?.meal || category }),
            )
          } catch {}
        }

        router.push('/food')
        return
      }

      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setError('Saving failed. Please try again.')
        return
      }

      // Auto-save newly created meals into Favorites so they appear under Favorites → Custom.
      try {
        const createdId = typeof data?.id === 'string' ? data.id : null
        const favoritePayload = {
          id: favoriteLinkId,
          sourceId: createdId,
          label: title,
          description,
          nutrition: payload.nutrition,
          total: payload.nutrition,
          items: cleanedItems,
          photo: null,
          method: 'meal-builder',
          customMeal: true,
          meal: category,
          createdAt: Date.now(),
        }
        const existingIndex = favorites.findIndex(
          (fav: any) =>
            (fav.id && favoritePayload.id && String(fav.id) === String(favoritePayload.id)) ||
            (fav.sourceId && favoritePayload.sourceId && fav.sourceId === favoritePayload.sourceId) ||
            (fav.label && favoritePayload.label && fav.label === favoritePayload.label),
        )
        const nextFavorites =
          existingIndex >= 0
            ? favorites.map((fav: any, idx: number) =>
                idx === existingIndex ? { ...favoritePayload, id: fav.id || favoritePayload.id } : fav,
              )
            : [...favorites, favoritePayload]
        persistFavorites(nextFavorites)
      } catch {}

      // Scroll to the saved meal when returning to the diary.
      try {
        const createdId = typeof data?.id === 'string' ? data.id : null
        if (createdId) {
          sessionStorage.setItem(
            'foodDiary:scrollToEntry',
            JSON.stringify({ dbId: createdId, localDate: selectedDate, category }),
          )
        }
      } catch {}

      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setFavoriteSaving(false)
      setSavingMeal(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-900 truncate">{editFavoriteId ? 'Edit meal' : 'Build a meal'}</div>
            <div className="text-xs text-gray-500">
              {CATEGORY_LABELS[category]} • {selectedDate}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={createMeal}
              disabled={busy || favoriteSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {editFavoriteId ? (favoriteSaving ? 'Saving…' : 'Save changes') : 'Save meal'}
            </button>
            <div className="text-[11px] text-gray-500 text-right max-w-[240px]">
              Find this later in <span className="font-semibold">Food Diary → {CATEGORY_LABELS[category]}</span> (tap to edit) and <span className="font-semibold">Favorites → Custom</span>.
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {lastRemoved && (
            <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 w-[min(92vw,520px)] px-3 py-3 rounded-2xl bg-slate-900 text-white shadow-lg flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Removed {String(lastRemoved.item?.name || 'item')}</div>
                <div className="text-xs text-white/80">Tap undo to restore</div>
              </div>
              <button
                type="button"
                onClick={undoRemove}
                className="px-3 py-2 rounded-xl bg-white text-slate-900 text-sm font-semibold"
              >
                Undo
              </button>
            </div>
          )}

          {showFavoritesPicker && (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowFavoritesPicker(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Back"
                >
                  <span aria-hidden>←</span>
                </button>
                <div className="flex-1 text-center">
                  <div className="text-lg font-semibold text-gray-900">Add from favorites</div>
                  <div className="text-xs text-gray-500">Pick from All / Favorites / Custom</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFavoritesPicker(false)}
                  className="p-2 rounded-full hover:bg-gray-100"
                  aria-label="Close"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>

              <div className="px-4 py-3 border-b border-gray-200">
                <input
                  value={favoritesSearch}
                  onChange={(e) => setFavoritesSearch(e.target.value)}
                  placeholder="Search all foods..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="px-4 py-3 border-b border-gray-200">
                <div className="grid grid-cols-3 gap-2">
                  {(['all', 'favorites', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFavoritesActiveTab(tab)}
                      className={`py-2 text-sm font-semibold border rounded-lg ${
                        favoritesActiveTab === tab ? 'bg-gray-200 text-gray-900 border-gray-300' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {tab === 'all' ? 'All' : tab === 'favorites' ? 'Favorites' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const search = favoritesSearch.trim().toLowerCase()
                  const { allMeals, favoriteMeals, customMeals } = buildFavoritesDatasets()
                  const filterBySearch = (item: any) => {
                    if (!search) return true
                    return (
                      String(item?.label || '').toLowerCase().includes(search) ||
                      String(item?.serving || '').toLowerCase().includes(search) ||
                      String(item?.sourceTag || '').toLowerCase().includes(search)
                    )
                  }
                  const sortList = (list: any[]) => [...list].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))

                  let data: any[] = []
                  if (favoritesActiveTab === 'all') data = sortList(allMeals.filter(filterBySearch))
                  if (favoritesActiveTab === 'favorites')
                    data = sortList(favoriteMeals.filter((m: any) => !isCustomMealFavorite(m?.favorite)).filter(filterBySearch))
                  if (favoritesActiveTab === 'custom') data = sortList(customMeals.filter(filterBySearch))

                  if (data.length === 0) {
                    return (
                      <div className="text-sm text-gray-500 py-8 text-center">
                        {favoritesActiveTab === 'all'
                          ? 'No meals yet. Add some entries to see them here.'
                          : favoritesActiveTab === 'favorites'
                          ? 'No favorites yet.'
                          : 'No custom meals yet.'}
                      </div>
                    )
                  }

                  return (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                      {data.map((item, idx) => {
                        const label = String(item?.label || 'Meal').trim() || 'Meal'
                        const calories = typeof item?.calories === 'number' && Number.isFinite(item.calories) ? item.calories : null
                        const tag = String(item?.sourceTag || (favoritesActiveTab === 'favorites' ? 'Favorite' : 'Custom'))
                        const serving = String(item?.serving || '1 serving')
                        const key = normalizeMealLabel(label).toLowerCase()
                        const isSaved = Boolean(item?.favorite) || (key ? favoritesKeySet.has(key) : false)
                        const canSaveFromAll = favoritesActiveTab === 'all' && !isSaved && Boolean(item?.entry)
                        const favorite = item?.favorite || null
                        const favoriteId = favorite?.id ? String(favorite.id) : null
                        return (
                          <div
                            key={String(item?.id || idx)}
                            className="w-full flex items-stretch gap-2"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item?.favorite) addFromFavorite(item.favorite)
                                else if (item?.entry) addFromFavorite(item.entry)
                                else addFromFavorite(item)
                                setShowFavoritesPicker(false)
                                setFavoritesSearch('')
                              }}
                              className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{label}</div>
                                <div className="text-xs text-gray-500 truncate">
                                  {serving} • {tag}
                                </div>
                              </div>
                              {calories !== null && <div className="text-sm font-semibold text-gray-900">{calories} kcal</div>}
                            </button>

                            {favoritesActiveTab === 'all' && (
                              <div className="flex items-center pr-2">
                                {isSaved ? (
                                  <div className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    Saved
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canSaveFromAll}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (item?.entry) {
                                        saveToFavorites(item.entry)
                                      }
                                    }}
                                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                                    aria-label="Save to favorites"
                                  >
                                    Save
                                  </button>
                                )}
                              </div>
                            )}

                            {favoritesActiveTab !== 'all' && favoriteId && (
                              <div className="flex items-center pr-2 gap-1">
                                {isCustomMealFavorite(favorite) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      openEditFavorite(favorite)
                                    }}
                                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                    title="Edit meal"
                                    aria-label="Edit meal"
                                  >
                                    Edit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    deleteFavorite(favoriteId)
                                  }}
                                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50"
                                  title="Delete meal"
                                  aria-label="Delete meal"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {favoritesToast && (
                <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold shadow-lg">
                  {favoritesToast}
                </div>
              )}
            </div>
          )}

          {showBarcodeScanner && (
            <div className="fixed inset-0 z-50 bg-black">
              <div className="absolute inset-0 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 bg-black/70 text-white">
                  <div className="text-sm font-semibold">Scan barcode</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBarcodeScanner(false)
                      stopBarcodeScanner()
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 relative">
                  <div id="meal-builder-barcode-region" className="absolute inset-0" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-40 border-2 border-white/70 rounded-xl" />
                  </div>
                </div>

                <div className="bg-black/85 text-white px-4 py-3 space-y-2">
                  <div className="text-xs text-white/80">{barcodeStatusHint}</div>
                  {barcodeError && <div className="text-xs text-red-300">{barcodeError}</div>}

                  <div className="flex gap-2">
                    <input
                      value={manualBarcode}
                      onFocus={() => {
                        manualBarcodeBackupRef.current = manualBarcode
                        manualBarcodeEditedRef.current = false
                        manualBarcodeWasClearedOnFocusRef.current = manualBarcode.trim().length > 0
                        if (manualBarcodeWasClearedOnFocusRef.current) setManualBarcode('')
                      }}
                      onChange={(e) => {
                        manualBarcodeEditedRef.current = true
                        setManualBarcode(e.target.value)
                      }}
                      onBlur={() => {
                        if (manualBarcodeWasClearedOnFocusRef.current && !manualBarcodeEditedRef.current) {
                          setManualBarcode(manualBarcodeBackupRef.current)
                        }
                        manualBarcodeWasClearedOnFocusRef.current = false
                        manualBarcodeEditedRef.current = false
                      }}
                      placeholder="Enter barcode"
                      className="flex-1 px-3 py-2 rounded-lg bg-white text-gray-900 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => lookupBarcode(manualBarcode)}
                      disabled={barcodeLoading}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      Lookup
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startBarcodeScanner()}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
                    >
                      Restart camera
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBarcodeScanner(false)
                        stopBarcodeScanner()
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-900">Meal name (optional)</div>
          <input
            value={mealName}
            onFocus={() => {
              mealNameBackupRef.current = mealName
              mealNameEditedRef.current = false
              mealNameWasClearedOnFocusRef.current = mealName.trim().length > 0
              if (mealNameWasClearedOnFocusRef.current) setMealName('')
            }}
            onChange={(e) => {
              mealNameEditedRef.current = true
              setMealName(e.target.value)
            }}
            onBlur={() => {
              if (mealNameWasClearedOnFocusRef.current && !mealNameEditedRef.current) {
                setMealName(mealNameBackupRef.current)
              }
              mealNameWasClearedOnFocusRef.current = false
              mealNameEditedRef.current = false
            }}
            placeholder={buildDefaultMealName(items)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-900">Search ingredients</div>
          <div className="flex gap-2">
            <input
              value={query}
              onFocus={() => {
                queryBackupRef.current = query
                queryEditedRef.current = false
                queryWasClearedOnFocusRef.current = query.trim().length > 0
                if (queryWasClearedOnFocusRef.current) setQuery('')
              }}
              onChange={(e) => {
                queryEditedRef.current = true
                setQuery(e.target.value)
              }}
              onBlur={() => {
                if (queryWasClearedOnFocusRef.current && !queryEditedRef.current) {
                  setQuery(queryBackupRef.current)
                }
                queryWasClearedOnFocusRef.current = false
                queryEditedRef.current = false
              }}
              placeholder="e.g. chicken breast"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <button
              type="button"
              disabled={busy}
              onClick={runSearch}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
            >
              Search
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('packaged')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                kind === 'packaged' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              Packaged
            </button>
            <button
              type="button"
              onClick={() => setKind('single')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                kind === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              Single food
            </button>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  triggerHaptic(10)
                  photoInputRef.current?.click()
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {photoLoading ? 'Adding photo…' : 'Add by photo'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowBarcodeScanner(true)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {barcodeLoading ? 'Looking up…' : 'Scan barcode'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFavoritesActiveTab('all')
                  setFavoritesSearch('')
                  setShowFavoritesPicker(true)
                }}
                className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                Add from favorites
              </button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) analyzePhotoAndAdd(f)
              }}
            />
          </div>

          <UsageMeter inline className="mt-1" />

          {photoPreviewUrl && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="relative w-full max-w-sm mx-auto">
                {photoLoading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrl}
                  alt="Analyzed food"
                  className="w-full aspect-square object-cover"
                />
              </div>
              <div className="px-3 py-2 text-xs text-gray-600 flex items-center justify-between gap-2">
                <span>{photoLoading ? 'Analyzing photo…' : 'Photo added'}</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
                    } catch {}
                    setPhotoPreviewUrl(null)
                    try {
                      if (photoInputRef.current) photoInputRef.current.value = ''
                    } catch {}
                  }}
                  className="text-xs font-semibold text-gray-700 hover:text-gray-900"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {error && <div className="text-xs text-red-600">{error}</div>}
          {(searchLoading || savingMeal || photoLoading || barcodeLoading) && (
            <div className="text-xs text-gray-500">
              {searchLoading
                ? 'Searching…'
                : savingMeal
                ? 'Saving…'
                : photoLoading
                ? 'Analyzing photo…'
                : barcodeLoading
                ? 'Looking up barcode…'
                : 'Working…'}
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-72 overflow-y-auto space-y-2 pt-1">
              {results.map((r) => (
                <div key={`${r.source}:${r.id}`} className="flex items-start justify-between rounded-xl border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {r.name}
                      {r.brand ? ` – ${r.brand}` : ''}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {r.serving_size ? `Serving: ${r.serving_size}` : 'Serving: (unknown)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(r)}
                    className="ml-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Your ingredients</div>
            <div className="text-xs text-gray-500">{items.length} item{items.length === 1 ? '' : 's'}</div>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add ingredients using the search above.</div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const expanded = expandedId === it.id
                const baseUnits = allowedUnitsForBase(it.__baseUnit)
                const totals = computeItemTotals(it)
                return (
                  <div
                    key={it.id}
                    data-builder-item-id={it.id}
                    className="rounded-2xl border border-gray-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : it.id)}
                      className="w-full flex items-center justify-between px-3 py-3 bg-white hover:bg-gray-50"
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {it.name}
                          {it.brand ? ` – ${it.brand}` : ''}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {it.serving_size ? `Serving: ${it.serving_size}` : 'Serving: (unknown)'} •{' '}
                          {it.__baseUnit ? `Amount: ${it.__amount} ${it.__unit || it.__baseUnit}` : `Servings: ${it.servings}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 bg-white space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Amount</div>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={it.__amountInput}
                              onChange={(e) => setAmount(it.id, e.target.value)}
                              onFocus={() => setAmount(it.id, '')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Serving size</div>
                            {baseUnits.length > 0 ? (
                              <select
                                value={it.__unit || it.__baseUnit || baseUnits[0]}
                                onChange={(e) => setUnit(it.id, e.target.value as BuilderUnit)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              >
                                {baseUnits.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600">
                                servings
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{Math.round(totals.calories)}</span> kcal
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.protein)}</span> g protein
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.carbs)}</span> g carbs
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.fat)}</span> g fat
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.fiber)}</span> g fibre
                          </div>
                          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700">
                            <span className="font-semibold text-gray-900">{round3(totals.sugar)}</span> g sugar
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            removeItem(it.id)
                          }}
                          className="w-full mt-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"
                        >
                          Remove ingredient
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Meal totals</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Calories</span>
              <span className="font-semibold text-gray-900">{Math.round(mealTotals.calories)} kcal</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Protein</span>
              <span className="font-semibold text-gray-900">{round3(mealTotals.protein)} g</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Carbs</span>
              <span className="font-semibold text-gray-900">{round3(mealTotals.carbs)} g</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Fat</span>
              <span className="font-semibold text-gray-900">{round3(mealTotals.fat)} g</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Fibre</span>
              <span className="font-semibold text-gray-900">{round3(mealTotals.fiber)} g</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-700">Sugar</span>
              <span className="font-semibold text-gray-900">{round3(mealTotals.sugar)} g</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={createMeal}
          disabled={busy}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-2xl"
        >
          Save meal
        </button>

        <div className="pb-10" />
        </div>
      </div>
    </div>
  )
}
