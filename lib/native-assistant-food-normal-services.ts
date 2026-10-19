import { NextRequest } from 'next/server'
import { AssistantContractError, AssistantContext, AssistantReceipt } from './native-assistant-registry'
import { AssistantFoodServices, AssistantFoodValues, validateAssistantFoodSourceChoices } from './native-assistant-food-actions'
import { invokeNativeVoiceRecordRoute } from './native-voice-record-actions'
import { verifyNativeVoiceDraft } from './native-voice-review-token'

const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, stable(value[key])])) : value
const same = (a: any, b: any) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))
const fields = [['calories','calories_kcal'],['protein_g','protein'],['carbs_g','carbs'],['fat_g','fat'],['fiber_g','fiber'],['sugar_g','sugar']] as const
const nutrient = (row: any, keys: readonly string[]) => { const key = keys.find(key => Object.hasOwn(row || {}, key)); return key === undefined ? null : row[key] }
function nutrientsMatch(actual: any, expected: any, roundedCalories = false) {
  return fields.every((keys, index) => {
    const stored = nutrient(actual, keys), reviewed = nutrient(expected, keys)
    if (stored === null || reviewed === null) return stored === reviewed
    if (typeof stored !== 'number' || typeof reviewed !== 'number' || !Number.isFinite(stored) || !Number.isFinite(reviewed)) return false
    return Math.abs(stored - (roundedCalories && index === 0 ? Math.round(reviewed) : reviewed)) < 0.00001
  })
}
function itemsMatch(actual: any, expected: any, diary: boolean) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false
  return actual.every((item, index) => {
    const reviewed = expected[index]
    if (!item || !reviewed || !nutrientsMatch(item, reviewed) || !same(item.__voiceSourceFood, reviewed.__voiceSourceFood)) return false
    for (const key of ['requestedName','requestedAmount','nutritionCoversServing','estimatedPortion']) if (!same(item[key], reviewed[key])) return false
    if (!diary) return same(item, reviewed)
    return item.servings === (reviewed.servings ?? 1) && String(item.serving_size || '') === String(reviewed.serving_size || reviewed.serving || reviewed.unit || reviewed.requestedAmount || '1 serving')
  })
}
/** Fixed normal food service calls. Preparation uses the existing private meal
 * builder through its narrow structured branch; no model or provider is called
 * by these services. Submission/recovery use the existing normal receipts. */
