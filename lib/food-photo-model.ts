import { HELFI_ANALYSIS_MODEL } from './ai-models'

export const HELFI_FOOD_PHOTO_MODEL = 'gpt-6.1-sol'
export const FOOD_PHOTO_COMPLETION_TOKENS = 6144
export const FOOD_PHOTO_MODEL_FEATURE = 'food:photo-analysis'

export function isMealPhotoAnalysis(hasImage: boolean, packagedMode: boolean, labelScan: boolean) {
  return hasImage && !packagedMode && !labelScan
}

export function prepareFoodPhotoCompletion(params: any, enabled: boolean) {
  const hasImage = Array.isArray(params.messages) && params.messages.some((message: any) =>
    Array.isArray(message.content) && message.content.some((part: any) => part?.type === 'image_url'))
  if (!enabled || !hasImage) return { params, feature: undefined }
  const next = { ...params, model: HELFI_FOOD_PHOTO_MODEL, reasoning_effort: 'low',
    // Respect the primary call's wallet-capped allowance. Small existing vision
    // follow-ups need room for reasoning plus the full ingredient output.
    max_completion_tokens: params.max_completion_tokens ?? FOOD_PHOTO_COMPLETION_TOKENS }
  for (const key of ['max_tokens', 'temperature', 'top_p', 'logprobs', 'top_logprobs']) delete next[key]
  return { params: next, feature: FOOD_PHOTO_MODEL_FEATURE }
}

export function selectFoodAnalysisModel(hasImage: boolean, packagedMode: boolean, labelScan: boolean) {
  return isMealPhotoAnalysis(hasImage, packagedMode, labelScan) ? HELFI_FOOD_PHOTO_MODEL : HELFI_ANALYSIS_MODEL
}

// Keep every lookup and the original result order while limiting provider load.
export async function mapFoodNutritionChecks<T, R>(items: T[], concurrency: number, check: (item: T) => Promise<R>): Promise<R[]> {
  const width = Number.isFinite(concurrency) ? Math.max(1, Math.min(4, Math.floor(concurrency))) : 1
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await check(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker))
  return results
}
