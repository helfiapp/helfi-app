/** Compare saved nutrient content without depending on object property order. */
const canonicalContent = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalContent)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalContent(item)]))
  }
  return value
}

export const hasSameDiaryNutrientContent = (a: any, b: any): boolean =>
  JSON.stringify(canonicalContent({ nutrition: a?.nutrition, total: a?.total, items: a?.items })) ===
  JSON.stringify(canonicalContent({ nutrition: b?.nutrition, total: b?.total, items: b?.items }))
