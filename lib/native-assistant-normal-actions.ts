import { NextRequest } from 'next/server'
import { AssistantContext, AssistantContractError, AssistantNotSubmittedError, AssistantPrepared, AssistantReceipt } from './native-assistant-registry'
import { NativeAssistantCoreDependencies } from './native-assistant-core-actions'
import { prepareNativeVoiceRecordAction, invokeNativeVoiceRecordRoute } from './native-voice-record-actions'
import { prepareVoicePreferenceAction } from './native-voice-preference-actions'
import { prepareVoiceNotificationAction } from './native-voice-notification-actions'
import { readVoiceAppData } from './native-voice-app-reads'
import { nativeVoiceMoodContextSummary, validateNativeVoiceMoodContext } from './native-voice-mood-context'
import { signNativeVoiceDraft } from './native-voice-review-token'
import { resolveVoiceWallTime } from './native-voice-time'
import { getHealthProfileForUser } from './exercise/health-profile'
import { estimateVoiceExerciseDurationMinutes } from './exercise/voice-duration'
import * as normalConfirmation from '@/app/api/native/voice-assistant/confirm/route'

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function fixedRequest(original: NextRequest, path: string, method: 'GET' | 'POST', body?: unknown) {
  const headers = new Headers(original.headers); headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store')
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(new URL(path, original.url), { method, headers, signal: original.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}
/** Reuses the real normal signed-review/receipt route. Neither models nor
 * clients select endpoints or mint these inner reviews. */
export function createNativeAssistantNormalActions(options: {
  request: NextRequest
  authenticate: (context: AssistantContext) => Promise<string | null>
  trustedTimeZone: (context: AssistantContext) => string
  db: any
}) {
  const request = () => options.request
  const authorize = async (context: AssistantContext) => {
    if (!context.actorId || context.signal?.aborted || options.request.signal?.aborted || await options.authenticate(context) !== context.actorId || context.signal?.aborted) throw new Error('Please use the same signed-in account for this action.')
  }
  const seal = (context: AssistantContext, family: 'preferences' | 'notifications' | 'records' | 'creation', normal: any, actionId: string) => {
    const action = family === 'preferences' ? 'preference_action' : family === 'notifications' ? 'notification_action' : family === 'records' ? 'record_action' : normal.draft.action
    const preparedAt = family === 'creation' ? normal.preparedAt : normal.preparedAt
    if (typeof preparedAt !== 'number' || !Number.isFinite(preparedAt)) throw new Error('This action needs a current server review.')
    const draft: any = family === 'creation' ? { ...normal.draft } : {
      action, transcript: '', localDate: family === 'records' ? normal.localDate : family === 'preferences' ? normal.values?.date || '2000-01-01' : '2000-01-01', summary: normal.summary || normal.spokenReview || 'Reviewed app change',
      confirmationMessage: normal.summary || normal.spokenReview || 'Apply this exact reviewed change?', canConfirm: true, autoSave: false,
      [family === 'preferences' ? 'preferenceAction' : family === 'notifications' ? 'notificationAction' : 'recordAction']: normal,
    }
    draft.reviewIssuedAt = preparedAt; draft.reviewNonce = actionId; draft.reviewToken = signNativeVoiceDraft(context.actorId, draft)
    return draft
  }
  const submitted = async (context: AssistantContext, family: 'preferences' | 'notifications' | 'records' | 'creation', normal: any, receipt: AssistantReceipt) => {
    await authorize(context)
    if (receipt?.receiptClaimed !== true || typeof receipt.actionId !== 'string' || !receipt.actionId.trim() || receipt.actionId.length > 200) throw new Error('A durable reviewed action claim is required before submission.')
    const draft = seal(context, family, normal, receipt.actionId)
    const response = await normalConfirmation.POST(fixedRequest(options.request, '/api/native/voice-assistant/confirm', 'POST', { draft }))
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.success !== true || !data.result) throw new Error('The normal app did not verify this reviewed action. Check its saved result before retrying.')
    if (family === 'records') return { ...data.result, kind: normal.entity }
    return data.result
  }
  const recover = async (context: AssistantContext, family: 'preferences' | 'notifications' | 'records' | 'creation', normal: any, actionId: string) => {
    await authorize(context)
    if (typeof actionId !== 'string' || !actionId.trim() || actionId.length > 200) throw new Error('Please choose the original reviewed action to recover.')
    const draft = seal(context, family, normal, actionId)
    const response = await normalConfirmation.GET(fixedRequest(options.request, `/api/native/voice-assistant/confirm?reviewToken=${encodeURIComponent(draft.reviewToken)}`, 'GET'))
    const data = await response.json().catch(() => null)
    if (response.status === 202) return null
    if (!response.ok || data?.success !== true || data?.receiptVerified !== true || !data.result) throw new Error('The normal saved-action receipt could not be verified.')
    return family === 'records' ? { ...data.result, kind: normal.entity } : data.result
  }
  const timing = (context: AssistantContext, values: any) => {
    const localDate = values.localDate || context.localDate, timeZone = options.trustedTimeZone(context)
    if (!values.localTime) return { localDate, timeZone }
    const time = resolveVoiceWallTime(localDate, values.localTime, timeZone)
    if (time.status !== 'unique') throw new AssistantContractError('missing_fields', 'Please choose an unambiguous local time for this date.', ['values.localTime'])
    return { localDate, timeZone, localTime: values.localTime, tzOffsetMin: time.tzOffsetMin }
  }
  const creationSnapshot = async (context: AssistantContext, draft: any) => {
    if (draft.action !== 'exercise') return null
    const type = await options.db.exerciseType.findUnique({ where: { id: draft.exercise.exerciseTypeId } })
    const health = await getHealthProfileForUser(context.actorId)
    if (!type || !health.weightKg) throw new AssistantContractError('missing_fields', 'Please choose an existing exercise type and complete your saved weight first.', ['values.exerciseTypeId'])
    return wire({ type: { id: type.id, name: type.name, met: type.met }, weightKg: health.weightKg })
  }
  const creations = {
    prepare: async (context: AssistantContext, operationId: string, values: Record<string, any>): Promise<AssistantPrepared> => {
      await authorize(context)
      const clock = timing(context, values), draft: any = { transcript: '', ...clock, canConfirm: true, autoSave: false }
      let summary: string
      let source: any = null
      if (operationId === 'water.create') {
        const amountMl = values.unit === 'l' ? values.amount * 1000 : values.unit === 'oz' ? values.amount * 29.5735 : values.amount
        if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 10000) throw new Error('Please log up to 10,000 millilitres of water at a time.')
        draft.action = 'water'; draft.water = { amount: values.amount, unit: values.unit, label: 'Water', drinkType: 'water', category: values.category || 'other' }
        summary = `Log ${values.amount} ${values.unit} of water for ${clock.localDate}${values.localTime ? ` at ${values.localTime}` : ''}.`
      } else if (operationId === 'mood.create') {
        draft.action = 'mood'; draft.mood = { mood: values.score, note: values.note || '', tags: values.tags || [], context: validateNativeVoiceMoodContext(values.context) }
        summary = `Log mood ${values.score} out of seven for ${clock.localDate}.${values.note ? `\nComplete note: ${values.note}` : ''}${values.tags?.length ? `\nTags: ${values.tags.join(', ')}` : ''}${Object.keys(draft.mood.context).length ? `\nDetails: ${nativeVoiceMoodContextSummary(draft.mood.context)}` : ''}`
      } else if (operationId === 'exercise.create') {
        if (values.intensity !== undefined) throw new AssistantContractError('missing_fields', 'The normal exercise save does not support an intensity label. Please give a duration, distance, speed or exact calories instead.', ['values.intensity'])
        if (values.caloriesKcal !== undefined && (!Number.isFinite(values.caloriesKcal) || values.caloriesKcal > 10000 || values.caloriesKcal < 1)) throw new Error('The normal exercise save supports up to 10,000 stated calories.')
        if (values.steps !== undefined && (!Number.isInteger(values.steps) || values.steps < 1 || values.steps > 500000)) throw new Error('Please give a positive supported whole number of steps.')
        if (values.durationMinutes !== undefined && (!Number.isFinite(values.durationMinutes) || values.durationMinutes < 1 || values.durationMinutes > 1440)) throw new Error('Please give an exercise duration from one to 1,440 minutes.')
        draft.action = 'exercise'; draft.exercise = { exerciseTypeId: values.exerciseTypeId, ...(values.distanceKm !== undefined ? { distanceKm: values.distanceKm } : {}), ...(values.steps !== undefined ? { steps: values.steps } : {}), ...(values.speedKph !== undefined ? { speedKph: values.speedKph } : {}), ...(values.caloriesKcal !== undefined ? { caloriesKcal: Math.round(values.caloriesKcal) } : {}) }
        const snapshot = await creationSnapshot(context, draft)
        if (!snapshot) throw new Error('The selected exercise source could not be verified.')
        source = snapshot
        const estimated = values.durationMinutes === undefined
        const durationMinutes = estimated ? estimateVoiceExerciseDurationMinutes({ exerciseName: snapshot.type.name, steps: values.steps, caloriesKcal: values.caloriesKcal }) : Math.round(values.durationMinutes)
        if (!durationMinutes) throw new AssistantContractError('missing_fields', 'How long did this exercise take? I will keep the details you already gave me.', ['values.durationMinutes'])
        draft.exercise.durationMinutes = durationMinutes
        draft.exercise.exerciseName = snapshot.type.name
        summary = `Log ${snapshot.type.name} for ${draft.exercise.durationMinutes} minutes${estimated ? ` (estimated from the stated ${values.steps !== undefined ? 'steps' : 'calories'} using the normal app calculation)` : ''} on ${clock.localDate}${values.distanceKm !== undefined ? `, ${values.distanceKm} km` : ''}${values.caloriesKcal !== undefined ? `, ${draft.exercise.caloriesKcal} stated calories` : ', using the normal app calorie calculation'}${values.steps !== undefined ? `, ${values.steps} steps` : ''}${values.speedKph !== undefined ? `, speed ${Math.round(values.speedKph * 10) / 10} km/h` : ''}.`
      } else throw new Error('This creation operation is not registered.')
      draft.summary = summary; draft.confirmationMessage = summary
      return { data: { draft, preparedAt: Date.now(), source }, summary, cost: { kind: 'free', maximumCredits: 0 } }
    },
    execute: async (context: AssistantContext, normal: any, receipt: AssistantReceipt) => {
      let current
      try { current = await creationSnapshot(context, normal.draft) }
      catch (error) { if (error instanceof AssistantContractError && error.code === 'missing_fields') throw new AssistantNotSubmittedError(error.message, error.fields); throw error }
      if (JSON.stringify(normal.source) !== JSON.stringify(current)) throw new AssistantNotSubmittedError('The saved exercise profile or type changed. Nothing was submitted. Please review the current calculation again.', ['values.exerciseTypeId'], current ? [{ exerciseTypeId: current.type.id, exerciseName: current.type.name, weightKg: current.weightKg }] : [])
      const result = await submitted(context, 'creation', normal, receipt)
      return { ...result, actionId: receipt.actionId, actorId: context.actorId, saved: true, verified: true, status: 'completed' }
    },
    verify: async (context: AssistantContext, result: any, normal: any) => {
      await authorize(context)
      if (result?.actorId !== context.actorId || result.saved !== true || result.verified !== true || result.status !== 'completed' || result.kind !== normal.draft.action || typeof result.id !== 'string') return false
      const data = await invokeNativeVoiceRecordRoute(options.request, { entity: normal.draft.action, method: 'GET', localDate: normal.draft.localDate })
      const entries = data.logs || data.entries
      if (!Array.isArray(entries)) return false
      const rows = entries.filter((row: any) => row.id === result.id && row.userId === context.actorId && row.localDate === normal.draft.localDate)
      if (rows.length !== 1) return false
      const row = rows[0]
      let reviewedTime: number | null = null
      if (normal.draft.localTime) {
        const [year, month, day] = normal.draft.localDate.split('-').map(Number)
        const [hour, minute] = normal.draft.localTime.split(':').map(Number)
        reviewedTime = Date.UTC(year, month - 1, day, hour, minute) + normal.draft.tzOffsetMin * 60000
      }
      if (reviewedTime !== null && normal.draft.action !== 'mood' && new Date(normal.draft.action === 'water' ? row.createdAt : row.startTime).getTime() !== reviewedTime) return false
      if (normal.draft.action === 'water') return row.amount === normal.draft.water.amount && row.unit === normal.draft.water.unit && row.category === normal.draft.water.category && row.label === normal.draft.water.label
      if (normal.draft.action === 'mood') return row.mood === normal.draft.mood.mood && row.note === normal.draft.mood.note.trim() && JSON.stringify(row.tags) === JSON.stringify([...new Set(normal.draft.mood.tags)]) && Object.entries(normal.draft.mood.context || {}).every(([key,value]) => JSON.stringify(row.context?.[key]) === JSON.stringify(value)) && (!normal.draft.localTime || row.context?.localHour === Number(normal.draft.localTime.slice(0,2)))
      return row.exerciseTypeId === normal.draft.exercise.exerciseTypeId && row.durationMinutes === Math.round(normal.draft.exercise.durationMinutes) && (normal.draft.exercise.distanceKm === undefined || row.distanceKm === normal.draft.exercise.distanceKm) && (normal.draft.exercise.caloriesKcal === undefined || row.calories === Math.round(normal.draft.exercise.caloriesKcal)) && (normal.draft.exercise.steps === undefined || row.rawPayload?.steps === Math.round(normal.draft.exercise.steps)) && (normal.draft.exercise.speedKph === undefined || row.rawPayload?.speedKph === Math.round(normal.draft.exercise.speedKph * 10) / 10)
    },
  }
  const dependencies: NativeAssistantCoreDependencies = {
    request, authenticate: options.authenticate,
    preferences: { prepare: prepareVoicePreferenceAction, execute: (req, actor, normal, receipt) => submitted({ actorId: actor, localDate: normal.values?.date || '2000-01-01', capabilities: [], signal: req.signal }, 'preferences', normal, receipt) },
    notifications: { prepare: prepareVoiceNotificationAction, execute: (req, actor, normal, receipt) => submitted({ actorId: actor, localDate: '2000-01-01', capabilities: [], signal: req.signal }, 'notifications', normal, receipt) },
    records: {
      prepare: async (req, actor, input) => { const result = await prepareNativeVoiceRecordAction(req, actor, input); return result.recordAction ? { ...result, recordAction: { ...result.recordAction, preparedAt: Date.now(), summary: result.summary } } : result },
      execute: (req, actor, normal, receipt) => submitted({ actorId: actor, localDate: normal.localDate, capabilities: [], signal: req.signal }, 'records', normal, receipt),
    },
    appReads: { read: readVoiceAppData }, creations,
  }
  return { dependencies, recover, seal, creations }
}
