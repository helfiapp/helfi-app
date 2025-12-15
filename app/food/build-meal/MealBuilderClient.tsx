'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

  const initialDate = searchParams.get('date') || buildTodayIso()
  const initialCategory = normalizeCategory(searchParams.get('category'))

  const [selectedDate] = useState<string>(initialDate)
  const [category] = useState<MealCategory>(initialCategory)

  const [mealName, setMealName] = useState('')

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'packaged' | 'single'>('packaged')
  const [searchLoading, setSearchLoading] = useState(false)
  const [savingMeal, setSavingMeal] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NormalizedFoodItem[]>([])

  const [items, setItems] = useState<BuilderItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeStatusHint, setBarcodeStatusHint] = useState<string>('Ready')
  const [manualBarcode, setManualBarcode] = useState('')
  const barcodeScannerRef = useRef<any>(null)

  const busy = searchLoading || savingMeal || photoLoading || barcodeLoading

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
        __unit: baseUnit,
      }
      addBuilderItem(next)
    }
  }

  const analyzePhotoAndAdd = async (file: File) => {
    if (!file) return
    setError(null)
    setPhotoLoading(true)
    try {
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
    setItems((prev) => prev.filter((x) => x.id !== id))
    setExpandedId((prev) => (prev === id ? null : prev))
  }

  const setAmount = (id: string, raw: string) => {
    const v = raw === '' ? '' : raw
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const num = v === '' ? NaN : Number(v)
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

        return { ...it, __amount: amount, servings: round3(Math.max(0, servings)) }
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
        return { ...it, __unit: unit, __amount: round3(Math.max(0, converted)), servings: round3(Math.max(0, servings)) }
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

    const cleanedItems = items.map((it) => {
      const { __baseAmount, __baseUnit, __amount, __unit, ...rest } = it
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
      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError('Saving failed. Please try again.')
        return
      }
      // Go back to Food Diary. It will refresh and show the new meal.
      router.push('/food')
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
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
            <div className="text-lg font-semibold text-gray-900 truncate">Build a meal</div>
            <div className="text-xs text-gray-500">
              {CATEGORY_LABELS[category]} • {selectedDate}
            </div>
          </div>
          <button
            type="button"
            onClick={createMeal}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            Save meal
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="w-full max-w-4xl mx-auto space-y-4">
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
                      onChange={(e) => setManualBarcode(e.target.value)}
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
            onChange={(e) => setMealName(e.target.value)}
            placeholder={buildDefaultMealName(items)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-900">Search ingredients</div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => photoInputRef.current?.click()}
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
                  <div key={it.id} className="rounded-2xl border border-gray-200 overflow-hidden">
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            removeItem(it.id)
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 bg-white space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">Amount</div>
                            <input
                              value={String(it.__amount)}
                              onChange={(e) => setAmount(it.id, e.target.value)}
                              inputMode="decimal"
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

