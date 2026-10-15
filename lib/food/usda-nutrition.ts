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
  const energyKcal = n.energyKcal
  const option = (id: string, label: string, amount: number) => {
    const scale = amount / 100
    // Retain provider precision for later portion changes; round only the displayed result.
    const macro = (value: number | null) => value == null ? null : value * scale
    return {
      id: `usda:${fdcId}:${id}`, label, serving_size: label,
      grams: basis === 'g' ? amount : null, ml: basis === 'ml' ? amount : null, unit: basis,
      calories: energyKcal * scale,
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
    const description = [portion.portionDescription, portion.modifier]
      .find(value => typeof value === 'string' && value.trim())?.trim() || ''
    const rawMeasure = portion.measureUnit?.name
    const measure = typeof rawMeasure === 'string' && !/^(undetermined|unknown|not specified)$/i.test(rawMeasure.trim()) ? rawMeasure.trim() : ''
    const label = description || measure
    const count = foodNumberOrNull(portion.amount)
    // gramWeight covers the complete provider portion, which can be 3 oz or
    // several pieces. A bare unit must not imply one unit at that full weight.
    const hasQuantity = /^(?:\d|\.\d|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b)/i.test(label)
    const barePhysicalUnit = /^(?:oz|ounces?|g|grams?|kg|kilograms?|lb|lbs|pounds?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)$/i.test(label)
    const servingLabel = hasQuantity ? label
      : count != null && count > 0 && label ? `${count} ${label}`
        : barePhysicalUnit || !description ? '' : label
    options.push(option(String(index), servingLabel ? `${servingLabel} — ${grams}g` : `${grams} g`, grams))
  })
  return options
}