export function createNativeAssistantFoodNormalServices(options: {
  request: NextRequest
  authenticate(context: AssistantContext): Promise<string | null>
  readDayContext: NonNullable<AssistantFoodServices['readDayContext']>
}): AssistantFoodServices {
  const request = (path: string, method: 'GET' | 'POST', body?: unknown) => {
    const headers = new Headers(options.request.headers); headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store'); headers.set('x-helfi-assistant-read-only','1')
    if (body !== undefined) headers.set('content-type', 'application/json')
    const caps = new Set((headers.get('x-helfi-voice-capabilities') || '').split(',')); caps.add('general-assistant-v1'); headers.set('x-helfi-voice-capabilities', [...caps].filter(Boolean).join(','))
    return new NextRequest(new URL(path, options.request.url), { method, headers, signal: options.request.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  }
  const authorize = async (context: AssistantContext) => { if (context.signal?.aborted || await options.authenticate(context) !== context.actorId || context.signal?.aborted) throw new Error('Please use the same signed-in account for this meal.') }
  const receipt = (context: AssistantContext, draft: any, actionId: string, result: any) => {
    const library = draft.action === 'record_action', id = library ? result?.id : result?.ids?.length === 1 ? result.ids[0] : null
    if (typeof id !== 'string' || !id || (library ? result.kind !== 'record_action' || result.operation !== 'create' || result.entity !== 'favorite' : result.kind !== 'food')) throw new Error('The normal food tool did not return this exact save receipt.')
    return { ...result, id, actorId: context.actorId, actionId, destination: library ? 'library' : 'diary', saved: true, status: 'completed' }
  }
  const services: AssistantFoodServices = {
    authenticate: options.authenticate, readDayContext: options.readDayContext,
    prepare: async (context, operation, values) => {
      await authorize(context)
      const normal = await import('@/app/api/native/voice-assistant/route')
      const response = await normal.POST(request('/api/native/voice-assistant','POST',{ structuredFood: { operation, values }, aiConsentGranted: true })), data = await response.json().catch(() => null)
      await authorize(context)
      const root = values.recipe ? 'recipe.ingredients' : 'ingredients'
      const allowedFields = new Set(values.ingredients.map((_item, index) => `${root}.${index}`))
      if (response.status === 422 && data?.code === 'missing_fields' && typeof data.error === 'string' && data.error.length > 0 && data.error.length <= 10000 && Array.isArray(data.fields) && data.fields.length > 0 && data.fields.length <= values.ingredients.length && data.fields.every((field: unknown) => typeof field === 'string' && allowedFields.has(field))) {
        const choices = validateAssistantFoodSourceChoices(data.choices, values)
        if (choices.some((choice: any) => !data.fields.includes(`${root}.${choice.ingredientIndex}`))) throw new Error('The source alternatives do not match the missing foods.')
        throw Object.assign(new AssistantContractError('missing_fields', data.error, [...new Set<string>(data.fields)]), { choices })
      }
      if (!response.ok || data?.success !== true || data.chargedCredits !== 0 || !data.preparation || !verifyNativeVoiceDraft(context.actorId, data.preparation.normalDraft)) throw new Error(data?.error || 'The normal food builder could not prepare this exact source review.')
      return data.preparation
    },
    execute: async (context, rawDraft, claim: AssistantReceipt) => {
      await authorize(context)
      const draft = rawDraft as any
      if (claim?.receiptClaimed !== true || typeof claim.actionId !== 'string' || !claim.actionId || !verifyNativeVoiceDraft(context.actorId, draft)) throw new Error('Please review this exact meal before saving it.')
      const normal = await import('@/app/api/native/voice-assistant/confirm/route')
      const response = await normal.POST(request('/api/native/voice-assistant/confirm','POST',{ draft })), data = await response.json().catch(() => null)
      await authorize(context)
      if (!response.ok || data?.success !== true) throw new Error(data?.error || 'The saved meal receipt could not be verified. Check its existing result before another save.')
      return receipt(context, draft, claim.actionId, data.result)
    },
    recover: async (context, actionId, rawDraft) => {
      await authorize(context)
      const draft = rawDraft as any
      const normal = await import('@/app/api/native/voice-assistant/confirm/route')
      const response = await normal.GET(request(`/api/native/voice-assistant/confirm?reviewToken=${encodeURIComponent(draft.reviewToken)}`,'GET')), data = await response.json().catch(() => null)
      await authorize(context)
      if (response.status === 202) return null
      if (!response.ok || data?.success !== true || data.receiptVerified !== true) throw new Error('The existing food receipt could not be read. No repeat save was sent.')
      return receipt(context, draft, actionId, data.result)
    },
    verify: async (context, result: any, rawDraft, values: AssistantFoodValues) => {
      await authorize(context)
      if (result.actorId !== context.actorId || result.destination !== values.destination || result.saved !== true || result.status !== 'completed') return false
      const draft = rawDraft as any, library = values.destination === 'library'
      const data = await invokeNativeVoiceRecordRoute(request('/api/native/assistant','GET'), { entity: library ? 'favorite' : 'food', method: 'GET', localDate: values.localDate, ...(library ? {} : { id: result.id }) })
      await authorize(context)
      if (data.readOnly !== true) return false
      const rows = library ? data.favorites : data.log ? [data.log] : data.logs
      if (!Array.isArray(rows)) return false
      const selected = rows.filter(row => row.id === result.id)
      if (selected.length !== 1) return false
      const row = selected[0], food = draft.food, nutrition = row.nutrients ?? row.nutrition ?? row.total
      if (library ? row.label !== values.name : row.userId !== context.actorId || row.name !== values.name || row.localDate !== values.localDate) return false
      if (row.meal !== values.meal || !nutrientsMatch(nutrition, food.nutrition, !library && !values.recipe) || !itemsMatch(row.items, food.items, !library)) return false
      if (values.recipe) {
        for (const key of ['__importRecipe','__portionAmount','__portionUnit','__portionScale','__portionRecipeServings','__portionControlEnabled','__nativeRecipeServingsEaten']) if (!same(nutrition[key], food.nutrition[key])) return false
        if (library && !same(row.total, food.nutrition)) return false
      }
      return true
    },
  }
  return services
}
