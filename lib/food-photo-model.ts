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

export function buildFoodPhotoPrompt(hintBlock = '', feedbackBlock = '') {
  return `Analyze this food photo carefully. Nutrition and portion weights from a photo are estimates, not measured facts.
- Identify every visible food, side, topping, sauce and drink separately; never invent typical sides or invisible ingredients. Keep plain, specific names and preserve raw/cooked/fried/breaded identities.
- Count clearly visible eggs, patties, nuggets, slices and other discrete foods across the whole photo. Write the FULL count explicitly in serving_size, including1, and give nutrition for that whole portion exactly once. Example:3 large eggs are about210kcal/18g protein before added cooking fat.
- Estimate sensible grams or household portions using plate/utensil cues. Rice, fries, pasta, salads and sliced produce are portions in grams or fractions, not arbitrary piece counts. Do not default each food to100g. Omit inedible bones/packaging.
- Use realistic standard food nutrition for each estimated portion. Do not underestimate large meals; do not add hidden oil as a known fact. Mark every estimated portion isGuess:true. Unknown fibre/sugar are null; use0 only for known zero.
- If a nutrition label is visible, copy its PER-SERVING numbers and serving wording exactly rather than the per100g column. Keep visible brand separately; identical packaged units default to one labelled unit unless multiple consumed units are clear.
- Each item's nutrition covers its stated serving_size with servings:1. The total must equal the sum of items multiplied by servings for all six nutrients. Do not duplicate the whole meal as another item.
${hintBlock}${feedbackBlock}
Return a brief description (at most2 sentences), then these lines:
Components: every item name, comma separated (must match JSON exactly)
Calories: [number], Protein: [g], Carbs: [g], Fat: [g]
Then ALWAYS include this complete compact block, with one entry per visible food; numbers here are only the shape, never defaults for unknown values:
<ITEMS_JSON>{"items":[{"name":"specific food","brand":null,"serving_size":"whole estimated portion","servings":1,"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":null,"sugar_g":null,"isGuess":true}],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":null,"sugar_g":null}}</ITEMS_JSON>
If no food is visible, say so and return an empty items array; never fabricate a meal.`
}
