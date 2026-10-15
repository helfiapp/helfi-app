export type MealPortionUnit = 'serving' | 'g' | 'oz'

// One serving here means the complete set of ingredient amounts in the editor.
// Keep these amounts as the baseline so changing units/presets never compounds.
export function mealPortionScale(amount: string, unit: MealPortionUnit, wholeGrams: number | null, recipeServings = 1): number | null {
  if (!amount.trim()) return null
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return null
  if (unit === 'serving') return Number.isFinite(recipeServings) && recipeServings > 0 ? value / recipeServings : null
  if (wholeGrams == null || !Number.isFinite(wholeGrams) || wholeGrams <= 0) return null
  const ratio = value * (unit === 'oz' ? 28.349523125 : 1) / wholeGrams
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

export function portionMealItems<T extends { servings: number; amountInput: string }>(items: T[], scale: number): T[] {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Enter a positive portion amount.')
  return items.map((item) => ({
    ...item,
    servings: item.servings * scale,
    amountInput: String(Number(item.amountInput) * scale),
  }))
}
