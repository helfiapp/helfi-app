type Basis = 'per_serving' | 'per_100g'
type EnergyUnit = 'kcal' | 'kJ' | null

export type NormalizedFoodInput = {
  source?: string | null
  id?: string | number | null
  name?: string | null
  brand?: string | null
  serving_size?: string | null
  servings?: number | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
  barcode?: string | null
  basis?: Basis | null
  quantity_g?: number | null
  energyUnit?: EnergyUnit
  pieces?: number | null
  piecesPerServing?: number | null
}

const WORD_NUMBER_MAP: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
}

const DISCRETE_KEYWORDS = [
  'egg',
  'eggs',
  'patty',
  'pattie',
  'patties',
  'nugget',
  'nuggets',
  'wing',
  'wings',
  'slice',
  'slices',
  'strip',
  'strips',
  'tender',
  'tenders',
  'bite',
  'bites',
  'piece',
  'pieces',
  'cookie',
  'cookies',
  'cracker',
  'crackers',
  'biscuit',
  'biscuits',
]

export const replaceWordNumbers = (text: string | null | undefined): string => {
  if (!text) return ''
  return String(text).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m) => {
    const repl = WORD_NUMBER_MAP[m.toLowerCase()]
    return repl || m
  })
}

export const parseCountFromText = (text: string | null | undefined): number | null => {
  if (!text) return null
  const normalized = replaceWordNumbers(String(text).toLowerCase())
  const match = normalized.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

const isDiscreteLabel = (text: string | null | undefined): boolean => {
  if (!text) return false
  const lower = text.toLowerCase()
  return DISCRETE_KEYWORDS.some((kw) => lower.includes(kw))
}

const parseGramWeight = (label: string | null | undefined): number | null => {
  if (!label) return null
  const normalized = replaceWordNumbers(label)
  const gMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams)/i)
  if (gMatch) return parseFloat(gMatch[1])
  const mlMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre)/i)
  if (mlMatch) return parseFloat(mlMatch[1])
  const ozMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)/i)
  if (ozMatch) return parseFloat(ozMatch[1]) * 28.3495
  return null
}

const inferPiecesFromLabel = (name?: string | null, servingSize?: string | null): number | null => {
  const label = replaceWordNumbers([name, servingSize].filter(Boolean).join(' '))
  if (!label.trim()) return null

  // Prefer explicit parenthetical counts like "(6 crackers)" or "(3 pieces)"
  const paren = label.match(/\((\d+(?:\.\d+)?)\s*(?:pieces?|pcs|crackers?|cookies?|nuggets?|patt(?:y|ies)|slices?)\)/i)
  if (paren) {
    const val = parseFloat(paren[1])
    if (Number.isFinite(val) && val > 0) return val
  }

  const fromText = parseCountFromText(label)
  if (fromText && isDiscreteLabel(label)) return fromText
  return null
}

export const normalizeDiscreteItemCounts = (item: any): { item: any; changed: boolean; debug?: any } => {
  if (!item || typeof item !== 'object') return { item, changed: false }

  const next = { ...item }
  const label = replaceWordNumbers([next.name, next.serving_size || next.servingSize].filter(Boolean).join(' ').trim())
  const isDiscrete = isDiscreteLabel(label)

  if (!isDiscrete) {
    return { item: next, changed: false }
  }

  const initialServings = Number.isFinite(Number(next.servings)) && Number(next.servings) > 0 ? Number(next.servings) : 1
  const existingPiecesPerServing =
    Number.isFinite(Number((next as any).piecesPerServing)) && Number((next as any).piecesPerServing) > 0
      ? Number((next as any).piecesPerServing)
      : null
  const inferredPieces = inferPiecesFromLabel(next.name, next.serving_size || (next as any).servingSize)

  let piecesPerServing = existingPiecesPerServing || inferredPieces || null
  let servings = initialServings
  let changed = false

  // Plan rule: single discrete item with servings > 1 but no pieces → set piecesPerServing = servings, clamp servings = 1
  if (servings > 1 && !piecesPerServing) {
    piecesPerServing = servings
    servings = 1
    changed = true
  }

  if (piecesPerServing && piecesPerServing > 0 && piecesPerServing !== existingPiecesPerServing) {
    ;(next as any).piecesPerServing = piecesPerServing
    changed = true
  }

  if (servings !== initialServings) {
    next.servings = servings
  }

  // Seed pieces for the UI if missing
  if (
    piecesPerServing &&
    (!Number.isFinite(Number((next as any).pieces)) || Number((next as any).pieces) <= 0)
  ) {
    ;(next as any).pieces = Math.max(1, Math.round(piecesPerServing * servings * 1000) / 1000)
    changed = true
  }

  return {
    item: next,
    changed,
    debug: {
      name: next.name,
      serving_size: next.serving_size,
      servings: next.servings,
      pieces: (next as any).pieces,
      piecesPerServing: (next as any).piecesPerServing,
      inferredPieces,
    },
  }
}

