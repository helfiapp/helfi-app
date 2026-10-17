import { AssistantContext, AssistantContractError, AssistantField, AssistantOperation, AssistantPrepared, AssistantReceipt, AssistantValue, validateAssistantValue } from './native-assistant-registry'
import type { NextRequest } from 'next/server'

/** Fixed existing domain services supplied by the authenticated server host.
 * No endpoint, account, storage key, transcript or provider is model-controlled.
 * The host must wrap write execution in its signed normal confirmation and
 * durable receipt boundary before these operations are production-registered.
 */
export type NativeAssistantCoreDependencies = {
  request: (context: AssistantContext) => NextRequest
  authenticate: (context: AssistantContext) => Promise<string | null>
  preferences: {
    prepare: (request: NextRequest, actorId: string, input: any) => Promise<any>
    execute: (request: NextRequest, actorId: string, prepared: any, receipt: AssistantReceipt) => Promise<any>
  }
  notifications: {
    prepare: (request: NextRequest, actorId: string, input: any) => Promise<any>
    execute: (request: NextRequest, actorId: string, prepared: any, receipt: AssistantReceipt) => Promise<any>
  }
  records: {
    prepare: (request: NextRequest, actorId: string, input: any) => Promise<any>
    execute: (request: NextRequest, actorId: string, prepared: any, receipt: AssistantReceipt) => Promise<any>
  }
  appReads: { read: (request: NextRequest, actorId: string, input: any, localDate: string) => Promise<any> }
  creations?: {
    prepare: (context: AssistantContext, operationId: string, values: Record<string, AssistantValue>) => Promise<AssistantPrepared>
    execute: (context: AssistantContext, normalDraft: unknown, receipt: AssistantReceipt) => Promise<unknown>
    verify: (context: AssistantContext, result: unknown, normalDraft: unknown) => Promise<boolean>
  }
}
type ObjectField = Extract<AssistantField, { type: 'object' }>
const obj = (properties: Record<string, AssistantField>, required: string[] = []): ObjectField => ({ type: 'object', properties, required })
const str = (maxLength = 160, minLength = 1): AssistantField => ({ type: 'string', maxLength, minLength })
const choice = (values: readonly string[]): AssistantField => ({ type: 'string', maxLength: Math.max(...values.map(value => value.length)), enum: values, minLength: values.includes('') ? 0 : 1 })
const number = (minimum: number, maximum: number, integer = false): AssistantField => ({ type: 'number', minimum, maximum, integer })
const boolean: AssistantField = { type: 'boolean' }
const date: AssistantField = { type: 'string', maxLength: 10, format: 'date' }
const id = str(120)
const names: AssistantField = { type: 'array', minItems: 0, maxItems: 50, items: str(160) }
const tags: AssistantField = { type: 'array', minItems: 0, maxItems: 12, items: str(24) }
const category = choice(['breakfast', 'lunch', 'dinner', 'snacks', 'other', 'uncategorized'])
const reminder = obj({ enabled: boolean, time1: str(5), time2: str(5), time3: str(5), time4: str(5), frequency: number(1, 4, true), timezone: str(64) })
const healthProperties: Record<string, AssistantField> = {
  gender: choice(['male', 'female']), weight: number(0.01, 1000), height: number(0.01, 300), birthdate: date,
  bodyType: choice(['ectomorph', 'mesomorph', 'endomorph']), exerciseFrequency: str(160),
  diabetesType: choice(['', 'type1', 'type2', 'prediabetes']),
  healthSituations: obj({ healthIssues: str(4000, 0), healthProblems: str(4000, 0), additionalInfo: str(4000, 0), skipped: boolean }),
  healthCheckSettings: obj({ enabled: boolean, frequency: choice(['always', 'high', 'never']), dailyCap: number(1, 100000, true), thresholds: obj({ sugar: number(1, 100000, true), carbs: number(1, 100000, true), fat: number(1, 100000, true) }) }),
}
for (const field of ['exerciseTypes', 'goals', 'dietTypes', 'allergies']) for (const suffix of ['', 'Add', 'Remove']) healthProperties[field + suffix] = names
const preferenceSpecs: Array<{ id: string; action: string; input: ObjectField; manualIds: string[]; normalHandler: string }> = [
  { id: 'profile.update', action: 'profile.update', input: obj({ firstName: str(160, 0), lastName: str(160, 0), bio: str(2000, 0), dateOfBirth: date, gender: choice(['male', 'female', 'other', 'prefer-not-to-say']) }), manualIds: ['profile.update'], normalHandler: '/api/user-data' },
  { id: 'health_setup.update', action: 'health_setup.update', input: obj(healthProperties), manualIds: ['health_setup.profile.update', 'health_setup.body.update', 'health_setup.allergies.update', 'health_setup.diet.update', 'health_setup.lifestyle.update', 'health_setup.issues.update', 'health_setup.situations.update'], normalHandler: '/api/user-data' },
  { id: 'goals.update', action: 'goals.update', input: obj({ goalChoice: choice(['lose weight', 'gain weight', 'maintain weight', 'tone up', 'get shredded']), goalIntensity: choice(['mild', 'standard', 'aggressive']), goalTargetWeightKg: number(0.01, 1000), goalTargetWeightUnit: choice(['kg', 'lb']), goalPaceKgPerWeek: number(0.01, 100000), goalCalorieTarget: number(1, 100000), goalMacroMode: choice(['auto', 'manual']), goalMacroSplit: obj({ proteinPct: number(0.00001, 1), carbPct: number(0.00001, 1), fatPct: number(0.00001, 1) }, ['proteinPct', 'carbPct', 'fatPct']), goalFiberTarget: number(0.01, 100000), goalSugarMax: number(0.01, 100000) }), manualIds: ['health_setup.goals.update'], normalHandler: '/api/user-data' },
  { id: 'water.goal.set', action: 'hydration_goal.set', input: obj({ targetMl: number(1, 20000, true) }, ['targetMl']), manualIds: ['water.goal.set'], normalHandler: '/api/hydration-goal' },
  { id: 'water.goal.reset', action: 'hydration_goal.reset', input: obj({}), manualIds: ['water.goal.reset'], normalHandler: '/api/hydration-goal' },
  { id: 'reminders.checkin.update', action: 'checkin_reminders.update', input: reminder, manualIds: ['reminders.checkin.update'], normalHandler: '/api/checkins/settings' },
  { id: 'reminders.mood.update', action: 'mood_reminders.update', input: reminder, manualIds: ['reminders.mood.update'], normalHandler: '/api/mood/reminders' },
  { id: 'notifications.quiet_hours.update', action: 'quiet_hours.update', input: obj({ enabled: boolean, startTime: str(5), endTime: str(5), timezone: str(64) }), manualIds: ['notifications.quiet_hours.update'], normalHandler: '/api/notifications/quiet-hours' },
  { id: 'checkin.rating.set', action: 'checkin.rating.set', input: obj({ date, issueId: id, value: number(0, 6, true), note: str(2000, 0), isNa: boolean }, ['date', 'issueId']), manualIds: ['checkin.rating.set'], normalHandler: '/api/checkins/today' },
  { id: 'checkin.rating.update', action: 'checkin.rating.update', input: obj({ date, issueId: id, value: number(0, 6, true), note: str(2000, 0) }, ['date', 'issueId', 'value']), manualIds: ['checkin.rating.update'], normalHandler: '/api/checkins/ratings' },
  { id: 'checkin.rating.delete', action: 'checkin.rating.delete', input: obj({ date, issueId: id }, ['date', 'issueId']), manualIds: ['checkin.rating.delete'], normalHandler: '/api/checkins/ratings' },
]
const recordSpecs: Array<{ prefix: string; entity: string; changes: ObjectField; handler: string; manualIds?: string[] }> = [
  { prefix: 'water', entity: 'water', changes: obj({ amount: number(0.01, 10000), unit: choice(['ml', 'l', 'oz']), label: str(48), category }), handler: '/api/water-log' },
  { prefix: 'exercise', entity: 'exercise', changes: obj({ durationMinutes: number(0.01, 1440), distanceKm: number(0.01, 500), caloriesOverride: number(1, 50000), exerciseTypeId: number(1, 2147483647, true) }), handler: '/api/exercise-entries' },
  { prefix: 'mood.entries', entity: 'mood', changes: obj({ mood: number(1, 7, true), tags, note: str(600, 0) }), handler: '/api/mood/entries', manualIds: [] },
  { prefix: 'journal.health', entity: 'journal', changes: obj({ content: str(20000) }, ['content']), handler: '/api/health-journal' },
  { prefix: 'journal.mood', entity: 'mood_journal', changes: obj({ title: str(120), content: str(20000), tags, localDate: date }), handler: '/api/mood/journal/entries' },
]
const readSpecs: Array<{ id: string; input: ObjectField; manualIds: string[]; handler: string }> = [
  { id: 'reports.status', input: obj({}), manualIds: ['reports.status'], handler: '/api/reports/weekly/status?voiceReadOnly=1' },
  { id: 'reports.list', input: obj({ kind: choice(['weekly', 'uploaded']), limit: number(1, 10, true) }), manualIds: ['reports.list'], handler: '/api/reports/weekly/list or /api/reports/list' },
  { id: 'reports.weekly.read', input: obj({ reportId: id, periodStart: date, periodEnd: date, section: choice(['summary', 'overview', 'supplements', 'medications', 'nutrition', 'hydration', 'exercise', 'lifestyle', 'labs', 'mood', 'symptoms']) }), manualIds: ['reports.weekly.read'], handler: '/api/reports/weekly/list' },
  { id: 'hydration.status', input: obj({ localDate: date }), manualIds: ['water.status'], handler: '/api/hydration-goal + /api/water-log' },
  { id: 'devices.status', input: obj({ provider: choice(['fitbit', 'garmin', 'all']) }), manualIds: ['devices.status'], handler: '/api/fitbit/status + /api/garmin/status?voiceReadOnly=1' },
]
const fail = (message: string): never => { throw new AssistantContractError('core_action_unverified', message) }
const record = (value: any): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('Please review this exact app action again.')
const wire = (value: any) => JSON.parse(JSON.stringify(value))
const FREE = { kind: 'free' as const, maximumCredits: 0 }
const creationSpecs: Array<{ id: string; input: ObjectField; handler: string }> = [
  { id: 'water.create', input: obj({ amount: number(0.01, 10000), unit: choice(['ml', 'l', 'oz']), localDate: date, category, localTime: str(5) }, ['amount', 'unit']), handler: 'normal voice confirmation saveWater → water-log transaction (plain water only)' },
  { id: 'mood.create', input: obj({ score: number(1, 7, true), note: str(600, 0), tags: { type: 'array', minItems: 0, maxItems: 12, items: str(24) }, localDate: date, localTime: str(5), context: obj({ intensityPercent: number(0, 100, true), feelings: { type: 'array', minItems: 0, maxItems: 12, items: str(24) }, energyLevel: number(1, 5, true), sleepQuality: number(1, 5, true), nutrition: number(1, 5, true), supplements: number(1, 5, true), medicationEffect: number(1, 5, true), physicalActivity: number(1, 5, true) }) }, ['score']), handler: 'normal voice confirmation saveNativeVoiceMood → /api/mood/entries POST/GET' },
  { id: 'exercise.create', input: obj({ exerciseTypeId: number(1, 2147483647, true), durationMinutes: number(1, 1440), distanceKm: number(0.01, 1000), steps: number(1, 500000, true), caloriesKcal: number(1, 50000), speedKph: number(0.01, 100), localDate: date, localTime: str(5) }, ['exerciseTypeId']), handler: 'normal voice confirmation saveExercise → current owned exercise-type service' },
]

