/** Structured source-resolved food operations. No phrase routing, provider,
 * arbitrary endpoints or model-supplied nutrition. Production requires the
 * host's existing normal food builder, signed review and durable save receipt. */
import crypto from 'crypto'
import { AssistantContractError, AssistantNotSubmittedError, validateAssistantValue, type AssistantContext, type AssistantCost, type AssistantField, type AssistantOperation, type AssistantPrepared, type AssistantReceipt, type AssistantValue } from './native-assistant-registry'
import { validateNativeVoiceResolvedFood } from './native-voice-resolved-food'
import { validateNativeVoiceImportedRecipe, type NativeVoiceImportedRecipe } from './native-voice-recipe-metadata'
export type AssistantFoodOperationId = 'food.diary.create' | 'recipe.library.create' | 'food.recipe.log'
export type AssistantMeasuredIngredient = { name: string; quantity: number; unit: string; brand?: string; country?: string; display: string }
export type AssistantFoodValues = { name: string; meal: string; localDate: string; destination: 'diary' | 'library'; ingredients: AssistantMeasuredIngredient[]; recipe?: NativeVoiceImportedRecipe; servingsEaten?: number; budgetSourceVersion?: string; country?: string }
export type AssistantFoodPreparation = { actorId: string; localDate: string; destination: 'diary' | 'library'; normalDraft: any; trustedSources: any[]; cost: AssistantCost }
export type AssistantFoodServices = {
  authenticate(context: AssistantContext): Promise<string | null>
  /** Must only resolve existing normal food-source records here. No generation,
   * paid lookup, analysis, write or arbitrary model-selected network request. */
  prepare(context: AssistantContext, operation: AssistantFoodOperationId, values: AssistantFoodValues): Promise<AssistantFoodPreparation>
  /** Same exact normal confirmed save path and durable receipt as manual app. */
  execute(context: AssistantContext, normalDraft: unknown, receipt: AssistantReceipt): Promise<any>
  /** Read actual exact saved ID/destination/account, all nutrients, portions,
   * ingredients and complete recipe metadata back. Never only screen opening. */
  verify(context: AssistantContext, result: any, normalDraft: unknown, values: AssistantFoodValues): Promise<boolean>
  /** Only an already-computed owned read snapshot; never paid generation. */
  readDayContext?: (context: AssistantContext, localDate: string) => Promise<any>
  /** Read-only receipt recovery, never another normal save submission. */
  recover?: (context: AssistantContext, actionId: string, normalDraft: unknown, values: AssistantFoodValues) => Promise<any | null>
}
const fail = (message: string): never => { throw new Error(message) }
const record = (value: any): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('Please review this exact source-resolved meal again.')
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value
const same = (a: any, b: any) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))
const digest = (value: any) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const wire = (value: any) => JSON.parse(JSON.stringify(value))
const str = (maxLength: number, minLength = 1): AssistantField => ({ type: 'string', maxLength, minLength })
const positive = (maximum: number): AssistantField => ({ type: 'number', minimum: 0.000001, maximum })
const obj = (properties: Record<string, AssistantField>, required: string[] = []): Extract<AssistantField, { type: 'object' }> => ({ type: 'object', properties, required })
const meal: AssistantField = { type: 'string', maxLength: 20, enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'other', 'uncategorized'] }
const measured = obj({ name: str(200), quantity: positive(100000), unit: { type: 'string', maxLength: 8, enum: ['g','kg','ml','l','oz','lb','cup','tbsp','tsp','each','serving'] }, brand: str(120), country: str(2) }, ['name','quantity','unit'])
const ingredients: AssistantField = { type: 'array', items: measured, minItems: 1, maxItems: 30 }
const recipe = obj({ title: str(120), yieldServings: positive(1000), ingredients, steps: { type: 'array', items: str(2000), minItems: 1, maxItems: 100 }, prepMinutes: { type: 'number', minimum: 0, maximum: 10080 }, cookMinutes: { type: 'number', minimum: 0, maximum: 10080 } }, ['title','yieldServings','ingredients','steps'])
const shared = { localDate: { type: 'string', maxLength: 10, format: 'date' } as AssistantField, budgetSourceVersion: str(64) }
const schemas: Record<AssistantFoodOperationId, AssistantOperation['input']> = {
  'food.diary.create': obj({ name: str(120), meal, ingredients, ...shared }, ['name','meal','ingredients']),
  'recipe.library.create': obj({ recipe, ...shared }, ['recipe']),
  'food.recipe.log': obj({ recipe, meal, servingsEaten: positive(1000), ...shared }, ['recipe','meal','servingsEaten']),
}
function normalize(operation: AssistantFoodOperationId, input: Record<string, AssistantValue>, context: AssistantContext): AssistantFoodValues {
  const value = validateAssistantValue(schemas[operation], input) as Record<string, any>
  const source = operation === 'food.diary.create' ? value.ingredients : value.recipe.ingredients
  const requests: AssistantMeasuredIngredient[] = source.map((entry: any) => {
    const name = entry.name.trim(), brand = entry.brand?.trim(), country = entry.country?.toUpperCase()
    if (!name || entry.brand !== undefined && !brand || country && !/^[A-Z]{2}$/.test(country)) fail('Please provide exact food names, brands and two-letter countries.')
    return { name, quantity: entry.quantity, unit: entry.unit, ...(brand ? { brand } : {}), ...(country ? { country } : {}), display: `${entry.quantity} ${entry.unit} ${name}` }
  })
  const countries = [...new Set(requests.flatMap(entry => entry.country ? [entry.country] : []))]
  if (countries.length > 1) fail('Please resolve the meal from one exact country catalog before combining its foods.')
  if (operation === 'food.diary.create' && !value.name.trim()) fail('Please supply the exact meal name.')
  const localDate = String(value.localDate ?? context.localDate)
  validateAssistantValue(shared.localDate, localDate)
  if (value.budgetSourceVersion !== undefined && !/^[a-f0-9]{64}$/.test(value.budgetSourceVersion)) fail('Please read your actual current daily allowance before planning this meal.')
  const normalRecipe = value.recipe ? validateNativeVoiceImportedRecipe({ title: value.recipe.title.trim(), servings: value.recipe.yieldServings, ingredients: requests.map(entry => entry.display), steps: value.recipe.steps.map((step: string) => step.trim()), prepMinutes: value.recipe.prepMinutes ?? null, cookMinutes: value.recipe.cookMinutes ?? null, sourceUrl: null }) : undefined
  return { name: operation === 'food.diary.create' ? value.name.trim() : normalRecipe!.title, meal: operation === 'recipe.library.create' ? 'uncategorized' : value.meal, localDate, destination: operation === 'recipe.library.create' ? 'library' : 'diary', ingredients: requests, ...(normalRecipe ? { recipe: normalRecipe, servingsEaten: operation === 'food.recipe.log' ? value.servingsEaten : normalRecipe.servings } : {}), ...(value.budgetSourceVersion ? { budgetSourceVersion: value.budgetSourceVersion } : {}), ...(countries[0] ? { country: countries[0] } : {}) }
}
/** Revalidate the server-service normalized wire shape independently of the
 * caller. Derived displays/destination/recipe fields must match strict inputs. */
