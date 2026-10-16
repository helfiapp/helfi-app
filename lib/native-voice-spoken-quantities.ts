// Deliberately scoped to measurement parsing. Never use this to rewrite saved
// transcripts, journal text, dates, mood notes or other free-form user content.
export type SpokenMeasurementScope = 'food' | 'water' | 'exercise-duration' | 'exercise'

const small: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
}
const tens: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const denominators: Record<string, number> = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10 }
const numberVocabulary = new Set([...Object.keys(small), ...Object.keys(tens), ...Object.keys(denominators),
  'a', 'an', 'and', 'of', 'hundred', 'thousand', 'point',
  // Keep uncertainty/sign words inside the candidate so its numeric suffix
  // cannot accidentally become a positive, definite amount.
  'negative', 'minus', 'plus', 'or', 'to', 'between', 'approximately', 'about',
  'not', 'no', 'never', 'least', 'most', 'more', 'less', 'than', 'up', 'under', 'over', 'around', 'roughly', 'nearly'])

function underHundred(words: string[]): number | null {
  if (words.length === 1) return small[words[0]] ?? tens[words[0]] ?? (/^(a|an)$/.test(words[0]) ? 1 : null)
  if (words.length === 2 && tens[words[0]] !== undefined && small[words[1]] > 0 && small[words[1]] < 10) return tens[words[0]] + small[words[1]]
  return null
}

function underThousand(words: string[]): number | null {
  if (words[1] !== 'hundred') return underHundred(words)
  const hundreds = /^(a|an)$/.test(words[0]) ? 1 : small[words[0]]
  if (!(hundreds > 0 && hundreds < 10)) return null
  let rest = words.slice(2)
  if (!rest.length) return hundreds * 100
  if (rest[0] === 'and') rest = rest.slice(1)
  const remainder = underHundred(rest)
  return remainder !== null && remainder > 0 ? hundreds * 100 + remainder : null
}

function cardinal(text: string): number | null {
  if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(text)) return Number(text.replace(/,/g, ''))
  const words = text.split(' ')
  const index = words.indexOf('thousand')
  if (index < 0) return underThousand(words)
  if (words.lastIndexOf('thousand') !== index) return null
  const thousands = underThousand(words.slice(0, index))
  if (thousands === null || thousands <= 0) return null
  let rest = words.slice(index + 1)
  if (!rest.length) return thousands * 1000
  if (rest[0] === 'and') rest = rest.slice(1)
  const remainder = underThousand(rest)
  return remainder !== null && remainder > 0 ? thousands * 1000 + remainder : null
}

function fraction(text: string): number | null {
  const glyph = ({ '½': 0.5, '¼': 0.25, '¾': 0.75 } as Record<string, number>)[text]
  if (glyph !== undefined) return glyph
  const numeric = text.match(/^(\d+)\/(\d+)$/)
  if (numeric) return Number(numeric[2]) > 0 ? Number(numeric[1]) / Number(numeric[2]) : null
  const words = text.replace(/\s+(?:of\s+)?(?:a|an)$/, '').split(' ')
  const denominator = denominators[words[words.length - 1]]
  if (!denominator) return null
  const numerator = words.length === 1 ? 1 : cardinal(words.slice(0, -1).join(' '))
  return numerator !== null && Number.isInteger(numerator) && numerator > 0 ? numerator / denominator : null
}

/** Parse one complete, unambiguous English quantity, never a matching suffix. */
export function parseSpokenQuantity(value: string): number | null {
  const text = value.toLowerCase().trim().replace(/(?<=[a-z])-(?=[a-z])/g, ' ').replace(/\s+/g, ' ')
  if (!text || /\b(?:negative|minus|plus|or|to|between|approximately|about)\b|[+\-]/.test(text)) return null
  let result = fraction(text)
  if (result === null) {
    const mixed = text.lastIndexOf(' and ')
    if (mixed > 0) {
      const whole = cardinal(text.slice(0, mixed))
      const part = fraction(text.slice(mixed + 5))
      if (whole !== null && Number.isInteger(whole) && part !== null && part > 0 && part < 1) result = whole + part
    }
  }
  if (result === null && text.includes(' point ')) {
    const parts = text.split(' point ')
    const whole = parts.length === 2 ? cardinal(parts[0]) : null
    const decimal = parts[1]?.split(' ')
    if (whole !== null && Number.isInteger(whole) && decimal?.length && decimal.every(word => small[word] !== undefined && small[word] < 10)) result = Number(`${whole}.${decimal.map(word => small[word]).join('')}`)
  }
  if (result === null) result = cardinal(text)
  return result !== null && Number.isFinite(result) && result >= 0 && result <= 100000 ? result : null
}

