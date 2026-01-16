export type PractitionerPlaceMatchStatus = 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'UNKNOWN'

export type PractitionerPlaceMatch = {
  status: PractitionerPlaceMatchStatus
  reason: string
  placeName?: string | null
  placeTypes?: string[]
  businessStatus?: string | null
  raw?: any
}

const GENERIC_PLACE_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'premise',
  'subpremise',
  'route',
  'street_address',
  'intersection',
  'locality',
  'sublocality',
  'political',
  'postal_code',
  'postal_town',
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
])

const STOPWORDS = new Set(['and', 'the', 'of', 'or', 'for', 'with', 'a', 'an', 'in'])

const TEST_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\btest\b/i, label: 'Contains "test"' },
  { pattern: /\bdummy\b/i, label: 'Contains "dummy"' },
  { pattern: /\bplaceholder\b/i, label: 'Contains "placeholder"' },
  { pattern: /\blorem\b/i, label: 'Contains "lorem"' },
  { pattern: /\bipsum\b/i, label: 'Contains "ipsum"' },
  { pattern: /\bfake\b/i, label: 'Contains "fake"' },
  { pattern: /\bnot\s+real\b/i, label: 'Contains "not real"' },
  { pattern: /\bdo\s+not\s+use\b/i, label: 'Contains "do not use"' },
  { pattern: /\bdelete\s+me\b/i, label: 'Contains "delete me"' },
  { pattern: /\bsample\b/i, label: 'Contains "sample"' },
  { pattern: /\bexample\b/i, label: 'Contains "example"' },
  { pattern: /example\.com/i, label: 'Uses example.com' },
  { pattern: /\btest\.com\b/i, label: 'Uses test.com' },
]

function getMapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.MAPS_API_KEY ||
    null
  )
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buildKeywordSet(inputs: Array<string | null | undefined>): Set<string> {
  const keywords = new Set<string>()
  inputs
    .filter(Boolean)
    .map((value) => normalizeText(String(value)))
    .filter(Boolean)
    .forEach((value) => {
      keywords.add(value)
      value.split(' ').forEach((token) => {
        if (!token || token.length < 2 || STOPWORDS.has(token)) return
        keywords.add(token)
      })
    })
  return keywords
}

function buildPlaceText(placeName: string | null | undefined, placeTypes: string[]): string {
  const typeText = placeTypes.map((type) => type.replace(/_/g, ' ')).join(' ')
  return normalizeText([placeName || '', typeText].join(' '))
}

export function detectTestSignals(input: {
  displayName?: string | null
  description?: string | null
  websiteUrl?: string | null
  emailPublic?: string | null
  phone?: string | null
  tags?: string[] | null
  address?: string | null
}): string[] {
  const combined = [
    input.displayName,
    input.description,
    input.websiteUrl,
    input.emailPublic,
    input.phone,
    input.address,
    ...(input.tags || []),
  ]
    .filter(Boolean)
    .join(' ')

  if (!combined.trim()) return []
  return TEST_PATTERNS.filter(({ pattern }) => pattern.test(combined)).map(({ label }) => label)
}

export async function lookupPlaceMatch(input: {
  displayName: string
  address: string
  categoryName?: string | null
  subcategoryName?: string | null
  categorySynonyms?: string[]
  subcategorySynonyms?: string[]
}): Promise<PractitionerPlaceMatch> {
  const apiKey = getMapsApiKey()
  if (!apiKey) {
    return { status: 'UNKNOWN', reason: 'Google Places API is not configured.' }
  }

  const query = [input.displayName, input.address].filter(Boolean).join(' ').trim()
  if (!query) {
    return { status: 'UNKNOWN', reason: 'Missing listing name or address.' }
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) {
    return { status: 'UNKNOWN', reason: `Google Places lookup failed (${res.status}).` }
  }

  const data = await res.json().catch(() => ({}))
  const result = Array.isArray(data?.results) ? data.results[0] : null
  if (!result) {
    return { status: 'NOT_FOUND', reason: 'No Google Places result found.' }
  }

  const placeName = result?.name ? String(result.name) : null
  const placeTypes = Array.isArray(result?.types)
    ? result.types.map((type: any) => String(type).toLowerCase())
    : []
  const businessStatus = result?.business_status ? String(result.business_status) : null
  const placeText = buildPlaceText(placeName, placeTypes)

  const keywords = buildKeywordSet([
    input.categoryName,
    input.subcategoryName,
    ...(input.categorySynonyms || []),
    ...(input.subcategorySynonyms || []),
  ])

  const matchesCategory = Array.from(keywords).some((keyword) => placeText.includes(keyword))
  if (matchesCategory) {
    return {
      status: 'MATCH',
      reason: 'Google business types match the selected category.',
      placeName,
      placeTypes,
      businessStatus,
      raw: result,
    }
  }

  const nonGenericTypes = placeTypes.filter((type) => !GENERIC_PLACE_TYPES.has(type))
  if (nonGenericTypes.length === 0) {
    return {
      status: 'UNKNOWN',
      reason: 'Google returned only generic place types.',
      placeName,
      placeTypes,
      businessStatus,
      raw: result,
    }
  }

  return {
    status: 'MISMATCH',
    reason: `Google business types do not match the selected category: ${nonGenericTypes.join(', ')}`,
    placeName,
    placeTypes,
    businessStatus,
    raw: result,
  }
}
