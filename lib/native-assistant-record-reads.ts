/** Fixed, minimal owned record discovery for the general assistant. The model
 * can select only registered semantic operations, never accounts or URLs. */
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { validateAssistantValue, type AssistantContext, type AssistantField, type AssistantOperation, type AssistantValue } from './native-assistant-registry'
export const RECORD_READ_IDS = ['water.list', 'exercise.list', 'exercise.types', 'mood.entries.list', 'journal.health.list', 'journal.mood.list', 'profile.read', 'health_setup.saved.read', 'checkin.issues.read', 'checkin.today', 'notifications.inbox.list'] as const
export type RecordReadId = typeof RECORD_READ_IDS[number]
export type RecordReadEnvelope = { actorId: string; readOnly: true; data: unknown }
export type RecordReadServices = {
  authenticatedActor(context: AssistantContext): Promise<string | null>
  /** Omission is for injected audited fixtures; normal host defaults to only
   * already read-only services until exact route guards are installed. */
  operations?: readonly RecordReadId[]
  read(context: AssistantContext, operation: RecordReadId, values: Record<string, AssistantValue>): Promise<RecordReadEnvelope>
  createMoodJournal?: (context: AssistantContext, values: Record<string, AssistantValue>, actionId?: string) => Promise<unknown>
  actionIdsSupported?: boolean
}
export class RecordReadError extends Error {
  constructor(public code: string, message: string, public retrySafe = true, public possibleEntryId?: string) { super(message); this.name = 'RecordReadError' }
}
const fail = (message = 'The app could not verify these exact saved records.'): never => { throw new RecordReadError('record_read_unverified', message) }
const object = (value: any): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : fail()
const text = (value: any, max = 200, empty = false): string => typeof value === 'string' && value.length <= max && !value.includes('\0') && (empty || value.trim()) ? value : fail()
const date = (value: any): string => { text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('Please select a valid calendar date.'); return value }
const optionalText = (value: any, max = 20000) => value === null || value === undefined ? null : text(value, max, true)
const number = (value: any, min = 0, max = 1000000) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail()
const timestamp = (value: any) => { if (value === null || value === undefined) return null; const instant = new Date(value); if (!Number.isFinite(instant.getTime())) fail(); return instant.toISOString() }
const tags = (value: any, max = 12, length = 300) => { if (!Array.isArray(value) || value.length > max) fail(); return value.map((item: any) => text(item, length)) }
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const digest = (value: any) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const wire = (value: any) => JSON.parse(JSON.stringify(value))
const str = (maxLength: number, minLength = 1): AssistantField => ({ type: 'string', maxLength, minLength })
const calendar: AssistantField = { type: 'string', maxLength: 10, format: 'date' }
const limit: AssistantField = { type: 'number', minimum: 1, maximum: 100, integer: true }
const obj = (properties: Record<string, AssistantField>, required: string[] = []): Extract<AssistantField, { type: 'object' }> => ({ type: 'object', properties, required })
const range = { localDate: calendar, start: calendar, end: calendar, limit }
const schemas: Record<RecordReadId, AssistantOperation['input']> = {
  'water.list': obj(range), 'exercise.list': obj({ localDate: calendar, limit }), 'exercise.types': obj({ search: str(160), category: str(100), intensity: str(100), limit, offset: { type: 'number', minimum: 0, maximum: 10000, integer: true } }),
  'mood.entries.list': obj(range), 'journal.health.list': obj({ localDate: calendar, limit }), 'journal.mood.list': obj({ ...range, query: str(200) }),
  'profile.read': obj({}), 'health_setup.saved.read': obj({}), 'checkin.issues.read': obj({ localDate: calendar, limit }), 'checkin.today': obj({ localDate: calendar, limit }),
  'notifications.inbox.list': obj({ limit, offset: { type: 'number', minimum: 0, maximum: 10000, integer: true }, status: { type: 'string', maxLength: 8, enum: ['read', 'unread', 'all'] } }),
}
function values(operation: RecordReadId, raw: Record<string, AssistantValue>, context: AssistantContext) {
  const value = validateAssistantValue(schemas[operation], raw) as Record<string, AssistantValue>
  date(context.localDate)
  if (['profile.read', 'health_setup.saved.read'].includes(operation)) return value
  value.limit ??= 20
  if (operation === 'exercise.types' || operation === 'notifications.inbox.list') { value.offset ??= 0; return value }
  if (value.localDate !== undefined && (value.start !== undefined || value.end !== undefined) || (value.start === undefined) !== (value.end === undefined)) fail('Choose one date or a complete start and end date.')
  if (operation === 'journal.mood.list' && value.query !== undefined && (value.localDate !== undefined || value.start !== undefined)) fail('Search recent mood journals or select a date range separately.')
  if (value.query === undefined) {
    if (value.start === undefined) value.localDate ??= context.localDate
    else if (String(value.end) < String(value.start) || Date.parse(String(value.end)) - Date.parse(String(value.start)) > 30 * 86400000) fail('Please select a date range of at most31 days.')
  }
  return value
}
function owned(row: any, context: AssistantContext) {
  if (row.userId !== undefined && row.userId !== context.actorId) fail('The app returned a record from another account.')
}
function checkDate(row: any, checked: Record<string, AssistantValue>) {
  const localDate = date(row.localDate)
  if (checked.localDate !== undefined && localDate !== checked.localDate || checked.start !== undefined && (localDate < String(checked.start) || localDate > String(checked.end))) fail('The app returned a record outside the selected dates.')
  return localDate
}
function array(value: any): any[] { if (!Array.isArray(value) || value.length > 5000) fail('The saved list is too large or could not be verified completely. Please narrow the dates.'); return value }
function profileData(data: any, profileOnly: boolean) {
  const source = object(data.data), info = object(source.profileInfo || {}), profile = { firstName: optionalText(info.firstName, 160), lastName: optionalText(info.lastName, 160), bio: optionalText(info.bio, 2000), dateOfBirth: optionalText(info.dateOfBirth, 10), gender: optionalText(info.gender, 30) }
  if (profileOnly) return { profile }
  const saved: Record<string, any> = {}
  for (const key of ['gender', 'weight', 'height', 'birthdate', 'bodyType', 'exerciseFrequency', 'goalChoice', 'goalIntensity', 'goalMacroMode', 'diabetesType']) saved[key] = optionalText(source[key] === undefined || source[key] === null ? null : String(source[key]), 300)
  for (const key of ['exerciseTypes', 'goals', 'dietTypes', 'allergies']) saved[key] = source[key] === undefined ? null : tags(source[key], 200)
  for (const key of ['goalCalorieTarget', 'goalTargetWeightKg', 'goalPaceKgPerWeek', 'goalFiberTarget', 'goalSugarMax']) saved[key] = source[key] === undefined || source[key] === null ? null : number(source[key])
  if (source.goalMacroSplit) { const split = object(source.goalMacroSplit); saved.goalMacroSplit = Object.fromEntries(['proteinPct', 'carbPct', 'fatPct'].map(key => [key, split[key] === null || split[key] === undefined ? null : number(split[key], 0, 100)])) } else saved.goalMacroSplit = null
  const situations = object(source.healthSituations || {})
  saved.healthSituations = Object.fromEntries(['healthIssues', 'healthProblems', 'additionalInfo'].map(key => [key, optionalText(situations[key], 4000)]))
  return { profile, saved }
}
function minimal(operation: RecordReadId, raw: unknown, checked: Record<string, AssistantValue>, context: AssistantContext) {
  const data = object(raw)
  if (operation === 'profile.read' || operation === 'health_setup.saved.read') return profileData(data, operation === 'profile.read')
  if (operation === 'checkin.issues.read' || operation === 'checkin.today') {
    const issues = array(data.issues).map(value => { const row = object(value); owned(row, context); const polarity = text(row.polarity, 8); if (!['positive', 'negative'].includes(polarity)) fail(); return { id: text(row.id), name: text(row.name, 300), polarity } })
    if (new Set(issues.map(row => row.id)).size !== issues.length) fail()
    const issueIds = new Set(issues.map(row => row.id))
    const ratings = operation === 'checkin.today' ? array(data.ratings).map(value => { const row = object(value); owned(row, context); const issueId = text(row.issueId); if (!issueIds.has(issueId) || typeof row.isNa !== 'boolean' || !(row.value === null && row.isNa || typeof row.value === 'number' && Number.isInteger(row.value) && row.value >= 0 && row.value <= 6)) fail(); return { issueId, localDate: checked.localDate, value: row.value, isNa: row.isNa, note: optionalText(row.note, 2000), timestamp: timestamp(row.timestamp) } }) : []
    if (new Set(ratings.map(row => row.issueId)).size !== ratings.length) fail()
    const max = Number(checked.limit), shown = issues.slice(0, max), shownIds = new Set(shown.map(row => row.id))
    return { localDate: checked.localDate, issues: shown, ...(operation === 'checkin.today' ? { ratings: ratings.filter(row => shownIds.has(row.issueId)) } : {}), returnedCount: shown.length, totalCount: issues.length, truncated: issues.length > max }
  }
  const source = array(operation === 'exercise.types' ? data.items : operation === 'notifications.inbox.list' ? data.items : data.entries)
  const entries = source.map(value => {
    const row = object(value); owned(row, context)
    const id = operation === 'exercise.types' ? number(row.id, 1, 2147483647) : text(row.id)
    if (operation === 'exercise.types') return { id, name: text(row.name, 200), category: optionalText(row.category, 100), intensity: optionalText(row.intensity, 100), met: row.met === null || row.met === undefined ? null : number(row.met, 0, 100) }
    if (operation === 'notifications.inbox.list') { const status = text(row.status, 8); if (!['read', 'unread'].includes(status) || checked.status && checked.status !== 'all' && status !== checked.status) fail(); return { id, title: text(row.title, 500), body: optionalText(row.body, 10000), status, type: optionalText(row.type, 100), createdAt: timestamp(row.createdAt), readAt: timestamp(row.readAt) } }
    const localDate = checkDate(row, checked)
    if (operation === 'water.list') return { id, localDate, amount: number(row.amount, 0, 10000), unit: text(row.unit, 10), amountMl: number(row.amountMl, 0, 10000000), label: optionalText(row.label, 500), category: optionalText(row.category, 40), createdAt: timestamp(row.createdAt) }
    if (operation === 'exercise.list') return { id, localDate, exerciseTypeId: row.exerciseTypeId === undefined ? row.exerciseType?.id ?? null : row.exerciseTypeId, name: optionalText(row.label ?? row.exerciseType?.name, 500), source: optionalText(row.source, 40), durationMinutes: row.durationMinutes === null ? null : number(row.durationMinutes, 0, 1440), distanceKm: row.distanceKm === null ? null : number(row.distanceKm, 0, 1000), calories: number(row.calories, 0, 100000), startTime: timestamp(row.startTime), createdAt: timestamp(row.createdAt) }
    if (operation === 'mood.entries.list') { const score = number(row.mood, 1, 7); if (!Number.isInteger(score)) fail(); return { id, localDate, mood: score, note: optionalText(row.note, 600), tags: tags(row.tags ?? [], 12, 24), timestamp: timestamp(row.timestamp) } }
    if (operation === 'journal.health.list') return { id, localDate, content: text(row.content, 20000), createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt) }
    return { id, localDate, title: optionalText(row.title, 120), content: optionalText(row.content, 20000), tags: tags(row.tags ?? [], 12, 24), prompt: optionalText(row.prompt, 200), template: optionalText(row.template, 200), imageCount: array(row.images ?? []).length, audioCount: array(row.audio ?? []).length, createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt) }
  })
  if (new Set(entries.map(row => row.id)).size !== entries.length) fail('The app returned repeated saved identities.')
  const max = Number(checked.limit), boundedUpstream = operation === 'exercise.types' || operation === 'notifications.inbox.list' || operation === 'journal.mood.list' && checked.query !== undefined
  return { ...(checked.localDate ? { localDate: checked.localDate } : {}), ...(checked.start ? { start: checked.start, end: checked.end } : {}), entries: entries.slice(0, max), returnedCount: Math.min(entries.length, max), totalCount: boundedUpstream ? null : entries.length, truncated: entries.length > max || boundedUpstream && entries.length >= 100, sourceMayHaveMore: boundedUpstream && (entries.length > max || entries.length >= 100), ...(checked.offset !== undefined ? { offset: checked.offset } : {}) }
}
export function createNativeAssistantRecordReadOperations(services: RecordReadServices): AssistantOperation[] {
  async function authorize(context: AssistantContext) { if (!context.actorId || context.signal?.aborted || await services.authenticatedActor(context) !== context.actorId || context.signal?.aborted) throw new RecordReadError('unauthorized', 'Please use the same signed-in account for these records.'); date(context.localDate) }
  async function read(operation: RecordReadId, context: AssistantContext, raw: Record<string, AssistantValue>) {
    await authorize(context); const checked = values(operation, raw, context), envelope = await services.read(context, operation, checked)
    await authorize(context)
    if (envelope.actorId !== context.actorId || envelope.readOnly !== true) fail('The normal handler did not verify a read-only result for this account.')
    const data = minimal(operation, envelope.data, checked, context)
    return { operation, actorId: context.actorId, verified: true, safeToClaimSaved: false, sourceVersion: digest({ actorId: context.actorId, operation, checked, data }), selection: checked, data }
  }
  const operations: AssistantOperation[] = RECORD_READ_IDS.filter(id => !services.operations || services.operations.includes(id)).map(operation => ({
    id: operation, description: `Read actual saved ${operation.replace(/\./g, ' ')} with exact IDs for later reviewed actions.`, kind: 'read', input: schemas[operation], normalHandler: normalHandler(operation),
    coverage: { manualIds: [operation === 'health_setup.saved.read' ? 'health_setup.read' : operation === 'checkin.issues.read' ? 'checkin.today' : operation === 'notifications.inbox.list' ? 'notifications.list' : operation], status: 'offline-proof', scope: 'Bounded saved fields and exact IDs; no generation, sync, migration or media access.' },
    read: (context, raw) => read(operation, context, raw), plannerResult: (result: any) => wire({ operation, sourceVersion: result.sourceVersion, selection: result.selection, data: result.data }),
    verify: async (context, result: any) => result?.operation === operation && result?.actorId === context.actorId && result?.verified === true && result.safeToClaimSaved === false && (await read(operation, context, result.selection)).sourceVersion === result.sourceVersion,
  }))
  if (services.createMoodJournal) {
    const input = obj({ localDate: calendar, title: str(120, 0), content: str(20000), tags: { type: 'array', items: str(24), minItems: 0, maxItems: 12 }, prompt: str(200, 0), template: str(200, 0) }, ['content'])
    const preparedValues = (context: AssistantContext, raw: any) => { const v = validateAssistantValue(input, raw) as Record<string, AssistantValue>; return { localDate: date(v.localDate ?? context.localDate), title: typeof v.title === 'string' ? v.title.trim() : '', content: String(v.content).trim(), tags: tags(v.tags ?? [],12,24).map((tag: string) => tag.trim()), prompt: typeof v.prompt === 'string' ? v.prompt.trim() : '', template: typeof v.template === 'string' ? v.template.trim() : '' } }
    const exactMood = async (context: AssistantContext, localDate: string, entryId: string, allowMissing = false) => {
      await authorize(context)
      const envelope = await services.read(context, 'journal.mood.list', { localDate, limit: 100 })
      await authorize(context)
      if (envelope.actorId !== context.actorId || envelope.readOnly !== true) fail()
      const selected = array(object(envelope.data).entries).filter(value => object(value).id === entryId)
      if (!selected.length && allowMissing) return null
      if (selected.length !== 1) fail('The exact new Mood Journal entry could not be reopened.')
      const result = minimal('journal.mood.list', { entries: selected }, { localDate, limit: 1 }, context)
      return array(object(result).entries)[0]
    }
    const checkedMood = (context: AssistantContext, prepared: any) => {
      const data = object(prepared.data), value = preparedValues(context,data.values)
      if (data.actorId !== context.actorId || data.operation !== 'journal.mood.create' || prepared.cost?.kind !== 'free' || prepared.cost.maximumCredits !== 0 || prepared.sourceVersion !== digest({ actorId:context.actorId,value })) fail('Please review this exact Mood Journal entry first.')
      return value
    }
    const matchesMood = (entry: any, value: any) => !!entry && ['localDate','title','content','tags','prompt','template'].every(key => JSON.stringify(entry[key]) === JSON.stringify(value[key])) && entry.imageCount === 0 && entry.audioCount === 0

    operations.push({ id: 'journal.mood.create', kind: 'write', description: 'Review literal Mood Journal text and explicitly supplied metadata, save once and reopen its exact ID; no media is invented.', input, normalHandler: '/api/mood/journal/entries POST then exact owned date-range GET', coverage: { manualIds: ['journal.mood.create'], status: 'offline-proof', scope: services.actionIdsSupported ? 'Exact text/metadata and owned deterministic normal action identity with GET-only recovery; media pickers remain separate.' : 'Exact text/metadata; media pickers remain separate; legacy normal service has no durable action identity.' },
      prepare: async (context, raw) => {
        await authorize(context); const value = preparedValues(context, raw); if (!value.content) fail('Please dictate the complete Mood Journal note.')
        // One complete possible owned result, using the exact reviewed literal
        // fields and bounded saved metadata; no model-controlled size claim.
        const result=JSON.stringify({kind:'mood_journal',status:'completed',actorId:context.actorId,actionId:'x'.repeat(200),saved:true,verified:true,entry:{id:'x'.repeat(200),...value,imageCount:0,audioCount:0,createdAt:'9999-12-31T23:59:59.999Z',updatedAt:'9999-12-31T23:59:59.999Z'}})
        return { data: { actorId: context.actorId, operation: 'journal.mood.create', values: value }, summary: `Save this Mood Journal entry on ${value.localDate}${value.title ? ` titled “${value.title}”` : ''}:\n${value.content}${value.tags.length ? `\nTags: ${value.tags.join(', ')}` : ''}${value.prompt ? `\nPrompt: ${value.prompt}` : ''}${value.template ? `\nTemplate: ${value.template}` : ''}`, sourceVersion: digest({ actorId: context.actorId, value }), cost: { kind: 'free', maximumCredits: 0 },resultReserveCharacters:result.length+4096,resultReserveBytes:Buffer.byteLength(result,'utf8')+4096 }
      },
      execute: async (context, prepared, receipt) => {
        await authorize(context)
        if (receipt.receiptClaimed !== true || typeof receipt.actionId !== 'string' || !receipt.actionId.trim() || receipt.actionId.length > 200) fail('Please review this exact Mood Journal entry first.')
        const value = checkedMood(context,prepared), expectedId = services.actionIdsSupported ? (await import('./native-assistant-action-id')).nativeAssistantMoodJournalEntryId(context.actorId,receipt.actionId) : undefined
        let possibleEntryId: string | undefined = expectedId
        try { const result = object(await services.createMoodJournal!(context, value,services.actionIdsSupported ? receipt.actionId : undefined)); await authorize(context); if (result.success !== true) fail(); possibleEntryId = text(result.id)
          if (expectedId && possibleEntryId !== expectedId) fail()
          const entry = await exactMood(context, value.localDate, possibleEntryId)
          if (!matchesMood(entry,value)) fail()
          return { kind: 'mood_journal', status: 'completed', actorId: context.actorId, actionId: receipt.actionId, saved: true, verified: true, entry }
        } catch { throw new RecordReadError('mood_journal_save_uncertain', 'The Mood Journal save could not be verified. Check that journal before saving it again.', false, possibleEntryId) }
      },
      verify: async (context, result: any, prepared) => {
        if (!prepared || result?.actorId !== context.actorId || result.saved !== true || result.verified !== true || !result.entry?.id) return false
        const value = checkedMood(context,prepared)
        if (services.actionIdsSupported && (typeof result.actionId !== 'string' || result.entry.id !== (await import('./native-assistant-action-id')).nativeAssistantMoodJournalEntryId(context.actorId,result.actionId))) return false
        const entry = await exactMood(context, value.localDate, text(result.entry.id))
        return matchesMood(entry,value)
      },
      ...(services.actionIdsSupported ? { recover: async (context: AssistantContext, actionId: string, prepared: any) => {
        await authorize(context); const value = checkedMood(context,prepared), id = (await import('./native-assistant-action-id')).nativeAssistantMoodJournalEntryId(context.actorId,actionId), entry = await exactMood(context,value.localDate,id,true)
        if (!entry) return null
        if (!matchesMood(entry,value)) fail('The saved Mood Journal entry does not match this exact reviewed content.')
        return {kind:'mood_journal',status:'completed',actorId:context.actorId,actionId,saved:true,verified:true,entry}
      } } : {}),
      plannerResult: (result: any) => wire({ entry: result.entry }),
    })
  }
  return operations
}
function normalHandler(operation: RecordReadId) {
  const names: Record<RecordReadId, string> = { 'water.list': '/api/water-log', 'exercise.list': '/api/exercise-entries', 'exercise.types': '/api/exercise-types', 'mood.entries.list': '/api/mood/entries', 'journal.health.list': '/api/health-journal', 'journal.mood.list': '/api/mood/journal/entries', 'profile.read': '/api/user-data?scope=health-setup', 'health_setup.saved.read': '/api/user-data?scope=health-setup', 'checkin.issues.read': '/api/checkins/today', 'checkin.today': '/api/checkins/today', 'notifications.inbox.list': '/api/notifications/inbox' }
  return names[operation]
}
/** In-process fixed normal handlers; explicit host registration acknowledges
 * each installed read-only guard. Never enable a GET merely because of its name. */
