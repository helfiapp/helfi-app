export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { searchOpenFoodFactsByQuery, searchUsdaFoods, searchFatSecretFoods, lookupFoodNutrition, searchLocalFoods } from '@/lib/food-data'
import { searchCustomFoodMacros } from '@/lib/food/custom-foods'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

let usdaHealthCache: { count: number | null; checkedAt: number } = { count: null, checkedAt: 0 }

// Lightweight read-only endpoint that proxies to external food databases
// and returns a normalized list of items in a format compatible with the
// Food Diary `items[]` structure (name, brand, serving_size, macros).
//
// Query parameters:
// - source: "openfoodfacts" | "usda" | "fatsecret" | "auto" (tries all with fallback)
// - q: search query (product name, brand, or keywords)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const source = (searchParams.get('source') || '').toLowerCase()
    const query = (searchParams.get('q') || '').trim()
    const kind = (searchParams.get('kind') || '').toLowerCase()
    const localOnly = searchParams.get('localOnly') === '1'
    const limitRaw = searchParams.get('limit')
    const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : NaN
    const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 50) : 20
    const kindMode = kind === 'packaged' ? 'packaged' : 'single'

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: q' },
        { status: 400 },
      )
    }

    let items: any[] = []
    let actualSource = source

    const normalizeForMatch = (value: any) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')

    const normalizeForCompact = (value: any) => normalizeForMatch(value).replace(/\s+/g, '')

    const sortByNameAsc = (list: any[]) =>
      [...list].sort((a, b) => normalizeForMatch(a?.name).localeCompare(normalizeForMatch(b?.name)))

    // "Alphabetical hierarchy" (Google-Maps-like feel):
    // 1) Prefer items whose FIRST word matches what you typed.
    // 2) Then prefer items where the matching word is closest (egg beats eggplant).
    // 3) If the match is in a later word (Black-eyed peas), sort by that word.
    const sortByAlphabeticalHierarchyAsc = (list: any[], searchQuery: string) => {
      const stableNameKey = (it: any) => normalizeForMatch(it?.name)
      const queryNorm = normalizeForMatch(searchQuery)
      const queryTokens = getSearchTokens(searchQuery)
      const queryFirstRaw = queryTokens[0] || queryNorm
      const queryFirst = singularizeToken(queryFirstRaw)
      const queryAlt = singularizeToken(queryFirstRaw)
      const queryCandidates = Array.from(new Set([queryFirstRaw, queryFirst, queryAlt].filter(Boolean)))
      const minCandidateLen = queryCandidates.length > 0 ? Math.min(...queryCandidates.map((t) => t.length)) : 0

      const getMatchMeta = (name: any) => {
        const normalizedName = normalizeForMatch(name)
        const nameTokens = getSearchTokens(String(name || ''))
        let matchIndex = Number.POSITIVE_INFINITY
        let matchedWord = ''
        let matchedCandidateLen = minCandidateLen || 0

        for (let i = 0; i < nameTokens.length; i += 1) {
          const word = nameTokens[i]
          if (!word) continue
          const wordSingular = singularizeToken(word)
          for (const candidate of queryCandidates) {
            if (!candidate) continue
            if (word.startsWith(candidate)) {
              matchIndex = i
              matchedWord = word
              matchedCandidateLen = candidate.length
              break
            }
            if (wordSingular && wordSingular !== word && wordSingular.startsWith(candidate)) {
              matchIndex = i
              matchedWord = wordSingular
              matchedCandidateLen = candidate.length
              break
            }
          }
          if (matchIndex !== Number.POSITIVE_INFINITY) break
        }

        const isFirstWordMatch = matchIndex === 0
        const exactWordMatch = queryCandidates.some((c) => c === matchedWord || c === singularizeToken(matchedWord))
        const wordDelta = matchedWord ? Math.max(0, matchedWord.length - matchedCandidateLen) : 999
        const hierarchyKey = matchedWord ? `${matchedWord} ${normalizedName}` : normalizedName

        return { matchIndex, isFirstWordMatch, exactWordMatch, wordDelta, hierarchyKey, stable: normalizedName }
      }

      return [...list].sort((a, b) => {
        const aMeta = getMatchMeta(a?.name)
        const bMeta = getMatchMeta(b?.name)

        // 1) First-word matches should always win (E.g. "Eggplant" before "Aubergine (eggplant)").
        if (aMeta.isFirstWordMatch !== bMeta.isFirstWordMatch) return aMeta.isFirstWordMatch ? -1 : 1

        // 2) Earlier word match wins (if both are non-first).
        if (aMeta.matchIndex !== bMeta.matchIndex) return aMeta.matchIndex - bMeta.matchIndex

        // 3) Exact word match wins ("egg" beats "eggplant").
        if (aMeta.exactWordMatch !== bMeta.exactWordMatch) return aMeta.exactWordMatch ? -1 : 1

        // 4) Closer match wins (shorter extension after the typed prefix).
        if (aMeta.wordDelta !== bMeta.wordDelta) return aMeta.wordDelta - bMeta.wordDelta

        // 5) Alphabetical within the hierarchy.
        return aMeta.hierarchyKey.localeCompare(bMeta.hierarchyKey) || aMeta.stable.localeCompare(bMeta.stable)
      })
    }

    // Alphabetical hierarchy for packaged foods (considers brand + name)
    const sortPackagedByAlphabeticalHierarchyAsc = (list: any[], searchQuery: string) => {
      const queryNorm = normalizeForMatch(searchQuery)
      const queryTokens = getSearchTokens(searchQuery)
      const queryFirstRaw = queryTokens[0] || queryNorm
      const queryFirst = singularizeToken(queryFirstRaw)
      const queryAlt = singularizeToken(queryFirstRaw)
      const queryCandidates = Array.from(new Set([queryFirstRaw, queryFirst, queryAlt].filter(Boolean)))
      const minCandidateLen = queryCandidates.length > 0 ? Math.min(...queryCandidates.map((t) => t.length)) : 0

      const getMatchMeta = (item: any) => {
        // For packaged foods, consider both brand and name
        const brand = String(item?.brand || '').trim()
        const name = String(item?.name || '').trim()
        const combined = [brand, name].filter(Boolean).join(' ')
        const normalizedCombined = normalizeForMatch(combined)
        const combinedTokens = getSearchTokens(combined)
        
        let matchIndex = Number.POSITIVE_INFINITY
        let matchedWord = ''
        let matchedCandidateLen = minCandidateLen || 0
        let isBrandMatch = false

        // Check brand first, then name
        const brandTokens = brand ? getSearchTokens(brand) : []
        const nameTokens = name ? getSearchTokens(name) : []
        
        // Calculate simplicity score: fewer words in product name = simpler = better
        const simplicityScore = nameTokens.length // Lower is better
        
        // Check brand tokens first
        for (let i = 0; i < brandTokens.length; i += 1) {
          const word = brandTokens[i]
          if (!word) continue
          const wordSingular = singularizeToken(word)
          for (const candidate of queryCandidates) {
            if (!candidate) continue
            if (word.startsWith(candidate)) {
              matchIndex = i
              matchedWord = word
              matchedCandidateLen = candidate.length
              isBrandMatch = true
              break
            }
            if (wordSingular && wordSingular !== word && wordSingular.startsWith(candidate)) {
              matchIndex = i
              matchedWord = wordSingular
              matchedCandidateLen = candidate.length
              isBrandMatch = true
              break
            }
          }
          if (matchIndex !== Number.POSITIVE_INFINITY) break
        }

        // If no brand match, check name tokens
        if (matchIndex === Number.POSITIVE_INFINITY) {
          const nameStartIndex = brandTokens.length
          for (let i = 0; i < nameTokens.length; i += 1) {
            const word = nameTokens[i]
            if (!word) continue
            const wordSingular = singularizeToken(word)
            for (const candidate of queryCandidates) {
              if (!candidate) continue
              if (word.startsWith(candidate)) {
                matchIndex = nameStartIndex + i
                matchedWord = word
                matchedCandidateLen = candidate.length
                break
              }
              if (wordSingular && wordSingular !== word && wordSingular.startsWith(candidate)) {
                matchIndex = nameStartIndex + i
                matchedWord = wordSingular
                matchedCandidateLen = candidate.length
                break
              }
            }
            if (matchIndex !== Number.POSITIVE_INFINITY) break
          }
        }

        const isFirstWordMatch = matchIndex === 0
        const exactWordMatch = queryCandidates.some((c) => c === matchedWord || c === singularizeToken(matchedWord))
        const wordDelta = matchedWord ? Math.max(0, matchedWord.length - matchedCandidateLen) : 999
        const hierarchyKey = matchedWord ? `${matchedWord} ${normalizedCombined}` : normalizedCombined

        return { matchIndex, isFirstWordMatch, exactWordMatch, wordDelta, hierarchyKey, stable: normalizedCombined, isBrandMatch, simplicityScore }
      }

      return [...list].sort((a, b) => {
        const aMeta = getMatchMeta(a)
        const bMeta = getMatchMeta(b)

        // 1) First-word matches should always win
        if (aMeta.isFirstWordMatch !== bMeta.isFirstWordMatch) return aMeta.isFirstWordMatch ? -1 : 1

        // 2) Brand matches come before name matches (if both are first word)
        if (aMeta.isFirstWordMatch && bMeta.isFirstWordMatch) {
          if (aMeta.isBrandMatch !== bMeta.isBrandMatch) return aMeta.isBrandMatch ? -1 : 1
        }

        // 3) Earlier word match wins (if both are non-first)
        if (aMeta.matchIndex !== bMeta.matchIndex) return aMeta.matchIndex - bMeta.matchIndex

        // 4) Exact word match wins
        if (aMeta.exactWordMatch !== bMeta.exactWordMatch) return aMeta.exactWordMatch ? -1 : 1

        // 5) Simpler names win (fewer words in product name)
        if (aMeta.simplicityScore !== bMeta.simplicityScore) return aMeta.simplicityScore - bMeta.simplicityScore

        // 6) Closer match wins (shorter extension after the typed prefix)
        if (aMeta.wordDelta !== bMeta.wordDelta) return aMeta.wordDelta - bMeta.wordDelta

        // 7) Alphabetical within the hierarchy
        return aMeta.hierarchyKey.localeCompare(bMeta.hierarchyKey) || aMeta.stable.localeCompare(bMeta.stable)
      })
    }

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

    const getSearchTokens = (value: string) => normalizeForMatch(value).split(' ').filter(Boolean)

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

    const DESCRIPTOR_TOKENS = new Set([
      'raw',
      'fresh',
      'cooked',
      'uncooked',
      'frozen',
      'pasteurized',
      'pasteurised',
      'boiled',
      'baked',
      'roasted',
      'fried',
      'grilled',
      'steamed',
      'sauteed',
      'smoked',
      'dried',
    ])

    // Strip parentheses and their content to prevent synonym matching
    const stripParentheses = (text: string) => {
      return text.replace(/\s*\([^)]*\)/g, '').trim()
    }

    const nameMatchesSearchQuery = (name: string, searchQuery: string, options?: { allowTypo?: boolean }) => {
      const normalizedQuery = normalizeForMatch(searchQuery)
      if (!normalizedQuery) return false

      // Strip parentheses from name to prevent matching via synonyms
      const nameWithoutParentheses = stripParentheses(name)
      const nameTokens = getSearchTokens(nameWithoutParentheses)
      
      if (normalizedQuery.length === 1) {
        // Single letter: first word must start with it
        if (nameTokens.length === 0) return false
        const firstWord = nameTokens[0]
        return firstWord.startsWith(normalizedQuery)
      }

      const rawTokens = getSearchTokens(searchQuery).filter((token) => token.length >= 2)
      const filteredTokens = rawTokens.filter((token) => !DESCRIPTOR_TOKENS.has(token))
      const queryTokens = filteredTokens.length > 0 ? filteredTokens : rawTokens
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

    const filterItemsByQuery = (
      items: any[],
      searchQuery: string,
      getText: (item: any) => string,
      allowTypoFallback = true,
    ) => {
      if (!Array.isArray(items) || items.length === 0) return []
      
      // For packaged foods, be more lenient - allow partial matches
      const isPackaged = kindMode === 'packaged'
      
      if (isPackaged) {
        // For packaged foods, check if query tokens appear anywhere in brand+name
        const queryTokens = getSearchTokens(searchQuery).filter((t) => t.length >= 2)
        if (queryTokens.length > 0) {
          const matches = items.filter((item) => {
            const text = getText(item)
            const normalizedText = normalizeForMatch(text)
            // Check if all query tokens appear in the text (more lenient for packaged)
            return queryTokens.every((token) => normalizedText.includes(token))
          })
          if (matches.length > 0) return matches
        }
      }
      
      const prefixMatches = items.filter((item) => nameMatchesSearchQuery(getText(item), searchQuery, { allowTypo: false }))
      if (prefixMatches.length > 0) return prefixMatches
      if (!allowTypoFallback) return []
      return items.filter((item) => nameMatchesSearchQuery(getText(item), searchQuery, { allowTypo: true }))
    }

    type CustomPackagedItem = {
      id: string
      name: string
      brand?: string | null
      serving_size?: string | null
      calories?: number | null
      protein_g?: number | null
      carbs_g?: number | null
      fat_g?: number | null
      fiber_g?: number | null
      sugar_g?: number | null
      source: 'openfoodfacts' | 'usda' | 'fatsecret'
      aliases?: string[]
    }

    // Parse CSV line handling quoted fields
    const parseCsvLine = (line: string): string[] => {
      const cells: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          const next = line[i + 1]
          if (inQuotes && next === '"') {
            current += '"'
            i += 1
            continue
          }
          inQuotes = !inQuotes
          continue
        }
        if (ch === ',' && !inQuotes) {
          cells.push(current)
          current = ''
          continue
        }
        current += ch
      }
      cells.push(current)
      return cells.map((cell) => cell.trim())
    }

    // Load fast food items from CSV
    const loadBeverageItems = (): CustomPackagedItem[] => {
      const beverageFile = path.join(process.cwd(), 'data', 'food-overrides', 'beverages_macros.csv')
      if (!fs.existsSync(beverageFile)) return []
      
      try {
        const content = fs.readFileSync(beverageFile, 'utf8')
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
        if (lines.length < 2) return []
        
        const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
        const foodIndex = headers.indexOf('food')
        const caloriesIndex = headers.indexOf('per_100g_kcal')
        const proteinIndex = headers.indexOf('protein_g')
        const carbsIndex = headers.indexOf('carbs_g')
        const fatIndex = headers.indexOf('fat_g')
        const fiberIndex = headers.indexOf('fibre_g') >= 0 ? headers.indexOf('fibre_g') : headers.indexOf('fiber_g')
        const sugarIndex = headers.indexOf('sugar_g')
        
        if (foodIndex < 0 || caloriesIndex < 0 || proteinIndex < 0 || carbsIndex < 0 || fatIndex < 0) return []
        
        const items: CustomPackagedItem[] = []
        for (let i = 1; i < lines.length; i++) {
          const cells = parseCsvLine(lines[i])
          const name = cells[foodIndex] || ''
          if (!name) continue
          
          const calories = Number(cells[caloriesIndex])
          const protein = Number(cells[proteinIndex])
          const carbs = Number(cells[carbsIndex])
          const fat = Number(cells[fatIndex])
          const fiber = fiberIndex >= 0 ? Number(cells[fiberIndex] || 0) : 0
          const sugar = sugarIndex >= 0 ? Number(cells[sugarIndex] || 0) : 0
          
          if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) continue
          
          // Extract brand from name if present (e.g., "Coke Zero (Coca-Cola)" -> brand: "Coca-Cola")
          const brandMatch = name.match(/\(([^)]+)\)$/)
          const brand = brandMatch ? brandMatch[1] : null
          const cleanName = brandMatch ? name.replace(/\s*\([^)]+\)$/, '').trim() : name
          
          // Beverages are typically 100ml servings, but we'll use 250ml (standard can/bottle) as default
          const servingSizeGrams = 250 // 250ml = 250g for water-based beverages
          const multiplier = servingSizeGrams / 100
          
          items.push({
            id: `custom:beverage-${normalizeForCompact(name)}`,
            name: cleanName,
            brand: brand,
            serving_size: `1 serve (${servingSizeGrams} ml)`,
            calories: Math.round(calories * multiplier),
            protein_g: Math.round(protein * multiplier * 10) / 10,
            carbs_g: Math.round(carbs * multiplier * 10) / 10,
            fat_g: Math.round(fat * multiplier * 10) / 10,
            fiber_g: fiber > 0 ? Math.round(fiber * multiplier * 10) / 10 : null,
            sugar_g: sugar > 0 ? Math.round(sugar * multiplier * 10) / 10 : null,
            source: 'openfoodfacts',
            aliases: [],
          })
        }
        return items
      } catch (err) {
        console.warn('Failed to load beverage items:', err)
        return []
      }
    }

    const loadFastFoodItems = (): CustomPackagedItem[] => {
      const fastFoodFile = path.join(process.cwd(), 'data', 'food-overrides', 'fast_food_macros.csv')
      if (!fs.existsSync(fastFoodFile)) return []
      
      try {
        const content = fs.readFileSync(fastFoodFile, 'utf8')
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
        if (lines.length < 2) return []
        
        const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
        const foodIndex = headers.indexOf('food')
        const caloriesIndex = headers.indexOf('per_100g_kcal')
        const proteinIndex = headers.indexOf('protein_g')
        const carbsIndex = headers.indexOf('carbs_g')
        const fatIndex = headers.indexOf('fat_g')
        const fiberIndex = headers.indexOf('fibre_g') >= 0 ? headers.indexOf('fibre_g') : headers.indexOf('fiber_g')
        const sugarIndex = headers.indexOf('sugar_g')
        
        if (foodIndex < 0 || caloriesIndex < 0 || proteinIndex < 0 || carbsIndex < 0 || fatIndex < 0) return []
        
        const items: CustomPackagedItem[] = []
        for (let i = 1; i < lines.length; i++) {
          const cells = parseCsvLine(lines[i])
          const name = cells[foodIndex] || ''
          if (!name) continue
          
          const calories = Number(cells[caloriesIndex])
          const protein = Number(cells[proteinIndex])
          const carbs = Number(cells[carbsIndex])
          const fat = Number(cells[fatIndex])
          const fiber = fiberIndex >= 0 ? Number(cells[fiberIndex] || 0) : 0
          const sugar = sugarIndex >= 0 ? Number(cells[sugarIndex] || 0) : 0
          
          if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) continue
          
          // Extract brand from name if present (e.g., "Big Mac (McDonald's)" -> brand: "McDonald's")
          const brandMatch = name.match(/\(([^)]+)\)$/)
          const brand = brandMatch ? brandMatch[1] : null
          const cleanName = brandMatch ? name.replace(/\s*\([^)]+\)$/, '').trim() : name
          
          // Define typical serving sizes (in grams) for common items
          // If not specified, default to 100g
          const getServingSize = (itemName: string): { sizeGrams: number; servingLabel: string } => {
            const lowerName = itemName.toLowerCase()
            
            // Meals
            if (lowerName.includes('mcsmart meal')) return { sizeGrams: 490, servingLabel: '1 meal' }
            if (lowerName.includes('fish & chips') || lowerName.includes('fish and chips')) return { sizeGrams: 400, servingLabel: '1 serve' }
            
            // Burgers
            if (lowerName.includes('big mac')) return { sizeGrams: 215, servingLabel: '1 burger' }
            if (lowerName.includes('quarter pounder')) return { sizeGrams: 200, servingLabel: '1 burger' }
            if (lowerName.includes('cheeseburger') && !lowerName.includes('double')) return { sizeGrams: 119, servingLabel: '1 burger' }
            if (lowerName.includes('hamburger') && !lowerName.includes('double')) return { sizeGrams: 105, servingLabel: '1 burger' }
            if (lowerName.includes('mcdouble')) return { sizeGrams: 155, servingLabel: '1 burger' }
            if (lowerName.includes('mcdouble')) return { sizeGrams: 155, servingLabel: '1 burger' }
            
            // Fish items
            if (lowerName.includes('battered') && (lowerName.includes('fish') || lowerName.includes('flake') || lowerName.includes('snapper') || lowerName.includes('cod') || lowerName.includes('barramundi') || lowerName.includes('flathead'))) {
              return { sizeGrams: 150, servingLabel: '1 piece' }
            }
            if (lowerName.includes('filet-o-fish')) return { sizeGrams: 142, servingLabel: '1 burger' }
            
            // Chicken items
            if (lowerName.includes('mcnuggets')) return { sizeGrams: 100, servingLabel: '4 pieces' }
            if (lowerName.includes('mccrispy')) return { sizeGrams: 200, servingLabel: '1 sandwich' }
            if (lowerName.includes('mcchicken')) return { sizeGrams: 153, servingLabel: '1 sandwich' }
            
            // Sides
            if (lowerName.includes('french fries') || lowerName.includes('chips')) {
              if (lowerName.includes('small')) return { sizeGrams: 80, servingLabel: '1 small' }
              if (lowerName.includes('medium')) return { sizeGrams: 110, servingLabel: '1 medium' }
              if (lowerName.includes('large')) return { sizeGrams: 150, servingLabel: '1 large' }
              return { sizeGrams: 100, servingLabel: '1 serve' }
            }
            if (lowerName.includes('hash brown')) return { sizeGrams: 52, servingLabel: '1 piece' }
            if (lowerName.includes('apple pie')) return { sizeGrams: 80, servingLabel: '1 pie' }
            
            // Desserts
            if (lowerName.includes('mcflurry')) return { sizeGrams: 360, servingLabel: '1 regular' }
            
            // Fish & chip shop items
            if (lowerName.includes('dim sim')) return { sizeGrams: 50, servingLabel: '1 piece' }
            if (lowerName.includes('potato cake') || lowerName.includes('potato scallop')) return { sizeGrams: 75, servingLabel: '1 piece' }
            if (lowerName.includes('calamari rings')) return { sizeGrams: 100, servingLabel: '1 serve' }
            if (lowerName.includes('scallops') && lowerName.includes('battered')) return { sizeGrams: 100, servingLabel: '1 serve' }
            if (lowerName.includes('prawns') && lowerName.includes('battered')) return { sizeGrams: 100, servingLabel: '1 serve' }
            if (lowerName.includes('fish cake')) return { sizeGrams: 100, servingLabel: '1 piece' }
            if (lowerName.includes('chiko roll')) return { sizeGrams: 160, servingLabel: '1 roll' }
            if (lowerName.includes('spring roll')) return { sizeGrams: 50, servingLabel: '1 roll' }
            if (lowerName.includes('corn jack')) return { sizeGrams: 100, servingLabel: '1 piece' }
            if (lowerName.includes('onion rings')) return { sizeGrams: 91, servingLabel: '1 small serve' }
            if (lowerName.includes('mushy peas')) return { sizeGrams: 100, servingLabel: '1 serve' }
            if (lowerName.includes('curry sauce') || lowerName.includes('gravy') || lowerName.includes('tartare sauce')) return { sizeGrams: 50, servingLabel: '1 serve' }
            
            // Default to 100g
            return { sizeGrams: 100, servingLabel: '100 g' }
          }
          
          const servingInfo = getServingSize(name)
          const multiplier = servingInfo.sizeGrams / 100
          
          // Format serving size to include weight so modal can parse it correctly
          // Format: "1 meal (616 g)" or "1 burger (215 g)" etc.
          const servingSizeLabel = servingInfo.sizeGrams !== 100 
            ? `${servingInfo.servingLabel} (${servingInfo.sizeGrams} g)`
            : servingInfo.servingLabel
          
          // Add aliases for better matching
          const aliases: string[] = []
          if (cleanName.toLowerCase().includes('flake')) {
            aliases.push('flake', 'fish and chip shop flake', 'fish & chip shop flake')
          }
          if (cleanName.toLowerCase().includes('mcsmart')) {
            aliases.push('mcsmart', 'mc smart')
          }
          
          items.push({
            id: `custom:fast-food-${normalizeForCompact(name)}`,
            name: cleanName,
            brand: brand,
            serving_size: servingSizeLabel,
            calories: Math.round(calories * multiplier),
            protein_g: Math.round(protein * multiplier * 10) / 10,
            carbs_g: Math.round(carbs * multiplier * 10) / 10,
            fat_g: Math.round(fat * multiplier * 10) / 10,
            fiber_g: fiber > 0 ? Math.round(fiber * multiplier * 10) / 10 : null,
            sugar_g: sugar > 0 ? Math.round(sugar * multiplier * 10) / 10 : null,
            source: 'openfoodfacts',
            aliases: aliases,
          })
        }
        return items
      } catch (err) {
        console.warn('Failed to load fast food items:', err)
        return []
      }
    }

    const CUSTOM_PACKAGED_ITEMS: CustomPackagedItem[] = [
      {
        id: 'custom:burger-with-the-lot',
        name: 'Burger with the lot (fish & chip shop)',
        brand: null,
        serving_size: '1 burger',
        calories: 950,
        protein_g: 44,
        carbs_g: 72,
        fat_g: 62,
        fiber_g: 6.5,
        sugar_g: 16,
        source: 'openfoodfacts',
        aliases: ['burger with the lot', 'burger with lot', 'fish and chip shop burger', 'fish & chip shop burger'],
      },
      ...loadBeverageItems(),
      ...loadFastFoodItems(),
    ]

    const getCustomPackagedMatches = (value: string) => {
      if (!value) return []
      
      // For packaged foods, be more lenient - check if query tokens appear in name or brand+name
      const queryTokens = getSearchTokens(value).filter((t) => t.length >= 2)
      const normalizedQuery = normalizeForMatch(value)
      
      const buildMatches = (allowTypo: boolean) =>
        CUSTOM_PACKAGED_ITEMS.filter((item) => {
          const name = item.name || ''
          const brand = item.brand || ''
          const brandName = brand ? `${brand} ${name}` : name
          const normalizedBrandName = normalizeForMatch(brandName)
          const normalizedName = normalizeForMatch(name)
          const normalizedBrand = normalizeForMatch(brand)
          
          // For multi-word queries, check if all tokens appear somewhere (more lenient)
          if (queryTokens.length > 1) {
            const allTokensMatch = queryTokens.every((token) => 
              normalizedBrandName.includes(token) || 
              normalizedName.includes(token) ||
              (brand && normalizedBrand.includes(token))
            )
            if (allTokensMatch) return true
          }
          
          // Check name
          if (nameMatchesSearchQuery(name, value, { allowTypo })) return true
          // Check brand + name combination
          if (brandName && nameMatchesSearchQuery(brandName, value, { allowTypo })) return true
          // Check brand alone (if query matches brand)
          if (brand && normalizedBrand.includes(normalizedQuery)) return true
          // Check aliases
          const aliases = Array.isArray(item.aliases) ? item.aliases : []
          return aliases.some((alias) => nameMatchesSearchQuery(alias, value, { allowTypo }))
        })
      const prefixMatches = buildMatches(false)
      const matches = prefixMatches.length > 0 ? prefixMatches : buildMatches(true)
      return matches.map((item) => {
        const { aliases, ...rest } = item
        return rest
      })
    }

    const queryNorm = normalizeForMatch(query)
    const queryCompact = normalizeForCompact(query)
    const queryTokens = queryNorm ? queryNorm.split(' ').filter(Boolean) : []
    const queryTokensNormalized = queryTokens.map((token) => singularizeToken(token))
    const queryFirstToken = queryTokens[0] || ''
    const customPackagedMatches = kindMode === 'packaged' ? getCustomPackagedMatches(query) : []
    let customPackagedApplied = false

    const toCustomFoodItems = (value: string, options?: { allowTypo?: boolean }) => {
      if (kindMode !== 'single') return []
      const matches = searchCustomFoodMacros(value, limit, options)
      if (!matches.length) return []
      const items = matches.map((item) => ({
        source: 'usda' as const,
        id: `custom:${normalizeForCompact(item.name) || normalizeForMatch(item.name)}`,
        name: item.name,
        brand: null,
        serving_size: '100 g',
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        sugar_g: item.sugar_g,
        __custom: true,
      }))
      return items
    }

    const buildSingleFoodResults = async (value: string) => {
      const customPrefix = toCustomFoodItems(value, { allowTypo: false })

      // For single foods: only use foundation and legacy (simple foods), NOT branded (product foods)
      // Branded/product foods should only appear for packaged searches
      const [foundation, legacy] = await Promise.all([
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_foundation'] }),
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_sr_legacy'] }),
      ])

      const combinedMain = [...foundation, ...legacy]
      const dedupe = (list: any[]) => {
        const seen = new Set<string>()
        return list.filter((item) => {
          const key = `${normalizeForMatch(item?.name)}|${normalizeForMatch(item?.brand)}`
          if (!key || key === '|') return false
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }

      const mainDeduped = dedupe(combinedMain)

      const mainPrefix = filterItemsByQuery(mainDeduped, value, (item) => item?.name || '', false)

      const hasPrefixMatches = customPrefix.length > 0 || mainPrefix.length > 0

      const customFinal = hasPrefixMatches ? customPrefix : toCustomFoodItems(value, { allowTypo: true })
      const mainFinal = hasPrefixMatches
        ? mainPrefix
        : filterItemsByQuery(mainDeduped, value, (item) => item?.name || '', true)

      const sortedCustom = sortByAlphabeticalHierarchyAsc(customFinal, value)
      const sortedMain = sortByAlphabeticalHierarchyAsc(mainFinal, value)

      const combined: any[] = []
      const pushGroup = (group: any[]) => {
        for (const item of group) {
          if (combined.length >= limit) return
          combined.push(item)
        }
      }

      // Custom list first, then simple foods (foundation + legacy)
      // Branded/product foods are excluded from single food searches
      pushGroup(sortedCustom)
      pushGroup(sortedMain)

      return combined
    }

    const hasMacroData = (item: any) => {
      if (!item) return false
      const calories = item?.calories
      const protein = item?.protein_g
      const carbs = item?.carbs_g
      const fat = item?.fat_g
      const hasCalories = calories !== null && calories !== undefined && Number.isFinite(Number(calories))
      const hasProtein = protein !== null && protein !== undefined && Number.isFinite(Number(protein))
      const hasCarbs = carbs !== null && carbs !== undefined && Number.isFinite(Number(carbs))
      const hasFat = fat !== null && fat !== undefined && Number.isFinite(Number(fat))
      return hasCalories && hasProtein && hasCarbs && hasFat
    }

    const scoreNameMatch = (name: any) => {
      if (!queryNorm) return 0
      const n = normalizeForMatch(name)
      const nCompact = normalizeForCompact(name)
      if (!n) return 0
      if (nCompact === queryCompact) return 1200
      if (nCompact.startsWith(queryCompact)) return 1000
      if (n === queryNorm) return 900
      if (n.startsWith(queryNorm)) return 750
      if (nCompact.includes(queryCompact)) return 600
      if (n.includes(queryNorm)) return 500
      const nameTokens = n.split(' ').filter(Boolean)
      const scoredTokens = queryTokensNormalized.filter((token) => token.length >= 2)
      const coreTokens = scoredTokens.filter((token) => !DESCRIPTOR_TOKENS.has(token))
      if (scoredTokens.length > 0) {
        const exactMatches = new Set<string>()
        const prefixMatches = new Set<string>()
        for (const token of scoredTokens) {
          if (nameTokens.includes(token)) {
            exactMatches.add(token)
            continue
          }
          if (nameTokens.some((word) => word.startsWith(token))) {
            prefixMatches.add(token)
          }
        }
        if (exactMatches.size > 0) return 520 + exactMatches.size * 120
        if (prefixMatches.size > 0) {
          let score = 360 + prefixMatches.size * 40
          if (coreTokens.length > 0) {
            const exactCoreMatches = coreTokens.filter((token) => nameTokens.includes(token))
            if (exactCoreMatches.length === 0) score -= 200
          }
          return score
        }
      }
      if (queryTokens.length > 0) {
        const hitCount = queryTokens.filter((t) => n.includes(t)).length
        if (hitCount === queryTokens.length) return 420
        return hitCount * 40
      }
      return 0
    }

    const scoreItemName = (it: any) => {
      const combined = [it?.brand, it?.name].filter(Boolean).join(' ').trim()
      let score = scoreNameMatch(combined || it?.name)
      if (kindMode === 'single') {
        score += it?.brand ? -40 : 120
      } else if (it?.brand) {
        score += 40
      }
      const nameNorm = normalizeForMatch(it?.name)
      if (nameNorm) score += Math.max(0, 80 - Math.min(80, nameNorm.length))
      const brandToken = normalizeForMatch(queryFirstToken)
      if (brandToken) {
        const brand = normalizeForMatch(it?.brand)
        const name = normalizeForMatch(it?.name)
        if (brand && brand === brandToken) score += 220
        if (brand && brand.startsWith(brandToken)) score += 180
        if (name && name.startsWith(brandToken)) score += 160
        if (brand && name && name.startsWith(brand)) score += 120
      }
      return score
    }

    const cleanSingleFoodQuery = (value: string) =>
      value
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const buildSingleFoodFallbacks = (value: string) => {
      const original = value.trim()
      if (!original) return []
      const cleaned = cleanSingleFoodQuery(original)
      const candidates = new Set<string>()
      if (cleaned && cleaned.toLowerCase() !== original.toLowerCase()) candidates.add(cleaned)

      const parts = cleaned.split(' ').filter(Boolean)
      if (parts.length > 0) {
        const last = parts[parts.length - 1]
        const singular = singularizeToken(last)
        if (singular && singular !== last) {
          const updated = [...parts]
          updated[updated.length - 1] = singular
          candidates.add(updated.join(' '))
        }
        const base = parts.join(' ')
        const raw = `${base} raw`
        const rawComma = `${base}, raw`
        const cooked = `${base} cooked`
        const cookedComma = `${base}, cooked`
        candidates.add(raw)
        candidates.add(rawComma)
        candidates.add(cooked)
        candidates.add(cookedComma)
      }

      return Array.from(candidates).filter((q) => q.toLowerCase() !== original.toLowerCase())
    }

    // LOCKED: Single-food search must use the local USDA library (foodLibraryItem) only.
    // Do not swap back to the external USDA API. See GUARD_RAILS.md for restore steps.
    const checkUsdaLibraryHealth = async () => {
      const now = Date.now()
      if (now - usdaHealthCache.checkedAt < 10 * 60 * 1000 && usdaHealthCache.count != null) return usdaHealthCache.count
      const count = await prisma.foodLibraryItem.count({ where: { source: { in: ['usda_foundation', 'usda_sr_legacy', 'usda_branded'] } } })
      usdaHealthCache = { count, checkedAt: now }
      return count
    }

    const searchUsdaSingleFood = async (value: string) => {
      const sources = ['usda_foundation', 'usda_sr_legacy', 'usda_branded']
      const attempt = async (q: string) => {
        if (!q) return []
        return await searchLocalFoods(q, { pageSize: limit, sources })
      }

      const primary = await attempt(value)
      if (primary.length > 0) return primary

      const fallbacks = buildSingleFoodFallbacks(value)
      for (const fallback of fallbacks) {
        const next = await attempt(fallback)
        if (next.length > 0) return next
      }

      const libraryCount = await checkUsdaLibraryHealth()
      if (libraryCount < 100000) {
        console.warn(`USDA library looks thin (${libraryCount} rows). Consider re-importing USDA data.`)
      }
      // As a last resort, hit USDA API so users still get results if the local library is empty.
      const remote = await searchUsdaFoods(value, { pageSize: limit, dataType: 'generic' })
      if (remote.length > 0) return remote
      for (const fallback of fallbacks) {
        const remoteNext = await searchUsdaFoods(fallback, { pageSize: limit, dataType: 'generic' })
        if (remoteNext.length > 0) return remoteNext
      }
      return []
    }

    const searchLocalPreferred = async (value: string, resolvedKind: 'packaged' | 'single') => {
      if (!value) return []
      if (resolvedKind === 'packaged') {
        const localPackaged = await searchLocalFoods(value, { pageSize: limit, sources: ['usda_branded'], mode: 'prefix' })
        return sortPackagedByAlphabeticalHierarchyAsc(localPackaged, value).slice(0, limit)
      }
      const [foundation, legacy, branded] = await Promise.all([
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_foundation'] }),
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_sr_legacy'] }),
        searchLocalFoods(value, { pageSize: limit, sources: ['usda_branded'] }),
      ])

      const combined = [...foundation, ...legacy, ...branded]
      const seen = new Set<string>()
      const deduped = combined.filter((item) => {
        const key = `${normalizeForMatch(item?.name)}|${normalizeForMatch(item?.brand)}`
        if (!key || key === '|') return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const filtered = filterItemsByQuery(deduped, value, (item) => item?.name || '')
      return sortByNameAsc(filtered).slice(0, limit)
    }

    if (source === 'auto' || !source) {
      const resolvedKind = kind === 'packaged' ? 'packaged' : 'single'

      const scoredServing = (serving: string | null | undefined, calories?: number | null) => {
        const s = (serving || '').toLowerCase()
        if (!s) return 0
        let score = 1
        // Prefer real package servings over "100 g" defaults.
        if (s.includes('100 g') || s.includes('100g')) score -= isMealQuery ? 8 : 5
        if (s.includes('serving')) score += 2
        if (
          s.includes('piece') ||
          s.includes('biscuit') ||
          s.includes('cookie') ||
          s.includes('slice') ||
          s.includes('pack') ||
          s.includes('packet') ||
          s.includes('each')
        ) {
          score += 3
        }
        if (isMealQuery) {
          if (
            s.includes('kebab') ||
            s.includes('kebap') ||
            s.includes('shawarma') ||
            s.includes('doner') ||
            s.includes('gyro') ||
            s.includes('burger') ||
            s.includes('wrap') ||
            s.includes('burrito') ||
            s.includes('taco') ||
            s.includes('pizza') ||
            s.includes('sandwich') ||
            s.includes('roll') ||
            s.includes('sub') ||
            s.includes('pita')
          ) {
            score += 4
          }
          const cal = Number(calories)
          if (Number.isFinite(cal)) {
            if (cal >= 250 && cal <= 1200) score += 3
            if (cal > 0 && cal < 150) score -= 5
          }
        }
        return score
      }

      const parseServingGrams = (serving: any) => {
        const raw = String(serving || '').toLowerCase()
        const match = raw.match(/(\d+(?:\.\d+)?)\s*g\b/)
        if (!match) return null
        const grams = Number(match[1])
        return Number.isFinite(grams) ? grams : null
      }

      const mealKeywords = [
        'kebab',
        'kebap',
        'shawarma',
        'doner',
        'gyro',
        'burger',
        'wrap',
        'burrito',
        'taco',
        'pizza',
        'sandwich',
        'roll',
        'sub',
        'pita',
        'meal',
        'combo',
      ]
      const isMealQuery = queryTokensNormalized.some((token) => mealKeywords.includes(token))

      const restaurantKeywords = [
        'mcdonald',
        'mcdonalds',
        'burger king',
        'kfc',
        'subway',
        'domino',
        'pizza hut',
        'starbucks',
        'dunkin',
        'taco bell',
        'wendy',
        'popeyes',
        'chipotle',
        'panera',
        'chick fil',
        'chick-fil',
        'five guys',
        'in n out',
        'innout',
        'jack in the box',
        'carls jr',
        'hardees',
        'shake shack',
        'arby',
        'dairy queen',
        'white castle',
      ]
      const isRestaurantQuery = restaurantKeywords.some((keyword) => queryNorm.includes(keyword))

      const isLikelyFullMeal = (it: any) => {
        const servingText = String(it?.serving_size || '').toLowerCase()
        const grams = parseServingGrams(it?.serving_size)
        const calories = Number(it?.calories)
        const hasMealWord =
          servingText.includes('kebab') ||
          servingText.includes('kebap') ||
          servingText.includes('shawarma') ||
          servingText.includes('doner') ||
          servingText.includes('gyro') ||
          servingText.includes('burger') ||
          servingText.includes('wrap') ||
          servingText.includes('burrito') ||
          servingText.includes('taco') ||
          servingText.includes('pizza') ||
          servingText.includes('sandwich') ||
          servingText.includes('roll') ||
          servingText.includes('sub') ||
          servingText.includes('pita')
        if (typeof grams === 'number' && Number.isFinite(grams) && grams >= 120) return true
        if (hasMealWord && typeof grams === 'number' && Number.isFinite(grams) && grams >= 90) return true
        if (Number.isFinite(calories) && calories >= 250) return true
        return false
      }

      const scoreItem = (it: any) => {
        let score = 0
        score += scoreItemName(it)
        if (it?.source === 'usda') score += 4
        if (it?.source === 'fatsecret') score += isMealQuery ? 6 : 2
        if (it?.source === 'openfoodfacts') score += 1
        if (it?.brand) score += 2
        if (Number.isFinite(Number(it?.calories)) && Number(it.calories) > 0) score += 1
        score += scoredServing(it?.serving_size, it?.calories)
        if (isMealQuery) {
          const grams = parseServingGrams(it?.serving_size)
          if (typeof grams === 'number' && Number.isFinite(grams)) {
            if (grams >= 150 && grams <= 600) score += 6
            if (grams >= 90 && grams < 150) score += 2
            if (grams > 0 && grams < 80) score -= 6
          }
          if (it?.source === 'openfoodfacts' && typeof grams === 'number' && grams < 80) score -= 4
          if (it?.source === 'usda' && it?.brand) score += 2
          if (Number.isFinite(Number(it?.calories)) && Number(it.calories) < 150) score -= 4
        }
        return score
      }

      if (resolvedKind === 'single') {
        const combined = await buildSingleFoodResults(query)
        if (combined.length > 0) {
          items = combined
          actualSource = 'auto'
        } else {
          const usdaItems = await searchUsdaSingleFood(query)
          items = sortByAlphabeticalHierarchyAsc(usdaItems, query).slice(0, limit)
          actualSource = 'usda'
        }
      } else {
        const perSource = Math.min(Math.max(limit, 10), 25)

        const normalized = (value: any) => String(value || '').trim().toLowerCase()
        const dedupe = (list: any[]) => {
          const byNameBrand = new Map<string, any>()
          list
            .sort((a, b) => scoreItem(b) - scoreItem(a))
            .forEach((it) => {
              const key = `${normalized(it?.name)}|${normalized(it?.brand)}`
              if (!key || key === '|') return
              if (!byNameBrand.has(key)) byNameBrand.set(key, it)
            })
          return Array.from(byNameBrand.values())
        }

        const buildCompactFoodQuery = (value: string) => {
          const normalized = normalizeForMatch(value)
          if (!normalized) return null
          const compacted = normalized.replace(/\bcheese burger\b/g, 'cheeseburger')
          return compacted !== normalized ? compacted : null
        }

        const fetchExternalPool = async () => {
          const fetchForQuery = async (value: string) => {
            const [off, fat] = await Promise.all([
              searchOpenFoodFactsByQuery(value, { pageSize: perSource }),
              searchFatSecretFoods(value, { pageSize: perSource }),
            ])
            return dedupe([...off, ...fat])
          }

          const primary = await fetchForQuery(query)
          if (primary.length > 0) return primary
          const compactQuery = buildCompactFoodQuery(query)
          if (!compactQuery) return primary
          return await fetchForQuery(compactQuery)
        }

        // For packaged foods, always query OpenFoodFacts and FatSecret first (they have fast food items)
        // Then merge with local USDA branded items
        const [localPackaged, externalPool] = await Promise.all([
          searchLocalPreferred(query, 'packaged'),
          fetchExternalPool(),
        ])

        // Combine external (OpenFoodFacts/FatSecret) with local USDA branded
        const allPackaged = [...externalPool, ...localPackaged]
        
        // Filter to only items that match the query
        const filtered = filterItemsByQuery(allPackaged, query, (item) => {
          const combined = [item?.brand, item?.name].filter(Boolean).join(' ')
          return combined || item?.name || ''
        })

        // Custom packaged items take precedence
        if (customPackagedMatches.length > 0) {
          // Prioritize custom items: sort them first, then add others
          const sortedCustom = sortPackagedByAlphabeticalHierarchyAsc(customPackagedMatches, query)
          const sortedOthers = sortPackagedByAlphabeticalHierarchyAsc(filtered, query)
          // Custom items always come first
          items = [...sortedCustom, ...sortedOthers].slice(0, limit)
          actualSource = 'auto'
          customPackagedApplied = true
        } else if (filtered.length > 0) {
          items = sortPackagedByAlphabeticalHierarchyAsc(filtered, query).slice(0, limit)
          actualSource = 'auto'
        } else {
          // If no matches, still try external pool without filtering (might have partial matches)
          items = sortPackagedByAlphabeticalHierarchyAsc(externalPool, query).slice(0, limit)
          actualSource = 'auto'
        }
      }
    } else if (source === 'openfoodfacts') {
      items = await searchOpenFoodFactsByQuery(query, { pageSize: limit })
    } else if (source === 'usda') {
      const resolvedKind = kind === 'packaged' ? 'packaged' : 'single'
      if (resolvedKind === 'single') {
        const combined = await buildSingleFoodResults(query)
        if (combined.length > 0) {
          items = combined
          actualSource = 'usda'
        } else if (localOnly) {
          items = []
          actualSource = 'usda'
        } else {
          const usdaItems = await searchUsdaSingleFood(query)
          items = sortByAlphabeticalHierarchyAsc(usdaItems, query).slice(0, limit)
          actualSource = 'usda'
        }
      } else {
        const localItems = await searchLocalPreferred(query, resolvedKind)
        if (customPackagedMatches.length > 0) {
          items = sortPackagedByAlphabeticalHierarchyAsc(customPackagedMatches, query).slice(0, limit)
          actualSource = 'usda'
          customPackagedApplied = true
        } else if (localItems.length > 0) {
          items = sortPackagedByAlphabeticalHierarchyAsc(localItems, query).slice(0, limit)
          actualSource = 'usda'
        } else if (localOnly) {
          items = []
          actualSource = 'usda'
        } else {
          const dataType = resolvedKind === 'packaged' ? 'all' : 'generic'
          const remote = await searchUsdaFoods(query, { pageSize: limit, dataType })
          items = sortPackagedByAlphabeticalHierarchyAsc(remote, query).slice(0, limit)
          actualSource = 'usda'
        }
      }
    } else if (source === 'fatsecret') {
      items = await searchFatSecretFoods(query, { pageSize: limit })
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid source. Expected "openfoodfacts", "usda", "fatsecret", or "auto".' },
        { status: 400 },
      )
    }

    if (kindMode === 'packaged' && customPackagedMatches.length > 0 && !customPackagedApplied) {
      if (!Array.isArray(items) || items.length === 0) {
        items = sortPackagedByAlphabeticalHierarchyAsc(customPackagedMatches, query).slice(0, limit)
        customPackagedApplied = true
      }
    }

    if (kindMode === 'single' && Array.isArray(items) && items.length > 0) {
      const filtered = filterItemsByQuery(items, query, (item) => item?.name || '')
      items = filtered.length > 0 ? filtered : []
    }

    if (Array.isArray(items) && items.length > 0) {
      const filtered = items.filter((item) => hasMacroData(item))
      items = filtered
    }

    if (Array.isArray(items) && items.length > 1) {
      if (kindMode !== 'single') {
        items = sortPackagedByAlphabeticalHierarchyAsc(items, query).slice(0, limit)
      } else {
        items = items.slice(0, limit)
      }
    }

    return NextResponse.json({ success: true, source: actualSource, items })
  } catch (error) {
    console.error('GET /api/food-data error', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch food data' }, { status: 500 })
  }
}
