import { optionalNutrient, roundOptionalNutrient, scaleOptionalNutrient, sumOptionalNutrients } from './nutrient-values'

const KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const
export type RecommendedMacroTotals = Record<(typeof KEYS)[number], number | null>
export type RecommendedNutritionItem = Partial<RecommendedMacroTotals> & { name?: string; servings: number }

// Sum original per-serving values at full precision. A removed (zero-count)
// ingredient contributes nothing; a missing value in an eaten ingredient
// makes that nutrient's total unknown, never a smaller apparently complete sum.
export function computeRecommendedTotals(items: RecommendedNutritionItem[]): RecommendedMacroTotals {
  const totals: RecommendedMacroTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  for (const item of items) {
    for (const key of KEYS) totals[key] = sumOptionalNutrients(totals[key], scaleOptionalNutrient(item[key], item.servings))
  }
  return totals
}

export function recommendationNutritionError(items: RecommendedNutritionItem[]): string | null {
  if (!items.length || items.every(item => item.servings === 0)) return 'This meal has no ingredients with a positive amount. Adjust an ingredient before saving.'
  for (const item of items) {
    if (!Number.isFinite(item.servings) || item.servings < 0 || item.servings > 20) return 'Please enter a valid ingredient amount before saving.'
    if (item.servings === 0) continue
    if (KEYS.slice(0, 4).some(key => optionalNutrient(item[key]) == null)) {
      return `Nutrition is incomplete for ${item.name || 'an ingredient'}. Use Build this meal to find a matching food before saving.`
    }
  }
  return null
}

export function recommendedFoodLogTotals(totals: RecommendedMacroTotals) {
  return {
    calories: roundOptionalNutrient(totals.calories, 0),
    protein: roundOptionalNutrient(totals.protein_g, 3),
    carbs: roundOptionalNutrient(totals.carbs_g, 3),
    fat: roundOptionalNutrient(totals.fat_g, 3),
    fiber: roundOptionalNutrient(totals.fiber_g, 3),
    sugar: roundOptionalNutrient(totals.sugar_g, 3),
  }
}
