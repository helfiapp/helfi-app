import { foodNumberOrNull } from './openfoodfacts'

/** USDA branded values use 100 g or 100 ml, according to the provider's recorded unit. */
export function usdaNutrientBasis(food: any): 'g' | 'ml' | null {
  if (!String(food?.dataType || '').toLowerCase().includes('branded')) return 'g'
  const raw = food?.servingSizeUnit
  const unit = String(typeof raw === 'string' ? raw : raw?.name ?? '').trim().toLowerCase()
  if (/^(ml|mlt|millilit(?:er|re)s?)$/.test(unit)) return 'ml'
  if (/^(g|gm|grm|grams?|oz|ounces?)$/.test(unit)) return 'g'
  return null
}

export function extractUsdaNutrients(food: any) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : []
  const find = (ids: number[], names: string[], numbers: string[], unit: string): number | null => {
    for (const n of nutrients) {
      const id = Number(n.nutrientId ?? n.nutrient?.id)
      const name = String(n.nutrientName ?? n.nutrient?.name ?? '').trim().toLowerCase()
      const number = String(n.nutrientNumber ?? n.nutrient?.number ?? '').trim()
      const actualUnit = String(n.unitName ?? n.nutrient?.unitName ?? '').trim().toUpperCase()
      if (!(ids.includes(id) || names.includes(name) || numbers.includes(number)) || actualUnit !== unit) continue
      const value = foodNumberOrNull(n.value ?? n.amount)
      if (value != null) return value
    }
    return null
  }
  const kcal = find([1008, 2047, 2048], ['energy'], ['208', '957', '958'], 'KCAL')
  const kj = find([1062], ['energy'], ['268'], 'KJ')
  return {
    energyKcal: kcal ?? (kj == null ? null : kj / 4.184),
    protein: find([1003], ['protein'], ['203'], 'G'),
    carbs: find([1005], ['carbohydrate, by difference', 'carbohydrate'], ['205'], 'G'),
    fat: find([1004], ['total lipid (fat)'], ['204'], 'G'),
    fiber: find([1079], ['fiber, total dietary', 'dietary fiber'], ['291'], 'G'),
    sugar: find([2000, 1063], ['sugars, total including nlea', 'sugars, total'], ['269'], 'G'),
  }
}

export function usdaStandardServingOptions(food: any, fdcId: string) {
  const n = extractUsdaNutrients(food)
  const basis = usdaNutrientBasis(food)
  // Missing calories must not become a valid zero-calorie serving option.
  if (n.energyKcal == null || basis == null) return []
  const option = (id: string, label: string, amount: number) => {
    const scale = amount / 100
    const macro = (value: number | null) => value == null ? null : Math.round(value * scale * 10) / 10
    return {
      id: `usda:${fdcId}:${id}`, label, serving_size: label,
      grams: basis === 'g' ? amount : null, ml: basis === 'ml' ? amount : null, unit: basis,
      calories: Math.round(n.energyKcal! * scale),
      protein_g: macro(n.protein), carbs_g: macro(n.carbs), fat_g: macro(n.fat),
      fiber_g: macro(n.fiber), sugar_g: macro(n.sugar), source: 'usda' as const,
    }
  }
  const options = [option(`100${basis}`, `100 ${basis}`, 100)]
  const rawUnit = food?.servingSizeUnit
  const unit = String(typeof rawUnit === 'string' ? rawUnit : rawUnit?.name ?? '').trim().toLowerCase()
  const amount = foodNumberOrNull(food?.servingSize)
  const servingAmount = amount == null ? null : /^(g|gm|grm|grams?|ml|mlt|millilit(?:er|re)s?)$/.test(unit) ? amount
    : /^(oz|ounces?)$/.test(unit) ? amount * 28.349523125 : null
  if (String(food?.dataType || '').toLowerCase().includes('branded') && servingAmount != null && servingAmount > 0) {
    options.push(option('serving', `Serving — ${servingAmount}${basis}`, servingAmount))
  }
  const portions = Array.isArray(food?.foodPortions) ? food.foodPortions : []
  if (basis === 'g') portions.forEach((portion: any, index: number) => {
    const grams = foodNumberOrNull(portion?.gramWeight)
    if (grams == null || grams <= 0) return
    const label = portion.portionDescription || portion.modifier || portion.measureUnit?.name || 'Serving'
    options.push(option(String(index), `${label} — ${grams}g`, grams))
  })
  return options
}
