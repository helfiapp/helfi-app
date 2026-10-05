export type FoodBaseUnit = 'g' | 'ml' | 'oz' | 'fl oz'
// Generic kitchen choices only. Recorded provider portions and saved metric
// quantities retain their own basis; never apply this to historical amounts.
export function liquidHouseholdMl(country = ''): Partial<Record<string, number>> {
  const australian = /^(AU|AUS|AUSTRALIA)$/.test(country.trim().toUpperCase())
  const cup = australian ? 250 : 240
  return {
    ml: 1, tsp: 5, tbsp: australian ? 20 : 15,
    'quarter-cup': cup / 4, 'half-cup': cup / 2,
    'three-quarter-cup': cup * 3 / 4, cup,
  }
}
export const liquidDensity = (name: string): number | null => {
  const label = name.toLowerCase()
  // A named ingredient is not the density of the whole food (e.g. mayonnaise
  // with olive oil or juice diluted with water). Identify the food itself first.
  const head = label.split(',')[0].replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  if (/\b(powder|dry|dried|cake|bread|biscuit|cookie|chocolate|bar|soup|stew|chicken|beef|pasta|sauce|dressing|mayonnaise|spray|concentrate|concentrated|condensed|evaporated)\b/.test(label)) return null
  const composition = label.replace(/\bwith(?: added)? vitamins?\b/g, '')
  if (/\b(with|containing|contains|mixed|blend|blended)\b/.test(composition)) return null
  const oilName = /^(?:(?:extra virgin|virgin|pure|refined|unrefined|cold pressed) )?(?:olive|canola|rapeseed|sunflower|safflower|soybean|soy|corn|peanut|groundnut|sesame|vegetable|avocado|grapeseed|grape seed|rice bran|cottonseed|palm|coconut|walnut|fish|cod liver|salad|cooking) oil$/
  if (head === 'oil' || oilName.test(head)) return 0.92
  if (head === 'syrup' || head === 'maple syrup') return 1.33
  if (head === 'honey' || head === 'pure honey') return 1.42
  const milkName = /^(?:milk|(?:whole|skim(?:med)?|nonfat|low ?fat|reduced fat|full cream|cow s|cow|goat s|goat|sheep s|sheep|dairy|fluid|[0-3](?: percent)?(?: fat)?) milk|milk (?:whole|skim(?:med)?|nonfat|low ?fat|reduced fat|full cream|fluid))$/
  if (milkName.test(head) && !/\b(almond|soy|soya|oat|coconut|rice|cashew|hemp|breast|buttermilk|flavored|flavoured|malted|syrup|shake|smoothie)\b/.test(label)) return 1.03
  const waterName = /^(?:(?:tap|drinking|bottled|spring|mineral|sparkling|carbonated|distilled|purified) )?water$/
  if (waterName.test(head) && !/\b(juice|coconut|flavored|flavoured|sweetened|sugar|syrup|tonic|chestnuts?)\b/.test(label)) return 1
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
  // Metric amounts in dual-unit labels are the recorded basis; ounce values are often rounded.
  const text = label.toLowerCase()
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|grams?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l)\b/)
    || text.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|fluid ounces?|ounces?|oz)\b/)
  if (!match || Number(match[1]) <= 0) return null
  const token = match[2]
  const unit: FoodBaseUnit = /^fl|^fluid/.test(token) ? 'fl oz' : /^oz|^ounce/.test(token) ? 'oz' : /^ml|^millilit|^l/.test(token) ? 'ml' : 'g'
  return { amount: Number(match[1]) * (/^(kg|l|lit)/.test(token) ? 1000 : 1), unit, density: liquidDensity(name) }
}
