'use client'

import { useEffect, useMemo, useState } from 'react'

type RecommendedItem = {
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

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const formatNumber = (value: number | null | undefined, decimals = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const formatServingsDisplay = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const normalized = Math.round(value * 1000) / 1000
  const rounded = Math.round(normalized * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

export default function RecommendedIngredientCard({
  item,
  index,
  onServingsChange,
}: {
  item: RecommendedItem
  index: number
  onServingsChange: (index: number, next: number) => void
}) {
  const servings = useMemo(() => {
    const raw = Number(item?.servings ?? 1)
    return Number.isFinite(raw) ? clamp(raw, 0, 20) : 1
  }, [item?.servings])
  const [inputValue, setInputValue] = useState(() => formatServingsDisplay(servings))
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (isFocused) return
    setInputValue(formatServingsDisplay(servings))
  }, [servings, isFocused])

  const totals = useMemo(() => {
    return {
      calories: Math.round(macroOrZero(item.calories) * servings),
      protein_g: Math.round(macroOrZero(item.protein_g) * servings * 10) / 10,
      carbs_g: Math.round(macroOrZero(item.carbs_g) * servings * 10) / 10,
      fat_g: Math.round(macroOrZero(item.fat_g) * servings * 10) / 10,
      fiber_g: Math.round(macroOrZero(item.fiber_g) * servings * 10) / 10,
      sugar_g: Math.round(macroOrZero(item.sugar_g) * servings * 10) / 10,
    }
  }, [item.calories, item.protein_g, item.carbs_g, item.fat_g, item.fiber_g, item.sugar_g, servings])

  const perServingCalories = Math.round(macroOrZero(item.calories))
  const servingSizeLabel = item.serving_size ? String(item.serving_size).trim() : '1 serving'
  const totalsLabel = `${formatServingsDisplay(servings)} serving${Math.abs(servings - 1) < 0.001 ? '' : 's'}`

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (value === '') {
      onServingsChange(index, 0)
      return
    }
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      onServingsChange(index, parsed)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 text-base break-words">{item.name}</div>
          <div className="text-sm text-gray-500 mt-1 break-words">
            Serving size: {servingSizeLabel} • {perServingCalories} kcal per serving
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:self-start max-w-full">
          <span className="text-xs text-gray-500">Servings</span>
          <input
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              setInputValue('')
            }}
            onBlur={() => {
              setIsFocused(false)
              setInputValue(formatServingsDisplay(servings))
            }}
            inputMode="decimal"
            className="w-20 max-w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900 text-center"
            aria-label={`Servings for ${item.name}`}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Totals for {totalsLabel}</div>
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-orange-600">{formatNumber(totals.calories)}</span>
            <span className="uppercase text-gray-500">Calories</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-blue-600">{formatNumber(totals.protein_g, 1)}g</span>
            <span className="uppercase text-gray-500">Protein</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-green-600">{formatNumber(totals.carbs_g, 1)}g</span>
            <span className="uppercase text-gray-500">Carbs</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-purple-600">{formatNumber(totals.fat_g, 1)}g</span>
            <span className="uppercase text-gray-500">Fat</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-amber-600">{formatNumber(totals.fiber_g, 1)}g</span>
            <span className="uppercase text-gray-500">Fiber</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1">
            <span className="font-semibold text-pink-600">{formatNumber(totals.sugar_g, 1)}g</span>
            <span className="uppercase text-gray-500">Sugar</span>
          </div>
        </div>
      </div>
    </div>
  )
}
