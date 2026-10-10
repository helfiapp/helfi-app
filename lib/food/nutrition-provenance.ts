import { foodNumberOrNull } from './openfoodfacts'
import { isFoodPreparationCompatible } from '../../native/src/lib/foodPreparation'
import { convertFoodAmount, parseFoodServing } from '../../native/src/lib/foodUnits'

export const NUTRITION_FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const
const text = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const foodNutritionLookupName = (value: unknown) => text(value).replace(/\bwhole\s+(?!wheat\b|grain\b|grains\b|milk\b)/g, '')
const tokens = (value: unknown) => foodNutritionLookupName(value).split(' ').filter((word) => word && !/^\d+$/.test(word) && !['a', 'an', 'the', 'of', 'estimated', 'serving'].includes(word))
const sameFoodWord = (requested: string, actual: string) => requested === actual || actual === `${requested}s` || requested === `${actual}s`
// A matching food word alone does not make preserved or processed food equivalent.
// Plain photo ingredients must not inherit dried/canned/juice nutrition silently.
const foodForms = [
  /\b(dried|dehydrated)\b/,
  /\b(canned|tinned)\b/,
  /\b(juice|juiced)\b/,
  /\b(puree|pureed)\b/,
  /\b(powder|powdered)\b/,
  /\b(concentrate|concentrated)\b/,
  /\b(candied|sweetened|in syrup)\b/,
  /\b(jam|jelly|preserve|preserves)\b/,
  /\b(pickled)\b/,
  /\b(frozen)\b/,
  /\b(mixture|mix)\b/,
  /\b(babyfood|baby food|infant food)\b/,
  /\b(cereal|cereals)\b/,
  /\b(bread|breads)\b/,
  /\b(cake|cakes|cookie|cookies|biscuit|biscuits|pie|pies|pastry|pastries)\b/,
  /\b(soup|soups|stew|stews)\b/,
  /\b(salad|salads)\b/,
  /\b(sauce|sauces|dressing|dressings)\b/,
  /\b(smoothie|smoothies)\b/,
]

// A common ingredient word does not identify a distinct vegetable or a
// processed product: rice noodles cannot supply ordinary cooked rice values.
const distinctFoodTypes = [
  /\b(broccoli (raab|rabe)|rapini)\b/,
  /\b(chinese broccoli|broccoli chinese|gai lan)\b/,
  /\bnoodles?\b/,
]
const sameFoodSubtype = (requested: unknown, actual: unknown) => {
  const requestedName = text(requested)
  const actualName = text(actual)
  return distinctFoodTypes.every(subtype => subtype.test(requestedName) === subtype.test(actualName))
}

// A word buried in another food's name is not its primary identity. USDA
// category prefixes (e.g. Nuts, almonds) and preparation labels are metadata.
export function isFoodPhotoCandidateIdentity(item: any, candidate: any): boolean {
  if (!sameFoodSubtype(item.name, candidate.name)) return false
  const metadata = new Set(['raw', 'uncooked', 'cooked', 'grilled', 'roasted', 'roast', 'boiled', 'baked', 'fried', 'steamed', 'fresh', 'nuts', 'nut', 'seeds', 'seed', 'fish', 'fruits', 'fruit', 'vegetables', 'vegetable'])
  const requested = tokens(item.name).filter(word => !metadata.has(word))
  const first = tokens(candidate.name).find(word => !metadata.has(word))
  return !!first && requested.some(word => sameFoodWord(word, first))
}

export function nutritionCandidateScale(item: any, candidate: any): number | null {
  if (!candidate?.id || !candidate?.source || !isFoodPreparationCompatible(candidate.name, item.name)) return null
  const requestedName = text(item.name)
  const actualName = text(candidate.name)
  if (foodForms.some(form => form.test(requestedName) !== form.test(actualName))) return null
  if (!sameFoodSubtype(item.name, candidate.name)) return null
  const requested = tokens(item.name)
  const actual = tokens(candidate.name)
  if (!requested.length || !requested.every((word) => actual.some(actualWord => sameFoodWord(word, actualWord)))) return null
  const brand = text(item.brand)
  const candidateBrand = text(candidate.brand)
  if (brand ? candidateBrand !== brand : !!candidateBrand) return null
  const portion = parseFoodServing(String(item.serving_size || ''), String(item.name || ''))
  const reference = parseFoodServing(String(candidate.serving_size || ''), String(candidate.name || ''))
  if (portion && reference) {
    const amount = convertFoodAmount(portion.amount, portion.unit, reference.unit, portion.density ?? reference.density)
    return Number.isFinite(amount) && amount > 0 ? amount / reference.amount : null
  }
  const serving = text(item.serving_size)
  return serving && serving === text(candidate.serving_size) ? 1 : null
}

export function fillMissingNutrition(item: any, candidate: any): any {
  const scale = nutritionCandidateScale(item, candidate)
  if (scale == null) return item
  const next = { ...item }
  const filled: string[] = []
  for (const field of NUTRITION_FIELDS) {
    if (foodNumberOrNull(item[field]) != null) continue
    const value = foodNumberOrNull(candidate[field])
    if (value == null) continue
    next[field] = Math.round(value * scale * 1000) / 1000
    filled.push(field)
  }
  if (!filled.length) return item
  next.nutritionProvenance = {
    ...item.nutritionProvenance,
    provider: candidate.source, recordId: String(candidate.id), foodName: candidate.name,
    referenceServing: candidate.serving_size, selectedServing: item.serving_size, scale,
    fields: filled, portionEstimated: true, status: 'database-assisted-estimate',
  }
  return next
}