export function validateAssistantFoodServiceValues(operation: unknown, raw: unknown): AssistantFoodValues {
  if (operation !== 'food.diary.create' && operation !== 'recipe.library.create' && operation !== 'food.recipe.log') fail('Choose a registered structured food operation.')
  const source = record(raw), allowed = ['name','meal','localDate','destination','ingredients','recipe','servingsEaten','budgetSourceVersion','country']
  if (Object.keys(source).some(key => !allowed.includes(key)) || !Array.isArray(source.ingredients)) fail('That structured meal contains unsupported fields.')
  const measuredInputs = source.ingredients.map((entry: any) => {
    record(entry)
    if (Object.keys(entry).some(key => !['name','quantity','unit','brand','country','display'].includes(key))) fail('That ingredient contains unsupported fields.')
    return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'display'))
  })
  const recipeInput = source.recipe ? { title: source.recipe.title, yieldServings: source.recipe.servings, ingredients: measuredInputs, steps: source.recipe.steps, ...(source.recipe.prepMinutes !== null ? { prepMinutes: source.recipe.prepMinutes } : {}), ...(source.recipe.cookMinutes !== null ? { cookMinutes: source.recipe.cookMinutes } : {}) } : undefined
  const input = operation === 'food.diary.create' ? { name: source.name, meal: source.meal, ingredients: measuredInputs } : { recipe: recipeInput, ...(operation === 'food.recipe.log' ? { meal: source.meal, servingsEaten: source.servingsEaten } : {}) }
  const normalized = normalize(operation as AssistantFoodOperationId, { ...input, localDate: source.localDate, ...(source.budgetSourceVersion ? { budgetSourceVersion: source.budgetSourceVersion } : {}) } as Record<string, AssistantValue>, { actorId: 'server-validation', localDate: source.localDate, capabilities: [] })
  if (!same(normalized, source)) fail('The structured meal changed its exact measured fields or destination.')
  return normalized
}

