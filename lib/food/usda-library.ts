import unresolved from '../../data/usda-unresolved-basis-2025-12-18.json'

const unresolvedIds = new Set<number>(unresolved.fdcIds)

/** A cached branded portion cannot be treated as 100 g without a recorded mass. */
export function usdaLibraryServingSize(record: { source: string; servingSize?: string | null; fdcId?: number | null }): string | null {
  const serving = String(record.servingSize || '').trim()
  if (record.source !== 'usda_branded') return serving || '100 g'
  if (record.fdcId != null && unresolvedIds.has(record.fdcId)) return null
  if (/^100\s+ml$/i.test(serving)) return serving
  // The old importer scaled branded nutrients to a mass, but sometimes retained
  // only "None", "1 cup", or a volume label. Those rows need archive repair.
  const match = serving.match(/(\d+(?:\.\d+)?)\s*(kg|grams?|g|ounces?|oz)\b/i)
  return match && Number(match[1]) > 0 ? serving : null
}
