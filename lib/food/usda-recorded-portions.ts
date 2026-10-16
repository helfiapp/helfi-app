import recorded from '@/data/food-overrides/usda-recorded-portions.json'

/** Restore only independently verified USDA portion rows missing from the
 * runtime provider reply. Nutrients always come from that same local FDC row.
 * Paired grams/fluid ounces are source data, not a general liquid density. */
export function verifiedUsdaRecordedPortionOptions(row: any) {
  const exact = recorded.foods.find(food => food.fdcId === row?.fdcId && food.source === row?.source
    && food.name.toLowerCase() === String(row?.name || '').trim().toLowerCase())
  if (!exact || !/^100\s*g$/i.test(String(row?.servingSize || '').trim())) return []
  const nutrient = (value: any, optional: boolean) => {
    if (optional && (value === null || value === undefined)) return null
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
  }
  const base = { calories: nutrient(row.calories, false), protein_g: nutrient(row.proteinG, false), carbs_g: nutrient(row.carbsG, false), fat_g: nutrient(row.fatG, false),
    fiber_g: nutrient(row.fiberG, true), sugar_g: nutrient(row.sugarG, true) }
  if (Object.values(base).some(value => value === undefined)) return []
  const nutrition = (grams: number) => Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value === null ? null : Number(value) * grams / 100]))
  const basic = { id: `usda:${exact.fdcId}:100g`, source: 'usda' as const, foodName: row.name, label: '100 g', serving_size: '100 g', grams: 100, ml: null, unit: 'g' as const, ...nutrition(100) }
  return [basic, ...exact.portions.map((portion, index) => {
    const label = `${portion.amount} ${portion.modifier} — ${portion.grams} g`
    // Match the normal USDA portion-index IDs; keep the authoritative CSV row
    // separately so existing saved serving selections continue to reopen.
    return { id: `usda:${exact.fdcId}:${index}`, source: 'usda' as const, foodName: row.name,
      label, serving_size: label, grams: portion.grams, ml: portion.fluidOunces * 29.5735295625, unit: 'g' as const,
      ...nutrition(portion.grams), __sourcePortion: { provider: recorded.provider, fdcId: exact.fdcId, portionId: portion.id,
        amount: portion.amount, modifier: portion.modifier, gramWeight: portion.grams,
        url: recorded.downloadUrl, archiveSha256: recorded.downloadSha256 } }
  })]
}