function validateNormal(prepared: AssistantFoodPreparation, values: AssistantFoodValues, context: AssistantContext) {
  if (prepared.actorId !== context.actorId || prepared.localDate !== values.localDate || prepared.destination !== values.destination || prepared.cost?.kind !== 'free' || prepared.cost.maximumCredits !== 0) fail('The normal meal preparation did not match this account, destination or free source lookup.')
  const draft = record(prepared.normalDraft)
  if (draft.canConfirm !== true || draft.autoSave === true || draft.localDate !== values.localDate || typeof draft.reviewToken !== 'string' || !draft.reviewToken || (values.destination === 'library' ? draft.action !== 'record_action' : draft.action !== 'food_build_meal')) fail('The normal food tool needs a complete signed source review before saving.')
  const food = validateNativeVoiceResolvedFood(draft.food, prepared.trustedSources)
  if (food.mealName !== values.name || food.meal !== values.meal || food.items.length !== values.ingredients.length) fail('The resolved meal changed its exact requested name, destination or ingredients.')
  for (let i = 0; i < food.items.length; i++) {
    const item = food.items[i], requested = values.ingredients[i], source = record(item.__voiceSourceFood)
    if (item.requestedName !== requested.name || item.requestedAmount !== requested.display || item.estimatedPortion === true) fail('An ingredient needs its exact measured source portion before saving.')
    const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (requested.brand && normalizeName(String(source.brand || '')) !== normalizeName(requested.brand) && !normalizeName(String(source.name)).includes(normalizeName(requested.brand))) fail('The resolved source does not match the requested brand.')
    if (requested.country && source.country && String(source.country).toUpperCase() !== requested.country) fail('The resolved source comes from another requested country catalog.')
  }
  if (values.recipe) {
    const savedRecipe = validateNativeVoiceImportedRecipe(food.nutrition.__importRecipe)
    if (!same(savedRecipe, values.recipe) || food.nutrition.__portionAmount !== values.servingsEaten || food.nutrition.__portionScale !== values.servingsEaten! / values.recipe.servings || food.nutrition.__portionUnit !== 'serving' || food.nutrition.__portionRecipeServings !== values.recipe.servings) fail('The recipe yield, ingredients, complete steps or eaten servings changed after review.')
  } else if (food.nutrition.__portionScale !== undefined && food.nutrition.__portionScale !== 1) fail('Please review the measured whole meal before changing a recipe portion.')
  return food
}
export function createNativeAssistantFoodOperations(services: AssistantFoodServices): AssistantOperation[] {
  async function authorize(context: AssistantContext) { if (!context.actorId || context.signal?.aborted || await services.authenticate(context) !== context.actorId || context.signal?.aborted) fail('Please use the same signed-in account for this meal.') }
  async function budget(context: AssistantContext, values: AssistantFoodValues, resolvedFood?: any) {
    if (!values.budgetSourceVersion) return
    if (!services.readDayContext) fail('Please read the current saved daily allowance before planning dinner.')
    const current = await services.readDayContext!(context, values.localDate)
    await authorize(context)
    if (current?.actorId !== context.actorId || current.verified !== true || current.safeToClaimSaved !== false || typeof current.sourceVersion !== 'string' || !/^[a-f0-9]{64}$/.test(current.sourceVersion)) fail('The current owned daily allowance could not be verified. Please read it again.')
    const choices: AssistantValue[] = [{ localDate: current.localDate, budgetSourceVersion: current.sourceVersion, budget: { status: current.budget?.status ?? 'unavailable', remainingCalories: typeof current.budget?.remainingCalories === 'number' && Number.isFinite(current.budget.remainingCalories) ? current.budget.remainingCalories : null }, ...(current.constraints ? { constraints: wire(current.constraints) } : {}) }]
    const clarification = (message: string, fields: string[]): never => { throw Object.assign(new AssistantContractError('missing_fields', message, fields), { choices }) }
    if (current.localDate !== values.localDate || current.sourceVersion !== values.budgetSourceVersion || current.budget?.status !== 'ready') clarification('Your food, exercise, targets or diet changed. Nothing was submitted. Please refresh the dinner plan and review it again.', ['values.budgetSourceVersion', ...(current.localDate !== values.localDate ? ['values.localDate'] : [])])
    if (resolvedFood) {
      const portionCalories = resolvedFood.nutrition.calories / (values.destination === 'library' && values.recipe ? values.recipe.servings : 1)
      if (typeof current.budget.remainingCalories !== 'number' || !Number.isFinite(current.budget.remainingCalories) || portionCalories > current.budget.remainingCalories + 0.000001) clarification('This reviewed dinner portion exceeds your current remaining calories. Nothing was submitted. Please reduce its measured portion or ingredients and review it again.', [values.recipe ? 'values.recipe' : 'values.ingredients'])
    }
  }
  async function preparedData(context: AssistantContext, operation: AssistantFoodOperationId, prepared: AssistantPrepared) {
    await authorize(context)
    const data = record(prepared.data)
    if (data.actorId !== context.actorId || data.operation !== operation || !data.values || !data.normal || prepared.cost.kind !== 'free' || prepared.cost.maximumCredits !== 0 || prepared.sourceVersion !== digest(data)) fail('Please review this exact meal and its complete recipe again.')
    validateNormal(data.normal, data.values, context)
    return data as { actorId: string; operation: AssistantFoodOperationId; values: AssistantFoodValues; normal: AssistantFoodPreparation }
  }
  async function checkedResult(context: AssistantContext, data: Awaited<ReturnType<typeof preparedData>>, result: any, actionId?: string) {
    await authorize(context)
    if (!result || result.actorId !== context.actorId || typeof result.id !== 'string' || !result.id || result.id.length > 200 || result.destination !== data.values.destination || result.saved !== true || result.status !== 'completed' || typeof result.actionId !== 'string' || !result.actionId || actionId && result.actionId !== actionId) fail('The app did not return the exact saved meal receipt.')
    if (!await services.verify(context, result, data.normal.normalDraft, data.values)) fail('The exact saved food, sources and recipe could not be reopened and verified.')
    await authorize(context)
    return { operation: data.operation, actorId: context.actorId, actionId: result.actionId, id: result.id, destination: data.values.destination, saved: true, verified: true, status: 'completed', name: data.values.name, localDate: data.values.localDate, meal: data.values.meal, ...(data.values.recipe ? { recipe: wire(data.values.recipe), servingsEaten: data.values.servingsEaten } : {}), nutrition: wire(data.normal.normalDraft.food.nutrition), message: data.values.destination === 'library' ? 'The complete reviewed recipe is saved in your library. No eaten serving was added.' : 'The exact reviewed meal and eaten portion are saved in your food diary.' }
  }
  return (Object.keys(schemas) as AssistantFoodOperationId[]).map(operation => ({
    id: operation, kind: 'write', input: schemas[operation], description: operation === 'recipe.library.create' ? 'Save a complete measured source-resolved recipe to the library only.' : operation === 'food.recipe.log' ? 'Log the explicit number of eaten servings from a complete source-resolved recipe.' : 'Resolve, review and save one exact measured meal using the normal food builder.', normalHandler: 'normal source-resolving buildVoiceMealDraft + recipe metadata/library service + signed normal confirmation and exact readback',
    coverage: { manualIds: [operation === 'food.diary.create' ? 'food.diary.create' : operation === 'recipe.library.create' ? 'food.library.create' : 'food.library.log'], status: 'offline-proof', scope: 'Strict structured source/destination/portion boundary. Actual normal host services must be wired and tested; no provider or generation installed here.' },
    prepare: async (context, raw) => {
      await authorize(context); const values = normalize(operation, raw, context); await budget(context, values)
      const normal = await services.prepare(context, operation, values); await authorize(context); const food = validateNormal(normal, values, context); await budget(context, values, food)
      const ingredientReview = values.ingredients.map((item, i) => `${item.display}${item.brand ? `; brand ${item.brand}` : ''}${item.country ? `; country ${item.country}` : ''}; resolved source ${String(food.items[i].__voiceSourceFood.name)}`).join('\n')
      const completeRecipe = values.recipe ? `\nRecipe yield: ${values.recipe.servings}. ${values.destination === 'diary' ? `Servings eaten: ${values.servingsEaten}.` : 'Library only; no diary entry.'}\nSteps:\n${values.recipe.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : ''
      const data = wire({ actorId: context.actorId, operation, values, normal })
      return { data, sourceVersion: digest(data), cost: { kind: 'free', maximumCredits: 0 }, summary: `${values.destination === 'library' ? 'Save to recipe library' : `Log to ${values.meal} on ${values.localDate}`}: ${values.name}\n${ingredientReview}${completeRecipe}\nSource calories: ${food.nutrition.calories} kcal. Unknown nutrients remain unreported.` }
    },
    execute: async (context, prepared, receipt) => { const data = await preparedData(context, operation, prepared); if (receipt?.receiptClaimed !== true || typeof receipt.actionId !== 'string' || !receipt.actionId || receipt.actionId.length > 200) fail('A durable reviewed action receipt is required before saving this meal.');
      try { await budget(context, data.values, data.normal.normalDraft.food) }
      catch (error) { if (error instanceof AssistantContractError && error.code === 'missing_fields') throw new AssistantNotSubmittedError(error.message, error.fields, (error as AssistantContractError & { choices?: AssistantValue[] }).choices ?? []); throw error }
      const result = await services.execute(context, data.normal.normalDraft, receipt); return checkedResult(context, data, result, receipt.actionId) },
    verify: async (context, result: any, prepared) => { if (!prepared) return false; const data = await preparedData(context, operation, prepared); if (result?.operation !== operation || result.verified !== true) return false; try { await checkedResult(context, data, result); return true } catch { return false } },
    ...(services.recover ? { recover: async (context: AssistantContext, actionId: string, prepared: AssistantPrepared) => { const data = await preparedData(context, operation, prepared), result = await services.recover!(context, actionId, data.normal.normalDraft, data.values); return result === null ? null : checkedResult(context, data, result, actionId) } } : {}),
    plannerResult: (result: any): AssistantValue => wire({ id: result.id, destination: result.destination, name: result.name, localDate: result.localDate, meal: result.meal, ...(result.recipe ? { recipe: result.recipe, servingsEaten: result.servingsEaten } : {}), nutrition: Object.fromEntries(['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g'].map(key => [key, result.nutrition[key] ?? null])), message: result.message }),
  }))
}

export { validateNormal as validateAssistantFoodPreparedSource }
