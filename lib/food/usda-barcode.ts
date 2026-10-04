import { foodNumberOrNull } from './openfoodfacts'
import { usdaNutrientBasis } from './usda-nutrition'

export const sameProductBarcode = (a: unknown, b: unknown) => {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  return /^\d{8,14}$/.test(left) && /^\d{8,14}$/.test(right) && left.padStart(14, '0') === right.padStart(14, '0')
}

export function normalizeExactUsdaBarcode(food: any, barcode: string) {
  if (!sameProductBarcode(food?.gtinUpc, barcode)) return null
  const unit = usdaNutrientBasis(food)
  if (unit == null) return null
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
  const nutrient = (ids: number[], names: string[], unit: string) => {
    const matches = nutrients.filter((n: any) => {
      const id = Number(n.nutrientId ?? n.nutrient?.id)
      const name = String(n.nutrientName ?? n.nutrient?.name ?? '').toLowerCase()
      const actualUnit = String(n.unitName ?? n.nutrient?.unitName ?? '').toUpperCase()
      return (ids.includes(id) || names.includes(name)) && actualUnit === unit
    })
    for (const n of matches) {
      const value = foodNumberOrNull(n.value ?? n.amount)
      if (value != null) return value
    }
    return null
  }
  const kcal = nutrient([1008, 2047, 2048], ['energy'], 'KCAL')
  const kj = nutrient([1062], ['energy'], 'KJ')
  return {
    source: 'usda' as const, id: String(food.fdcId), name: String(food.description || 'Packaged food'),
    brand: food.brandName || food.brandOwner || null,
    // Branded drinks use the provider's 100ml basis; solids use 100g.
    serving_size: `100 ${unit}`, basis: 'per_serving' as const, energyUnit: 'kcal' as const,
    barcode, quantity_g: unit === 'g' ? 100 : null,
    calories: kcal ?? (kj == null ? null : kj / 4.184),
    protein_g: nutrient([1003], ['protein'], 'G'),
    carbs_g: nutrient([1005], ['carbohydrate, by difference'], 'G'),
    fat_g: nutrient([1004], ['total lipid (fat)'], 'G'),
    fiber_g: nutrient([1079], ['fiber, total dietary'], 'G'),
    sugar_g: nutrient([2000, 1063], ['sugars, total including nlea', 'sugars, total'], 'G'),
  }
}
