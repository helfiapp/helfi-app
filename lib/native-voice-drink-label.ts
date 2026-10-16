/** Resize only the complete automatic drink-label grammar. Personal names,
 * dates and unrelated numbers are never rewritten. */
export function resizeNativeVoiceDrinkLabel(label: unknown, nutrition: any, ratio: number): string | undefined {
  if (nutrition?.__voiceBuiltMeal !== true || typeof label !== 'string' || !Number.isFinite(ratio) || ratio <= 0) return undefined
  const measure = String.raw`\d+(?:\.\d+)?\s*(?:ml|g|tsp|tbsp|cups?|oz|l)\s+(?:(?:whole|skim(?:med)?|full[- ]?fat|low[- ]?fat|full cream|oat|almond|soy|soya|coconut)\s+)?(?:milk|sugar|honey)`
  if (!new RegExp(String.raw`^(?:coffee|tea|water|milk|hot chocolate)(?:\s+(?:with|and)\s+${measure})+$`, 'i').test(label.trim())) return undefined
  const resized = label.trim().replace(/\b(\d+(?:\.\d+)?)\s*(ml|g|tsp|tbsp|cups?|oz|l)\b/gi,
    (_match, amount, unit) => `${Number((Number(amount) * ratio).toFixed(6))} ${unit}`)
  // The normal hydration label has a 48-character limit. Never silently cut
  // a reviewed ingredient amount or turn a custom label into a partial label.
  if (resized.length > 48) throw new Error('Please choose a shorter drink name before resizing these ingredients.')
  return resized
}
