import { isFoodPreparationCompatible } from './foodPreparation'

const words = (value: unknown) => String(value ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
const forms = [
  /\b(dried|dehydrated)\b/, /\b(canned|tinned)\b/, /\b(juice|juiced)\b/,
  /\b(puree|pureed)\b/, /\b(powder|powdered)\b/, /\b(concentrate|concentrated)\b/,
  /\b(candied|sweetened|in syrup)\b/, /\b(jam|jelly|preserves?)\b/, /\bpickled\b/,
  /\bfrozen\b/, /\b(mixture|mix)\b/, /\b(babyfood|baby food|infant food)\b/,
  /\bcereals?\b/, /\bbreads?\b/, /\b(cakes?|cookies?|biscuits?|pies?|pastr(?:y|ies))\b/,
  /\b(soups?|stews?)\b/, /\bsalads?\b/, /\b(sauces?|dressings?)\b/, /\bsmoothies?\b/,
  /\bnoodles?\b/, /\b(broccoli (raab|rabe)|rapini)\b/, /\b(chinese broccoli|broccoli chinese|gai lan)\b/,
]
const metadata = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'estimated', 'approximately', 'about', 'serving', 'raw', 'uncooked', 'cooked', 'grilled', 'roasted', 'roast', 'rotisserie', 'braised', 'boiled', 'baked', 'fried', 'steamed', 'poached', 'stewed', 'fresh', 'nuts', 'nut', 'seeds', 'seed', 'fish', 'fruits', 'fruit', 'vegetables', 'vegetable'])
const hasWholeMilkQualifier = (value: string) => /\bmilk\b/.test(value) && /\bwhole\b/.test(value) && !/\bwhole (wheat|grains?)\b/.test(value)
const identityWords = (value: string) => (hasWholeMilkQualifier(value)
  ? value.replace(/\bwhole\b/g, '')
  : value.replace(/\bwhole\s+(?!wheat\b|grain\b|grains\b|milk\b)/g, ''))
  .split(' ').filter(word => word && !metadata.has(word) && !/^\d+$/.test(word))
const sameWord = (a: string, b: string) => a === b || a === `${b}s` || b === `${a}s`
const productForms = [
  /\b(patty|patties)\b/, /\bnuggets?\b/, /\bsausages?\b/, /\bburgers?\b/,
  /\b(meatless|vegetarian|vegan|plant based)\b/, /\b(imitation|substitutes?)\b/,
]
const milkFlavours = [/\b(chocolate|cocoa)\b/, /\bvanilla\b/, /\bstrawberr(?:y|ies)\b/, /\bbanana\b/, /\bflavou?red\b/]

function hasUnrequestedIngredients(requested: string, actual: string): boolean {
  // Anatomy and ordinary vitamin fortification are source description metadata,
  // rather than extra foods (e.g. USDA "meat and skin" or milk with vitamin D).
  const composition = actual
    .replace(/\b(meat and skin|flesh and skin|skin and fat|with skin|with bone|bone and skin|separable lean and fat|lean and fat)\b/g, ' ')
    .replace(/\b(?:with(?: added)?|and) vitamins? [a-k](?: [0-9]+)?\b/g, ' ')
  const requestedWords = identityWords(requested)
  for (const match of composition.matchAll(/\b(?:with|and|containing|contains|includes?|plus)\s+(.+)/g)) {
    if (identityWords(match[1]).some(word => !requestedWords.some(other => sameWord(word, other)))) return true
  }
  return false
}

function skinKind(value: string): 'skin' | 'meat-with-skin' | 'meat-without-skin' | null {
  if (/\b(skinless|without skin|skin removed|meat only)\b/.test(value)) return 'meat-without-skin'
  if (/\b(with skin|skin on|meat and skin|flesh and skin|flesh skin)\b/.test(value)) return 'meat-with-skin'
  if (/\blean flesh\b/.test(value) && !/\bskin\b/.test(value)) return 'meat-without-skin'
  if (/\bskin\b/.test(value) && /\b(chicken|turkey|duck|goose|poultry|skin only)\b/.test(value)) return 'skin'
  return null
}

/** Shared by native serving review and server photo matching. A matching word
 * cannot turn skin, organ meat or a processed food into the photographed food. */
export function isFoodIdentityCompatible(requestedName: unknown, candidateName: unknown): boolean {
  const requested = words(requestedName)
  const actual = words(candidateName)
  if (!requested || !actual || !isFoodPreparationCompatible(actual, requested)) return false
  if (hasWholeMilkQualifier(requested) && !hasWholeMilkQualifier(actual)) return false
  if (forms.some(form => form.test(requested) !== form.test(actual))) return false
  if (productForms.some(form => form.test(requested) !== form.test(actual))) return false
  if (/\bmilk\b/.test(actual) && milkFlavours.some(flavour => flavour.test(requested) !== flavour.test(actual))) return false
  if (hasUnrequestedIngredients(requested, actual)) return false
  const requestedSkin = skinKind(requested)
  const actualSkin = skinKind(actual)
  if (requestedSkin === 'skin' ? actualSkin !== 'skin' : actualSkin === 'skin') return false
  if (requestedSkin && actualSkin && requestedSkin !== actualSkin) return false
  if (requestedSkin === 'meat-with-skin' && actualSkin !== requestedSkin) return false
  if (/\b(chicken|turkey|duck|goose)\b/.test(requested)) {
    for (const part of ['breast', 'thigh', 'wing', 'leg', 'drumstick', 'back', 'neck', 'feet', 'dark meat', 'light meat']) {
      const pattern = new RegExp(`\\b${part}s?\\b`)
      if (pattern.test(actual) !== pattern.test(requested)) return false
    }
  }
  for (const part of ['liver', 'heart', 'gizzard', 'kidney', 'brain', 'fat']) {
    const pattern = new RegExp(`\\b${part}\\b`)
    if (pattern.test(actual) && !pattern.test(requested) && /\b(chicken|turkey|beef|pork|lamb)\b/.test(actual) && !(part === 'fat' && actualSkin === 'meat-with-skin')) return false
  }
  const requestedWords = identityWords(requested)
  const candidateWords = identityWords(actual)
  if (!requestedWords.length || !requestedWords.every(word => candidateWords.some(other => sameWord(word, other)))) return false
  const primary = candidateWords[0]
  return !!primary && requestedWords.some(word => sameWord(word, primary))
}

export function isGenericMealName(value: unknown): boolean {
  const name = words(value)
  return !name || /^(?:photo (?:analyzed|analysed) meal|analy[sz]ed meal|meal|new meal|my meal|untitled meal|breakfast|lunch|dinner|snacks?)$/.test(name)
}

/** A concise description from detected foods; never invent a dish or replace a
 * name the person wrote. This does not call an AI service or change nutrition. */
export function suggestMealName(items: Array<{ name?: unknown }>, currentName = ''): string {
  if (!isGenericMealName(currentName)) return currentName
  const names = [...new Set(items.map(item => String(item?.name ?? '').trim()
    .replace(/^(?:approximately|about|estimated)\s+/i, '')
    .replace(/^(?:cooked|boiled|steamed|fresh)\s+/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(name => name && !isGenericMealName(name)))].slice(0, 3)
  if (!names.length) return currentName
  const title = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names[2]}`
  const short = title.length > 100 ? `${title.slice(0, 97).trimEnd()}…` : title
  return short.charAt(0).toUpperCase() + short.slice(1)
}
