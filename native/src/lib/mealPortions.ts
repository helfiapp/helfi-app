// The web stores whole-recipe ingredients plus __portionScale. Native editors
// operate on the eaten ingredient amounts, so materialize that scale exactly once.
export function materializeMealPortion(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw
  const containers = ['nutrients', 'nutrition', 'total', 'nourishment']
  const declared = containers.map((key) => raw[key]?.__portionScale).find((value) => value != null)
  const scale = Number(declared)
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return raw
  const next = { ...raw }
  const scaleItems = (items: any[]) => items.map((item) => {
    const value = { ...item }
    const servings = Number(item?.servings)
    value.servings = (Number.isFinite(servings) && servings > 0 ? servings : 1) * scale
    for (const key of ['amount', '__amount', 'weightAmount', 'pieces']) {
      if (item?.[key] != null && Number.isFinite(Number(item[key]))) value[key] = Number(item[key]) * scale
    }
    return value
  })
  const readItems = (value: any): any[] | null => {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return null
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : null } catch { return null }
  }
  const items = readItems(raw.items)
  const ingredients = readItems(raw.ingredients)
  if (items) next.items = scaleItems(items)
  if (ingredients) next.ingredients = scaleItems(ingredients)
  const hasItems = !!(items?.length || ingredients?.length)
  for (const key of containers) {
    if (!raw[key] || typeof raw[key] !== 'object') continue
    next[key] = { ...raw[key], __portionScale: 1 }
    // With ingredient data, totals are recalculated from the materialized items.
    if (!hasItems) {
      for (const field of ['calories', 'calories_kcal', 'protein', 'protein_g', 'carbs', 'carbs_g', 'fat', 'fat_g', 'fiber', 'fiber_g', 'sugar', 'sugar_g', 'satFat', 'saturatedFat', 'saturated_fat_g']) {
        const value = raw[key][field]
        if (value != null && Number.isFinite(Number(value))) next[key][field] = Math.max(0, Number(value) * scale)
      }
    }
  }
  return next
}
