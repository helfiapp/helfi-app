import { convertFoodAmount, liquidDensity, parseFoodServing, type FoodBaseUnit } from './foodUnits'
import { isFoodPreparationCompatible } from './foodPreparation'
import { sortPlainFoodResults } from './plainFoodSearch'
import { optionalNutrient } from './nutrientValues'

export type RecipeFood = {
  id?: string | number; name?: string | null; source?: string | null; brand?: string | null
  serving_size?: string | null; calories?: number | null; protein_g?: number | null
  carbs_g?: number | null; fat_g?: number | null; fiber_g?: number | null; sugar_g?: number | null
  [key: string]: any
}
export type RecipeAmount = { line: string; lookup: string; amount: number; unit: FoodBaseUnit }

const fraction = (value: string) => {
  const parts = value.trim().split(/\s+/)
  const tail = parts.pop() || ''
  const divided = tail.split('/')
  const n = divided.length === 2 ? Number(divided[0]) / Number(divided[1]) : Number(tail)
  return n + (parts.length ? Number(parts[0]) : 0)
}

// An unmeasured ingredient or an alternative must be reviewed, never invented
// as 100 g or zero calories. Household volume is left for a measured ml amount.
export function parseRecipeAmount(raw: string): RecipeAmount | null {
  let line = String(raw || '').trim().replace(/^[•*–—-]\s*/, '')
  const unicode: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' }
  line = line.replace(/[½¼¾⅓⅔]/g, (char) => ` ${unicode[char]} `).replace(/\s+/g, ' ').trim()
  if (/\b(or|optional|to taste|plus|for frying|to serve)\b/i.test(line)) return null
  const amountMatch = line.match(/^(\d+\/\d+|\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*(.*)$/)
  if (!amountMatch) return null
  const amount = fraction(amountMatch[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const rest = amountMatch[2].trim()
  const egg = rest.match(/^(?:(small|medium|large|extra large|jumbo)\s+)?eggs?\b(.*)$/i)
  if (egg) {
    if (egg[2].trim() && !/^\s*(raw|whole|beaten)\s*$/i.test(egg[2])) return null
    const grams = ({ small: 38, medium: 44, large: 50, 'extra large': 56, jumbo: 63 } as Record<string, number>)[egg[1]?.toLowerCase() || 'large']
    return { line: raw, lookup: 'egg whole raw', amount: amount * grams, unit: 'g' }
  }
  const measure = rest.match(/^(kg|g|grams?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounces?|fl\s*oz|fluid ounces?)\b\s*(.+)$/i)
  if (!measure) return null
  const token = measure[1].toLowerCase()
  const unit: FoodBaseUnit = /^(fl|fluid)/.test(token) ? 'fl oz' : /^(oz|ounce)/.test(token) ? 'oz' : /^(ml|millilit|l)/.test(token) ? 'ml' : 'g'
  let lookup = measure[2].replace(/\([^)]*\)/g, '').split(',')[0].trim()
    .replace(/\bplain flour\b/gi, 'wheat flour white all purpose')
    .replace(/\bself[ -]raising flour\b/gi, 'wheat flour self rising')
  if (!lookup || /\b(cup|tbsp|tsp)\b/i.test(lookup)) return null
  if (/\b(chicken|beef|pork|salmon|rice|pasta)\b/i.test(lookup) && !/\b(raw|uncooked|cooked|grilled|roasted|boiled|fried|baked|steamed|braised)\b/i.test(lookup)) lookup += ' raw'
  return { line: raw, lookup, amount: amount * (/^(kg|l|lit)/.test(token) ? 1000 : 1), unit }
}

const tokens = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
  .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)

export function chooseRecipeFood(items: RecipeFood[], request: RecipeAmount): RecipeFood | null {
  const required = tokens(request.lookup).filter((word) => !['fresh', 'raw', 'white', 'all', 'purpose'].includes(word))
  const candidates = items.filter((item) => {
    if (!item.name || !isFoodPreparationCompatible(item.name, request.lookup)) return false
    const candidate = tokens(item.name)
    if (!required.every((word) => candidate.includes(word))) return false
    if (/\b(milk)\b/i.test(request.lookup) && /\b(human|breast|powder|dried|condensed|evaporated|chocolate|buttermilk)\b/i.test(item.name)
      && !tokens(request.lookup).some((word) => /^(human|breast|powder|dried|condensed|evaporated|chocolate|buttermilk)$/.test(word))) return false
    if (/\bflour\b/i.test(request.lookup) && /\bself[- ]?rising\b/i.test(item.name) && !/\bself rising\b/i.test(request.lookup)) return false
    if (!['calories', 'protein_g', 'carbs_g', 'fat_g'].every((key) => optionalNutrient(item[key]) !== null)) return false
    return Boolean(parseFoodServing(item.serving_size || '', item.name))
  })
  return sortPlainFoodResults(candidates, request.lookup, (item) => item.source === 'usda' ? 0 : 1)[0] || null
}

export function measuredRecipeFood(food: RecipeFood, request: RecipeAmount): RecipeFood | null {
  const basis = parseFoodServing(food.serving_size || '', food.name || '')
  if (!basis) return null
  const amount = convertFoodAmount(request.amount, request.unit, basis.unit, liquidDensity(food.name || request.lookup))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return {
    ...food, servings: amount / basis.amount, __amount: amount, __unit: basis.unit,
    requestedName: request.lookup, importLine: request.line, __recipeMeasured: true,
    fiber_g: optionalNutrient(food.fiber_g), sugar_g: optionalNutrient(food.sugar_g),
  }
}

export function recipePortionRatio(next: string | number, previous: string | number): number | null {
  const n = Number(next); const p = Number(previous)
  return Number.isFinite(n) && n > 0 && Number.isFinite(p) && p > 0 ? n / p : null
}
