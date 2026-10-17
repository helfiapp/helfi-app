import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'
import { invokeNativeVoiceRecordRoute, prepareNativeVoiceRecordAction, executeNativeVoiceRecordAction, mutateNativeVoiceFavoriteLibrary, readNativeVoiceFavoriteLibrary } from '@/lib/native-voice-record-actions'
import { validateNativeVoiceResolvedFood } from '@/lib/native-voice-resolved-food'
import { parseSpokenQuantity, normalizeSpokenMeasurementQuantities } from '@/lib/native-voice-spoken-quantities'
import { applyNativeVoiceRecipeMetadata } from '@/lib/native-voice-recipe-metadata'
import { extractBlobPathWithPrefixes } from '@/lib/blob-paths'
import { nativeVoiceFoodCopyVersion, nativeVoiceFoodCopyWaterId, nativeVoiceFoodCopyWaterVersion, relinkNativeVoiceCopiedDrink, nativeVoiceFoodCopyReview } from '@/lib/native-voice-food-copy'

const SELECTOR = { id: 'exact existing owned ID OR query', query: 'exact existing saved title', sourceDate: 'YYYY-MM-DD for diary only' }
export const VOICE_FOOD_MANAGEMENT_SCHEMAS = {
  'diary.list': { localDate: 'YYYY-MM-DD', meal: 'optional breakfast|lunch|dinner|snacks|other|uncategorized', limit: 'optional 1..100, default20' },
  'diary.detail': { ...SELECTOR },
  'diary.totals': { localDate: 'YYYY-MM-DD', meal: 'optional breakfast|lunch|dinner|snacks|other|uncategorized' },
  'library.list': { entity: 'favorite|custom_food|recipe|all', limit: 'optional 1..100, default20' },
  'library.detail': { entity: 'favorite|custom_food|recipe|all', id: SELECTOR.id, query: SELECTOR.query },
  'diary.copy': { selectors: '1..50 exact diary selectors {id OR query,sourceDate}', targetDates: '1..7 explicit YYYY-MM-DD target dates; maximum100 new foods total', targetMeal: 'optional breakfast|lunch|dinner|snacks|other|uncategorized' },
  'diary.combine': { selectors: '2..20 exact diary selectors {id OR query,sourceDate} from one date', name: 'literal combined meal name stated by user', targetMeal: 'breakfast|lunch|dinner|snacks|other|uncategorized; creates one combined diary entry and custom library food, removes only selected originals; linked drinks unsupported' },
  'library.edit': { entity: 'favorite|custom_food', id: SELECTOR.id, query: SELECTOR.query, changes: 'ingredients:[{name,quantity,unit}] OR ingredientChanges:[{match,quantity?,unit?,replacementName?,remove?}], ingredientsAdd:[{name,quantity,unit}], portionMultiplier:positive multiplier relative to current stored portion; never nutrition/items JSON' },
  'barcode.lookup': { code: 'exact numeric barcode,8|12|13|14 digits stated by user; normal lookup3credits only if found' },
  'food_missing.submit': { name: 'exact dictated missing name', brand: 'optional exact brand', size: 'optional exact size', country: 'optional two-letter country', kind: 'optional single|packaged', query: 'optional exact failed search', notes: 'optional exact dictated notes' },
} as const
export type VoiceFoodManagementAction = keyof typeof VOICE_FOOD_MANAGEMENT_SCHEMAS
export type VoiceFoodManagementInput = { action: VoiceFoodManagementAction; values: Record<string, any> }
type Selector = { id?: string; query?: string; sourceDate?: string }
type Call = { domain: 'diary' | 'library' | 'water' | 'barcode' | 'missing'; id?: string; localDate?: string; code?: string; body?: any }
export type VoiceFoodManagementIo = {
  userId: (request: NextRequest) => Promise<string | null>
  call: (request: NextRequest, call: Call) => Promise<any>
  /** Server-owned normal food builder only. It receives the selected complete
   * saved basis and validated measured deltas; never accept this from JSON. */
  resolveLibraryEdit?: (request: NextRequest, userId: string, sourceFood: any, changes: Record<string, any>) => Promise<{ food: any; trustedSources: any[] }>
  recordIo?: typeof invokeNativeVoiceRecordRoute
}
export const nativeVoiceFoodManagementIo: VoiceFoodManagementIo = {
  userId: async request => {
    const session = await getServerSession(authOptions), native = await getUserIdFromNativeAuth(request)
    if (session?.user?.email && !session.user.id || session?.user?.id && native && session.user.id !== native) throw new Error('Please sign in to the same account before using this food action.')
    return session?.user?.id || native || null
  },
  call: async (original, call) => {
    if (call.domain === 'diary' || call.domain === 'library' || call.domain === 'water') return invokeNativeVoiceRecordRoute(original, { entity: call.domain === 'diary' ? 'food' : call.domain === 'library' ? 'favorite' : 'water', method: 'GET', localDate: call.localDate || '2000-01-01', id: call.id })
    const url = new URL(call.domain === 'barcode' ? '/api/barcode/lookup' : '/api/food-missing', original.url)
    if (call.domain === 'barcode') url.searchParams.set('code', call.code!)
    if (call.domain === 'missing' && call.id) url.searchParams.set('id', call.id)
    const headers = new Headers(original.headers); headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store')
    if (call.body) headers.set('content-type', 'application/json')
    const request = new NextRequest(url, { method: call.domain === 'barcode' || call.id ? 'GET' : 'POST', headers, signal: original.signal, ...(call.body ? { body: JSON.stringify(call.body) } : {}) })
    const response = call.domain === 'barcode' ? await (await import('@/app/api/barcode/lookup/route')).GET(request) : call.id ? await (await import('@/app/api/food-missing/route')).GET(request) : await (await import('@/app/api/food-missing/route')).POST(request)
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || data.error) throw new Error('The normal food handler did not complete this request. Please check the app before retrying.')
    return data
  },
}
function text(value: any, max = 200): string { if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error('Please give the exact saved name or requested value.'); return value.trim() }
function object(value: any) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Please review this food action.'); return value as Record<string, any> }
function fields(value: any, keys: string[]) { const result = object(value); if (Object.keys(result).some(key => !keys.includes(key))) throw new Error('That field is not supported by this food action.'); return result }
function date(value: any): string { const result = text(value, 10), parsed = new Date(`${result}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new Error('Please choose a valid calendar date.'); return result }
function stable(value: any): any { if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => !['imageUrl', 'signedUrl'].includes(key)).sort().map(key => [key, stable(value[key])])); return value }
function version(userId: string, value: any) { return crypto.createHash('sha256').update(JSON.stringify(stable({ userId, value }))).digest('hex') }
function copyVersion(row: any) { return nativeVoiceFoodCopyVersion({ ...row, imageUrl: extractBlobPathWithPrefixes(row.imageUrl, ['food-photos/']) || row.imageUrl }) }
function meal(value: any) { if (!['breakfast', 'lunch', 'dinner', 'snacks', 'other', 'uncategorized'].includes(value)) throw new Error('Please choose a supported meal category.'); return value }
function selector(raw: any, diary: boolean): Selector { const s = fields(raw, diary ? ['id', 'query', 'sourceDate'] : ['id', 'query']); if (Boolean(s.id) === Boolean(s.query)) throw new Error('Please identify one exact saved food.'); return { ...(s.id ? { id: text(s.id, 120) } : { query: text(s.query, 200) }), ...(diary ? { sourceDate: date(s.sourceDate) } : {}) } }
function validate(input: any, localDate: string): VoiceFoodManagementInput {
  fields(input, ['action', 'values']); if (!Object.hasOwn(VOICE_FOOD_MANAGEMENT_SCHEMAS, input.action)) throw new Error('Please choose a registered food action.')
  const action = input.action as VoiceFoodManagementAction, raw = fields(input.values, Object.keys(VOICE_FOOD_MANAGEMENT_SCHEMAS[action])), values: any = { ...raw }
  if (['diary.list', 'diary.totals'].includes(action)) { values.localDate = date(raw.localDate || localDate); if (raw.meal !== undefined) values.meal = meal(raw.meal) }
  if (action === 'diary.detail') Object.assign(values, selector(raw, true))
  if (action.startsWith('library.')) { values.entity = raw.entity || 'all'; if (!['favorite', 'custom_food', 'recipe', 'all'].includes(values.entity) || action === 'library.edit' && !['favorite', 'custom_food'].includes(values.entity)) throw new Error('Please choose Favorites, Custom foods or saved recipes.'); if (action !== 'library.list') Object.assign(values, selector({ id: raw.id, query: raw.query }, false)) }
  if (action.endsWith('.list')) { values.limit = raw.limit ?? 20; if (!Number.isInteger(values.limit) || values.limit < 1 || values.limit > 100) throw new Error('Please choose a list limit from1 to100.') }
  if (action === 'diary.copy' || action === 'diary.combine') { if (action === 'diary.combine') { if (!Array.isArray(raw.selectors) || raw.selectors.length < 2 || raw.selectors.length > 20) throw new Error('Please choose two to twenty saved foods to combine.'); values.name = text(raw.name, 160); values.targetMeal = meal(raw.targetMeal); values.selectors = raw.selectors.map((s: any) => selector(s, true)); if (new Set(values.selectors.map((s: Selector) => s.sourceDate)).size !== 1) throw new Error('Please combine foods from one exact diary date.'); } else { if (!Array.isArray(raw.selectors) || !raw.selectors.length || raw.selectors.length > 50 || !Array.isArray(raw.targetDates) || !raw.targetDates.length || raw.targetDates.length > 7) throw new Error('Please choose up to50 exact foods and up to7 target dates.'); values.selectors = raw.selectors.map((s: any) => selector(s, true)); values.targetDates = raw.targetDates.map(date); if (new Set(values.targetDates).size !== values.targetDates.length || values.selectors.length * values.targetDates.length > 100) throw new Error('Please review at most100 copies with distinct target dates.'); if (raw.targetMeal !== undefined) values.targetMeal = meal(raw.targetMeal) } }
  if (action === 'library.edit') values.changes = validateChanges(raw.changes)
  if (action === 'barcode.lookup') { values.code = text(raw.code, 14); if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(values.code)) throw new Error('Please give an8,12,13 or14digit barcode.') }
  if (action === 'food_missing.submit') { for (const key of Object.keys(raw)) values[key] = text(raw[key], key === 'notes' ? 1200 : 200); values.name = text(raw.name, 200); if (raw.country && !/^[A-Za-z]{2}$/.test(raw.country)) throw new Error('Please give a two-letter country.'); if (raw.country) values.country = raw.country.toUpperCase(); if (raw.kind && !['single', 'packaged'].includes(raw.kind)) throw new Error('Please choose single or packaged food.') }
  return { action, values }
}
function measured(raw: any) { const item = fields(raw, ['name', 'quantity', 'unit']); const name = text(item.name, 200), unit = text(item.unit, 30); if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100000 || !/^(?:g|grams?|kg|ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?|lb|lbs|cups?|tbsp|tablespoons?|tsp|teaspoons?|each|pieces?|items?|servings?)$/i.test(unit)) throw new Error('Please give a positive measured ingredient amount and supported unit.'); return { name, quantity: item.quantity, unit } }
function validateChanges(raw: any) {
  const changes = fields(raw, ['ingredients', 'ingredientChanges', 'ingredientsAdd', 'portionMultiplier'])
  if (!Object.keys(changes).length) throw new Error('Please say which measured ingredient or portion to change.')
  const result: any = {}
  if (changes.ingredients !== undefined) { if (changes.ingredientChanges !== undefined || changes.ingredientsAdd !== undefined || !Array.isArray(changes.ingredients) || !changes.ingredients.length || changes.ingredients.length > 30) throw new Error('Please choose one complete replacement list or individual ingredient changes.'); result.ingredients = changes.ingredients.map(measured) }
  if (changes.ingredientsAdd !== undefined) { if (!Array.isArray(changes.ingredientsAdd) || !changes.ingredientsAdd.length || changes.ingredientsAdd.length > 30) throw new Error('Please give measured ingredients to add.'); result.ingredientsAdd = changes.ingredientsAdd.map(measured) }
  if (changes.ingredientChanges !== undefined) {
    if (!Array.isArray(changes.ingredientChanges) || !changes.ingredientChanges.length || changes.ingredientChanges.length > 30) throw new Error('Please identify the exact ingredient to change.')
    result.ingredientChanges = changes.ingredientChanges.map((raw: any) => { const c = fields(raw, ['match', 'quantity', 'unit', 'replacementName', 'remove']); const match = text(c.match, 200); if (c.remove === true) { if (c.quantity !== undefined || c.unit !== undefined || c.replacementName !== undefined) throw new Error('Choose removal or replacement of that ingredient.'); return { match, remove: true } } if (c.remove !== undefined && c.remove !== false || (c.quantity === undefined) !== (c.unit === undefined) || c.quantity === undefined && c.replacementName === undefined) throw new Error('Please give the measured ingredient change.'); const replacementName = c.replacementName === undefined ? undefined : text(c.replacementName, 200); if (c.quantity !== undefined) measured({ name: replacementName || match, quantity: c.quantity, unit: c.unit }); return { match, ...(c.quantity !== undefined ? { quantity: c.quantity, unit: c.unit } : {}), ...(replacementName ? { replacementName } : {}) } })
  }
  if (changes.portionMultiplier !== undefined) { if (typeof changes.portionMultiplier !== 'number' || !Number.isFinite(changes.portionMultiplier) || changes.portionMultiplier <= 0 || changes.portionMultiplier > 1000) throw new Error('Please give a positive portion multiplier.'); result.portionMultiplier = changes.portionMultiplier }
  return result
}
/** Reuses the caller's NORMAL source resolver. This pure orchestration cannot
 * call a provider, accept nutrient JSON, or manufacture a source serving. */
export async function resolveVoiceLibraryFoodEdit(sourceFood: any, rawChanges: any,
  build: (ingredients: any[], trustedSourceItems: any[]) => Promise<{ canConfirm?: boolean; food?: any; confirmationMessage?: string }>) {
  const changes = validateChanges(rawChanges), old = nutrition(sourceFood?.nutrition)
  const stored = Array.isArray(old.__fullMealItems) && old.__fullMealItems.length ? old.__fullMealItems : sourceFood?.items
  const parse = (item: any) => {
    const name = text(item.requestedName || item.name || item.label, 200)
    const requested = normalizeSpokenMeasurementQuantities(String(item.requestedAmount || ''), 'food')
    const raw = requested || `${String(item.serving_size || item.serving || '')} ${name}`
    const match = raw.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter|\d+(?:\.\d+)?)\s+(?:(g|grams?|kg|ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?|lb|lbs|cups?|tbsp|tablespoons?|tsp|teaspoons?|each|pieces?|items?|servings?)\b\s*(?:of\s+)?)?/i)
    const quantity = match ? parseSpokenQuantity(match[1]) : null, factor = item.servings === undefined ? 1 : item.servings
    if (quantity == null || typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0 || item.macroMultiplier != null && item.macroMultiplier !== 1 || item.multiplier != null && item.multiplier !== 1) throw new Error('The saved ingredient needs its exact measured amount. Please give the complete replacement ingredient list.')
    return measured({ name, quantity: quantity * factor, unit: match![2] || 'each' })
  }
  let ingredients: any[] = changes.ingredients ? changes.ingredients.map(measured) : Array.isArray(stored) && stored.length ? stored.map(parse) : []
  if (!ingredients.length) throw new Error('Please give the complete measured ingredient list for this saved food.')
  for (const c of changes.ingredientChanges || []) {
    const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), match = normalized(c.match)
    const exact = ingredients.map((item, index) => normalized(item.name) === match ? index : -1).filter(index => index >= 0)
    const matches = exact.length ? exact : ingredients.map((item, index) => match.split(' ').every(word => normalized(item.name).split(' ').includes(word)) ? index : -1).filter(index => index >= 0)
    if (matches.length !== 1) throw new Error('Please choose one exact saved ingredient before changing it.')
    if (c.remove) ingredients.splice(matches[0], 1)
    else { const previous = ingredients[matches[0]]; ingredients[matches[0]] = measured({ name: c.replacementName || previous.name, quantity: c.quantity ?? previous.quantity, unit: c.unit || previous.unit }) }
  }
  ingredients.push(...(changes.ingredientsAdd || []).map(measured))
  if (!ingredients.length || ingredients.length > 30) throw new Error('Please keep one to thirty measured ingredients.')
  const batches: any[] = []
  for (let offset = 0; offset < ingredients.length; offset += 12) {
    const result = await build(ingredients.slice(offset, offset + 12).map(item => ({ ...item, display: `${item.quantity} ${item.unit} ${item.name}` })), stored || [])
    if (!result?.canConfirm || !result.food) throw new Error('A changed ingredient could not be resolved from its food source. Nothing has changed.')
    batches.push(result.food)
  }
  const items = batches.flatMap(batch => batch.items), trustedSources = items.map(item => item.__voiceSourceFood)
  const full = { ...sourceFood, items, nutrition: { ...old, ...Object.fromEntries(NUTRIENTS.flatMap(([primary, alias]) => { const values = items.map(item => { const raw = Object.hasOwn(item, primary) ? item[primary] : item[alias]; return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null }); const value = values.some(value => value === null) ? null : values.reduce((sum: number, value: any) => sum + value, 0); return [[primary, value], [alias, value]] })) } }
  const multiplier = changes.portionMultiplier ?? 1, currentScale = old.__portionScale ?? 1
  if (typeof currentScale !== 'number' || !Number.isFinite(currentScale) || currentScale <= 0) throw new Error('Please review the stored food portion first.')
  if (old.__importRecipe) {
    const recipe = { ...old.__importRecipe, ingredients: ingredients.map(item => `${item.quantity} ${item.unit} ${item.name}`) }
    if (old.__portionUnit !== undefined && old.__portionUnit !== 'serving') throw new Error('Please choose a recorded recipe serving portion before changing its ingredients.')
    const currentAmount = old.__portionAmount ?? recipe.servings * currentScale
    if (typeof currentAmount !== 'number' || !Number.isFinite(currentAmount) || currentAmount <= 0 || Math.abs(currentAmount / recipe.servings - currentScale) > .0000001) throw new Error('The saved recipe portion is inconsistent. Please review it first.')
    delete full.nutrition.__portionScale
    Object.assign(full, applyNativeVoiceRecipeMetadata(full, recipe, { servingsEaten: currentAmount * multiplier, portionControlEnabled: old.__portionControlEnabled === true || currentAmount * multiplier !== recipe.servings }))
  } else {
    if (['g', 'oz'].includes(old.__portionUnit)) throw new Error('This saved weight-based portion needs a complete weight review before changing its ingredients. Please use the normal editor.')
    const scale = currentScale * multiplier
    if (!Number.isFinite(scale) || scale <= 0 || scale > 1000) throw new Error('Please review a supported saved food portion.')
    for (const [primary, alias] of NUTRIENTS) { const value = full.nutrition[primary]; full.nutrition[primary] = value == null ? null : value * scale; full.nutrition[alias] = full.nutrition[primary] }
    if (old.__portionScale !== undefined || changes.portionMultiplier !== undefined) Object.assign(full.nutrition, { __portionScale: scale, __portionAmount: (old.__portionAmount ?? 1) * multiplier, __portionUnit: old.__portionUnit || 'serving', __portionControlEnabled: old.__portionControlEnabled === true || scale !== 1 })
  }
  if (Object.hasOwn(old, '__fullMealItems')) full.nutrition.__fullMealItems = items
  if (Object.hasOwn(old, '__fullMealNutrition')) full.nutrition.__fullMealNutrition = Object.fromEntries(NUTRIENTS.flatMap(([primary, alias]) => { const values = items.map(item => item[primary] ?? item[alias]); const value = values.some(value => value == null) ? null : values.reduce((sum, value) => sum + value, 0); return [[primary, value], [alias, value]] }))
  return { food: validateNativeVoiceResolvedFood(full, trustedSources), trustedSources }
}

function active(request: NextRequest) { if (request.signal?.aborted) throw new Error('This food request was stopped. Please check the app before retrying.') }
async function authorize(request: NextRequest, userId: string, io: VoiceFoodManagementIo) { active(request); if (!request.headers.get('x-helfi-voice-capabilities')?.split(',').map(s => s.trim()).includes('food-management-v1')) throw new Error('This food action needs the updated Helfi app. Nothing has changed.'); if (!userId || await io.userId(request) !== userId) throw new Error('Please sign in to the same account before using this food action.'); active(request) }
const NUTRIENTS = [['calories_kcal', 'calories'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']] as const
function nutrition(value: any) { if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = {} } } return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function totals(rows: any[]) { return Object.fromEntries(NUTRIENTS.map(([primary, alias]) => { const values = rows.map(row => { const n = nutrition(row.nutrients ?? row.nutrition ?? row.total); const value = Object.hasOwn(n, primary) ? n[primary] : n[alias]; return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }); return [primary, values.some(v => v === null) ? null : values.reduce<number>((sum, value) => sum + Number(value), 0)] })) }
function nutrientText(value: any) { return NUTRIENTS.map(([primary], index) => `${['calories', 'protein', 'carbohydrate', 'fat', 'fibre', 'sugar'][index]} ${value[primary] == null ? 'unknown' : `${Number(value[primary].toFixed(2))}${index ? 'g' : 'kcal'}`}`).join(', ') }
function label(row: any) { return String(row.label || row.name || row.description || 'Unnamed food') }
function libraryType(row: any) { const n = nutrition(row.nutrition ?? row.total); return n.__importRecipe ? 'recipe' : row.custom || row.customMeal || row.method === 'meal-builder' ? 'custom_food' : 'favorite' }
function detail(row: any) { const n = nutrition(row.nutrients ?? row.nutrition ?? row.total), items = Array.isArray(row.items) ? row.items : []; return { id: row.id, label: label(row), localDate: row.localDate, meal: row.meal || row.category, createdAt: row.createdAt, nutrition: totals([row]), items, storedPortion: { scale: n.__portionScale ?? 1, amount: n.__portionAmount ?? null, unit: n.__portionUnit ?? null, recipeServings: n.__portionRecipeServings ?? null }, recipe: n.__importRecipe || row.recipe || row.raw?.recipe || null } }
async function diary(request: NextRequest, userId: string, localDate: string, io: VoiceFoodManagementIo, id?: string) { const data = await io.call(request, { domain: 'diary', localDate, id }); active(request); const list = data.log ? [data.log] : data.logs; if (data.success !== true || !Array.isArray(list) || list.length > 5000 || list.some(row => !row || typeof row.id !== 'string' || row.userId !== userId || row.localDate && row.localDate !== localDate) || new Set(list.map(row => row.id)).size !== list.length) throw new Error('The diary did not return a complete owned selection. Please reopen it.'); return list }
async function library(request: NextRequest, userId: string, io: VoiceFoodManagementIo) { const data = await io.call(request, { domain: 'library' }); active(request); if (!Array.isArray(data.favorites) || !/^[a-f0-9]{64}$/.test(data.voiceLibraryVersion || '') || data.favorites.some((row: any) => !row || typeof row.id !== 'string' || row.userId && row.userId !== userId) || new Set(data.favorites.map((row: any) => row.id)).size !== data.favorites.length) throw new Error('Your food library needs a fresh review.'); return data }
function select(rows: any[], selector: Selector) { return rows.filter(row => selector.id ? row.id === selector.id : label(row).trim().toLowerCase() === selector.query!.trim().toLowerCase()) }
function choices(rows: any[]) { return rows.map(row => ({ id: row.id, label: label(row), localDate: row.localDate, createdAt: row.createdAt })) }
function intent(action: VoiceFoodManagementAction, values: any, transcript: string) {
  if (action.startsWith('diary.') && !['diary.copy', 'diary.combine'].includes(action) || action.endsWith('.list') || action.endsWith('.detail')) return
  let command = transcript
  for (const literal of [values.name, values.notes, values.query]) if (typeof literal === 'string') command = command.replace(literal, ' ')
  if (/\b(?:do not|don't|don’t|never)\s+(?:copy|duplicate|combine|merge|report|submit|send|look up|scan|edit|change|update|add|remove)\b|\b(?:how do i|what happens|should i|if i)\b/i.test(command)) throw new Error('Please explicitly request this exact food action. Nothing has changed.')
  if (action === 'diary.combine' && (!/\b(?:combine|merge)\b/i.test(command) || !transcript.includes(values.name))) throw new Error('Please explicitly ask to combine the selected saved foods and dictate their new name.')
  if (action === 'diary.copy' && !/\b(?:copy|duplicate|paste)\b/i.test(command)) throw new Error('Please explicitly ask to copy the selected saved foods.')
  if (action === 'library.edit' && (!/\b(?:edit|change|update|adjust|replace|add|remove|halve|double)\b/i.test(command) || !/\b(?:saved|library|recipe|favorites?|favourites?|custom)\b/i.test(command))) throw new Error('Please explicitly request a change to the saved library item.')
  if (action === 'barcode.lookup' && (!/\b(?:look up|lookup|scan|check|find)\b/i.test(command) || !transcript.replace(/[\s-]/g, '').includes(values.code))) throw new Error('Please state the exact barcode to look up.')
  if (action === 'food_missing.submit' && (!/\b(?:report|submit|send)\b/i.test(command) || !/\b(?:missing|not found)\b/i.test(command))) throw new Error('Please explicitly ask to submit this missing food report.')
}
/** Read actions return verified facts and cannot be confirmed. Mutations bind
 * the exact complete selection, account and source version in a signed review. */
export async function prepareVoiceFoodManagement(request: NextRequest, userId: string, input: VoiceFoodManagementInput, transcript: string, localDate: string, io: VoiceFoodManagementIo = nativeVoiceFoodManagementIo) {
  await authorize(request, userId, io); localDate = date(localDate); const { action, values } = validate(input, localDate); intent(action, values, transcript)
  const base: any = { action: 'food_management_action', transcript, localDate, autoSave: false }
  const read = (message: string, data: any) => ({ ...base, canConfirm: false, summary: message, confirmationMessage: message, foodManagement: { action, userId, operation: 'read', verified: true, data, safeToClaimSaved: false } })
  const ambiguous = (rows: any[]) => ({ ...base, canConfirm: false, summary: 'Choose the exact saved food', confirmationMessage: 'Please choose the exact saved food and date before anything changes.', choices: choices(rows), foodManagement: { action, userId, values, choices: choices(rows) } })
  let prepared: any = { action, userId, values }, summary = ''
  if (action.startsWith('diary.') && !['diary.copy', 'diary.combine'].includes(action)) {
    const selectedDate = values.sourceDate || values.localDate, rows = await diary(request, userId, selectedDate, io, values.id), filtered = values.meal ? rows.filter(row => (row.meal || row.category || 'uncategorized') === values.meal) : rows
    if (action === 'diary.totals') return read(`Food intake for ${selectedDate}: ${nutrientText(totals(filtered))}.`, { localDate: selectedDate, meal: values.meal || null, entryCount: filtered.length, totals: totals(filtered) })
    if (action === 'diary.list') { const visible = filtered.slice(0, values.limit); return read(`Food diary for ${selectedDate}: ${visible.length ? visible.map(row => label(row)).join('; ') : 'no saved foods'}${visible.length < filtered.length ? `. Showing ${visible.length} of ${filtered.length}` : ''}.`, { localDate: selectedDate, entries: visible.map(detail), totalCount: filtered.length, truncated: visible.length < filtered.length }) }
    const matches = select(rows, values); if (matches.length !== 1) return ambiguous(matches.length ? matches : rows)
    return read(`${label(matches[0])}: ${nutrientText(totals(matches))}.`, { entry: detail(matches[0]) })
  }
  if (action === 'library.list' || action === 'library.detail') {
    const state = await library(request, userId, io), rows = state.favorites.filter((row: any) => values.entity === 'all' || values.entity === 'favorite' || libraryType(row) === values.entity)
    if (action === 'library.list') { const visible = rows.slice(0, values.limit); return read(`Saved food library: ${visible.length ? visible.map(label).join('; ') : 'no matching saved foods'}${visible.length < rows.length ? `. Showing ${visible.length} of ${rows.length}` : ''}.`, { entries: visible.map(detail), totalCount: rows.length, truncated: visible.length < rows.length }) }
    const matches = select(rows, values); if (matches.length !== 1) return ambiguous(matches.length ? matches : rows)
    const found = detail(matches[0]), recipe = found.recipe
    return read(`${found.label}: ${nutrientText(found.nutrition)}.${recipe ? ` Stored recipe yield: ${recipe.servings ?? 'not recorded'}. Ingredients: ${Array.isArray(recipe.ingredients) ? recipe.ingredients.join('; ') : 'not recorded'}. Steps: ${Array.isArray(recipe.steps) ? recipe.steps.join('; ') : 'not recorded'}.` : ''}`, { entry: found })
  }
  if (action === 'diary.copy' || action === 'diary.combine') {
    const selected: any[] = []
    const byDate = new Map<string, any[]>()
    for (const s of values.selectors as Selector[]) { if (!byDate.has(s.sourceDate!)) byDate.set(s.sourceDate!, await diary(request, userId, s.sourceDate!, io)); const rows = byDate.get(s.sourceDate!)!, matches = select(rows, s); if (matches.length !== 1) return ambiguous(matches.length ? matches : rows); selected.push(matches[0]) }
    if (new Set(selected.map(row => row.id)).size !== selected.length || selected.some(row => !row.localDate)) throw new Error('Please select each saved food once with its exact date.')
    if (action === 'diary.combine') {
      if (selected.some(row => nativeVoiceFoodCopyWaterId(row))) throw new Error('Keep these drinks as separate diary entries so their hydration links stay correct. Only ordinary foods can be combined by voice.')
      const state = await library(request, userId, io)
      if (state.favorites.length >= 300) throw new Error('Your food library is full. Please review it before combining foods.')
      const combined = combineFoodBasis(selected, values.name, values.targetMeal)
      prepared = { ...prepared, operation: 'combine', selectedIds: selected.map(row => row.id), sources: selected.map(row => ({ id: row.id, localDate: row.localDate, version: copyVersion(row) })), libraryVersion: state.voiceLibraryVersion, combined }
      summary = `Combine exactly ${selected.map(label).join('; ')} on ${selected[0].localDate} as “${values.name}” for ${values.targetMeal}. Create one combined diary entry and one Custom food, then remove exactly these ${selected.length} original food entries. ${nutrientText(totals(selected))}. Other entries remain unchanged`
    } else {
    const waters: any[] = [], ids = selected.map(nativeVoiceFoodCopyWaterId).filter(Boolean)
    if (new Set(ids).size !== ids.length) throw new Error('These selected foods share a hydration entry. Please review them before copying.')
    for (const sourceDate of [...new Set(selected.map(row => row.localDate))]) { const needed = selected.filter(row => row.localDate === sourceDate).map(nativeVoiceFoodCopyWaterId).filter(Boolean); if (!needed.length) continue; const data = await io.call(request, { domain: 'water', localDate: sourceDate }); if (!Array.isArray(data.entries)) throw new Error('Please review the source drink hydration first.'); for (const id of needed) { const matches = data.entries.filter((row: any) => row.id === id && row.userId === userId && row.localDate === sourceDate); if (matches.length !== 1) throw new Error('A selected drink is missing its exact owned hydration entry.'); waters.push(matches[0]) } }
    prepared = { ...prepared, operation: 'copy', sources: selected.map(row => ({ id: row.id, localDate: row.localDate, version: copyVersion(row) })), waters: waters.map(row => ({ id: row.id, localDate: row.localDate, version: nativeVoiceFoodCopyWaterVersion(row) })) }
    summary = `Copy ${selected.length} selected saved food${selected.length === 1 ? '' : 's'} to ${values.targetDates.join(', ')}${values.targetMeal ? ` as ${values.targetMeal}` : ''}, creating ${selected.length * values.targetDates.length} new food entries. ${nativeVoiceFoodCopyReview(selected, waters)} Originals stay unchanged`
    }
  } else if (action === 'library.edit') {
    const state = await library(request, userId, io), rows = state.favorites.filter((row: any) => values.entity === 'favorite' || libraryType(row) === 'custom_food' || Boolean(nutrition(row.nutrition ?? row.total).__importRecipe)), matches = select(rows, values)
    if (matches.length !== 1) return ambiguous(matches.length ? matches : rows)
    if (!io.resolveLibraryEdit) throw new Error('The saved food ingredient resolver is not available in this app version. Nothing has changed.')
    const row = matches[0], sourceFood = { meal: row.meal || 'uncategorized', mealName: label(row), items: row.items || [], nutrition: nutrition(row.nutrition ?? row.total) }
    const resolved = await io.resolveLibraryEdit(request, userId, sourceFood, values.changes), complete = validateNativeVoiceResolvedFood(resolved.food, resolved.trustedSources)
    const oldRecipe = sourceFood.nutrition.__importRecipe, newRecipe = complete.nutrition.__importRecipe
    if (oldRecipe && (!newRecipe || oldRecipe.title !== newRecipe.title || oldRecipe.servings !== newRecipe.servings || JSON.stringify(oldRecipe.steps) !== JSON.stringify(newRecipe.steps) || oldRecipe.sourceUrl !== newRecipe.sourceUrl || !Array.isArray(newRecipe.ingredients) || newRecipe.ingredients.length !== complete.items.length)) throw new Error('Please preserve the saved recipe yield and cooking steps while changing its ingredients.')
    const again = await library(request, userId, io); if (again.voiceLibraryVersion !== state.voiceLibraryVersion || version(userId, again.favorites.find((entry: any) => entry.id === row.id)) !== version(userId, row)) throw new Error('The saved food changed while resolving ingredients. Please review again.')
    const record = await prepareNativeVoiceRecordAction(request, userId, { operation: 'update', entity: values.entity, id: row.id, localDate, changes: { nutrition: complete.nutrition, items: complete.items } }, io.recordIo)
    if (!record.canConfirm || !record.recordAction) return { ...base, ...record, action: 'food_management_action', foodManagement: prepared }
    prepared = { ...prepared, operation: 'update', selectedId: row.id, sourceVersion: version(userId, row), libraryVersion: state.voiceLibraryVersion, recordAction: record.recordAction }
    summary = `Update saved ${values.entity === 'favorite' ? 'favorite' : 'custom food'} “${label(row)}”. ${nutrientText(totals([{ nutrition: complete.nutrition }]))}. This changes the saved library item, not past diary portions`
  } else if (action === 'barcode.lookup') { prepared = { ...prepared, operation: 'lookup', costCreditsIfFound: 3 }; summary = `Look up barcode ${values.code} for3credits only if a food is found. This does not log food or save a library item` }
  else if (action === 'food_missing.submit') { prepared = { ...prepared, operation: 'submit' }; summary = `Submit this missing food report to Helfi support: ${Object.entries(values).map(([key, value]) => `${key}: ${value}`).join('; ')}. This requests a catalog addition; it does not log food or prove email delivery` }
  active(request)
  const draft: any = { ...base, canConfirm: true, summary, confirmationMessage: `${summary}. Nothing has changed yet. Would you like me to confirm this exact action?`, reviewNonce: crypto.randomUUID(), reviewIssuedAt: Date.now(), foodManagement: prepared }
  draft.reviewToken = signNativeVoiceDraft(userId, draft); return draft
}
/** All mutations require the root's durable claim. Copy additionally needs the
 * SAME transaction as that claim/completion; no standalone fall-through writer.
 * Pending/uncertain normal handler calls must not be re-executed on retry. */
export async function executeVoiceFoodManagement(request: NextRequest, userId: string, draft: any, context: { receiptClaimed: true; actionId: string; tx?: any }, io: VoiceFoodManagementIo = nativeVoiceFoodManagementIo) {
  await authorize(request, userId, io)
  const prepared = draft?.foodManagement
  if (!context?.receiptClaimed || !context.actionId || draft?.action !== 'food_management_action' || draft.canConfirm !== true || !verifyNativeVoiceDraft(userId, draft) || prepared?.userId !== userId) throw new Error('Please review this exact food action again.')
  const { action, values } = validate({ action: prepared.action, values: prepared.values }, draft.localDate); intent(action, values, draft.transcript)
  const result = (status: string, saved: boolean, message: string, extra: any = {}) => ({ kind: 'food_management', action, actionId: context.actionId, operation: prepared.operation, status, saved, values, message, ...extra })
  if (action === 'diary.combine') { if (!context.tx) throw new Error('Combining foods requires the app save transaction. Nothing changed.'); const combined = await executeCombine(context.tx, userId, prepared); return result('completed', true, 'The exact selected foods were combined into one diary entry and one Custom food. Only the reviewed originals were removed.', combined) }
  if (action === 'diary.copy') { if (!context.tx) throw new Error('The reviewed copy requires the app save transaction. Nothing was copied.'); const copied = await executeCopy(context.tx, userId, prepared); return result('completed', true, `Copied exactly ${copied.ids.length} reviewed food entries${copied.waterIds.length ? ` and ${copied.waterIds.length} hydration entries` : ''}. Originals were retained.`, copied) }
  if (action === 'library.edit') {
    const state = await library(request, userId, io), row = state.favorites.find((entry: any) => entry.id === prepared.selectedId)
    if (!row || state.voiceLibraryVersion !== prepared.libraryVersion || version(userId, row) !== prepared.sourceVersion) throw new Error('Your saved food library changed after review. Please review it again.')
    const saved = await executeNativeVoiceRecordAction(request, userId, prepared.recordAction, io.recordIo)
    return result('completed', true, 'The exact reviewed library ingredients and portion were saved. Past diary entries were not changed.', { id: saved.id })
  }
  if (action === 'barcode.lookup') {
    if (prepared.costCreditsIfFound !== 3) throw new Error('Please review the normal barcode lookup price again.')
    const response = await io.call(request, { domain: 'barcode', code: values.code }); active(request)
    if (response.found === true && response.food && typeof response.food.name === 'string') return result('found_not_saved', false, `The normal barcode lookup found ${response.food.name}. No food has been logged or saved.`, { food: response.food, costCredits: 3, code: values.code })
    if (response.found === false) return result('not_found', false, 'The normal barcode lookup found no matching food. No food has been logged or saved.', { costCredits: 0, code: values.code })
    throw new Error('The barcode handler did not return a verified lookup result. Check the app before retrying.')
  }
  if (action === 'food_missing.submit') {
    const response = await io.call(request, { domain: 'missing', body: { ...values, ...(values.brand ? { chain: values.brand } : {}), source: 'voice-reviewed-missing-food' } }); active(request)
    if (response.success !== true || typeof response.id !== 'string') throw new Error('The app did not confirm acceptance of this missing food report. Check before retrying.')
    const readback = await io.call(request, { domain: 'missing', id: response.id }), report = readback?.report
    if (readback?.success !== true || !report || report.id !== response.id || report.userId !== userId || report.source !== 'voice-reviewed-missing-food' || Object.entries(values).some(([key, value]) => report[key] !== value) || values.brand && report.chain !== values.brand) throw new Error('The submitted report did not match the reviewed account and exact fields. Check before retrying.')
    return result('submitted', true, 'The exact reviewed missing food report is saved. Catalog changes and email delivery are not confirmed.', { id: response.id })
  }
  throw new Error('This read-only food action cannot be executed as a save.')
}
async function executeCopy(tx: any, userId: string, prepared: any) {
  const sources = prepared.sources, waters = prepared.waters, values = prepared.values
  if (!Array.isArray(sources) || !sources.length || sources.length * values.targetDates.length > 100 || new Set(sources.map((s: any) => s.id)).size !== sources.length || !Array.isArray(waters)) throw new Error('Please review the complete selected copy again.')
  await lockCopySources(tx, userId, sources.map((s: any) => s.id))
  const rows = await tx.foodLog.findMany({ where: { userId, id: { in: sources.map((s: any) => s.id) } } })
  if (rows.length !== sources.length || rows.some((row: any) => row.userId !== userId || !sources.some((s: any) => s.id === row.id && s.localDate === row.localDate && s.version === copyVersion(row)))) throw new Error('A selected food changed after review. Nothing was copied.')
  const links = rows.map(nativeVoiceFoodCopyWaterId).filter(Boolean)
  if (new Set(links).size !== links.length || waters.length !== links.length || waters.some((w: any) => !links.includes(w.id))) throw new Error('The selected drink links changed after review.')
  const hydration = links.length ? await tx.waterLog.findMany({ where: { userId, id: { in: links } } }) : []
  if (hydration.length !== waters.length || hydration.some((row: any) => row.userId !== userId || !waters.some((w: any) => w.id === row.id && w.localDate === row.localDate && w.version === nativeVoiceFoodCopyWaterVersion(row)))) throw new Error('A selected hydration entry changed after review. Nothing was copied.')
  const expectedFoods: any[] = [], expectedWaters: any[] = [], createdAt = new Date()
  for (const targetDate of values.targetDates) for (const source of sources) {
    const row = rows.find((row: any) => row.id === source.id), waterId = nativeVoiceFoodCopyWaterId(row), water = hydration.find((w: any) => w.id === waterId)
    let nutrients = row.nutrients, items = row.items
    if (water) { const id = crypto.randomUUID(); expectedWaters.push({ ...water, id, localDate: targetDate, category: values.targetMeal || water.category, createdAt }); nutrients = relinkNativeVoiceCopiedDrink(nutrients, waterId!, id); items = relinkNativeVoiceCopiedDrink(items, waterId!, id) }
    expectedFoods.push({ id: crypto.randomUUID(), userId, name: row.name, description: row.description, imageUrl: row.imageUrl, nutrients: nutrients ?? null, items: items ?? null, localDate: targetDate, meal: values.targetMeal || row.meal, category: values.targetMeal || row.category, createdAt })
  }
  if (expectedWaters.length) { const saved = await tx.waterLog.createMany({ data: expectedWaters }); if (saved.count !== expectedWaters.length) throw new Error('The app did not confirm all copied hydration.') }
  const saved = await tx.foodLog.createMany({ data: expectedFoods.map(row => ({ ...row, nutrients: row.nutrients ?? Prisma.JsonNull, items: row.items ?? Prisma.JsonNull })) }); if (saved.count !== expectedFoods.length) throw new Error('The app did not confirm all copied foods.')
  const actualFoods = await tx.foodLog.findMany({ where: { userId, id: { in: expectedFoods.map(row => row.id) } } }), actualWaters = expectedWaters.length ? await tx.waterLog.findMany({ where: { userId, id: { in: expectedWaters.map(row => row.id) } } }) : []
  if (actualFoods.length !== expectedFoods.length || expectedFoods.some(expected => !actualFoods.some((actual: any) => actual.id === expected.id && nativeVoiceFoodCopyVersion(actual) === nativeVoiceFoodCopyVersion(expected))) || actualWaters.length !== expectedWaters.length || expectedWaters.some(expected => !actualWaters.some((actual: any) => actual.id === expected.id && nativeVoiceFoodCopyWaterVersion(actual) === nativeVoiceFoodCopyWaterVersion(expected)))) throw new Error('The copied food and hydration readback did not match. The transaction must roll back.')
  return { ids: expectedFoods.map(row => row.id), waterIds: expectedWaters.map(row => row.id), selectedIds: sources.map((s: any) => s.id), targetDates: values.targetDates }
}

function combineFoodBasis(rows: any[], name: string, targetMeal: string) {
  const items: any[] = []
  for (const row of rows) {
    const n = nutrition(row.nutrients), sourceItems = Array.isArray(n.__fullMealItems) && n.__fullMealItems.length ? n.__fullMealItems : row.items
    if (!Array.isArray(sourceItems) || !sourceItems.length || sourceItems.some(item => item.servings != null && item.servings !== 1 || item.macroMultiplier != null && item.macroMultiplier !== 1 || item.multiplier != null && item.multiplier !== 1)) throw new Error('This saved meal lacks a complete compatible ingredient basis. Please keep it separate or review its measured ingredients first.')
    validateNativeVoiceResolvedFood({ items: sourceItems, nutrition: n }, sourceItems.map(item => item.__voiceSourceFood))
    const scale = n.__portionScale ?? 1
    for (const item of sourceItems) {
      const copy = { ...item, servings: scale, __combinedSourceFoodId: row.id }
      // These are consumed amount aliases; clearing them lets the existing
      // native editor derive the correct amount from its recorded base x scale.
      for (const key of ['amount', 'amountUnit', '__amount', '__unit', 'weightAmount', 'weightUnit']) delete copy[key]
      items.push(copy)
    }
  }
  if (items.length > 30) throw new Error('Please combine no more than thirty complete ingredients at once.')
  const sum = totals(rows), combinedNutrition: any = Object.fromEntries(NUTRIENTS.flatMap(([primary, alias]) => [[primary, sum[primary]], [alias, sum[primary]]]))
  if (NUTRIENTS.slice(0, 4).some(([key]) => combinedNutrition[key] === null)) throw new Error('Every selected food needs its recorded energy and macros before combining.')
  combinedNutrition.__voiceBuiltMeal = true
  combinedNutrition.__combinedSourceFoods = rows.map(row => ({ id: row.id, version: copyVersion(row), food: { ...row, imageUrl: extractBlobPathWithPrefixes(row.imageUrl, ['food-photos/']) || row.imageUrl } }))
  return { name, description: name, meal: targetMeal, category: targetMeal, localDate: rows[0].localDate, items, nutrients: combinedNutrition }
}
async function lockCopySources(tx: any, userId: string, ids: string[]) {
  if (!tx.$queryRawUnsafe) throw new Error('This save needs the normal app transaction locks. Nothing changed.')
  await tx.$queryRawUnsafe('SELECT id FROM "FoodLog" WHERE "userId" = $1 AND id = ANY($2::text[]) FOR UPDATE', userId, ids)
}
async function executeCombine(tx: any, userId: string, prepared: any) {
  const sources = prepared.sources
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > 20 || new Set(sources.map((s: any) => s.id)).size !== sources.length) throw new Error('Please review the exact foods to combine.')
  await lockCopySources(tx, userId, sources.map((s: any) => s.id))
  const rows = await tx.foodLog.findMany({ where: { userId, id: { in: sources.map((s: any) => s.id) } } })
  if (rows.length !== sources.length || rows.some((row: any) => row.userId !== userId || !sources.some((s: any) => s.id === row.id && s.localDate === row.localDate && s.version === copyVersion(row)) || nativeVoiceFoodCopyWaterId(row))) throw new Error('A selected food or drink link changed after review. Nothing was combined.')
  const ordered = sources.map((s: any) => rows.find((row: any) => row.id === s.id)), combined = combineFoodBasis(ordered, prepared.values.name, prepared.values.targetMeal)
  if (version(userId, combined) !== version(userId, prepared.combined)) throw new Error('The combined ingredient review changed. Nothing was combined.')
  const library = await readNativeVoiceFavoriteLibrary(tx, userId)
  if (library.voiceLibraryVersion !== prepared.libraryVersion) throw new Error('Your library changed after review. Nothing was combined.')
  const id = crypto.randomUUID(), favoriteId = crypto.randomUUID(), row = { ...combined, id, userId, imageUrl: null, createdAt: new Date() }
  const written = await tx.foodLog.create({ data: row })
  if (written.id !== id) throw new Error('The app did not confirm the combined meal ID.')
  await mutateNativeVoiceFavoriteLibrary(tx, userId, { operation: 'create', entity: 'custom_food', id: favoriteId, localDate: row.localDate, expectedVersion: library.voiceLibraryVersion, changes: { label: row.name, description: row.name, meal: row.meal, nutrition: row.nutrients, items: row.items, customMeal: true, method: 'meal-builder' } }, tx)
  const deleted = await tx.foodLog.deleteMany({ where: { userId, id: { in: sources.map((s: any) => s.id) } } })
  if (deleted.count !== sources.length) throw new Error('The app did not remove exactly the reviewed originals. The transaction must roll back.')
  const after = await tx.foodLog.findMany({ where: { userId, id: { in: [id, ...sources.map((s: any) => s.id)] } } }), savedLibrary = await readNativeVoiceFavoriteLibrary(tx, userId), favorite = savedLibrary.favorites.find((r: any) => r.id === favoriteId)
  if (after.length !== 1 || after[0].id !== id || nativeVoiceFoodCopyVersion(after[0]) !== nativeVoiceFoodCopyVersion(row) || !favorite || version(userId, favorite.items) !== version(userId, row.items) || version(userId, favorite.nutrition) !== version(userId, row.nutrients)) throw new Error('The combined diary and Custom food readback did not match. The transaction must roll back.')
  return { id, favoriteId, selectedIds: sources.map((s: any) => s.id), removedIds: sources.map((s: any) => s.id), localDate: row.localDate }
}