const liquidUnits = 'millilitres?|milliliters?|ml|litres?|liters?|l|fluid\\s+ounces?|fl\\s*oz|ounces?|oz|cups?'
const foodUnits = `${liquidUnits}|kilograms?|kg|grams?|g|pounds?|lbs?|tablespoons?|tbsp|teaspoons?|tsp|slices?|eggs?|servings?|each`
const durationUnits = 'minutes?|mins?|hours?|hrs?'
const exerciseUnits = `${durationUnits}|steps?|step\\s+count|kilocalories?|calories?|kcal|cals?|kilometres?\\s+per\\s+hour|kilometers?\\s+per\\s+hour|miles?\\s+per\\s+hour|km\\s*\\/\\s*h|kph|mph|kilometres?|kilometers?|km|miles?|mi`

function measurementCandidates(value: string, scope: SpokenMeasurementScope) {
  const units = scope === 'food' ? foodUnits : scope === 'water' ? liquidUnits : scope === 'exercise-duration' ? durationUnits : exerciseUnits
  const pattern = new RegExp(`(?<![A-Za-z])(?:${units})\\b`, 'gi')
  const candidates: Array<{ start: number; end: number; candidate: string; amount: number | null }> = []
  for (const unit of value.matchAll(pattern)) {
    const end = unit.index!
    const before = value.slice(0, end)
    const tokens = [...before.matchAll(/[a-z]+(?:-[a-z]+)*|\d+(?:,\d{3})*(?:\.\d+)?(?:\/\d+)?|[¼½¾+\-]/gi)]
    let start = end
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i]
      const word = token[0].toLowerCase()
      if (!/^[\s,/]*$/.test(before.slice(token.index! + token[0].length, start))) break
      if (!word.split('-').every(part => numberVocabulary.has(part)) && !/^(?:\d|[¼½¾+\-])/.test(word)) break
      start = token.index!
    }
    let candidate = value.slice(start, end).trim()
    // A list boundary is not part of the next number. Internal "and" remains
    // subject to the complete cardinal/mixed-fraction grammar above.
    if (/^(?:and|to)\s+/i.test(candidate)) { const skip = candidate.match(/^(?:and|to)\s+/i)![0].length; start += skip; candidate = candidate.slice(skip) }
    if (!candidate) continue
    const amount = parseSpokenQuantity(candidate)
    candidates.push({ start, end, candidate, amount })
  }
  return candidates
}

/** Older numeric regexes must not select a positive suffix of an invalid span. */
export function hasUnsafeMeasurementQuantity(value: string, scope: SpokenMeasurementScope): boolean {
  return measurementCandidates(value, scope).some(candidate => candidate.amount === null)
}

/** Keep original ingredient wording; "and" inside an amount is not a list break. */
export function splitSpokenFoodMeasurementList(value: string): string[] {
  const quantities = measurementCandidates(value, 'food')
  // Preserve malformed spoken spans too, so a later amount reader can ask.
  // A comma after a numeric food name ("chicken part 1, 10 g rice") still
  // separates ingredients; each resulting ingredient is validated separately.
  const protectedSpans = quantities.filter(candidate => candidate.amount !== null || /[a-z]/i.test(candidate.candidate))
  const pieces: string[] = []
  let start = 0
  for (const separator of value.matchAll(/\band\b|,/gi)) {
    if (protectedSpans.some(candidate => separator.index! >= candidate.start && separator.index! < candidate.end)) continue
    pieces.push(value.slice(start, separator.index))
    start = separator.index! + separator[0].length
  }
  pieces.push(value.slice(start))
  return pieces
}

/** Return a local parsing copy; units, other words and original text stay intact. */
export function normalizeSpokenMeasurementQuantities(value: string, scope: SpokenMeasurementScope): string {
  let result = value
  for (const change of measurementCandidates(value, scope).reverse()) {
    if (change.amount !== null && /[a-z¼½¾/]/i.test(change.candidate)) result = `${result.slice(0, change.start)}${change.amount} ${result.slice(change.end)}`
  }
  return result
}