export function createNativeAssistantRecordReadNormalServices(request: NextRequest, host: { readOnlyOperations?: readonly RecordReadId[]; moodJournalCreate?: boolean } = {}): RecordReadServices {
  const enabled: readonly RecordReadId[] = host.readOnlyOperations ?? ['exercise.list', 'profile.read', 'health_setup.saved.read']
  async function actor() {
    const [{ getServerSession }, { authOptions }, { getUserIdFromNativeAuth }] = await Promise.all([import('next-auth'), import('@/lib/auth'), import('@/lib/native-auth')])
    const session = await getServerSession(authOptions), native = await getUserIdFromNativeAuth(request), web = (session?.user as { id?: string } | undefined)?.id
    if (session?.user?.email && !web || web && native && web !== native) return null
    return web || native || null
  }
  async function route(operation: RecordReadId) {
    switch (operation) {
      case 'water.list': return import('@/app/api/water-log/route')
      case 'exercise.list': return import('@/app/api/exercise-entries/route')
      case 'exercise.types': return import('@/app/api/exercise-types/route')
      case 'mood.entries.list': return import('@/app/api/mood/entries/route')
      case 'journal.health.list': return import('@/app/api/health-journal/route')
      case 'journal.mood.list': return import('@/app/api/mood/journal/entries/route')
      case 'profile.read': case 'health_setup.saved.read': return import('@/app/api/user-data/route')
      case 'checkin.issues.read': case 'checkin.today': return import('@/app/api/checkins/today/route')
      case 'notifications.inbox.list': return import('@/app/api/notifications/inbox/route')
    }
  }
  const services: RecordReadServices = { operations: enabled, authenticatedActor: actor, read: async (context, operation, checked) => {
    if (!enabled.includes(operation)) fail('That normal read-only operation has not been installed yet.')
    if (await actor() !== context.actorId || request.signal.aborted) fail()
    const { NextRequest } = await import('next/server'), url = new URL(normalHandler(operation), request.url), headers = new Headers(request.headers)
    headers.delete('host'); headers.delete('content-length'); headers.set('cache-control','no-store')
    if (operation === 'profile.read' || operation === 'health_setup.saved.read') { headers.delete('x-vercel-ip-country'); headers.delete('cf-ipcountry') }
    url.searchParams.set('voiceReadOnly','1')
    const localDate = checked.localDate
    if (operation === 'journal.health.list') url.searchParams.set('date', String(localDate))
    else if (operation === 'exercise.list') url.searchParams.set('date', String(localDate))
    else if (operation === 'mood.entries.list' || operation === 'journal.mood.list') {
      if (checked.query !== undefined) url.searchParams.set('q',String(checked.query))
      else { url.searchParams.set('start',String(checked.start ?? localDate)); url.searchParams.set('end',String(checked.end ?? localDate)) }
    } else if (localDate !== undefined) url.searchParams.set('localDate',String(localDate))
    for (const key of ['start','end','search','category','intensity','offset','status']) if (checked[key] !== undefined) url.searchParams.set(key,String(checked[key]))
    if (checked.limit !== undefined) url.searchParams.set('limit',String(Math.min(100,Number(checked.limit)+1)))
    const normal = await route(operation), response = await normal.GET(new NextRequest(url,{headers,signal:request.signal})), data = await response.json().catch(()=>null)
    if (!response.ok || !data || data.error || await actor() !== context.actorId) fail()
    if (operation !== 'exercise.list' && data.readOnly !== true) fail('The installed normal handler did not confirm its read-only contract.')
    return { actorId: context.actorId, readOnly: true, data }
  } }
  if (host.moodJournalCreate && enabled.includes('journal.mood.list')) {
    services.actionIdsSupported = true
    services.createMoodJournal = async (context, value, actionId) => {
    if (await actor() !== context.actorId || request.signal.aborted) fail()
    const { NextRequest } = await import('next/server'), normal = await import('@/app/api/mood/journal/entries/route'), headers = new Headers(request.headers); headers.delete('host');headers.delete('content-length');headers.set('content-type','application/json')
    if (!actionId) fail('A reviewed Mood Journal action identity is required before saving.')
    const response = await normal.POST(new NextRequest(new URL('/api/mood/journal/entries',request.url),{method:'POST',headers,signal:request.signal,body:JSON.stringify({...value,images:[],audio:[],clientActionId:actionId})})), data = await response.json().catch(()=>null)
    if (!response.ok || !data || data.error || await actor() !== context.actorId) fail()
    return data
    }
  }
  return services
}
