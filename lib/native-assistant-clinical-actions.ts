/** Fixed clinical operations for the general assistant. No provider, endpoint
 * chooser or application bootstrap. Normal helper I/O remains authenticated.
 * Registration alone does not enable paid execution or installed UI support. */
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { AssistantContractError, AssistantContext, AssistantField, AssistantOperation, AssistantPrepared, AssistantReceipt, AssistantValue, validateAssistantValue } from './native-assistant-registry'
import { executeVoiceSymptomAction, prepareStructuredVoiceSymptomAction, readStructuredVoiceSymptomHistory, VoiceSymptomIo } from './native-voice-symptom-analysis'

type ObjectSchema = Extract<AssistantField, { type: 'object' }>
type ClinicalPrepared = { actorId: string; operation: string; clock: { localDate: string; timeZone: string }; draft: any }
export type AssistantClinicalServices = {
  /** Authenticated host request. Neither request nor actor is a model field. */
  requestForContext: (context: AssistantContext) => NextRequest | Promise<NextRequest>
  /** Resolve the current trusted device/account zone on every phase. */
  trustedTimeZone: (context: AssistantContext) => string | Promise<string>
  io?: VoiceSymptomIo
}
const string = (maxLength: number, extra: object = {}): AssistantField => ({ type: 'string', maxLength, ...extra })
const historyInput: ObjectSchema = { type: 'object', properties: { analysisId: string(200), localDate: string(10, { format: 'date' }), limit: { type: 'number', minimum: 1, maximum: 50, integer: true } }, required: [] }
const detailInput: ObjectSchema = { ...historyInput, required: ['analysisId'] }
const analyzeInput: ObjectSchema = { type: 'object', properties: { symptoms: { type: 'array', items: string(80), minItems: 1, maxItems: 12 }, duration: string(120, { minLength: 0 }), notes: string(1200, { minLength: 0 }) }, required: ['symptoms'] }
const followInput: ObjectSchema = { type: 'object', properties: { analysisId: string(200), query: string(300), localDate: string(10, { format: 'date' }), latest: { type: 'boolean' }, threadId: string(200), question: string(2000) }, required: ['question'] }
const fail = (message: string): never => { throw new AssistantContractError('clinical_action_unverified', message) }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (left: unknown, right: unknown) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))
const helperReceipt = (draft: any) => crypto.createHash('sha256').update(String(draft?.reviewToken || '')).digest('base64url')
/** Structured ambiguity retains genuine source choices for the host; nothing
 * has been sent. The runtime can request a current exact analysis selection. */
