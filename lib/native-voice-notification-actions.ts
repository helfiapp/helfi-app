import { NextRequest } from 'next/server'
import crypto from 'crypto'
import * as inbox from '@/app/api/notifications/inbox/route'

// The normal authenticated inbox handler remains the authority. Bulk actions
// affect only the visible IDs included in the signed review, never new arrivals.
export const VOICE_NOTIFICATION_ACTION_SCHEMAS = {
  'notifications.mark_read': { ids: 'existing own inbox ID list OR titles', titles: 'exact unambiguous visible notification title list OR ids' },
  'notifications.delete': { ids: 'existing own inbox ID list OR titles', titles: 'exact unambiguous visible notification title list OR ids' },
  'notifications.mark_all_visible_read': {},
  'notifications.delete_all_visible': {},
} as const
export type VoiceNotificationActionName = keyof typeof VOICE_NOTIFICATION_ACTION_SCHEMAS
export type VoiceNotificationActionInput = { action: VoiceNotificationActionName; values: { ids?: string[]; titles?: string[] } }
type ReviewedNotification = { id: string; title: string; status: 'read' | 'unread'; createdAt: string; body: string | null; url: string | null }
export type PreparedVoiceNotificationAction = { action: VoiceNotificationActionName; userId: string; ids: string[]; beforeHash: string; summary: string; preparedAt: number }
export type VoiceNotificationActionResult = { saved: boolean; status: 'saved' | 'already_set' | 'review_again' | 'not_saved'; message: string; ids?: string[]; operation?: 'update' | 'delete'; entity?: 'notification' }
export class VoiceNotificationActionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'VoiceNotificationActionError' }
}
const fail = (message: string): never => { throw new VoiceNotificationActionError('invalid_notification_action', message) }
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : fail('Please choose the notification action to review.')
const keys = (value: Record<string, any>, allowed: string[]) => { if (Object.keys(value).some(key => !allowed.includes(key))) fail('That notification action contains an unsupported field.') }
const isBulk = (action: VoiceNotificationActionName) => action === 'notifications.mark_all_visible_read' || action === 'notifications.delete_all_visible'
const isDelete = (action: VoiceNotificationActionName) => action === 'notifications.delete' || action === 'notifications.delete_all_visible'
const textList = (value: unknown) => {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 500 || item.includes('\u0000'))) fail('Please select between one and 100 notifications using their exact titles or IDs.')
  return [...new Set((value as string[]).map(item => item.trim()))]
}
function validateInput(input: unknown): VoiceNotificationActionInput {
  const value = object(input); keys(value, ['action', 'values'])
  if (typeof value.action !== 'string' || !Object.prototype.hasOwnProperty.call(VOICE_NOTIFICATION_ACTION_SCHEMAS, value.action)) fail('That notification action is not supported.')
  const values = object(value.values); keys(values, ['ids', 'titles'])
  if (isBulk(value.action)) { if (Object.keys(values).length) fail('A visible inbox bulk review does not accept extra selectors.'); return { action: value.action, values: {} } }
  if (('ids' in values) === ('titles' in values)) fail('Please choose notification IDs or exact titles, not both.')
  return { action: value.action, values: 'ids' in values ? { ids: textList(values.ids) } : { titles: textList(values.titles) } }
}
function checkActive(request: NextRequest) { if (request.signal?.aborted) throw new VoiceNotificationActionError('cancelled', 'This notification request stopped. Please check your inbox before retrying.', 499) }
function requestFor(original: NextRequest, method: 'GET' | 'POST', offset = 0, body?: unknown) {
  checkActive(original)
  const headers = new Headers(original.headers)
  headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store')
  if (method === 'POST') headers.set('content-type', 'application/json')
  const url = new URL(`/api/notifications/inbox${method === 'GET' ? `?limit=100&offset=${offset}` : ''}`, original.url)
  if (method === 'GET' && original.headers.get('x-helfi-assistant-read-only') === '1') url.searchParams.set('voiceReadOnly', '1')
  return new NextRequest(url, { method, headers, signal: original.signal, ...(body ? { body: JSON.stringify(body) } : {}) })
}
async function json(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || typeof data !== 'object' || data.error) throw new VoiceNotificationActionError('normal_handler_failed', 'The app could not verify this inbox action. Nothing is being reported as changed.', response.ok ? 409 : response.status)
  return data
}
async function read(request: NextRequest, userId: string): Promise<ReviewedNotification[]> {
  const rows: ReviewedNotification[] = [], seen = new Set<string>()
  for (let offset = 0; offset <= 1000; offset += 100) {
    const data = await json(await inbox.GET(requestFor(request, 'GET', offset)))
    if (request.headers.get('x-helfi-assistant-read-only') === '1' && data.readOnly !== true) fail('The app did not verify a read-only inbox snapshot.')
    checkActive(request)
    if (!Array.isArray(data.items) || data.items.length > 100) fail('The app returned an invalid notification list.')
    if (rows.length + data.items.length > 1000) fail('Please use the notification screen for this large inbox.')
    for (const item of data.items) {
      if (!item || typeof item.id !== 'string' || !item.id || item.userId !== userId || typeof item.title !== 'string' || !['read', 'unread'].includes(item.status) || !Number.isFinite(Date.parse(item.createdAt)) || seen.has(item.id)) fail('The app could not identify a complete, owned notification list. Please reopen your inbox.')
      seen.add(item.id)
      rows.push({ id: item.id, title: item.title, status: item.status, createdAt: item.createdAt, body: item.body ?? null, url: item.url ?? null })
    }
    if (data.items.length < 100) return rows
  }
  return fail('Please use the notification screen for this large inbox.')
}
const snapshot = (userId: string, action: VoiceNotificationActionName, rows: ReviewedNotification[]) => crypto.createHash('sha256').update(JSON.stringify({ userId, action, rows: [...rows].sort((a, b) => a.id.localeCompare(b.id)) })).digest('hex')
function selected(input: VoiceNotificationActionInput, rows: ReviewedNotification[]) {
  if (isBulk(input.action)) return input.action === 'notifications.mark_all_visible_read' ? rows.filter(row => row.status === 'unread') : rows
  const result = input.values.ids ? input.values.ids.map(id => rows.filter(row => row.id === id)) : input.values.titles!.map(title => rows.filter(row => row.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase()))
  if (result.some(matches => matches.length !== 1)) throw new VoiceNotificationActionError('ambiguous_notification', 'Please choose an exact notification from your inbox. Missing or repeated titles need a more specific selection.', 409)
  return [...new Map(result.flat().map(row => [row.id, row])).values()]
}
export async function prepareVoiceNotificationAction(request: NextRequest, userId: string, input: VoiceNotificationActionInput): Promise<PreparedVoiceNotificationAction> {
  if (!userId) throw new VoiceNotificationActionError('unauthorized', 'Please sign in first.', 401)
  const validated = validateInput(input)
  const rows = selected(validated, await read(request, userId))
  if (!rows.length) throw new VoiceNotificationActionError('empty_selection', 'There are no matching visible notifications to change.', 409)
  const titles = rows.length <= 5 ? `: ${rows.map(row => `“${row.title}” (${row.createdAt})`).join('; ')}` : ''
  const summary = `${isDelete(validated.action) ? 'Delete' : 'Mark as read'} ${rows.length} ${isBulk(validated.action) ? 'currently visible inbox notifications' : 'selected inbox notifications'}${titles}. Only these reviewed notifications will change; later arrivals are kept.`
  return { action: validated.action, userId, ids: rows.map(row => row.id), beforeHash: snapshot(userId, validated.action, rows), summary, preparedAt: Date.now() }
}
// The caller must verify its normal signed account-bound review before execution.
export async function executeVoiceNotificationAction(request: NextRequest, userId: string, prepared: PreparedVoiceNotificationAction): Promise<VoiceNotificationActionResult> {
  if (!prepared || prepared.userId !== userId || !userId || !Number.isFinite(prepared.preparedAt) || Date.now() - prepared.preparedAt > 30 * 60 * 1000 || prepared.preparedAt > Date.now() + 1000) return { saved: false, status: 'review_again', message: 'Please review this notification change again.' }
  let writeStarted = false
  try {
    if (!Object.prototype.hasOwnProperty.call(VOICE_NOTIFICATION_ACTION_SCHEMAS, prepared.action) || !Array.isArray(prepared.ids) || !prepared.ids.length || prepared.ids.length > 1000 || prepared.ids.some(id => typeof id !== 'string' || !id) || new Set(prepared.ids).size !== prepared.ids.length) fail('Please review a supported notification selection.')
    const allRows = await read(request, userId)
    const before = isBulk(prepared.action) ? selected({ action: prepared.action, values: {} }, allRows) : allRows.filter(row => prepared.ids.includes(row.id))
    if (snapshot(userId, prepared.action, before) !== prepared.beforeHash || before.length !== prepared.ids.length || before.some(row => !prepared.ids.includes(row.id))) return { saved: false, status: 'review_again', message: 'Your inbox changed after this review. Please review the latest notifications before applying it.' }
    const operation = isDelete(prepared.action) ? 'delete' : 'update'
    if (!isDelete(prepared.action) && before.every(row => row.status === 'read')) return { saved: true, status: 'already_set', ids: prepared.ids, operation, entity: 'notification', message: 'The selected notifications are already read, and their current status has been checked.' }
    if (isDelete(prepared.action)) {
      writeStarted = true
      const data = await json(await inbox.POST(requestFor(request, 'POST', 0, { action: 'delete_selected', ids: prepared.ids })))
      if (data.success !== true || data.deleted !== prepared.ids.length) fail('The app did not confirm deletion of every reviewed notification. Please check your inbox before retrying.')
    } else {
      for (const row of before.filter(row => row.status === 'unread')) {
        checkActive(request)
        writeStarted = true
        const data = await json(await inbox.POST(requestFor(request, 'POST', 0, { action: 'mark_read', id: row.id })))
        if (data.success !== true) fail('The app did not confirm every reviewed notification as read. Please check your inbox before retrying.')
      }
    }
    const after = await read(request, userId)
    if (isDelete(prepared.action) ? after.some(row => prepared.ids.includes(row.id)) : prepared.ids.some(id => !after.some(row => row.id === id && row.status === 'read'))) fail('The app did not verify the complete reviewed inbox change. Please check your inbox before retrying.')
    return { saved: true, status: 'saved', ids: prepared.ids, operation, entity: 'notification', message: `${prepared.ids.length} reviewed inbox notifications ${isDelete(prepared.action) ? 'deleted' : 'marked as read'} and checked.` }
  } catch (error) {
    return { saved: false, status: 'not_saved', message: writeStarted ? 'The inbox action started, but its complete result was not verified. Some notifications may have changed. Please check your inbox before retrying.' : error instanceof VoiceNotificationActionError ? error.message : 'The inbox action was not verified. Please check your inbox before retrying.' }
  }
}
