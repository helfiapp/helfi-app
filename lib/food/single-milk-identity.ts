const words = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9.%]+/g, ' ').replace(/\s+/g, ' ').trim()
const plantKinds = ['almond', 'oat', 'soy', 'coconut', 'rice', 'cashew', 'hemp', 'pea', 'macadamia']
const otherFood = /\b(babyfood|baby food|cereal|oatmeal|porridge|bar|bars|cheese|yogurt|yoghurt|bread|pudding|custard|dessert|cake|cookie|cookies|pie|potato|candy|candies|nougat|chicken|egg|eggs|pancake|pancakes|soup|sauce|creamer|whitener)\b/

// These aliases affect matching only. Never rename a returned provider record
// or alter its nutrient values, portion basis, identity or preparation.
export function milkSearchText(value: unknown): string {
  return words(value)
    .replace(/\b(almond|oat|soy|coconut|rice|cashew|hemp|pea|macadamia)milk\b/g, '$1 milk')
    .replace(/\b(?:skim|skimmed)\b/g, 'nonfat')
    .replace(/\bfat[ -]free\b/g, 'nonfat')
    .replace(/\bfull cream\b/g, 'whole')
    .replace(/\blow fat\b/g, 'lowfat')
    .replace(/\b(\d+(?:\.\d+)?)\s*%/g, '$1 percent ')
    .replace(/\s+/g, ' ').trim()
}

export function isSingleMilkQuery(value: unknown): boolean {
  const text = milkSearchText(value)
  return /\bmilk\b/.test(text) && !otherFood.test(text)
}

export function singleMilkLookupQueries(value: string): string[] {
  if (!isSingleMilkQuery(value)) return [value]
  const normalized = milkSearchText(value)
  const compound = normalized.replace(/\b(almond|oat|soy|coconut|rice|cashew|hemp|pea|macadamia) milk\b/g, '$1milk')
  // Preserve the literal query (including percentage symbols) for database
  // records, and add only the known spelling/label aliases, not looser foods.
  return Array.from(new Set([value, normalized, compound]))
}

export function isSingleMilkIdentityCompatible(name: unknown, query: unknown): boolean {
  if (!isSingleMilkQuery(query)) return true
  const candidate = milkSearchText(name)
  const requested = milkSearchText(query)
  if (!/\bmilk\b/.test(candidate) || otherFood.test(candidate) || /\bprepared with\b/.test(candidate)) return false
  const requestedPlant = plantKinds.find(kind => new RegExp(`\\b${kind} milk\\b|\\bmilk (?:of )?${kind}\\b`).test(requested))
  if (requestedPlant && !new RegExp(`\\b${requestedPlant} milk\\b|\\bmilk (?:of )?${requestedPlant}\\b`).test(candidate)) return false
  if (!requestedPlant && /\b(nonfat|whole|lowfat|reduced fat)\b/.test(requested) && plantKinds.some(kind => new RegExp(`\\b${kind} milk\\b|\\bmilk (?:of )?${kind}\\b`).test(candidate))) return false
  for (const variant of ['chocolate', 'buttermilk', 'dry', 'dried', 'powder', 'condensed', 'evaporated']) {
    if (new RegExp(`\\b${variant}\\b`).test(candidate) && !new RegExp(`\\b${variant}\\b`).test(requested)) return false
  }
  if (/\bnonfat\b/.test(requested) && !/\bnonfat\b/.test(candidate)) return false
  if (/\bwhole\b/.test(requested) && !/\bwhole\b/.test(candidate)) return false
  const percentage = requested.match(/(?:^|\s)(\d+(?:\.\d+)?) percent\b/)
  if (percentage && !Array.from(candidate.matchAll(/(?:^|\s)(\d+(?:\.\d+)?) percent\b/g)).some(match => Number(match[1]) === Number(percentage[1]))) return false
  return true
}