export class AssistantClinicalSelectionError extends AssistantContractError {
  constructor(public choices: { id: string; label: string; createdAt: string }[]) { super('missing_fields', 'Please choose the exact saved symptom notes.', ['values.analysisId']) }
}
export function createAssistantClinicalOperations(services: AssistantClinicalServices): AssistantOperation[] {
  const clock = async (context: AssistantContext) => {
    if (!context.actorId || context.signal?.aborted) fail('This symptom request stopped before submission.')
    return { localDate: context.localDate, timeZone: await services.trustedTimeZone(context) }
  }
  const request = async (context: AssistantContext) => {
    const result = await services.requestForContext(context)
    if (context.signal?.aborted) fail('This symptom request stopped before submission.')
    return result
  }
  const read = async (context: AssistantContext, values: Record<string, AssistantValue>, schema: ObjectSchema) => {
    const checked = validateAssistantValue(schema, values) as Record<string, any>
    const result = await readStructuredVoiceSymptomHistory(await request(context), context.actorId, checked, await clock(context), services.io)
    return { actorId: context.actorId, ...result }
  }
  const verifyRead = async (context: AssistantContext, result: any) => {
    if (result?.actorId !== context.actorId || result?.verified !== true || result.safeToClaimSaved !== false || !Array.isArray(result.analyses) || context.signal?.aborted) return false
    // Reauthenticate through the same normal read boundary; only the bounded
    // source selection is checked, never a newly generated analysis.
    const req = await request(context), currentClock = await clock(context)
    for (const row of result.analyses) {
      const current = await readStructuredVoiceSymptomHistory(req, context.actorId, { analysisId: row.id }, currentClock, services.io)
      if (current.analyses.length !== 1 || !same(current.analyses[0], row)) return false
    }
    // Empty lists must also reauthenticate rather than vacuously verify.
    if (!result.analyses.length) await readStructuredVoiceSymptomHistory(req, context.actorId, { limit: 1 }, currentClock, services.io)
    return true
  }
  const prepare = async (context: AssistantContext, operation: 'symptoms.analyze' | 'symptoms.follow_up', values: Record<string, AssistantValue>): Promise<AssistantPrepared> => {
    const checked = validateAssistantValue(operation === 'symptoms.analyze' ? analyzeInput : followInput, values)
    const currentClock = await clock(context)
    const draft = await prepareStructuredVoiceSymptomAction(await request(context), context.actorId, { action: operation, values: checked }, currentClock, services.io)
    if (draft.canConfirm !== true) throw new AssistantClinicalSelectionError(clone(draft.choices || []))
    const maximumCredits = operation === 'symptoms.analyze' ? draft.clinicalAction.normalCreditCost : null
    if (operation === 'symptoms.analyze' && (typeof maximumCredits !== 'number' || !Number.isFinite(maximumCredits) || maximumCredits < 0)) fail('The normal symptom price could not be verified.')
    return { data: { actorId: context.actorId, operation, clock: currentClock, draft }, summary: draft.confirmationMessage, ...(draft.clinicalAction.sourceVersion ? { sourceVersion: draft.clinicalAction.sourceVersion } : {}), cost: { kind: 'metered', maximumCredits } }
  }
  const preparedData = async (context: AssistantContext, prepared: AssistantPrepared, operation: string) => {
    const data = prepared?.data as ClinicalPrepared
    if (!data || data.actorId !== context.actorId || data.operation !== operation || !data.draft || data.draft.clinicalAction?.action !== operation || !same(data.clock, data.draft.clinicalAction?.trustedClock) || !same(data.clock, await clock(context))) fail('Please review the exact current account and local date before continuing.')
    return data
  }
  const execute = async (context: AssistantContext, prepared: AssistantPrepared, receipt: AssistantReceipt, operation: string) => {
    const data = await preparedData(context, prepared, operation)
    if (!receipt?.receiptClaimed || typeof receipt.actionId !== 'string' || !receipt.actionId || receipt.actionId.length > 200) fail('A durable same-account action claim is required before symptom generation.')
    // The normal chat has no enforceable reviewed maximum-price contract yet.
    // Registering it is useful for source selection/review, never permission to
    // submit an unbounded charge or create a thread as a supposed free read.
    if (operation === 'symptoms.follow_up' || prepared.cost.kind !== 'metered' || prepared.cost.maximumCredits !== data.draft.clinicalAction.normalCreditCost) fail('The normal symptom-chat tool needs a verified maximum cost before the general assistant can send this question.')
    const domainActionId = helperReceipt(data.draft)
    const result = await executeVoiceSymptomAction(await request(context), context.actorId, data.draft, { receiptClaimed: true, actionId: domainActionId }, services.io)
    if (result.actionId !== domainActionId) fail('The normal symptom receipt did not match this review.')
    return { ...result, actorId: context.actorId, actionId: receipt.actionId }
  }
  const verifyWrite = async (context: AssistantContext, result: any, prepared?: AssistantPrepared) => {
    if (!prepared || result?.actorId !== context.actorId || result.kind !== 'clinical_action' || result.status !== 'completed' || result.generated !== true || result.saved !== true || result.historySaved !== true || typeof result.analysisId !== 'string') return false
    const data = await preparedData(context, prepared, result.action)
    if (result.action !== 'symptoms.analyze' || result.chargedCredits !== (result.coveredByFreeUse === true ? 0 : data.draft.clinicalAction.normalCreditCost)) return false
    const current = await readStructuredVoiceSymptomHistory(await request(context), context.actorId, { analysisId: result.analysisId }, await clock(context), services.io)
    const row = current.analyses[0], values = data.draft.clinicalAction.values
    return current.analyses.length === 1 && same(row.analysis, result.analysis) && same(row.symptoms, values.symptoms) && row.duration === values.duration && row.notes === values.notes
  }
  const projection = (result: any): AssistantValue => ({ status: result.status, generated: result.generated === true, saved: result.saved === true, historySaved: result.historySaved === true, analysisId: result.analysisId ?? null, ...(result.analysis ? { analysis: clone(result.analysis) } : {}), message: result.message })
  return [
    { id: 'symptoms.history.list', description: 'Read actual owned saved Symptom Notes, optionally by local date.', input: historyInput, kind: 'read', capability: 'symptom-analysis-v1', normalHandler: 'GET /api/symptoms/history', coverage: { manualIds: ['symptoms.history.list'], status: 'offline-proof', scope: 'Normal authenticated owned history with trusted local-day selection; no generation.' }, read: (context, values) => read(context, values, historyInput), verify: verifyRead, plannerResult: result => ({ analyses: result.analyses, totalMatched: result.totalMatched, complete: result.complete }) },
    { id: 'symptoms.history.detail', description: 'Read one exact owned saved Symptom Notes analysis in full.', input: detailInput, kind: 'read', capability: 'symptom-analysis-v1', normalHandler: 'GET /api/symptoms/history', coverage: { manualIds: ['symptoms.history.list'], status: 'offline-proof', scope: 'Exact selected owned history analysis in full, supporting the normal Symptom Notes history workflow; no generation or deletion.' }, read: (context, values) => read(context, values, detailInput), verify: verifyRead, plannerResult: result => ({ analyses: result.analyses, totalMatched: result.totalMatched, complete: result.complete }) },
    { id: 'symptoms.analyze', description: 'Prepare normal symptom analysis with its fixed cost, consent and exact saved-history verification.', input: analyzeInput, kind: 'write', capability: 'symptom-analysis-v1', normalHandler: 'POST /api/analyze-symptoms', coverage: { manualIds: ['symptoms.analyze'], status: 'offline-proof', scope: 'Synthetic actual normal handler proof; metered execution requires a separate spending grant.' }, prepare: (context, values) => prepare(context, 'symptoms.analyze', values), execute: (context, prepared, receipt) => execute(context, prepared, receipt, 'symptoms.analyze'), verify: verifyWrite, plannerResult: projection },
    { id: 'symptoms.follow_up', description: 'Prepare an exact owned symptom follow-up; execution awaits a normal enforceable maximum cost.', input: followInput, kind: 'write', capability: 'symptom-analysis-v1', normalHandler: 'POST /api/analyze-symptoms/chat', coverage: { manualIds: ['symptoms.follow_up'], status: 'offline-proof', scope: 'Exact source/thread review only. Cost maximum is unknown; execution is deliberately refused.' }, prepare: (context, values) => prepare(context, 'symptoms.follow_up', values), execute: (context, prepared, receipt) => execute(context, prepared, receipt, 'symptoms.follow_up'), verify: verifyWrite, plannerResult: projection },
  ]
}
