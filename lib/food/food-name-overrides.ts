export type FoodNameOverrideRow = {
  from: string
  to: string
  itemId?: string
  favoriteId?: string
  sourceId?: string
  barcode?: string
  createdAt?: number
}

export type FoodNameOverrideIndex = Map<string, string> & {
  __byItemId?: Map<string, string>
  __byFavoriteId?: Map<string, string>
  __bySourceId?: Map<string, string>
  __byBarcode?: Map<string, string>
}

export const normalizeFoodName = (name: string | null | undefined) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Keep this intentionally simple: the UI should show a short, clean title (not AI paragraphs or macro lines).
export const extractBaseMealDescription = (value: string | null | undefined) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const firstLine = raw.split('\n')[0] || raw
  const withoutNutrition = firstLine.split(/Calories\s*:/i)[0] || firstLine
  const withoutJson = withoutNutrition.split(/<ITEMS_JSON>/i)[0] || withoutNutrition
  return String(withoutJson || '').trim()
}

export const normalizeMealLabel = (raw: any) => extractBaseMealDescription(String(raw || ''))

export const createFoodNameOverrideIndex = (overrides: any): FoodNameOverrideIndex => {
  const map = new Map<string, string>() as FoodNameOverrideIndex
  const byItemId = new Map<string, string>()
  const byFavoriteId = new Map<string, string>()
  const bySourceId = new Map<string, string>()
  const byBarcode = new Map<string, string>()

  const list = Array.isArray(overrides) ? (overrides as FoodNameOverrideRow[]) : []
  for (const row of list) {
    const fromRaw = typeof (row as any)?.from === 'string' ? String((row as any).from) : ''
    const toRaw = typeof (row as any)?.to === 'string' ? String((row as any).to) : ''
    const itemIdRaw = typeof (row as any)?.itemId === 'string' ? String((row as any).itemId).trim() : ''
    const favIdRaw = typeof (row as any)?.favoriteId === 'string' ? String((row as any).favoriteId).trim() : ''
    const srcIdRaw = typeof (row as any)?.sourceId === 'string' ? String((row as any).sourceId).trim() : ''
    const barcodeRaw = typeof (row as any)?.barcode === 'string' ? String((row as any).barcode).trim() : ''

    const from = normalizeMealLabel(fromRaw)
    const to = normalizeMealLabel(toRaw).trim()
    if (!from || !to) continue

    if (itemIdRaw) byItemId.set(itemIdRaw, to)
    if (favIdRaw) byFavoriteId.set(favIdRaw, to)
    if (srcIdRaw) bySourceId.set(srcIdRaw, to)
    if (barcodeRaw) byBarcode.set(barcodeRaw, to)

    const key = normalizeFoodName(from)
    if (key) map.set(key, to)
  }

  map.__byItemId = byItemId
  map.__byFavoriteId = byFavoriteId
  map.__bySourceId = bySourceId
  map.__byBarcode = byBarcode
  return map
}

const readEntryBarcode = (entry: any) => {
  try {
    const items = Array.isArray(entry?.items) ? entry.items : []
    const single = items.length === 1 ? items[0] : null
    const direct = single && (single?.barcode || single?.gtinUpc || null)
    if (direct) return String(direct).trim()
    const hit = items.find((it: any) => it?.barcode || it?.detectionMethod === 'barcode')
    if (hit?.barcode) return String(hit.barcode).trim()
    if (entry?.barcode) return String(entry.barcode).trim()
  } catch {}
  return ''
}

const readEntryItemId = (entry: any) => {
  try {
    const items = Array.isArray(entry?.items) ? entry.items : []
    const single = items.length === 1 ? items[0] : null
    const id = single && typeof single?.id === 'string' ? String(single.id).trim() : ''
    if (id) return id
  } catch {}
  return ''
}

const readEntryFavoriteId = (entry: any) => {
  try {
    const direct =
      (entry?.favorite && entry.favorite.id && String(entry.favorite.id)) ||
      (entry?.nutrition && (entry.nutrition as any).__favoriteId) ||
      (entry?.nutrients && (entry.nutrients as any).__favoriteId) ||
      (entry && entry.id && (entry.method || entry.customMeal != null) ? String(entry.id) : '')
    return direct ? String(direct).trim() : ''
  } catch {}
  return ''
}

const readEntrySourceId = (entry: any) => {
  try {
    const direct =
      (entry?.source && entry.source.id && String(entry.source.id)) ||
      (entry?.sourceId && String(entry.sourceId)) ||
      (entry?.nutrition && (entry.nutrition as any).__sourceId) ||
      (entry?.nutrients && (entry.nutrients as any).__sourceId)
    return direct ? String(direct).trim() : ''
  } catch {}
  return ''
}

export const applyFoodNameOverride = (raw: any, entry: any, index: FoodNameOverrideIndex) => {
  const rawString = raw === null || raw === undefined ? '' : String(raw || '')

  try {
    const itemId = readEntryItemId(entry)
    const byItemId = index?.__byItemId
    if (itemId && byItemId && typeof byItemId.get === 'function') {
      const hit = byItemId.get(itemId)
      if (hit) return hit
    }

    const barcode = readEntryBarcode(entry)
    const byBarcode = index?.__byBarcode
    if (barcode && byBarcode && typeof byBarcode.get === 'function') {
      const hit = byBarcode.get(barcode)
      if (hit) return hit
    }

    const favId = readEntryFavoriteId(entry)
    const byFavoriteId = index?.__byFavoriteId
    if (favId && byFavoriteId && typeof byFavoriteId.get === 'function') {
      const hit = byFavoriteId.get(favId)
      if (hit) return hit
    }

    const srcId = readEntrySourceId(entry)
    const bySourceId = index?.__bySourceId
    if (srcId && bySourceId && typeof bySourceId.get === 'function') {
      const hit = bySourceId.get(srcId)
      if (hit) return hit
    }
  } catch {}

  const base = normalizeMealLabel(rawString).trim()
  if (!base) return ''
  const key = normalizeFoodName(base)
  const hit = key ? index.get(key) : ''
  return hit || base
}

// Useful for UIs that want a "rename" only when an override actually changes something.
export const resolveFoodNameOverrideOnly = (raw: any, entry: any, index: FoodNameOverrideIndex) => {
  const rawString = raw === null || raw === undefined ? '' : String(raw || '')
  const base = normalizeMealLabel(rawString).trim()
  if (!base) return ''
  const applied = normalizeMealLabel(applyFoodNameOverride(rawString, entry, index) || '').trim()
  if (!applied) return ''
  const baseKey = normalizeFoodName(base)
  const appliedKey = normalizeFoodName(applied)
  if (baseKey && appliedKey && baseKey !== appliedKey) return applied
  if (!baseKey && applied !== base && applied.toLowerCase() !== base.toLowerCase()) return applied
  return ''
}

