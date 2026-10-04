export const FOOD_BENCHMARK_MODELS = ['gpt-5.6-sol', 'gpt-6.1-sol', 'gpt-4o'] as const

export function isFoodBenchmarkImageUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['helfi.ai', 'www.helfi.ai'].includes(url.hostname) &&
      url.pathname.startsWith('/FOOD%20TEST%20IMAGES/') && !url.search && !url.hash
  } catch { return false }
}

export function inspectFoodBenchmarkOutput(content: string, finishReason: string | null) {
  let result: any = null
  try { result = JSON.parse(content) } catch {}
  const items = Array.isArray(result?.items) ? result.items : []
  const fields = ['calories', 'protein_g', 'carbs_g', 'fat_g']
  const complete = finishReason === 'stop' && items.length > 0 && items.every((item: any) =>
    typeof item?.name === 'string' && item.name.trim() &&
    typeof item.serving_size === 'string' && item.serving_size.trim() &&
    item.servings === 1 && typeof item.isGuess === 'boolean' &&
    fields.every(field => typeof item[field] === 'number' && Number.isFinite(item[field]) && item[field] >= 0))
  const totalsMatch = complete && fields.every(field => {
    const total = result?.total?.[field]
    const sum = items.reduce((value: number, item: any) => value + item[field], 0)
    return typeof total === 'number' && Number.isFinite(total) && Math.abs(total - sum) <= (field === 'calories' ? 1 : 0.1)
  })
  return { parsed: result, ingredientCardsReady: Boolean(complete && totalsMatch), itemCount: items.length, totalsMatch: Boolean(totalsMatch) }
}

// Uncached standard short-context estimate only; does not alter wallet charging.
// Official prices verified 4 October 2026: OpenAI model pages and API pricing.
export function estimateFoodBenchmarkVendorCents(model: string, promptTokens: number, completionTokens: number) {
  const rates: Record<string, [number, number]> = {
    'gpt-5.6-sol': [0.4, 2],
    'gpt-6.1-sol': [0.2, 1],
    'gpt-4o': [0.25, 1],
  }
  const rate = rates[model]
  if (!rate) throw new Error('Unsupported food comparison model')
  return (promptTokens * rate[0] + completionTokens * rate[1]) / 1000
}
