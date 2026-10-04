import { convertFoodAmount, liquidDensity, parseFoodServing, type FoodBaseUnit } from '../../native/src/lib/foodUnits'
import { formatUnitLabel, getAllowedUnitsForFood, getFoodUnitGrams, isLiquidFood, type MeasurementUnit } from './measurement-units'

export type ItemMeasurementUnit = MeasurementUnit | 'fl oz'
type Basis = { amount: number; unit: 'g' | 'ml' }
const positive = (value: unknown): number | null => {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
const nameOf = (item: any) => String(item?.name || item?.food || '')
const volumeUnits: Partial<Record<ItemMeasurementUnit, number>> = {
  ml: 1, 'fl oz': 29.5735295625, tsp: 5, tbsp: 15,
  'quarter-cup': 60, 'half-cup': 120, 'three-quarter-cup': 180, cup: 240,
}
const cupFractions: Partial<Record<ItemMeasurementUnit, number>> = {
  'quarter-cup': 0.25, 'half-cup': 0.5, 'three-quarter-cup': 0.75, cup: 1,
}
const metricBasis = (amount: number, unit: FoodBaseUnit): Basis => ({
  amount: unit === 'oz' ? amount * 28.349523125 : unit === 'fl oz' ? amount * 29.5735295625 : amount,
  unit: unit === 'ml' || unit === 'fl oz' ? 'ml' : 'g',
})

// These are recorded serving/custom measurements, not estimates from calories
// or generic "one serving" weights. Keep the existing per-piece multiplier.
export function recordedServingBasis(item: any, multiplier = 1): Basis | null {
  const grams = positive(item?.customGramsPerServing)
  const ml = positive(item?.customMlPerServing)
  const parsed = parseFoodServing(String(item?.serving_size || ''), nameOf(item))
  if (parsed) {
    const basis = metricBasis(parsed.amount, parsed.unit)
    const custom = basis.unit === 'g' ? grams : ml
    return { amount: custom ?? basis.amount * multiplier, unit: basis.unit }
  }
  if (grams != null) return { amount: grams, unit: 'g' }
  if (ml != null) return { amount: ml, unit: 'ml' }
  return null
}

const quantity = (text: string, kind: string): number | null => {
  const token = kind === 'cup' ? 'cups?' : kind === 'tbsp' ? '(?:tbsp|tablespoons?)' : '(?:tsp|teaspoons?)'
  const match = text.match(new RegExp(`(?:^|[\\s(])(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)\\s*${token}\\b`))
  if (!match) return 1
  const parts = match[1].split(/\s+/)
  const fraction = parts.pop()!
  const pair = fraction.split('/')
  const value = pair.length === 2 ? Number(pair[0]) / Number(pair[1]) : Number(fraction)
  return positive(value + (parts.length ? Number(parts[0]) : 0))
}

function recordedHouseholdMeasure(item: any, unit: ItemMeasurementUnit): Basis | null {
  const target = cupFractions[unit] ? 'cup' : unit
  if (!['cup', 'tsp', 'tbsp'].includes(target)) return null
  for (const option of [item, ...(Array.isArray(item?.servingOptions) ? item.servingOptions : [])]) {
    const label = String(option?.serving_size || option?.label || '').toLowerCase()
    const kind = /\bcups?\b/.test(label) ? 'cup' : /\b(tbsp|tablespoons?)\b/.test(label) ? 'tbsp' : /\b(tsp|teaspoons?)\b/.test(label) ? 'tsp' : null
    if (kind !== target) continue
    const count = quantity(label, kind)
    if (count == null) continue
    const parsed = parseFoodServing(label, nameOf(item))
    const basis = parsed ? metricBasis(parsed.amount, parsed.unit)
      : positive(option?.grams) != null ? { amount: Number(option.grams), unit: 'g' as const }
      : positive(option?.ml) != null ? { amount: Number(option.ml), unit: 'ml' as const } : null
    if (basis) return { ...basis, amount: basis.amount / count * (cupFractions[unit] || 1) }
  }
  return null
}

function unitMeasure(item: any, unit: ItemMeasurementUnit, pieceGrams?: number | null, multiplier = 1): Basis | null {
  if (unit === 'serving') return recordedServingBasis(item, multiplier)
  if (unit === 'g') return { amount: 1, unit: 'g' }
  if (unit === 'oz') return { amount: 28.349523125, unit: 'g' }
  if (unit === 'ml' || unit === 'fl oz') return { amount: volumeUnits[unit]!, unit: 'ml' }
  const recorded = recordedHouseholdMeasure(item, unit)
  if (recorded) return recorded
  if (isLiquidFood(nameOf(item)) && volumeUnits[unit]) return { amount: volumeUnits[unit]!, unit: 'ml' }
  const grams = positive(getFoodUnitGrams(nameOf(item))?.[unit as MeasurementUnit])
    ?? (unit === 'piece' || unit === 'slice' ? positive(pieceGrams) : null)
  return grams == null ? null : { amount: grams, unit: 'g' }
}

export function convertItemMeasurement(amount: number, from: ItemMeasurementUnit, to: ItemMeasurementUnit, item: any, pieceGrams?: number | null, multiplier = 1): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  // Count-only foods can still be adjusted by their recorded serving.
  if (from === 'serving' && to === 'serving') return amount
  const source = unitMeasure(item, from, pieceGrams, multiplier)
  const target = unitMeasure(item, to, pieceGrams, multiplier)
  if (!source || !target) return null
  const converted = convertFoodAmount(amount * source.amount, source.unit, target.unit, liquidDensity(nameOf(item)))
  return Number.isFinite(converted) && converted > 0 ? converted / target.amount : null
}

export function servingRatioFromMeasurement(item: any, amount: number, unit: ItemMeasurementUnit, multiplier = 1): number | null {
  return convertItemMeasurement(amount, unit, 'serving', item, null, multiplier)
}

export function itemMeasurementUnitOptions(item: any, pieceGrams?: number | null): ItemMeasurementUnit[] {
  const basis = recordedServingBasis(item)
  if (!basis) return ['serving']
  const candidates: ItemMeasurementUnit[] = [...getAllowedUnitsForFood(nameOf(item), pieceGrams)]
  if (basis.unit === 'ml' || liquidDensity(nameOf(item)) != null) candidates.push('ml', 'fl oz')
  return [...new Set(candidates)].filter(unit => convertItemMeasurement(1, unit, 'serving', item, pieceGrams) != null)
}

export function formatItemMeasurementUnit(item: any, unit: ItemMeasurementUnit, pieceGrams?: number | null): string {
  if (unit === 'g' || unit === 'ml' || unit === 'oz' || unit === 'fl oz') return unit
  if (unit.startsWith('piece') || unit.startsWith('egg') || unit === 'slice') return formatUnitLabel(unit as MeasurementUnit, nameOf(item), pieceGrams)
  const measure = unitMeasure(item, unit, pieceGrams)
  const label = ({ 'quarter-cup': '1/4 cup', 'half-cup': '1/2 cup', 'three-quarter-cup': '3/4 cup' } as Partial<Record<ItemMeasurementUnit, string>>)[unit] || unit
  return measure ? `${label} — ${Number(measure.amount.toFixed(3))} ${measure.unit}` : label
}