export const normalizeDiscreteItems = (items: any[]): { items: any[]; changed: boolean; debug: any[] } => {
  if (!Array.isArray(items) || items.length === 0) return { items, changed: false, debug: [] }

  const normalized: any[] = []
  const debug: any[] = []
  let changed = false

  for (const item of items) {
    const { item: next, changed: itemChanged, debug: d } = normalizeDiscreteItemCounts(item)
    normalized.push(next)
    if (itemChanged) changed = true
    if (d) debug.push(d)
  }

  return { items: normalized, changed, debug }
}

export const normalizeBarcodeFood = (food: NormalizedFoodInput): { food: NormalizedFoodInput; debug: any } => {
  const next: NormalizedFoodInput = { ...food }
  let calories = Number.isFinite(Number(next.calories)) ? Number(next.calories) : null
  let protein = Number.isFinite(Number(next.protein_g)) ? Number(next.protein_g) : null
  let carbs = Number.isFinite(Number(next.carbs_g)) ? Number(next.carbs_g) : null
  let fat = Number.isFinite(Number(next.fat_g)) ? Number(next.fat_g) : null
  let fiber = Number.isFinite(Number(next.fiber_g)) ? Number(next.fiber_g) : null
  let sugar = Number.isFinite(Number(next.sugar_g)) ? Number(next.sugar_g) : null

  const quantityG = Number.isFinite(Number(next.quantity_g)) && Number(next.quantity_g) > 0 ? Number(next.quantity_g) : parseGramWeight(next.serving_size)
  const energyUnit: EnergyUnit = next.energyUnit || null

  // Normalize energy to kcal (heuristic: values > 4000 likely kJ)
  let convertedFromKJ = false
  if (energyUnit === 'kJ' && calories !== null) {
    calories = Math.round((calories as number) / 4.184)
    convertedFromKJ = true
  } else if (calories !== null && calories > 4000) {
    calories = Math.round(calories / 4.184)
    convertedFromKJ = true
  }

  // Scale from per-100g to per-serving if possible
  if (next.basis === 'per_100g' && quantityG && quantityG > 0) {
    const factor = quantityG / 100
    const scale = (v: number | null) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * factor * 1000) / 1000 : null)
    calories = scale(calories)
    protein = scale(protein)
    carbs = scale(carbs)
    fat = scale(fat)
    fiber = scale(fiber)
    sugar = scale(sugar)
  }

  next.calories = calories
  next.protein_g = protein
  next.carbs_g = carbs
  next.fat_g = fat
  next.fiber_g = fiber
  next.sugar_g = sugar
  next.servings = 1

  // Pieces inference for discrete packaged foods
  const inferredPieces = inferPiecesFromLabel(next.name, next.serving_size)
  if (inferredPieces && inferredPieces > 0) {
    next.piecesPerServing = inferredPieces
    next.pieces = inferredPieces
  }

  return {
    food: next,
    debug: {
      source: next.source,
      serving_size: next.serving_size,
      basis: next.basis || null,
      quantity_g: quantityG || null,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      convertedFromKJ,
      inferredPieces: next.piecesPerServing || null,
    },
  }
}

export const summarizeDiscreteItemsForLog = (items: any[]) =>
  Array.isArray(items)
    ? items
        .filter((it) => isDiscreteLabel(`${it?.name || ''} ${it?.serving_size || ''}`))
        .slice(0, 6)
        .map((it) => ({
          name: it?.name,
          serving_size: it?.serving_size,
          servings: it?.servings,
          pieces: (it as any)?.pieces,
          piecesPerServing: (it as any)?.piecesPerServing,
        }))
    : []
