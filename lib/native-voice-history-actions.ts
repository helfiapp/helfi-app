import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getCheckinUser } from '@/app/api/checkins/_auth'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export const VOICE_HISTORY_ACTION_SCHEMAS = {
  'coach_history.delete': { ids: 'exact existing selected history IDs', query: 'exact saved Health Coach title', periodStart: 'YYYY-MM-DD', periodEnd: 'YYYY-MM-DD', all: 'true only when the user explicitly asks for all Health Coach history' },
  'checkin_history.delete': { ids: 'exact existing selected rating IDs', query: 'exact existing health issue name', periodStart: 'YYYY-MM-DD', periodEnd: 'YYYY-MM-DD', all: 'true only when the user explicitly asks for all daily check-in history' },
} as const
type Action = keyof typeof VOICE_HISTORY_ACTION_SCHEMAS
export type NativeVoiceHistoryKind = 'coach' | 'checkin'
type Selection = { ids?: string[]; query?: string; periodStart?: string; periodEnd?: string; all?: true }
type Row = Record<string, any> & { id: string; userId: string }
type Db = { $queryRawUnsafe: (...args: any[]) => Promise<any>; $transaction?: any }
export type VoiceHistoryIo = {
  userId: (request: NextRequest) => Promise<string | null>
  call: (request: NextRequest, kind: NativeVoiceHistoryKind, selection: Selection, expectedRows?: Row[]) => Promise<any>
}
const LIMIT = 1000
export class VoiceHistoryActionError extends Error {
  constructor(public code: 'invalid' | 'changed' | 'unverified', public status = 409) {
    super(code === 'invalid' ? 'Please select a valid, exact history list before deleting anything.' : code === 'changed' ? 'The selected history changed after review. Please review it again. Nothing was deleted by this action.' : 'The history change could not be confirmed. Please check History before trying again.')
  }
}
function fail(code: 'invalid' | 'changed' | 'unverified', status = 409): never { throw new VoiceHistoryActionError(code, status) }
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const digest = (userId: string, kind: NativeVoiceHistoryKind, rows: Row[]) => crypto.createHash('sha256').update(JSON.stringify(stable({ userId, kind, rows }))).digest('hex')
const kindFor = (action: Action): NativeVoiceHistoryKind => action === 'coach_history.delete' ? 'coach' : 'checkin'
function text(value: any, max = 300): string { if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) fail('invalid', 400); return value.trim() }
function day(value: any): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('invalid', 400)
  return value
}
function ids(value: any): string[] {
  if (!Array.isArray(value) || !value.length || value.length > LIMIT) fail('invalid', 400)
  const result = value.map(item => text(item, 200))
  if (new Set(result).size !== result.length) fail('invalid', 400)
  return result.sort()
}
function selection(input: any): Selection {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['ids', 'query', 'periodStart', 'periodEnd', 'all'].includes(key))) fail('invalid', 400)
  const result: Selection = {}
  if (input.ids !== undefined) result.ids = ids(input.ids)
  if (input.query !== undefined) result.query = text(input.query)
  if (input.periodStart !== undefined) result.periodStart = day(input.periodStart)
  if (input.periodEnd !== undefined) result.periodEnd = day(input.periodEnd)
  if (!!result.periodStart !== !!result.periodEnd || result.periodStart && result.periodEnd && result.periodStart > result.periodEnd) fail('invalid', 400)
  if (input.all !== undefined) { if (input.all !== true) fail('invalid', 400); result.all = true }
  if (result.ids && (result.query || result.periodStart || result.all) || result.all && (result.query || result.periodStart)) fail('invalid', 400)
  return result
}
function canonicalRows(value: any, userId: string, kind: NativeVoiceHistoryKind): Row[] {
  if (!Array.isArray(value) || value.length > LIMIT) fail('invalid', 400)
  const rows = value.map((raw: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.userId !== userId) fail('invalid', 400)
    const id = text(raw.id, 200), row: Row = { id, userId }
    const keys = kind === 'checkin' ? ['issueId', 'date', 'timestamp', 'name', 'polarity', 'value', 'note', 'isNa'] : ['tipDate', 'sentAt', 'title', 'body', 'category', 'metadata', 'costCents', 'chargeCents']
    if (Object.keys(raw).some(key => !['id', 'userId', ...keys].includes(key)) || keys.some(key => !Object.hasOwn(raw, key))) fail('invalid', 400)
    for (const key of keys) {
      const original = raw[key], normalized = original instanceof Date ? original.toISOString() : original
      if (normalized === undefined || typeof normalized === 'number' && !Number.isFinite(normalized)) fail('invalid', 400)
      row[key] = normalized
    }
    if (kind === 'checkin') {
      row.issueId = text(row.issueId, 200); row.date = day(String(row.date).slice(0, 10))
      if (row.value !== null && (!Number.isInteger(row.value) || row.value < 0 || row.value > 6) || ![true, false, null].includes(row.isNa) || row.note !== null && typeof row.note !== 'string' || row.name !== null && typeof row.name !== 'string' || row.polarity !== null && typeof row.polarity !== 'string') fail('invalid', 400)
      if (typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) fail('invalid', 400)
      row.timestamp = new Date(row.timestamp).toISOString()
    } else {
      row.tipDate = day(String(row.tipDate).slice(0, 10))
      if (['title', 'body', 'category'].some(key => typeof row[key] !== 'string') || typeof row.sentAt !== 'string' || !Number.isFinite(Date.parse(row.sentAt))) fail('invalid', 400)
      row.sentAt = new Date(row.sentAt).toISOString()
      for (const key of ['costCents', 'chargeCents']) if (row[key] !== null && (!Number.isInteger(row[key]) || row[key] < 0)) fail('invalid', 400)
    }
    return row
  }).sort((a: Row, b: Row) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (new Set(rows.map((row: Row) => row.id)).size !== rows.length || JSON.stringify(rows).length > 1_000_000) fail('invalid', 400)
  return rows
}
// Every interpolated SQL fragment below is fixed by this module. All account,
// date, query and ID values remain bound parameters. Normal manual branches are
// deliberately separate from these reviewed exact-row operations.
async function readRows(db: Db, userId: string, kind: NativeVoiceHistoryKind, scope: Selection, lock: boolean): Promise<any[]> {
  const args: any[] = [userId], clauses = ['r.userId = $1']
  const bind = (value: any) => { args.push(value); return `$${args.length}` }
  if (scope.ids) clauses.push(`r.id = ANY(${bind(scope.ids)}::text[])`)
  if (scope.query) clauses.push(`lower(${kind === 'checkin' ? 'i.name' : 'r.title'}) = lower(${bind(scope.query)})`)
  if (scope.periodStart) clauses.push(kind === 'checkin' ? `r.date BETWEEN ${bind(scope.periodStart)} AND ${bind(scope.periodEnd)}` : `r.tipDate BETWEEN ${bind(scope.periodStart)}::date AND ${bind(scope.periodEnd)}::date`)
  const columns = kind === 'checkin' ? 'r.id, r.userId AS "userId", r.issueId AS "issueId", r.date, r.timestamp, i.name, i.polarity, r.value, r.note, r.isNa AS "isNa"' : 'r.id, r.userId AS "userId", r.tipDate AS "tipDate", r.sentAt AS "sentAt", r.title, r.body, r.category, r.metadata, r.costCents AS "costCents", r.chargeCents AS "chargeCents"'
  const table = kind === 'checkin' ? 'CheckinRatings r LEFT JOIN CheckinIssues i ON i.id = r.issueId AND i.userId = r.userId' : 'HealthTips r'
  return db.$queryRawUnsafe(`SELECT ${columns} FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY r.id LIMIT 1001${lock ? ' FOR UPDATE OF r' : ''}`, ...args)
}
export async function readNativeVoiceHistorySnapshot(db: Db, userId: string, kind: NativeVoiceHistoryKind, raw: any) {
  const scope = selection(raw), found = await readRows(db, text(userId, 200), kind, scope, false)
  return { rows: canonicalRows(found.slice(0, LIMIT), userId, kind), complete: found.length <= LIMIT, limit: LIMIT }
}
export async function deleteNativeVoiceReviewedHistory(db: Db, userId: string, kind: NativeVoiceHistoryKind, value: any) {
  const expected = canonicalRows(value, userId, kind)
  if (!expected.length || !db.$transaction) fail('invalid', 400)
  const targetIds = expected.map(row => row.id)
  return db.$transaction(async (tx: Db) => {
    if (kind === 'checkin') await tx.$queryRawUnsafe('SELECT id FROM CheckinIssues WHERE userId = $1 AND id = ANY($2::text[]) ORDER BY id FOR SHARE', userId, [...new Set(expected.map(row => row.issueId))].sort())
    const current = canonicalRows(await readRows(tx, userId, kind, { ids: targetIds }, true), userId, kind)
    if (!current.length) return { success: true, status: 'already_absent', deletedIds: [], deletedCount: 0 }
    if (digest(userId, kind, current) !== digest(userId, kind, expected)) fail('changed')
    const removed = await tx.$queryRawUnsafe(`DELETE FROM ${kind === 'checkin' ? 'CheckinRatings' : 'HealthTips'} WHERE userId = $1 AND id = ANY($2::text[]) RETURNING id`, userId, targetIds)
    if (!Array.isArray(removed) || JSON.stringify(removed.map((row: any) => row.id).sort()) !== JSON.stringify(targetIds)) fail('unverified')
    if ((await readRows(tx, userId, kind, { ids: targetIds }, false)).length) fail('unverified')
    return { success: true, status: 'completed', deletedIds: targetIds, deletedCount: targetIds.length }
  }, { maxWait: 5000, timeout: 15000 })
}
export function nativeVoiceHistoryHttpError(error: unknown) {
  return error instanceof VoiceHistoryActionError ? { body: { error: error.message, code: `voice_history_${error.code}` }, status: error.status } : { body: { error: 'The history change could not be confirmed. Please check History before trying again.', code: 'voice_history_unverified' }, status: 500 }
}
export function nativeVoiceHistoryRequestScope(params: URLSearchParams) {
  const allowed = ['voiceSnapshot', 'id', 'query', 'start', 'end']
  if ([...params.keys()].some(key => !allowed.includes(key)) || params.getAll('voiceSnapshot').length !== 1 || params.get('voiceSnapshot') !== '1' || ['query', 'start', 'end'].some(key => params.getAll(key).length > 1)) fail('invalid', 400)
  return selection({ ...(params.getAll('id').length ? { ids: params.getAll('id') } : {}), ...(params.has('query') ? { query: params.get('query') } : {}), ...(params.has('start') ? { periodStart: params.get('start') } : {}), ...(params.has('end') ? { periodEnd: params.get('end') } : {}) })
}
const defaultIo: VoiceHistoryIo = {
  userId: async request => (await getCheckinUser(request))?.id || null,
  call: async (original, kind, scope, expectedRows) => {
    const url = new URL(kind === 'checkin' ? '/api/checkins/ratings' : '/api/health-tips/history', original.url), headers = new Headers(original.headers)
    headers.delete('content-length'); headers.delete('host'); headers.set('cache-control', 'no-store')
    const method = expectedRows ? kind === 'checkin' ? 'POST' : 'DELETE' : 'GET'
    if (!expectedRows) { url.searchParams.set('voiceSnapshot', '1'); for (const id of scope.ids || []) url.searchParams.append('id', id); if (scope.query) url.searchParams.set('query', scope.query); if (scope.periodStart) { url.searchParams.set('start', scope.periodStart); url.searchParams.set('end', scope.periodEnd!) } }
    if (expectedRows) headers.set('content-type', 'application/json')
    const req = new NextRequest(url, { method, headers, ...(expectedRows ? { body: JSON.stringify({ action: 'delete-reviewed', expectedRows }) } : {}) })
    const route = kind === 'checkin' ? await import('@/app/api/checkins/ratings/route') : await import('@/app/api/health-tips/history/route')
    const response = method === 'GET' ? await route.GET(req) : method === 'POST' ? await (route as typeof import('@/app/api/checkins/ratings/route')).POST(req) : await route.DELETE(req)
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || data.error) throw new Error('The normal app could not confirm this history action. Please check History before retrying.')
    return data
  },
}
async function authorize(request: NextRequest, userId: string, io: VoiceHistoryIo) {
  if (!request.headers.get('x-helfi-voice-capabilities')?.split(',').map(item => item.trim()).includes('additional-actions-v1')) throw new Error('This action needs the updated Helfi app. Nothing has changed.')
  if (!userId || await io.userId(request) !== userId) throw new Error('Please sign in to the same account before changing History.')
  if (request.signal?.aborted) throw new Error('This action was cancelled. Nothing has changed.')
}
export async function prepareVoiceHistoryAction(request: NextRequest, userId: string, input: { action: Action; values: any }, transcript: string, localDate: string, io: VoiceHistoryIo = defaultIo) {
  await authorize(request, userId, io)
  if (!input || Object.keys(input).some(key => !['action', 'values'].includes(key)) || !Object.hasOwn(VOICE_HISTORY_ACTION_SCHEMAS, input.action)) fail('invalid', 400)
  const action = input.action, kind = kindFor(action), scope = selection(input.values)
  let intent = transcript
  if (scope.query) { const at = intent.lastIndexOf(scope.query); if (at >= 0) intent = intent.slice(0, at) + ' ' + intent.slice(at + scope.query.length) }
  if (!/\b(?:delete|remove|clear)\b/i.test(intent) || !/\bhistory\b/i.test(intent) || /\b(?:do not|don't|don’t|never|not)\s+(?:delete|remove|clear)\b|\b(?:how do|what happens|should i|if i|if you)\b/i.test(intent) || !(kind === 'checkin' ? /\bcheck[ -]?ins?\b/i : /\b(?:health\s+coach|coach)\b/i).test(intent)) throw new Error('Please explicitly request deletion of selected saved history. Nothing has changed.')
  if (scope.all && !/\b(?:delete|remove|clear)\s+(?:please\s+)?(?:my\s+|the\s+)?(?:all(?:\s+of)?(?:\s+my|\s+the)?|entire|every)\s+(?:(?:saved|daily|health|coach|check[ -]?ins?)\s+){0,5}(?:history|entries|ratings|tips)\b/i.test(intent)) throw new Error('Please explicitly say which history entries to delete. Nothing has changed.')
  if (!scope.ids && !scope.query && !scope.periodStart && !scope.all) throw new Error('Please select exact history entries, an issue or title, or a date range before deletion.')
  const data = await io.call(request, kind, scope)
  if (data?.complete !== true || data?.limit !== LIMIT) throw new Error('The full selected history could not be checked. Please select a smaller list or date range; nothing has changed.')
  const rows = canonicalRows(data.rows, userId, kind)
  if (scope.ids && JSON.stringify(rows.map(row => row.id)) !== JSON.stringify(scope.ids) || scope.query && rows.some(row => String(kind === 'checkin' ? row.name : row.title).toLowerCase() !== scope.query!.toLowerCase()) || scope.periodStart && rows.some(row => (kind === 'checkin' ? row.date : row.tipDate) < scope.periodStart! || (kind === 'checkin' ? row.date : row.tipDate) > scope.periodEnd!)) fail('invalid', 400)
  const choices = rows.map(row => ({ id: row.id, label: kind === 'checkin' ? row.name || 'Previous health issue' : row.title, date: kind === 'checkin' ? row.date : row.tipDate }))
  const ambiguousQuery = scope.query && (kind === 'coach' ? rows.length !== 1 : new Set(rows.map(row => row.issueId)).size > 1)
  if (!rows.length || ambiguousQuery) return { action: 'additional_action', transcript, localDate, canConfirm: false, autoSave: false, summary: 'Choose exact history entries', confirmationMessage: rows.length ? 'More than one saved entry or health issue has that name. Please choose the exact entries.' : 'No matching owned history entries were found. Nothing has changed.', choices, additionalAction: { action, userId, values: scope } }
  const dates = rows.map(row => kind === 'checkin' ? row.date : row.tipDate).sort(), labels = [...new Set(choices.map(row => row.label))]
  const summary = `Delete exactly ${rows.length} saved ${kind === 'checkin' ? 'daily check-in' : 'Health Coach'} history ${rows.length === 1 ? 'entry' : 'entries'} dated ${dates[0]}${dates[0] === dates[dates.length - 1] ? '' : ` through ${dates[dates.length - 1]}`}${labels.length <= 5 ? `: ${labels.join(', ')}` : ` across ${labels.length} issues or titles`}`
  const draft: any = { action: 'additional_action', transcript, localDate, canConfirm: true, autoSave: false, summary, confirmationMessage: `${summary}. Entries added later will stay. Nothing has changed yet. Confirm this exact deletion?`, choices, reviewNonce: crypto.randomUUID(), reviewIssuedAt: Date.now(), additionalAction: { action, userId, operation: 'delete', values: { ids: rows.map(row => row.id) }, count: rows.length, expectedRows: rows, beforeHash: digest(userId, kind, rows), preparedAt: Date.now() } }
  draft.reviewToken = signNativeVoiceDraft(userId, draft)
  return draft
}
export async function executeVoiceHistoryAction(request: NextRequest, userId: string, draft: any, receipt: { receiptClaimed: true; actionId: string }, io: VoiceHistoryIo = defaultIo) {
  await authorize(request, userId, io)
  const prepared = draft?.additionalAction
  if (!receipt?.receiptClaimed || typeof receipt.actionId !== 'string' || !receipt.actionId || receipt.actionId.length > 200 || draft?.action !== 'additional_action' || draft.canConfirm !== true || !verifyNativeVoiceDraft(userId, draft) || prepared?.userId !== userId || prepared.operation !== 'delete' || !Object.hasOwn(VOICE_HISTORY_ACTION_SCHEMAS, prepared.action)) fail('invalid', 400)
  const action = prepared.action as Action, kind = kindFor(action), expected = canonicalRows(prepared.expectedRows, userId, kind), targetIds = ids(prepared.values?.ids)
  if (!expected.length || expected.length !== prepared.count || digest(userId, kind, expected) !== prepared.beforeHash || JSON.stringify(targetIds) !== JSON.stringify(expected.map(row => row.id))) fail('invalid', 400)
  await authorize(request, userId, io)
  const result = await io.call(request, kind, { ids: targetIds }, expected)
  if (!result?.success || !['completed', 'already_absent'].includes(result.status) || !Array.isArray(result.deletedIds) || result.deletedCount !== (result.status === 'completed' ? targetIds.length : 0) || JSON.stringify([...result.deletedIds].sort()) !== JSON.stringify(result.status === 'completed' ? targetIds : [])) fail('unverified')
  const after = await io.call(request, kind, { ids: targetIds })
  if (after?.complete !== true || after?.limit !== LIMIT || canonicalRows(after.rows, userId, kind).length) fail('unverified')
  const changed = result.status === 'completed'
  return { kind: 'history_action', action, actionId: receipt.actionId, operation: 'delete', status: result.status, ids: targetIds, deletedIds: changed ? targetIds : [], count: changed ? targetIds.length : 0, saved: changed, changed, message: changed ? `The reviewed ${kind === 'checkin' ? 'daily check-in' : 'Health Coach'} history entries were deleted.` : 'The reviewed history entries are already absent. No deletion was performed by this action.' }
}
