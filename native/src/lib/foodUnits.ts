export type FoodBaseUnit = 'g' | 'ml' | 'oz' | 'fl oz'
export const liquidDensity = (name: string): number | null => {
  const label = name.toLowerCase()
  if (/\b(powder|cake|bread|biscuit|cookie|chocolate|bar|soup|stew|chicken|beef|rice|pasta)\b/.test(label)) return null
  if (/\boil\b/.test(label)) return 0.92
  if (/\bsyrup\b/.test(label)) return 1.33
  if (/\bhoney\b/.test(label)) return 1.42
  if (/\bmilk\b/.test(label) && !/\b(chocolate|powder)\b/.test(label)) return 1.03
  if (/\bwater\b/.test(label)) return 1
  return null
}
export function convertFoodAmount(value: number, from: FoodBaseUnit, to: FoodBaseUnit, density?: number | null): number {
  if (!Number.isFinite(value) || value < 0) return NaN
  if (from === to) return value
  const fromVolume = from === 'ml' || from === 'fl oz'
  const toVolume = to === 'ml' || to === 'fl oz'
  let amount = value * (from === 'oz' ? 28.349523125 : from === 'fl oz' ? 29.5735295625 : 1)
  if (fromVolume !== toVolume) {
    if (density == null || !Number.isFinite(density) || density <= 0) return NaN
    amount = fromVolume ? amount * density : amount / density
  }
  return amount / (to === 'oz' ? 28.349523125 : to === 'fl oz' ? 29.5735295625 : 1)
}
export function parseFoodServing(label: string, name = ''): { amount: number; unit: FoodBaseUnit; density?: number | null } | null {
  const match = label.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|grams?|g|millilit(?:er|re)s?|ml|fl\s*oz|fluid ounces?|ounces?|oz|lit(?:er|re)s?|l)\b/)
  if (!match || Number(match[1]) <= 0) return null
  const token = match[2]
  const unit: FoodBaseUnit = /^fl|^fluid/.test(token) ? 'fl oz' : /^oz|^ounce/.test(token) ? 'oz' : /^ml|^millilit|^l/.test(token) ? 'ml' : 'g'
  return { amount: Number(match[1]) * (/^(kg|l|lit)/.test(token) ? 1000 : 1), unit, density: liquidDensity(name) }
}