export function createNativeAssistantCoreActions(deps: NativeAssistantCoreDependencies): AssistantOperation[] {
  async function authorize(context: AssistantContext) {
    if (!context.actorId || context.signal?.aborted || await deps.authenticate(context) !== context.actorId || context.signal?.aborted) fail('Please use the same signed-in account for this request.')
  }
  function values(input: ObjectField, raw: Record<string, AssistantValue>) { return validateAssistantValue(input, raw) as Record<string, AssistantValue> }
  const coverage = (manualIds: string[], scope: string) => ({ manualIds, status: 'offline-proof' as const, scope })
  function write(id: string, input: ObjectField, family: 'preferences' | 'notifications' | 'records', action: string, normalHandler: string, manualIds: string[], command?: (values: Record<string, AssistantValue>, context: AssistantContext) => any): AssistantOperation {
    return {
      id, input, kind: 'write', description: `Review ${id.replace(/\./g, ' ')} using its normal app action and verify the saved result.`, normalHandler,
      coverage: coverage(manualIds, 'Structured fields, exact owned source state and normal service readback; production durable-confirm host integration required.'),
      prepare: async (context, raw) => {
        await authorize(context)
        const checked = values(input, raw)
        if (!Object.keys(checked).length && !id.endsWith('.reset') && !id.includes('_visible')) fail('Please say which value to change.')
        const prepared = await deps[family].prepare(deps.request(context), context.actorId, command ? command(checked, context) : { action, values: checked })
        await authorize(context)
        const normal = family === 'records' ? record(prepared.recordAction) : record(prepared)
        if (family === 'records' && prepared.canConfirm !== true) fail(prepared.confirmationMessage || 'Please choose an exact saved record.')
        if (family !== 'records' && (normal.userId !== context.actorId || normal.action !== action)) fail('The app did not return this account and requested action.')
        if (typeof normal.beforeHash !== 'string' || !normal.beforeHash || typeof prepared.summary !== 'string' || !prepared.summary.trim()) fail('The app could not prepare a source-bound review.')
        const fullText = family === 'records' ? Object.entries(normal.changes || {}).filter(([key, value]) => ['content', 'note', 'title', 'label'].includes(key) && typeof value === 'string').map(([key, value]) => `${key === 'content' ? 'Complete note' : key === 'note' ? 'Complete note' : key === 'title' ? 'Title' : 'Name'}:\n${value}`).join('\n') : ''
        return { data: { family, action, actorId: context.actorId, normal: wire(normal) }, summary: fullText ? `${prepared.summary}\n${fullText}` : prepared.summary, sourceVersion: normal.beforeHash, cost: { ...FREE } }
      },
      execute: async (context, prepared, receipt) => {
        await authorize(context)
        const data = record(prepared.data), normal = record(data.normal)
        if (data.family !== family || data.action !== action || data.actorId !== context.actorId || prepared.cost.kind !== 'free' || prepared.cost.maximumCredits !== 0 || receipt?.receiptClaimed !== true || typeof receipt.actionId !== 'string' || !receipt.actionId.trim() || normal.beforeHash !== prepared.sourceVersion) fail('This exact action needs its signed review and claimed receipt.')
        if (family !== 'records' && (normal.userId !== context.actorId || normal.action !== action)) fail('Please review this action in the same account.')
        if (family === 'records' && `${normal.entity}.${normal.operation}` !== action) fail('Please review the exact selected record operation.')
        const outcome = await deps[family].execute(deps.request(context), context.actorId, normal, receipt)
        await authorize(context)
        const checked = record(outcome)
        const verified = family === 'records' ? checked.id === normal.id && checked.kind === normal.entity && checked.operation === normal.operation : checked.saved === true && ['saved', 'already_set'].includes(checked.status)
        return { action: id, actionId: receipt.actionId, actorId: context.actorId, status: verified ? 'completed' : 'uncertain', saved: verified, verified, normal: wire(checked) }
      },
      verify: async (context, result: any, prepared?: AssistantPrepared) => {
        await authorize(context)
        const data = prepared && record(prepared.data)
        if (!data || data.family !== family || data.action !== action || data.actorId !== context.actorId || result?.actorId !== context.actorId || result.action !== id || typeof result.actionId !== 'string' || !result.actionId.trim() || result.status !== 'completed' || result.saved !== true || result.verified !== true) return false
        // Each existing execute helper reopens the exact selected ID/settings
        // through normal auth before returning. Do not execute again to verify.
        return family === 'records' ? result.normal?.id === data.normal.id && result.normal?.kind === data.normal.entity && result.normal?.operation === data.normal.operation : result.normal?.saved === true && ['saved', 'already_set'].includes(result.normal?.status)
      },
      plannerResult: (result: any): AssistantValue => ({ action: id, status: result.status, saved: result.saved, ...(result.normal?.id ? { id: result.normal.id } : {}), message: typeof result.normal?.message === 'string' ? result.normal.message : '' }),
    }
  }
  const operations = preferenceSpecs.map(spec => write(spec.id, spec.input, 'preferences', spec.action, `prepare/executeVoicePreferenceAction → ${spec.normalHandler}`, spec.manualIds))
  for (const action of ['notifications.mark_read', 'notifications.delete', 'notifications.mark_all_visible_read', 'notifications.delete_all_visible']) {
    const bulk = action.includes('_visible')
    operations.push(write(action, bulk ? obj({}) : obj({ ids: { type: 'array', minItems: 1, maxItems: 100, items: id } }, ['ids']), 'notifications', action, 'prepare/executeVoiceNotificationAction → /api/notifications/inbox', [action]))
  }
  for (const spec of recordSpecs) for (const operation of ['update', 'delete']) {
    const operationId = `${spec.prefix}.${operation}`, action = `${spec.entity}.${operation}`
    operations.push(write(operationId, obj({ id, localDate: date, ...(operation === 'update' ? { changes: spec.changes } : {}) }, operation === 'update' ? ['id', 'localDate', 'changes'] : ['id', 'localDate']), 'records', action,
      `prepare/executeNativeVoiceRecordAction → ${spec.handler}`, spec.manualIds ?? [operationId], (checked) => {
        const changes = checked.changes && typeof checked.changes === 'object' && !Array.isArray(checked.changes) ? Object.fromEntries(Object.entries(checked.changes).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.map(item => typeof item === 'string' ? item.trim() : item) : value])) : checked.changes
        if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
          if (spec.entity === 'water' && typeof changes.amount === 'number') changes.amount = Math.round(changes.amount * 100) / 100
          if (spec.entity === 'mood' && Array.isArray(changes.tags)) changes.tags = [...new Set(changes.tags)]
        }
        return { entity: spec.entity, operation, ...checked, ...(changes ? { changes } : {}) }
      }))
  }
  for (const spec of readSpecs) operations.push({
    id: spec.id, input: spec.input, kind: 'read', description: `Read owned stored ${spec.id.replace(/\./g, ' ')} through the normal app handler.`, normalHandler: `readVoiceAppData → ${spec.handler}`,
    coverage: coverage(spec.manualIds, 'Normal source-bound stored read only; no report generation, unlock, device connection or purchase.'),
    read: async (context, raw) => {
      await authorize(context)
      const result = await deps.appReads.read(deps.request(context), context.actorId, { action: spec.id, values: values(spec.input, raw) }, context.localDate)
      await authorize(context)
      if (result?.action !== spec.id || result.verified !== true || result.safeToClaimSaved !== false) fail('The app could not verify that stored information.')
      return wire(result)
    },
    verify: async (context, result: any) => { await authorize(context); return result?.action === spec.id && result.verified === true && result.safeToClaimSaved === false },
    plannerResult: (result: any) => ({ action: spec.id, message: typeof result.message === 'string' ? result.message : '', data: wire(result.data) }),
  })
  const creations = deps.creations
  if (creations) for (const spec of creationSpecs) operations.push({
    id: spec.id, input: spec.input, kind: 'write', description: `Review and save ${spec.id.replace(/\./g, ' ')} through the normal signed confirmation service.`, normalHandler: spec.handler,
    coverage: coverage([spec.id], 'Structured creation adapter requires actual normal-confirm host service; no source/provider guessing or direct storage writes.'),
    prepare: async (context, raw) => {
      await authorize(context)
      const checked = values(spec.input, raw)
      if (checked.localTime !== undefined && (typeof checked.localTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(checked.localTime))) fail('Please choose a valid local clock time.')
      const prepared = await creations.prepare(context, spec.id, checked)
      await authorize(context)
      if (!prepared?.data || typeof prepared.summary !== 'string' || !prepared.summary.trim() || prepared.cost?.kind !== 'free' || prepared.cost.maximumCredits !== 0) fail('The normal app could not prepare this free creation action.')
      return { ...prepared, data: { operationId: spec.id, actorId: context.actorId, normal: prepared.data } }
    },
    execute: async (context, prepared, receipt) => {
      await authorize(context)
      const data = record(prepared.data)
      if (data.operationId !== spec.id || data.actorId !== context.actorId || receipt?.receiptClaimed !== true || typeof receipt.actionId !== 'string' || !receipt.actionId.trim()) fail('This exact creation needs its signed review and claimed receipt.')
      const result = await creations.execute(context, data.normal, receipt)
      await authorize(context)
      return result
    },
    verify: async (context, result, prepared) => { await authorize(context); const data = prepared && record(prepared.data); return !!data && data.operationId === spec.id && data.actorId === context.actorId && await creations.verify(context, result, data.normal) },
    plannerResult: (result: any) => ({ kind: result.kind || '', id: result.id || '', message: result.message || '' }),
  })
  return operations
}
