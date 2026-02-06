import 'server-only'
import { prisma } from '@/lib/prisma'

export type CustomFoodMacro = {
  id?: string
  name: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sugar_g: number | null
  brand?: string | null
  country?: string | null
  kind?: 'SINGLE' | 'PACKAGED' | 'FAST_FOOD'
  aliases?: string[]
  servingOptions?: any[] | null
}

let cachedItems: CustomFoodMacro[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const singularizeToken = (value: string) => {
  const lower = value.toLowerCase()
  if (lower.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (
    lower.endsWith('es') &&
    value.length > 3 &&
    !lower.endsWith('ses') &&
    !lower.endsWith('xes') &&
    !lower.endsWith('zes') &&
    !lower.endsWith('ches') &&
    !lower.endsWith('shes')
  ) {
    return value.slice(0, -2)
  }
  if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss')) return value.slice(0, -1)
  return value
}

const getTokens = (value: string) => normalizeText(value).split(' ').filter(Boolean)

const isOneEditAway = (a: string, b: string) => {
  const lenA = a.length
  const lenB = b.length
  if (Math.abs(lenA - lenB) > 1) return false
  if (lenA === lenB) {
    let mismatches = 0
    for (let i = 0; i < lenA; i += 1) {
      if (a[i] !== b[i]) {
        mismatches += 1
        if (mismatches > 1) return false
      }
    }
    return mismatches <= 1
  }
  const shorter = lenA < lenB ? a : b
  const longer = lenA < lenB ? b : a
  let i = 0
  let j = 0
  let edits = 0
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    j += 1
  }
  return true
}

// Strip parentheses and their content to prevent synonym matching
const stripParentheses = (text: string) => {
  return text.replace(/\s*\([^)]*\)/g, '').trim()
}

const nameMatchesQuery = (name: string, query: string, options?: { allowTypo?: boolean }) => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return false

  // Strip parentheses from name to prevent matching via synonyms
  const nameWithoutParentheses = stripParentheses(name)
  const nameTokens = getTokens(nameWithoutParentheses)

  if (normalizedQuery.length === 1) {
    // Single letter: first word must start with it
    if (nameTokens.length === 0) return false
    const firstWord = nameTokens[0]
    return firstWord.startsWith(normalizedQuery)
  }

  const queryTokens = getTokens(query).filter((token) => token.length >= 2)
  const filteredNameTokens = nameTokens.filter((token) => token.length >= 1)
  if (queryTokens.length === 0 || filteredNameTokens.length === 0) return false

  // For single-word queries: FIRST word must match (strict prefix matching)
  if (queryTokens.length === 1) {
    const queryToken = queryTokens[0]
    const firstWord = filteredNameTokens[0]
    if (!firstWord) return false

    // Exact word match (egg = egg, eggs = eggs)
    if (firstWord === queryToken) return true
    
    // Singular/plural exact matches only (eggs = egg, but NOT eggs = eggplant)
    const firstWordSingular = singularizeToken(firstWord)
    const querySingular = singularizeToken(queryToken)
    
    // Exact singular match: "eggs" matches "egg" exactly, "egg" matches "eggs" exactly
    if (firstWordSingular === querySingular) {
      // Both are the same after singularization - this is an exact match
      return true
    }

    // Prefix match: first word must START with the FULL query token
    // This allows "egg" to match "eggplant" but NOT "eggs" to match "eggplant"
    // (because "eggplant" doesn't start with "eggs", only with "egg")
    if (firstWord.startsWith(queryToken)) return true

    // Typo tolerance: only if first letter matches and it's a prefix match
    const allowTypo = (options?.allowTypo ?? true) && queryToken.length >= 3 && queryToken[0] === firstWord[0]
    if (allowTypo) {
      const prefixSame = firstWord.slice(0, queryToken.length)
      if (prefixSame && isOneEditAway(queryToken, prefixSame)) return true
      const prefixLonger = firstWord.slice(0, queryToken.length + 1)
      if (prefixLonger && isOneEditAway(queryToken, prefixLonger)) return true
    }

    return false
  }

  // Multi-word queries: first query token must match first name word, then all tokens must match
  const firstQueryToken = queryTokens[0]
  const firstNameWord = filteredNameTokens[0]
  if (!firstNameWord) return false

  // First word must match first token
  const firstWordMatches = (() => {
    if (firstNameWord === firstQueryToken) return true
    const firstNameSingular = singularizeToken(firstNameWord)
    const firstQuerySingular = singularizeToken(firstQueryToken)
    if (firstNameSingular === firstQuerySingular) return true
    if (firstNameWord.startsWith(firstQueryToken)) return true
    if (firstNameSingular !== firstNameWord && firstNameSingular.startsWith(firstQueryToken)) return true
    if (firstQuerySingular !== firstQueryToken && firstNameWord.startsWith(firstQuerySingular)) return true
    return false
  })()

  if (!firstWordMatches) return false

  // All remaining query tokens must match somewhere in the name
  const remainingQueryTokens = queryTokens.slice(1)
  if (remainingQueryTokens.length === 0) return true

  const tokenMatches = (token: string, word: string) => {
    if (!token || !word) return false
    if (word.startsWith(token)) return true
    const singularWord = singularizeToken(word)
    if (singularWord !== word && singularWord.startsWith(token)) return true
    const singularToken = singularizeToken(token)
    if (singularToken !== token && word.startsWith(singularToken)) return true
    if (singularToken !== token && singularWord !== word && singularWord.startsWith(singularToken)) return true
    return false
  }

  return remainingQueryTokens.every((token) => filteredNameTokens.some((word) => tokenMatches(token, word)))
}

