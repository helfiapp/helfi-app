/** Pure persistence adapter for the existing native recipe/portion editor.
 * Call only after the normal food builder has resolved every recipe ingredient.
 * Ingredients remain the whole recipe basis; nutrition covers the eaten share.
 */
export type NativeVoiceImportedRecipe = {
  title: string
  servings: number
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: string[]
  steps: string[]
  sourceUrl: string | null
}
function recipeText(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Please review the recipe ${field}.`)
  return value.trim()
}
function positive(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000) throw new Error(`Please choose a positive ${field}.`)
  return value
}
export function validateNativeVoiceImportedRecipe(raw: any): NativeVoiceImportedRecipe {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Please review the complete recipe first.')
  const title = recipeText(raw.title, 'title', 200)
  const servings = positive(raw.servings, 'recipe yield')
  const minutes = (value: any) => {
    if (value === undefined || value === null) return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10080) throw new Error('Please review the recipe cooking time.')
    return value
  }
  const list = (value: any, field: string, max: number) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new Error(`Please review every recipe ${field}.`)
    return value.map((entry) => recipeText(entry, field, 2000))
  }
  const ingredients = list(raw.ingredients, 'ingredient', 30)
  const steps = list(raw.steps, 'step', 100)
  let sourceUrl: string | null = null
  if (raw.sourceUrl !== undefined && raw.sourceUrl !== null && raw.sourceUrl !== '') {
    try {
      const url = new URL(raw.sourceUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
      sourceUrl = url.toString()
    } catch { throw new Error('Please review the recipe source link.') }
  }
  return { title, servings, prepMinutes: minutes(raw.prepMinutes), cookMinutes: minutes(raw.cookMinutes), ingredients, steps, sourceUrl }
}

const NUTRIENTS = [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']] as const
function nutrient(value: any, primary: string, alias: string, optional: boolean) {
  const raw = Object.prototype.hasOwnProperty.call(value || {}, primary) ? value[primary] : value?.[alias]
  if (optional && (raw === null || raw === undefined)) return null
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) throw new Error('Please resolve the nutrition for every recipe ingredient first.')
  return raw
}

export function applyNativeVoiceRecipeMetadata<T extends { items?: any[]; nutrition?: Record<string, any> }>(
  food: T, rawRecipe: unknown, options: { servingsEaten?: number; portionControlEnabled?: boolean } = {},
): T {
  const recipe = validateNativeVoiceImportedRecipe(rawRecipe)
  const items = food?.items
  if (!Array.isArray(items) || items.length !== recipe.ingredients.length || !food.nutrition) throw new Error('Please resolve every recipe ingredient before saving.')
  const previousScale = food.nutrition.__portionScale
  if (previousScale !== undefined && previousScale !== 1) throw new Error('Please use the complete recipe ingredients before choosing a portion.')
  for (const item of items) {
    const source = item?.__voiceSourceFood
    if (!source || !(source.id || source.foodId) || !source.name || item.nutritionCoversServing !== true) throw new Error('Please resolve every recipe ingredient from its food source first.')
  }
  const eaten = positive(options.servingsEaten ?? recipe.servings, 'number of servings eaten')
  const enabled = options.portionControlEnabled ?? (eaten !== recipe.servings)
  if (typeof enabled !== 'boolean' || (!enabled && eaten !== recipe.servings)) throw new Error('Turn on portion control before choosing part of the recipe.')
  const scale = eaten / recipe.servings
  const nutrition = { ...food.nutrition }
  for (const [index, [primary, alias]] of NUTRIENTS.entries()) {
    const optional = index >= 4
    const values = items.map((item) => nutrient(item, primary, alias, optional))
    const sum = values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + Number(value), 0)
    const declared = nutrient(food.nutrition, primary, alias, optional)
    if ((sum === null) !== (declared === null) || (sum !== null && declared !== null && Math.abs(sum - declared) > (index === 0 ? 0.51 : 0.00001))) throw new Error('The complete recipe totals do not match its ingredients. Please review them first.')
    nutrition[primary] = sum === null ? null : sum * scale
    nutrition[alias] = nutrition[primary]
  }
  Object.assign(nutrition, {
    __importRecipe: recipe,
    __portionScale: scale,
    __portionControlEnabled: enabled,
    __portionUnit: 'serving',
    __portionAmount: eaten,
    // Weight is optional and never inferred from volume or a missing serving.
    __portionTotalWeightG: null,
    __portionRecipeServings: recipe.servings,
    __nativeRecipeServingsEaten: eaten,
  })
  return { ...food, items: items.map((item) => ({ ...item })), nutrition }
}
