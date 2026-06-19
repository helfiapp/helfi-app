export type PlainFoodSearchItem = {
  id?: string | number | null
  name?: string | null
  brand?: string | null
  source?: string | null
  __custom?: boolean | null
}

const DESCRIPTOR_TOKENS = new Set([
  'raw',
  'fresh',
  'whole',
  'cooked',
  'prepared',
  'with',
  'added',
  'vitamin',
  'large',
  'medium',
  'small',
  'extra',
])

const normalizeFoodSearchText = (value: string | null | undefined) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const singularize = (token: string) => {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 3 && token.endsWith('oes')) return token.slice(0, -2)
  if (token.length > 4 && /(ches|shes|xes|zes|ses)$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1)
  return token
}

const tokensFor = (value: string | null | undefined) =>
  normalizeFoodSearchText(value)
    .split(' ')
    .filter(Boolean)
    .map(singularize)

const includesAny = (tokens: string[], words: string[]) => words.some((word) => tokens.includes(word))

export const scorePlainFoodSearchResult = (item: PlainFoodSearchItem, query: string) => {
  const name = normalizeFoodSearchText(item?.name)
  if (!name) return 0

  const rawNameTokens = name.split(' ').filter(Boolean)
  const nameTokens = rawNameTokens.map(singularize)
  const queryTokens = tokensFor(query)
  const coreTokens = queryTokens.filter((token) => token.length >= 2 && !DESCRIPTOR_TOKENS.has(token))
  const requestedCore = coreTokens.length > 0 ? coreTokens : queryTokens.filter((token) => token.length >= 2)
  if (requestedCore.length === 0) return 0

  let score = 0

  requestedCore.forEach((token, index) => {
    const position = nameTokens.indexOf(token)
    if (position >= 0) {
      score += Math.max(80, 300 - position * 35)
      if (position === 0) score += 850
    }
    if (nameTokens[index] === token) score += index === 0 ? 420 : 180
    if (index === 0 && rawNameTokens[0] === `${token}s`) score += 240
  })

  if (name.includes(' raw')) score += 180
  if (name.includes(' fresh')) score += 110
  if (name.includes(' whole')) score += 80

  if (requestedCore.includes('milk')) {
    if (nameTokens[0] === 'milk') score += 1000
    if (/\bmilk whole\b/.test(name) || /\bwhole milk\b/.test(name)) score += 220
    if (/\bmilk (?:whole|lowfat|nonfat|reduced fat|fluid)\b/.test(name)) score += 180
    if (/\bprepared with whole milk\b/.test(name)) score -= 650
    if (!queryTokens.includes('buttermilk') && /\bbuttermilk\b/.test(name)) score -= 900
    if (!queryTokens.includes('canned') && /\bcanned|condensed|evaporated\b/.test(name)) score -= 820
    if (!queryTokens.includes('dried') && !queryTokens.includes('powder') && /\bdried|powder\b/.test(name)) score -= 760
    if (!queryTokens.includes('cultured') && /\bcultured\b/.test(name)) score -= 360
  }
  if (requestedCore.includes('coffee')) {
    if (/\bbeverages coffee\b/.test(name)) score += 650
    if (/\bbrewed|espresso|prepared with (?:tap )?water\b/.test(name)) score += 320
  }
  if (requestedCore.includes('egg') && /\begg whole raw fresh\b/.test(name)) score += 420
  if (requestedCore.includes('oat') && (rawNameTokens[0] === 'oats' || name === 'oats')) score += 520
  if (requestedCore.includes('rice')) {
    if (rawNameTokens[0] === 'rice') score += 260
    if (queryTokens.includes('cooked') && name.includes(' cooked')) score += 220
    if (!queryTokens.includes('noodle') && /\bnoodle|noodles\b/.test(name)) score -= 520
    if (/\buncle bens|tinkyada|cream of rice|pasta|sausage links\b/.test(name)) score -= 520
    if (/\brice, (?:white|brown), (?:long|medium|short)-grain\b/.test(name)) score += 160
  }
  if (requestedCore.includes('walnut')) {
    if (/\bnuts walnuts\b/.test(name)) score += 520
    if (/\bnuts walnuts english\b/.test(name)) score += 360
    if (!queryTokens.includes('roasted') && /\broasted\b/.test(name)) score -= 260
    if (!queryTokens.includes('salt') && /\bsalt|salted\b/.test(name)) score -= 360
    if (!queryTokens.includes('glazed') && /\bglazed\b/.test(name)) score -= 420
    if (!queryTokens.includes('oil') && /\boil\b/.test(name)) score -= 640
  }

  const requestedAllows = (words: string[]) => includesAny(queryTokens, words)
  const penalties: Array<[RegExp, number, string[]]> = [
    [/\bbabyfood|baby food\b/, -950, ['babyfood', 'baby']],
    [/\bcereal\b/, -520, ['cereal']],
    [/\bprepared with\b/, -360, ['prepared']],
    [/\bcheese\b/, -560, ['cheese']],
    [/\byogurt\b/, -480, ['yogurt']],
    [/\bchocolate|syrup\b/, -520, ['chocolate', 'syrup']],
    [/\bpotato|potatoes|custard|dessert|cake|cookie|pie\b/, -520, ['potato', 'custard', 'dessert', 'cake', 'cookie', 'pie']],
    [/\bdry|powder\b/, -360, ['dry', 'powder']],
    [/\bjuice|drink|beverage|nectar\b/, -600, ['juice', 'drink', 'beverage', 'nectar']],
    [/\boil\b/, -620, ['oil']],
    [/\bbran\b/, -300, ['bran']],
    [/\bflour\b/, -360, ['flour']],
  ]

  penalties.forEach(([pattern, penalty, allowedWords]) => {
    if (pattern.test(name) && !requestedAllows(allowedWords)) score += penalty
  })

  return score
}

export const sortPlainFoodResults = <T extends PlainFoodSearchItem>(
  list: T[],
  query: string,
  sourcePriority?: (item: T) => number,
) =>
  [...(Array.isArray(list) ? list : [])]
    .map((item, index) => ({
      item,
      index,
      score: scorePlainFoodSearchResult(item, query),
      source: sourcePriority ? sourcePriority(item) : 0,
      name: normalizeFoodSearchText(item?.name),
      brand: normalizeFoodSearchText(item?.brand),
      id: String(item?.id || ''),
    }))
    .sort((a, b) => (
      b.score - a.score ||
      a.source - b.source ||
      a.name.localeCompare(b.name) ||
      a.brand.localeCompare(b.brand) ||
      a.id.localeCompare(b.id) ||
      a.index - b.index
    ))
    .map((entry) => entry.item)