const loadCustomFoods = async () => {
  if (cachedItems && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cachedItems
  const rows = await prisma.customFoodItem.findMany()
  const items: CustomFoodMacro[] = rows.map((row) => {
    const servingOptions = Array.isArray(row.servingOptions) ? row.servingOptions : null
    return {
      id: row.id,
      name: row.name,
      brand: row.brand ?? null,
      country: row.country ?? null,
      kind: row.kind as CustomFoodMacro['kind'],
      calories: row.caloriesPer100g ?? null,
      protein_g: row.proteinPer100g ?? null,
      carbs_g: row.carbsPer100g ?? null,
      fat_g: row.fatPer100g ?? null,
      fiber_g: row.fiberPer100g ?? null,
      sugar_g: row.sugarPer100g ?? null,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      servingOptions,
    }
  })
  cachedItems = items
  cacheLoadedAt = Date.now()
  return items
}

export const searchCustomFoodMacros = async (
  query: string,
  limit = 10,
  options?: { allowTypo?: boolean; country?: string | null },
): Promise<CustomFoodMacro[]> => {
  const q = String(query || '').trim()
  if (!q) return []
  const matchCountry = String(options?.country || '').trim().toUpperCase()
  const allItems = (await loadCustomFoods()).filter((item) => item.kind === 'SINGLE' || !item.kind)
  const buildKey = (item: CustomFoodMacro) =>
    `${normalizeText(item.name)}|${normalizeText(item.brand || '')}`

  const items = (() => {
    if (!matchCountry) return allItems
    const exact = allItems.filter((item) => String(item.country || '').trim().toUpperCase() === matchCountry)
    if (exact.length === 0) {
      return allItems.filter((item) => {
        const itemCountry = String(item.country || '').trim().toUpperCase()
        return !itemCountry || itemCountry === matchCountry
      })
    }
    const exactKeys = new Set(exact.map(buildKey))
    const fallback = allItems.filter((item) => {
      const itemCountry = String(item.country || '').trim().toUpperCase()
      if (itemCountry && itemCountry !== matchCountry) return false
      if (!itemCountry) return !exactKeys.has(buildKey(item))
      return itemCountry === matchCountry
    })
    return [...exact, ...fallback]
  })()
  if (items.length === 0) return []

  const allowTypo = options?.allowTypo ?? true
  const matchesQuery = (item: CustomFoodMacro, strict: boolean) => {
    const allow = strict ? false : allowTypo
    if (nameMatchesQuery(item.name, q, { allowTypo: allow })) return true
    if (item.brand && nameMatchesQuery(`${item.brand} ${item.name}`, q, { allowTypo: allow })) return true
    const aliases = Array.isArray(item.aliases) ? item.aliases : []
    return aliases.some((alias) => nameMatchesQuery(String(alias || ''), q, { allowTypo: allow }))
  }

  const prefixMatches = items.filter((item) => matchesQuery(item, true))
  const base = prefixMatches.length > 0 || !allowTypo ? prefixMatches : items.filter((item) => matchesQuery(item, false))
  const matches = base.sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))
  if (matches.length === 0) return []
  return matches.slice(0, Math.max(1, limit))
}

export const getCustomPackagedItems = async (country?: string | null): Promise<CustomFoodMacro[]> => {
  const matchCountry = String(country || '').trim().toUpperCase()
  const allItems = (await loadCustomFoods()).filter(
    (item) => item.kind === 'PACKAGED' || item.kind === 'FAST_FOOD',
  )
  const buildKey = (item: CustomFoodMacro) =>
    `${normalizeText(item.name)}|${normalizeText(item.brand || '')}`

  if (!matchCountry) return allItems

  const exact = allItems.filter((item) => String(item.country || '').trim().toUpperCase() === matchCountry)
  if (exact.length === 0) {
    return allItems.filter((item) => {
      const itemCountry = String(item.country || '').trim().toUpperCase()
      return !itemCountry || itemCountry === matchCountry
    })
  }

  const exactKeys = new Set(exact.map(buildKey))
  const fallback = allItems.filter((item) => {
    const itemCountry = String(item.country || '').trim().toUpperCase()
    if (itemCountry && itemCountry !== matchCountry) return false
    // Anything with an exact country match is already in `exact` above.
    if (itemCountry === matchCountry) return false
    // For global items (no country), keep only those that don't duplicate an exact match.
    if (!itemCountry) return !exactKeys.has(buildKey(item))
    return false
  })

  return [...exact, ...fallback]
}
