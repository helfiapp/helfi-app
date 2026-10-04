// One nutrient basis for both packaged search and barcode lookup.
export const foodNumberOrNull = (value: unknown): number | null => {
  if (value == null || typeof value === 'boolean') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function normalizeOffNutrition(product: any) {
  const nutr = product?.nutriments || {}
  const label = String(product?.serving_size || '').trim()
  const measured = label.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|grams?|ml|millilit(?:er|re)s?|lit(?:er|re)s?|l)\b/i)
  const unit = measured?.[2].toLowerCase()
  const volume = !!unit && /^(ml|millilit|l)/.test(unit)
  const labelledQuantity = measured ? Number(measured[1].replace(',', '.')) * (/^(kg|l|lit)/.test(unit!) ? 1000 : 1) : null
  const quantity = labelledQuantity ?? foodNumberOrNull(product?.serving_quantity)
  const factor = quantity != null && quantity > 0 ? quantity / 100 : null
  const energy = (suffix: string) => {
    const kcal = foodNumberOrNull(nutr[`energy-kcal_${suffix}`])
    if (kcal != null) return kcal
    const kj = foodNumberOrNull(nutr[`energy-kj_${suffix}`]) ?? foodNumberOrNull(nutr[`energy_${suffix}`])
    return kj == null ? null : kj / 4.184
  }
  const fields = {
    calories: [energy('serving'), energy('100g')],
    protein_g: [foodNumberOrNull(nutr.proteins_serving), foodNumberOrNull(nutr.proteins_100g)],
    carbs_g: [foodNumberOrNull(nutr.carbohydrates_serving), foodNumberOrNull(nutr.carbohydrates_100g)],
    fat_g: [foodNumberOrNull(nutr.fat_serving), foodNumberOrNull(nutr.fat_100g)],
    fiber_g: [foodNumberOrNull(nutr.fiber_serving), foodNumberOrNull(nutr.fiber_100g)],
    sugar_g: [foodNumberOrNull(nutr.sugars_serving), foodNumberOrNull(nutr.sugars_100g)],
  }
  const hasServing = Object.values(fields).some(([serving]) => serving != null)
  // Unknown serving weights cannot justify combining a label portion with 100g data.
  const useServing = (hasServing && !!label) || (factor != null && !!label)
  const value = (field: keyof typeof fields) => {
    const [serving, hundred] = fields[field]
    if (!useServing) return hundred
    return serving ?? (hundred != null && factor != null ? hundred * factor : null)
  }
  return {
    serving_size: useServing ? label : `100 ${volume || product?.serving_quantity_unit === 'ml' ? 'ml' : 'g'}`,
    calories: value('calories'), protein_g: value('protein_g'), carbs_g: value('carbs_g'),
    fat_g: value('fat_g'), fiber_g: value('fiber_g'), sugar_g: value('sugar_g'),
    // Values are now canonical kcal per the displayed serving. Never convert/scale twice.
    basis: 'per_serving' as const,
    energyUnit: 'kcal' as const,
  }
}
