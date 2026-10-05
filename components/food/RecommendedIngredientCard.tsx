'use client'

import { useEffect, useMemo, useState } from 'react'
import NutrientCards from './NutrientCards'
import {
  convertItemMeasurement,
  formatItemMeasurementUnit,
  itemMeasurementUnitOptions,
  recordedServingBasis,
  type ItemMeasurementUnit,
} from '@/lib/food/serving-measurements'

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

type BuilderUnit = ItemMeasurementUnit
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const round3 = (n: number) => Math.round(n * 1000) / 1000
const macroOrZero = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)
// Keep calculation precision in editable amounts; round only nutrient displays.
const formatDecimal = (value: number) => Number.isFinite(value) && value >= 0 ? String(value) : ''
const extractPieceGramsFromLabel = (label: string) => {
  const match = label.match(/\((\d+(?:\.\d+)?)\s*g\)/i)
  const grams = match ? Number(match[1]) : NaN
  return Number.isFinite(grams) && grams > 0 ? grams : null
}
const recommendedAmount = (item: RecommendedItem, servings: number, unit: BuilderUnit, pieceGrams: number | null, country: string) =>
  servings === 0 ? 0 : convertItemMeasurement(servings, 'serving', unit, item, pieceGrams, 1, { toCountry: country })
const recommendedServings = (item: RecommendedItem, amount: number, unit: BuilderUnit, pieceGrams: number | null, country: string) => {
  if (!Number.isFinite(amount) || amount < 0) return null
  if (!itemMeasurementUnitOptions(item, pieceGrams, country).includes(unit)) return null
  // Zero intentionally removes an ingredient from this editable recipe.
  return amount === 0 ? 0 : convertItemMeasurement(amount, unit, 'serving', item, pieceGrams, 1, { fromCountry: country })
}

export default function RecommendedIngredientCard({
  item,
  index,
  onServingsChange,
  country = '',
}: {
  item: RecommendedItem
  index: number
  onServingsChange: (index: number, next: number) => void
  country?: string
}) {
  const servings = useMemo(() => {
    const raw = Number(item?.servings ?? 1)
    return Number.isFinite(raw) ? clamp(raw, 0, 20) : 1
  }, [item?.servings])
  const servingSizeLabel = item.serving_size ? String(item.serving_size).trim() : '1 serving'
  const pieceGrams = useMemo(() => extractPieceGramsFromLabel(servingSizeLabel), [servingSizeLabel])
  const units = useMemo(() => itemMeasurementUnitOptions(item, pieceGrams, country), [item, pieceGrams, country])
  const initialUnit = useMemo(() => {
    const basis = recordedServingBasis(item)
    return basis && units.includes(basis.unit) ? basis.unit : 'serving'
  }, [item, units])
  const amountFromServings = recommendedAmount(item, servings, initialUnit, pieceGrams, country)
  const [expanded, setExpanded] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<BuilderUnit>(initialUnit)
  const [amountInput, setAmountInput] = useState(() => formatDecimal(amountFromServings ?? NaN))
  const [amountFocused, setAmountFocused] = useState(false)

  useEffect(() => {
    setSelectedUnit(initialUnit)
  }, [initialUnit])
  useEffect(() => {
    if (amountFocused) return
    setAmountInput(formatDecimal(recommendedAmount(item, servings, selectedUnit, pieceGrams, country) ?? NaN))
  }, [amountFocused, item, selectedUnit, servings, pieceGrams, country])

  const totals = useMemo(
    () => ({
      calories: Math.round(macroOrZero(item.calories) * servings),
      protein_g: round3(macroOrZero(item.protein_g) * servings),
      carbs_g: round3(macroOrZero(item.carbs_g) * servings),
      fat_g: round3(macroOrZero(item.fat_g) * servings),
      fiber_g: round3(macroOrZero(item.fiber_g) * servings),
      sugar_g: round3(macroOrZero(item.sugar_g) * servings),
    }),
    [item.calories, item.carbs_g, item.fat_g, item.fiber_g, item.protein_g, item.sugar_g, servings],
  )
  const fullAmountLabel = `${amountInput} ${selectedUnit}`
  const applyAmountChange = (raw: string, unit: BuilderUnit = selectedUnit) => {
    setAmountInput(raw)
    if (!raw.trim()) return
    const nextServings = recommendedServings(item, Number(raw), unit, pieceGrams, country)
    if (nextServings != null) onServingsChange(index, nextServings)
  }
  const handleUnitChange = (nextUnit: BuilderUnit) => {
    if (!units.includes(nextUnit)) return
    // Changing a display unit conserves the exact committed serving count.
    // Never recalculate that count from a rounded or unfinished input draft.
    const converted = recommendedAmount(item, servings, nextUnit, pieceGrams, country)
    if (converted == null) return
    setSelectedUnit(nextUnit)
    setAmountInput(formatDecimal(converted))
  }

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-3 bg-white hover:bg-gray-50"
      >
        <div className="min-w-0 text-left">
          <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {servingSizeLabel ? `Serving: ${servingSizeLabel}` : 'Serving: (unknown)'} • Amount (full recipe): {fullAmountLabel}
          </div>
        </div>
        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 bg-white space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-700">Amount</div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={amountInput}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                onChange={(e) => applyAmountChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-700">Serving size</div>
              <select
                value={selectedUnit}
                onChange={(e) => handleUnitChange(e.target.value as BuilderUnit)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {formatItemMeasurementUnit(item, unit, pieceGrams, country)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <NutrientCards values={{
            calories: item.calories == null ? null : totals.calories,
            protein: item.protein_g == null ? null : totals.protein_g,
            carbs: item.carbs_g == null ? null : totals.carbs_g,
            fat: item.fat_g == null ? null : totals.fat_g,
            fiber: item.fiber_g == null ? null : totals.fiber_g,
            sugar: item.sugar_g == null ? null : totals.sugar_g,
          }} />
        </div>
      )}
    </div>
  )
}
