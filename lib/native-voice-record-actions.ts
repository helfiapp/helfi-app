import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { validateNativeVoiceResolvedFood } from '@/lib/native-voice-resolved-food'
import { resizeNativeVoiceDrinkLabel } from '@/lib/native-voice-drink-label'
import { isHealthIntakeRecordEntity, prepareNativeVoiceHealthIntakeRecordAction, executeNativeVoiceHealthIntakeRecordAction } from '@/lib/native-voice-health-intake-record-actions'

export type VoiceRecordEntity = 'food' | 'water' | 'mood' | 'journal' | 'mood_journal' | 'exercise' | 'favorite' | 'custom_food' | 'symptom_note' | 'supplement' | 'medication'
export type VoiceRecordCommand = {
  operation: 'create' | 'update' | 'delete'
  entity: VoiceRecordEntity
  id?: string
  query?: string
  localDate: string
  timeZone?: string
  changes?: Record<string, any>
  sourceFoodId?: string
}
export type VoiceRecordAction = VoiceRecordCommand & { id: string; beforeHash: string; libraryVersion?: string; changes: Record<string, any>; resolvedDrinkFood?: any; wholeDrinkFoodState?: any; spokenReview?: string }
type RouteCall = { entity: VoiceRecordEntity; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; localDate: string; id?: string; body?: any }
export type VoiceRecordIo = (request: NextRequest, call: RouteCall) => Promise<any>

const ENTITIES = new Set<VoiceRecordEntity>(['food', 'water', 'mood', 'journal', 'mood_journal', 'exercise', 'favorite', 'custom_food', 'symptom_note'])
const FIELDS: Record<VoiceRecordEntity, string[]> = {
  supplement: [],
  medication: [],
  symptom_note: [],
  food: ['name', 'description', 'nutrition', 'items', 'localDate', 'meal', 'category', 'createdAt'],
  water: ['amount', 'unit', 'label', 'category', 'localDate', 'createdAt'],
  mood: ['mood', 'tags', 'note'],
  journal: ['content'],
  mood_journal: ['title', 'content', 'tags', 'localDate'],
  exercise: ['durationMinutes', 'distanceKm', 'caloriesOverride', 'exerciseTypeId', 'startTime'],
  favorite: ['label', 'description', 'meal', 'nutrition', 'items'],
  custom_food: ['label', 'description', 'meal', 'nutrition', 'items', 'customMeal', 'method'],
}
function text(value: unknown, max = 200) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function validDate(value: unknown) {
  const date = String(value || '')
  const parsed = new Date(`${date}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  // Signed photo URLs are temporary presentation data, not record revisions.
  return Object.fromEntries(Object.keys(value).filter((key) => !['imageUrl', 'image_url', 'signedUrl'].includes(key)).sort().map((key) => [key, stable(value[key])]))
}
function hash(value: any) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex') }
function isLibrary(entity: VoiceRecordEntity) { return entity === 'favorite' || entity === 'custom_food' }
function isCustom(row: any) { return row?.custom === true || row?.customMeal === true || row?.raw?.customMeal === true || row?.method === 'meal-builder' }
function label(row: any, entity: VoiceRecordEntity) { if (entity === 'symptom_note') return text(Array.isArray(row?.symptoms) ? row.symptoms.join(', ') : row?.symptoms, 160) || 'symptom notes'; return text(row?.name || row?.label || row?.title || row?.exerciseType?.name || (entity === 'mood' ? `Mood ${row.mood}/7` : row?.content || row?.note || entity), 160) }
function rows(data: any, entity: VoiceRecordEntity) {
  const result = entity === 'symptom_note' ? data?.history : isLibrary(entity) ? data?.favorites : data?.logs || data?.entries || (data?.log ? [data.log] : [])
  return Array.isArray(result) ? result : []
}

const FAVORITES_NAME = '__FOOD_FAVORITES__'
export const VOICE_DELETED_FAVORITES_NAME = '__VOICE_DELETED_FAVORITES__'
const LIBRARY_REVIEW_ERRORS = {
  review_required: 'Please review the exact food library change first.',
  library_changed: 'Your food library changed. Please review the latest version.',
  identity_changed: 'That food library identity changed. Please review it again.',
  not_custom: 'That item is not a custom food.',
  library_full: 'Your food library is full.',
  save_raced: 'Your food library changed during saving. Please review it again.',
  linked_identity_changed: 'The linked food identity changed. Please review this rename again.',
  linked_save_raced: 'A linked food changed while saving. Please review the rename again.',
  linked_readback_failed: 'The app could not verify every linked food rename. Please review it again.',
} as const
// Only these fixed review messages may cross the normal API error boundary.
// Database/unknown exception text must never be displayed to the user.
export class VoiceRecordActionError extends Error {
  constructor(public readonly code: keyof typeof LIBRARY_REVIEW_ERRORS) { super(LIBRARY_REVIEW_ERRORS[code]); this.name = 'VoiceRecordActionError' }
  get publicMessage() { return LIBRARY_REVIEW_ERRORS[this.code] }
}
function parsedList(value: unknown, key: string) {
  if (!value) return []
  const parsed = JSON.parse(String(value))
  const values = Array.isArray(parsed) ? parsed : parsed?.[key]
  if (!Array.isArray(values)) throw new Error('The saved food library needs review before changing it.')
  return values
}
export async function readNativeVoiceFavoriteLibrary(db: any, userId: string) {
  const primary = await db.healthGoal.findFirst({ where: { userId, name: FAVORITES_NAME }, orderBy: { createdAt: 'desc' } })
  const tombstones = await db.healthGoal.findFirst({ where: { userId, name: VOICE_DELETED_FAVORITES_NAME }, orderBy: { createdAt: 'desc' } })
  return { favorites: parsedList(primary?.category, 'favorites'), deletedFavoriteIds: parsedList(tombstones?.category, 'ids'),
    voiceLibraryVersion: hash({ userId, id: primary?.id || null, category: primary?.category || null }) }
}
export async function mutateNativeVoiceFavoriteLibrary(db: any, userId: string, mutation: any) {
  const command = cleanCommand({ ...mutation, localDate: mutation.localDate || '2000-01-01' })
  if (!isLibrary(command.entity) || !command.id || !/^[a-f0-9]{64}$/.test(String(mutation.expectedVersion || ''))) throw new VoiceRecordActionError('review_required')
  return db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `native-voice-favorites:${userId}`)
    const state = await readNativeVoiceFavoriteLibrary(tx, userId)
    if (state.voiceLibraryVersion !== mutation.expectedVersion) throw new VoiceRecordActionError('library_changed')
    const primary = await tx.healthGoal.findFirst({ where: { userId, name: FAVORITES_NAME }, orderBy: { createdAt: 'desc' } })
    const existing = state.favorites.find((row: any) => String(row.id) === command.id)
    if (command.operation === 'create' ? Boolean(existing) : !existing) throw new VoiceRecordActionError('identity_changed')
    if (command.entity === 'custom_food' && existing && !isCustom(existing)) throw new VoiceRecordActionError('not_custom')
    if (command.operation === 'create' && state.favorites.length >= 300) throw new VoiceRecordActionError('library_full')
    const libraryChanges = { ...command.changes,
      ...(command.changes?.nutrition ? { total: { ...command.changes.nutrition } } : {}),
      ...(command.changes?.label ? { description: command.changes.label } : {}) }
    const favorites = command.operation === 'delete' ? state.favorites.filter((row: any) => String(row.id) !== command.id)
      : command.operation === 'create' ? [...state.favorites, { ...libraryChanges, id: command.id }]
      : state.favorites.map((row: any) => String(row.id) === command.id ? { ...row, ...libraryChanges, id: row.id } : row)
    if (primary) {
      // The content predicate also rejects an ordinary writer racing our read.
      const changed = await tx.healthGoal.updateMany({ where: { id: primary.id, userId, category: primary.category }, data: { category: JSON.stringify({ favorites }), currentRating: 0 } })
      if (changed.count !== 1) throw new VoiceRecordActionError('save_raced')
      await tx.healthGoal.create({ data: { userId, name: `__FOOD_FAVORITES__BACKUP__${Date.now()}`, category: primary.category, currentRating: 0 } })
    } else await tx.healthGoal.create({ data: { userId, name: FAVORITES_NAME, category: JSON.stringify({ favorites }), currentRating: 0 } })
    const renamedIds: string[] = []
    if (command.operation === 'update' && command.changes?.label && command.changes.label !== existing?.label) {
      // A rename changes visible titles only. Never replace a logged portion's
      // nutrition with favorite totals or remove its manual/drink metadata.
      const linked = await tx.foodLog.findMany({ where: { userId, nutrients: { path: ['__favoriteId'], equals: command.id } } })
      for (const food of linked) {
        if (food.userId !== userId || food.nutrients?.__favoriteId !== command.id) throw new VoiceRecordActionError('linked_identity_changed')
        const changed = await tx.foodLog.updateMany({ where: { id: food.id, userId, name: food.name, description: food.description,
          nutrients: { equals: food.nutrients } }, data: { name: command.changes.label, description: command.changes.label } })
        if (changed.count !== 1) throw new VoiceRecordActionError('linked_save_raced')
        renamedIds.push(food.id)
      }
      if (renamedIds.length) {
        const readback = await tx.foodLog.findMany({ where: { userId, id: { in: renamedIds } } })
        if (readback.length !== linked.length || readback.some((food: any) => {
          const original = linked.find((row: any) => row.id === food.id)
          return !original || food.name !== command.changes?.label || food.description !== command.changes?.label || hash(food.nutrients) !== hash(original.nutrients) || hash(food.items) !== hash(original.items)
        })) throw new VoiceRecordActionError('linked_readback_failed')
      }
    }
    if (command.operation === 'delete') {
      const ids = Array.from(new Set([...state.deletedFavoriteIds, command.id]))
      const id = `voice-deleted-favorites:${userId}`
      await tx.healthGoal.upsert({ where: { id }, create: { id, userId, name: VOICE_DELETED_FAVORITES_NAME, category: JSON.stringify({ ids }), currentRating: 0 }, update: { category: JSON.stringify({ ids }) } })
    }
    return { success: true, id: command.id, operation: command.operation, renamedIds }
  }, { maxWait: 5000, timeout: 15000 })
}

/** Only fixed same-app handlers are callable. Never accepts a URL, method or
 * arbitrary path from a user/model. Every handler retains its normal auth. */
export async function invokeNativeVoiceRecordRoute(original: NextRequest, call: RouteCall) {
  const { entity, method, localDate, id, body } = call
  if (entity === 'symptom_note') {
    if (original.signal?.aborted) throw new Error('This symptom-history request stopped. Please check its current state before retrying.')
    if (!['GET', 'DELETE'].includes(method) || (method === 'DELETE' && !id)) throw new Error('Saved symptom notes support deleting one reviewed entry only.')
  }
  let path: string
  if (entity === 'food') path = method === 'DELETE' ? '/api/food-log/delete' : '/api/food-log'
  else if (entity === 'water') path = `/api/water-log${method !== 'GET' ? `/${encodeURIComponent(id || '')}` : ''}`
  else if (entity === 'mood') path = '/api/mood/entries'
  else if (entity === 'journal') path = `/api/health-journal${method !== 'GET' ? `/${encodeURIComponent(id || '')}` : ''}`
  else if (entity === 'mood_journal') path = `/api/mood/journal/entries${method !== 'GET' ? `/${encodeURIComponent(id || '')}` : ''}`
  else if (entity === 'symptom_note') path = `/api/symptoms/history${method === 'DELETE' ? `/${encodeURIComponent(id!)}` : ''}`
  else if (entity === 'exercise') path = `/api/exercise-entries${method !== 'GET' ? `/${encodeURIComponent(id || '')}` : ''}`
  else if (isLibrary(entity)) path = '/api/user-data'
  else throw new Error('This record type is not supported.')
  const url = new URL(path, original.url)
  if (method === 'GET') {
    if (entity === 'food' && id) url.searchParams.set('id', id)
    else if (entity === 'water') url.searchParams.set('localDate', localDate)
    else if (entity === 'mood' || entity === 'mood_journal') { url.searchParams.set('start', localDate); url.searchParams.set('end', localDate); url.searchParams.set('limit', '100') }
    else if (!isLibrary(entity) && entity !== 'symptom_note') url.searchParams.set('date', localDate)
    if (isLibrary(entity)) url.searchParams.set('scope', 'voice-food-library')
  }
  const headers = new Headers(original.headers)
  headers.delete('content-length')
  if (body !== undefined) headers.set('content-type', 'application/json')
  const request = new NextRequest(url, { method: entity === 'food' && method === 'DELETE' ? 'POST' : method, headers, ...(entity === 'symptom_note' && original.signal ? { signal: original.signal } : {}), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  let response: Response
  if (entity === 'food') {
    const route = await import('@/app/api/food-log/route')
    if (method === 'GET') response = await route.GET(request)
    else if (method === 'PUT') response = await route.PUT(request)
    else if (method === 'DELETE') response = await (await import('@/app/api/food-log/delete/route')).POST(request)
    else throw new Error('Unsupported food record operation.')
  } else if (entity === 'water') {
    if (method === 'GET') response = await (await import('@/app/api/water-log/route')).GET(request)
    else {
      const route = await import('@/app/api/water-log/[id]/route')
      if (method === 'PATCH') response = await route.PATCH(request, { params: { id } })
      else if (method === 'DELETE') response = await route.DELETE(request, { params: { id } })
      else throw new Error('Unsupported hydration record operation.')
    }
  } else if (entity === 'mood') {
    const route = await import('@/app/api/mood/entries/route')
    if (method === 'GET') response = await route.GET(request)
    else if (method === 'PATCH') response = await route.PATCH(request)
    else if (method === 'DELETE') response = await route.DELETE(request)
    else throw new Error('Unsupported mood record operation.')
  } else if (entity === 'journal') {
    if (method === 'GET') response = await (await import('@/app/api/health-journal/route')).GET(request)
    else {
      const route = await import('@/app/api/health-journal/[id]/route')
      if (method === 'PATCH') response = await route.PATCH(request, { params: { id: id! } })
      else if (method === 'DELETE') response = await route.DELETE(request, { params: { id: id! } })
      else throw new Error('Unsupported journal record operation.')
    }
  } else if (entity === 'mood_journal') {
    if (method === 'GET') response = await (await import('@/app/api/mood/journal/entries/route')).GET(request)
    else {
      const route = await import('@/app/api/mood/journal/entries/[id]/route')
      if (method === 'PUT') response = await route.PUT(request, { params: { id: id! } })
      else if (method === 'DELETE') response = await route.DELETE(request, { params: { id: id! } })
      else throw new Error('Unsupported mood journal record operation.')
    }
  } else if (entity === 'symptom_note') {
    if (method === 'GET') response = await (await import('@/app/api/symptoms/history/route')).GET(request)
    else response = await (await import('@/app/api/symptoms/history/[id]/route')).DELETE(request, { params: { id: id! } })
  } else if (entity === 'exercise') {
    if (method === 'GET') response = await (await import('@/app/api/exercise-entries/route')).GET(request)
    else {
      const route = await import('@/app/api/exercise-entries/[id]/route')
      if (method === 'PATCH') response = await route.PATCH(request, { params: { id: id! } })
      else if (method === 'DELETE') response = await route.DELETE(request, { params: { id: id! } })
      else throw new Error('Unsupported exercise record operation.')
    }
  } else {
    const route = await import('@/app/api/user-data/route')
    if (method === 'GET') response = await route.GET(request)
    else if (method === 'POST') response = await route.POST(request)
    else throw new Error('Unsupported food library operation.')
  }
  const data = await response.json().catch(() => ({}))
  if (entity === 'symptom_note' && (data?.success !== true || (method === 'GET' && !Array.isArray(data.history)))) throw new Error(text(data?.error || 'The app did not verify this symptom-history action.', 300))
  if (!response.ok) {
    const error: Error & { code?: string } = new Error(text(data?.error || `The app could not complete this action (${response.status}).`, 300))
    if (typeof data?.code === 'string' && /^[a-z_]{1,80}$/.test(data.code)) error.code = data.code
    throw error
  }
  return data
}

function cleanCommand(raw: any): VoiceRecordCommand {
  if (!raw || !ENTITIES.has(raw.entity) || !['create', 'update', 'delete'].includes(raw.operation)) throw new Error('Please name a supported record and whether to change or delete it.')
  if (raw.entity === 'symptom_note' && raw.operation !== 'delete') throw new Error('Saved symptom notes can only be deleted after review. Use the normal symptom notes screen to create new notes.')
  let timeZone: string | undefined
  if (raw.timeZone !== undefined) {
    if (typeof raw.timeZone !== 'string' || !raw.timeZone.trim() || raw.timeZone.length > 100) throw new Error('Please provide the time zone for this record date.')
    try { timeZone = new Intl.DateTimeFormat('en-GB', { timeZone: raw.timeZone }).resolvedOptions().timeZone } catch { throw new Error('Please provide a valid time zone for this record date.') }
  }
  if (raw.entity === 'symptom_note' && !timeZone) throw new Error('Please provide your local time zone before selecting dated symptom notes.')
  if (!validDate(raw.localDate)) throw new Error('Please choose a valid calendar date for this record.')
  if (raw.operation === 'create' && !isLibrary(raw.entity)) throw new Error('Please use the normal reviewed new-entry action to create this record.')
  const changes: Record<string, any> = {}
  for (const [key, value] of Object.entries(raw.changes || {})) {
    if (!FIELDS[raw.entity as VoiceRecordEntity].includes(key)) throw new Error(`That ${raw.entity} field cannot be changed by this action.`)
    changes[key] = value
  }
  if (raw.operation === 'update' && !Object.keys(changes).length) throw new Error('What would you like to change in this record?')
  if (changes.localDate !== undefined && !validDate(changes.localDate)) throw new Error('Please choose a valid calendar date.')
  if (changes.createdAt !== undefined && !Number.isFinite(new Date(changes.createdAt).getTime())) throw new Error('Please choose a valid time.')
  if (changes.mood !== undefined && (!Number.isInteger(changes.mood) || changes.mood < 1 || changes.mood > 7)) throw new Error('Please choose a mood from 1 to 7.')
  if (changes.caloriesOverride !== undefined && changes.caloriesOverride !== null) {
    if (typeof changes.caloriesOverride !== 'number' || !Number.isFinite(changes.caloriesOverride) || changes.caloriesOverride <= 0 || changes.caloriesOverride > 50000 || Math.round(changes.caloriesOverride) < 1) throw new Error('Please choose a calorie amount from 1 to 50,000, or clear the override.')
    changes.caloriesOverride = Math.round(changes.caloriesOverride)
  }
  for (const key of ['amount', 'durationMinutes', 'distanceKm', 'exerciseTypeId']) {
    if (changes[key] !== undefined && changes[key] !== null && (typeof changes[key] !== 'number' || !Number.isFinite(changes[key]) || changes[key] <= 0)) throw new Error('Please use a positive measured amount.')
  }
  for (const key of ['name', 'label', 'content', 'title']) if (changes[key] !== undefined && (typeof changes[key] !== 'string' || !text(changes[key], 20000))) throw new Error('Please provide the new text.')
  if (changes.label !== undefined) changes.label = text(changes.label, 160)
  if (changes.items !== undefined && (!Array.isArray(changes.items) || !changes.items.length)) throw new Error('Please review the complete food ingredients before saving.')
  if (changes.nutrition !== undefined && (!changes.nutrition || typeof changes.nutrition !== 'object' || Array.isArray(changes.nutrition))) throw new Error('Please review the food nutrition before saving.')
  if (raw.entity === 'custom_food' && ((changes.customMeal !== undefined && changes.customMeal !== true) || (changes.method !== undefined && changes.method !== 'meal-builder'))) throw new Error('The custom food identity cannot be removed by this action.')
  return { operation: raw.operation, entity: raw.entity, id: text(raw.id, 120) || undefined, query: text(raw.query, 200) || undefined,
    sourceFoodId: text(raw.sourceFoodId, 120) || undefined, localDate: raw.localDate, ...(timeZone ? { timeZone } : {}), changes }
}
async function ownedRows(request: NextRequest, userId: string, command: VoiceRecordCommand, io: VoiceRecordIo) {
  if (command.entity === 'symptom_note' && request.signal?.aborted) throw new Error('This symptom-history request stopped. Please check it before retrying.')
  const data = await io(request, { entity: command.entity, method: 'GET', localDate: command.localDate, id: command.entity === 'food' ? command.id : undefined })
  if (command.entity === 'symptom_note' && (request.signal?.aborted || data?.success !== true || !Array.isArray(data.history))) throw new Error('The app did not verify your symptom history. Please reopen it before retrying.')
  const all = rows(data, command.entity)
  if (command.entity === 'symptom_note' && (all.some(row => !row || typeof row.id !== 'string' || !row.id || !Number.isFinite(new Date(row.createdAt).getTime())) || new Set(all.map(row => row.id)).size !== all.length)) throw new Error('Please reopen your symptom history to select a complete entry.')
  if (all.some((row) => row?.userId && row.userId !== userId)) throw new Error('The app returned a record for a different account. Please reopen this screen.')
  return Object.assign(all, { voiceLibraryVersion: data?.voiceLibraryVersion })
}
function symptomCalendarDate(row: any, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(row.createdAt))
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function selectedRows(all: any[], command: VoiceRecordCommand) {
  let matching = command.entity === 'symptom_note' ? all.filter(row => symptomCalendarDate(row, command.timeZone!) === command.localDate) : command.entity === 'custom_food' ? all.filter(isCustom) : all
  if (command.id) return matching.filter((row) => String(row.id) === command.id)
  if (command.query) {
    const query = command.query.toLowerCase()
    const exact = matching.filter((row) => label(row, command.entity).toLowerCase() === query)
    matching = exact.length ? exact : matching.filter((row) => label(row, command.entity).toLowerCase().includes(query))
  }
  return matching
}
function choiceDetails(matching: any[], entity: VoiceRecordEntity, source = false, timeZone?: string) {
  const choices = matching.slice(0, 10).map((row) => ({ id: String(row.id), label: label(row, entity), localDate: entity === 'symptom_note' ? symptomCalendarDate(row, timeZone!) : row.localDate,
    time: row.createdAt || row.timestamp || row.startTime, ...(source ? { sourceFoodId: String(row.id) } : {}) }))
  const options = choices.map((choice, index) => `${index + 1}. ${choice.label}${choice.localDate ? ` on ${choice.localDate}` : ''}${choice.time && Number.isFinite(new Date(choice.time).getTime()) ? ` at ${entity === 'symptom_note' ? `${new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(choice.time))} ${timeZone}` : `${new Date(choice.time).toISOString().slice(11, 16)} UTC`}` : ''}`).join('; ')
  return { choices, message: options ? `I found these entries: ${options}. Which one do you mean?` : 'I could not find a matching record on that date. Please give its exact name and date.' }
}
function friendlyChanges(changes: Record<string, any>) {
  const labels: Record<string, string> = { name: 'name', label: 'name', description: 'description', localDate: 'date', createdAt: 'time', startTime: 'start time',
    mood: 'mood', tags: 'tags', note: 'note', content: 'text', title: 'title', amount: 'amount', unit: 'unit', category: 'category', meal: 'meal',
    durationMinutes: 'duration in minutes', distanceKm: 'distance in kilometres', caloriesOverride: 'calories', exerciseTypeId: 'exercise type' }
  return Object.entries(changes).map(([key, value]) => {
    if (key === 'nutrition') return 'update the reviewed nutrition'
    if (key === 'items') return 'update the reviewed ingredients and portions'
    if (key === 'customMeal' || key === 'method') return ''
    const display = Array.isArray(value) ? value.join(', ') : value === null ? 'none' : text(value, 200)
    return `set ${labels[key] || 'the reviewed value'} to ${display}`
  }).filter(Boolean).join('; ')
}
function safeBody(row: any, action: VoiceRecordAction) {
  if (action.operation === 'delete') return { id: action.id, ...(action.entity === 'food' ? { exactIdOnly: true } : {}), ...(action.entity === 'water' ? { expectedWaterState: row } : {}) }
  if (action.entity === 'food') return { id: action.id, name: row.name, description: row.description, nutrition: row.nutrients ?? row.nutrition, items: row.items, localDate: row.localDate, meal: row.meal, category: row.category, ...action.changes }
  if (action.entity === 'water') return { amount: row.amount, unit: row.unit, wholeDrinkVolume: true, expectedWaterState: row, ...action.changes,
    ...(action.wholeDrinkFoodState ? { wholeDrinkFoodState: action.wholeDrinkFoodState } : {}),
    ...(action.resolvedDrinkFood ? { resolvedDrinkFood: action.resolvedDrinkFood } : {}) }
  if (action.entity === 'mood') return { id: action.id, mood: row.mood, tags: row.tags || [], note: row.note || '', ...action.changes }
  if (action.entity === 'mood_journal') return { title: row.title, content: row.content, images: row.images || [], audio: row.audio || [], tags: row.tags || [], prompt: row.prompt, template: row.template, localDate: row.localDate, ...action.changes }
  return { ...action.changes }
}

export async function prepareNativeVoiceRecordAction(request: NextRequest, userId: string, raw: unknown, io: VoiceRecordIo = invokeNativeVoiceRecordRoute) {
  if (isHealthIntakeRecordEntity((raw as any)?.entity)) return prepareNativeVoiceHealthIntakeRecordAction(request, userId, raw)
  let command: VoiceRecordCommand | undefined
  try {
    command = cleanCommand(raw)
    const all = await ownedRows(request, userId, command, io)
    let record: any
    let changes = command.changes || {}
    let wholeDrinkFoodState: any
    if (command.operation === 'create') {
      if (all.length >= 300) throw new Error('Your food library is full. Please review it before adding another item.')
      const sourceData = await io(request, { entity: 'food', method: 'GET', localDate: command.localDate, id: command.sourceFoodId })
      const sources = rows(sourceData, 'food')
      if (sources.some((row: any) => row?.userId && row.userId !== userId)) throw new Error('The app returned a record for a different account. Please reopen this screen.')
      const matching = selectedRows(sources, { ...command, entity: 'food', id: command.sourceFoodId })
      if (matching.length !== 1) {
        const details = choiceDetails(matching, 'food', true)
        return { canConfirm: false, summary: 'Choose the saved meal', confirmationMessage: details.message, choices: details.choices, recordAction: { ...command, choices: details.choices } }
      }
      record = matching[0]
      command.sourceFoodId = String(record.id)
      changes = { label: changes.label || record.name, description: record.description, meal: record.meal, nutrition: record.nutrients ?? record.nutrition, items: record.items,
        ...changes, ...(command.entity === 'custom_food' ? { customMeal: true, method: 'meal-builder' } : {}) }
      command.id = crypto.randomUUID()
    } else {
      const matching = selectedRows(all, command)
      if (matching.length !== 1) {
        const details = choiceDetails(matching, command.entity, false, command.timeZone)
        return { canConfirm: false, summary: 'Choose one record', confirmationMessage: details.message, choices: details.choices, recordAction: { ...command, choices: details.choices } }
      }
      record = matching[0]
      command.id = String(record.id)
      if (isLibrary(command.entity) && changes.nutrition) changes = { ...changes, nutrition: { ...(record.total || {}), ...(record.nutrition || {}), ...changes.nutrition } }
      if (command.entity === 'exercise' && command.operation === 'update' && record.source !== 'MANUAL') throw new Error('Device-imported exercise cannot be edited as a manual workout.')
      if (command.entity === 'water' && command.operation === 'update' && changes.label === undefined && (changes.amount !== undefined || changes.unit !== undefined)) {
        const factors: Record<string, number> = { ml: 1, l: 1000, oz: 29.5735 }
        const nextMl = Number(changes.amount ?? record.amount) * factors[String(changes.unit ?? record.unit)]
        if (Number.isFinite(nextMl) && Number(record.amountMl) > 0 && Math.abs(nextMl - Number(record.amountMl)) > 0.000001) {
          const foods = await ownedRows(request, userId, { ...command, entity: 'food', id: undefined }, io)
          const linked = foods.filter(row => waterLink(row) === command!.id)
          if (linked.length > 1) throw new Error('This drink has multiple linked food records. Please review it in the app.')
          const automaticLabel = resizeNativeVoiceDrinkLabel(record.label, linked[0]?.nutrients || linked[0]?.nutrition, nextMl / Number(record.amountMl))
          if (automaticLabel !== undefined) { changes = { ...changes, label: automaticLabel }; wholeDrinkFoodState = linked[0] }
        }
      }
    }
    if (isLibrary(command.entity) && !all.voiceLibraryVersion) throw new Error('Please reload the current food library before changing it.')
    const recordAction: VoiceRecordAction = { ...command, id: command.id!, changes, beforeHash: hash(isLibrary(command.entity) ? all : record), ...(wholeDrinkFoodState ? { wholeDrinkFoodState } : {}), ...(isLibrary(command.entity) ? { libraryVersion: all.voiceLibraryVersion } : {}) }
    const selectedLabel = command.operation === 'create' ? text(changes.label) : label(record, command.entity)
    const changeSummary = command.operation === 'update' ? `: ${friendlyChanges(changes)}` : ''
    const summary = `${command.operation === 'delete' ? 'Delete' : command.operation === 'create' ? 'Create' : 'Update'} ${selectedLabel}${command.entity === 'symptom_note' ? ` symptom notes on ${command.localDate} (${command.timeZone})` : ''}${changeSummary}${command.operation === 'create' && isLibrary(command.entity) ? `. ${resolvedFoodReviewDetails({ items: itemArray(changes.items), nutrition: changes.nutrition }, true)}` : ''}`
    if (command.operation === 'create' && isLibrary(command.entity)) recordAction.spokenReview = `Create ${selectedLabel}. ${resolvedFoodReviewDetails({ items: itemArray(changes.items), nutrition: changes.nutrition }, true, false)} This saves to your food library only and does not add a food diary entry. Would you like me to save it?`
    return { canConfirm: true, summary, confirmationMessage: `${summary}. ${command.operation === 'create' && isLibrary(command.entity) ? 'This saves to your food library only and does not add a food diary entry. ' : ''}Please confirm before I make this change. Nothing has changed yet.`, recordAction }
  } catch (error: any) { return { canConfirm: false, summary: 'Please review this action', confirmationMessage: text(error?.message || 'Please select the exact record first.', 400), ...(command ? { recordAction: command } : {}) } }
}

export type NativeVoiceFoodRecordSelection = {
  command: VoiceRecordCommand
  row: any
  foodRow: any | null
  beforeHash: string
  foodBeforeHash: string
  sourceFood: { items: any[]; nutrition: Record<string, any>; meal?: string; mealName?: string } | null
}
function itemArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed } catch {} }
  return []
}
function waterLink(row: any): string | undefined {
  const nutrition = row?.nutrients || row?.nutrition
  const id = nutrition?.__waterLogId || nutrition?.waterLogId || itemArray(row?.items).map((item) => item?.__waterLogId || item?.waterLogId).find(Boolean)
  return typeof id === 'string' && id.trim() ? id.trim() : undefined
}
function resolvedWholeWeight(items: any[]): number | null {
  let grams = 0
  for (const item of items) {
    const match = String(item?.serving_size || '').trim().match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg|oz|ounces?)$/i)
    if (!match) return null
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) return null
    grams += amount * (/^kg$/i.test(match[2]) ? 1000 : /^(?:oz|ounce)/i.test(match[2]) ? 28.349523125 : 1)
  }
  return grams > 0 ? grams : null
}

/** Describe the exact stored basis separately from the eaten nutrition. Never
 * infer an ingredient amount, recipe yield, cooking step or missing nutrient. */
function resolvedFoodReviewDetails(food: any, library = false, readSteps = true) {
  const nutrition = food?.nutrition || {}
  const ingredients = itemArray(food?.items).map((item) => {
    const amount = typeof item.serving_size === 'string' ? item.serving_size.trim() : ''
    return `${text(item.name || item.__voiceSourceFood?.name || 'Unnamed ingredient', 500)}: ${amount || 'amount not recorded'}`
  })
  const rawScale = nutrition.__portionScale ?? 1
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0 ? rawScale : null
  const amount = nutrition.__portionAmount
  const unit = nutrition.__portionUnit
  const yieldCount = nutrition.__portionRecipeServings ?? nutrition.__importRecipe?.servings
  const prefix = library ? 'Stored nutrition portion' : 'Consumed portion'
  const portion = typeof amount === 'number' && amount > 0 && ['g', 'oz'].includes(unit) ? `${amount} ${unit} of the listed ingredient basis`
    : typeof amount === 'number' && amount > 0 && unit === 'serving' && typeof yieldCount === 'number' && yieldCount > 0 ? `${amount} of ${yieldCount} recipe servings`
    : scale === null ? 'not recorded' : scale === 1 ? 'all listed ingredient amounts' : `${Number((scale * 100).toFixed(4))}% of the listed ingredient amounts`
  const nutrients = [['calories', 'calories_kcal', 'calories', 'kcal'], ['protein_g', 'protein', 'protein', 'g'], ['carbs_g', 'carbs', 'carbohydrate', 'g'], ['fat_g', 'fat', 'fat', 'g'], ['fiber_g', 'fiber', 'fibre', 'g'], ['sugar_g', 'sugar', 'sugar', 'g']].map(([primary, alias, label, unit]) => {
    const value = Object.prototype.hasOwnProperty.call(nutrition, primary) ? nutrition[primary] : nutrition[alias]
    return `${label}: ${typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${Number(value.toFixed(1))} ${unit}` : 'unknown'}`
  })
  const recipe = nutrition.__importRecipe
  const recipeDetails = recipe && typeof recipe === 'object' ? [
    ...(typeof recipe.title === 'string' && recipe.title ? [`Stored recipe title: ${recipe.title}.`] : []),
    `Recipe yield: ${typeof recipe.servings === 'number' && recipe.servings > 0 ? `${recipe.servings} servings` : 'not recorded'}.`,
    ...(typeof recipe.prepMinutes === 'number' && Number.isFinite(recipe.prepMinutes) && recipe.prepMinutes >= 0 ? [`Preparation time: ${recipe.prepMinutes} minutes.`] : []),
    ...(typeof recipe.cookMinutes === 'number' && Number.isFinite(recipe.cookMinutes) && recipe.cookMinutes >= 0 ? [`Cooking time: ${recipe.cookMinutes} minutes.`] : []),
    ...(Array.isArray(recipe.ingredients) && recipe.ingredients.length ? [`Stored recipe ingredients: ${recipe.ingredients.map((line: unknown) => String(line)).join('; ')}.`] : []),
    Array.isArray(recipe.steps) && recipe.steps.length ? readSteps ? `Full stored cooking steps: ${recipe.steps.map((step: unknown, index: number) => `${index + 1}. ${String(step)}`).join(' ')}` : `${recipe.steps.length} full cooking steps are retained in the written review and saved recipe.` : 'Cooking steps: not recorded.',
    ...(typeof recipe.sourceUrl === 'string' && recipe.sourceUrl ? [`Recipe source: ${recipe.sourceUrl}.`] : []),
  ].join(' ') : ''
  const sourceNotice = typeof food.sourceNote === 'string' ? food.sourceNote.trim() : ''
  return [`Complete ingredient basis: ${ingredients.length ? ingredients.join('; ') : 'ingredient amounts not recorded'}.`, `${prefix}: ${portion}.`, `Nutrition for this portion: ${nutrients.join('; ')}.`, sourceNotice, recipeDetails].filter(Boolean).join(' ')
}

/** Read-only selection for the root's normal food builder. No model-supplied
 * nutrients are accepted here; ambiguity stays available to the next turn. */
export async function selectNativeVoiceFoodRecordForEdit(request: NextRequest, userId: string, raw: any, io: VoiceRecordIo = invokeNativeVoiceRecordRoute) {
  let command: VoiceRecordCommand | undefined
  try {
    command = cleanCommand({ ...raw, operation: 'delete', changes: {} })
    if (!['food', 'water'].includes(command.entity)) throw new Error('Please choose the meal or drink to change.')
    command.operation = 'update'
    let all = await ownedRows(request, userId, command, io)
    const matching = selectedRows(all, command)
    if (matching.length !== 1) {
      const details = choiceDetails(matching, command.entity)
      return { canConfirm: false, summary: 'Choose one entry', confirmationMessage: details.message, choices: details.choices, recordAction: { ...command, choices: details.choices } }
    }
    let row = matching[0]
    let foodRow: any = command.entity === 'food' ? row : null
    if (command.entity === 'food' && waterLink(row)) {
      const id = waterLink(row)!
      const hydration = await ownedRows(request, userId, { ...command, entity: 'water', id }, io)
      const linked = hydration.filter((entry: any) => String(entry.id) === id)
      if (linked.length !== 1) throw new Error('The linked drink is missing. Please review this entry in the app.')
      row = linked[0]
      command = { ...command, entity: 'water', id }
    }
    command.id = String(row.id)
    if (command.entity === 'water') {
      const foods = await ownedRows(request, userId, { ...command, entity: 'food', id: undefined }, io)
      const linked = foods.filter((entry: any) => waterLink(entry) === command!.id)
      if (linked.length > 1) throw new Error('This drink has multiple linked food records. Please review their ingredients in the app first.')
      foodRow = linked[0] || null
      if (!foodRow && row.label && !/^(?:(?:plain|tap|mineral|sparkling|still|filtered|bottled)\s+)?water$/i.test(row.label)) throw new Error('The linked drink ingredients are missing. Please review this drink in the app.')
    }
    const selection: NativeVoiceFoodRecordSelection = { command, row, foodRow, beforeHash: hash(row), foodBeforeHash: hash(foodRow),
      sourceFood: foodRow ? { items: itemArray(foodRow.items), nutrition: foodRow.nutrients || foodRow.nutrition || {}, meal: foodRow.meal, mealName: foodRow.name } : null }
    return { canConfirm: false, summary: `Review ${label(foodRow || row, command.entity)}`, confirmationMessage: 'I found the entry. Its ingredients still need a reviewed change before saving.', selection }
  } catch (error: any) { return { canConfirm: false, summary: 'Choose an entry', confirmationMessage: text(error?.message, 400), ...(command ? { recordAction: command } : {}) } }
}

/** The root supplies a COMPLETE food from its normal source lookup, plus the
 * actual lookup snapshots in trustedSources. Never pass model nutrition. */
export async function prepareNativeVoiceResolvedFoodRecordAction(request: NextRequest, userId: string, selection: NativeVoiceFoodRecordSelection,
  resolvedFood: any, options: { trustedSources: any[]; changes?: Record<string, any> }, io: VoiceRecordIo = invokeNativeVoiceRecordRoute) {
  try {
    const selected = await selectNativeVoiceFoodRecordForEdit(request, userId, selection.command, io)
    const current = selected.selection
    if (!current || current.beforeHash !== selection.beforeHash || current.foodBeforeHash !== selection.foodBeforeHash) throw new Error('This entry changed while resolving its ingredients. Please review the latest version.')
    const normalized = validateNativeVoiceResolvedFood(resolvedFood, options.trustedSources)
    const oldNutrition = current.foodRow?.nutrients || current.foodRow?.nutrition || {}
    const nutrition = { ...oldNutrition, ...normalized.nutrition }
    const previousScale = oldNutrition.__portionScale
    const wholeWeight = resolvedWholeWeight(normalized.items)
    if ('__portionTotalWeightG' in oldNutrition) nutrition.__portionTotalWeightG = wholeWeight
    if (resolvedFood?.nutrition?.__portionScale === undefined && typeof previousScale === 'number' && previousScale > 0) {
      let preservedScale = previousScale
      if (oldNutrition.__portionControlEnabled !== false && ['g', 'oz'].includes(oldNutrition.__portionUnit)) {
        const amount = Number(oldNutrition.__portionAmount)
        if (!wholeWeight || !Number.isFinite(amount) || amount <= 0) throw new Error('The edited recipe needs a known total weight to keep your gram or ounce portion. Please choose servings instead.')
        preservedScale = amount * (oldNutrition.__portionUnit === 'oz' ? 28.349523125 : 1) / wholeWeight
      }
      nutrition.__portionScale = preservedScale
      for (const key of ['calories', 'calories_kcal', 'protein', 'protein_g', 'carbs', 'carbs_g', 'fat', 'fat_g', 'fiber', 'fiber_g', 'sugar', 'sugar_g']) {
        if (typeof normalized.nutrition[key] === 'number') nutrition[key] = normalized.nutrition[key] * preservedScale
      }
    }
    if ('__fullMealItems' in oldNutrition) nutrition.__fullMealItems = normalized.items
    if ('__fullMealNutrition' in oldNutrition) {
      const whole: any = { ...(oldNutrition.__fullMealNutrition || {}) }
      const inputScale = normalized.nutrition.__portionScale || 1
      for (const key of ['calories', 'calories_kcal', 'protein', 'protein_g', 'carbs', 'carbs_g', 'fat', 'fat_g', 'fiber', 'fiber_g', 'sugar', 'sugar_g']) whole[key] = normalized.nutrition[key] == null ? null : normalized.nutrition[key] / inputScale
      nutrition.__fullMealNutrition = whole
    }
    const complete = validateNativeVoiceResolvedFood({ ...normalized, nutrition }, options.trustedSources)
    const changes = { ...(options.changes || {}) }
    const prepared = await prepareNativeVoiceRecordAction(request, userId, { ...current.command,
      changes: current.command.entity === 'food' ? { ...changes, items: complete.items, nutrition: complete.nutrition }
        : { amount: current.row.amount, unit: current.row.unit, ...changes } }, io)
    if (!prepared.canConfirm || !prepared.recordAction || !('beforeHash' in prepared.recordAction) || typeof prepared.recordAction.beforeHash !== 'string') return prepared
    const recordAction = prepared.recordAction as VoiceRecordAction
    if (current.command.entity === 'water') recordAction.resolvedDrinkFood = { food: complete, expectedFoodState: current.foodRow,
      trustedSources: options.trustedSources, title: changes.label || current.foodRow?.name || current.row.label || 'Drink' }
    const summary = `Update selected entry “${label(current.foodRow || current.row, current.command.entity)}” on ${current.command.localDate}. ${resolvedFoodReviewDetails(complete)}${Object.keys(changes).length ? ` Other reviewed changes: ${friendlyChanges(changes)}.` : ''}`
    return { ...prepared, recordAction, summary, confirmationMessage: `${summary} Nothing has changed yet. Would you like me to save this exact change?` }
  } catch (error: any) { return { canConfirm: false, summary: 'Review this food change', confirmationMessage: text(error?.message, 400), recordAction: selection?.command } }
}

/** Save a resolved meal/recipe directly to the library without logging eating. */
export async function prepareNativeVoiceFoodLibraryFromResolved(request: NextRequest, userId: string,
  raw: { entity: 'favorite' | 'custom_food'; localDate: string; label: string }, resolvedFood: any, options: { trustedSources: any[] }, io: VoiceRecordIo = invokeNativeVoiceRecordRoute) {
  try {
    const complete = validateNativeVoiceResolvedFood(resolvedFood, options.trustedSources)
    const command = cleanCommand({ ...raw, operation: 'create', id: crypto.randomUUID(), changes: { label: raw.label, description: raw.label,
      meal: complete.meal || 'uncategorized', nutrition: complete.nutrition, items: complete.items,
      ...(raw.entity === 'custom_food' ? { customMeal: true, method: 'meal-builder' } : {}) } })
    if (!isLibrary(command.entity)) throw new Error('Please choose Favorites or Custom foods.')
    const all = await ownedRows(request, userId, command, io)
    if (!all.voiceLibraryVersion || all.length >= 300) throw new Error('Please review your current food library before adding this recipe.')
    const recordAction: VoiceRecordAction = { ...command, id: command.id!, changes: command.changes!, beforeHash: hash(all), libraryVersion: all.voiceLibraryVersion }
    const summary = `Save ${text(raw.label, 160)} to ${raw.entity === 'favorite' ? 'Favorites' : 'Custom foods'}. ${resolvedFoodReviewDetails(complete, true)}`
    recordAction.spokenReview = `Save ${text(raw.label, 160)} to ${raw.entity === 'favorite' ? 'Favorites' : 'Custom foods'}. ${resolvedFoodReviewDetails(complete, true, false)} This does not add a food diary entry. Would you like me to save this exact recipe or food to your library?`
    return { canConfirm: true, summary, confirmationMessage: `${summary} This does not add a food diary entry. Would you like me to save this exact recipe or food to your library?`, recordAction }
  } catch (error: any) { return { canConfirm: false, summary: 'Review this saved food', confirmationMessage: text(error?.message, 400) } }
}

/** Caller must verify the signed reviewed draft before invoking. No result is
 * called saved until the existing authenticated handler confirms success. */
export async function executeNativeVoiceRecordAction(request: NextRequest, userId: string, raw: VoiceRecordAction, io: VoiceRecordIo = invokeNativeVoiceRecordRoute) {
  if (isHealthIntakeRecordEntity(raw?.entity)) return executeNativeVoiceHealthIntakeRecordAction(request, userId, raw)
  const command = cleanCommand(raw)
  if (!raw.beforeHash || !command.id) throw new Error('Please review the exact record before confirming.')
  const all = await ownedRows(request, userId, command, io)
  const record = command.operation === 'create' ? null : selectedRows(all, command)[0]
  if (command.operation !== 'create' && !record) throw new Error('That record is no longer available. Please review it again.')
  if (hash(isLibrary(command.entity) ? all : record) !== raw.beforeHash) throw new Error('This record changed after the proposal. Please review the latest version before saving.')
  if (isLibrary(command.entity)) {
    if (!raw.libraryVersion || raw.libraryVersion !== all.voiceLibraryVersion) throw new Error('Your food library changed. Please review it again.')
    await io(request, { entity: command.entity, method: 'POST', localDate: command.localDate, body: { voiceFavoriteMutation: { operation: command.operation, entity: command.entity, id: command.id, expectedVersion: raw.libraryVersion, changes: raw.changes } } })
  } else {
    const method = command.operation === 'delete' ? 'DELETE' : command.entity === 'food' || command.entity === 'mood_journal' ? 'PUT' : 'PATCH'
    if (command.entity === 'symptom_note' && request.signal?.aborted) throw new Error('This symptom-history request stopped. Please check it before retrying.')
    const response = await io(request, { entity: command.entity, method, localDate: command.localDate, id: command.id, body: safeBody(record, raw) })
    if (command.entity === 'symptom_note' && response?.success !== true) throw new Error('The app did not confirm deletion of these symptom notes. Please check your history before retrying.')
  }
  // Some legacy handlers return 200 even when a guarded write was skipped.
  // Read back the exact selected ID before reporting completion.
  const after = await ownedRows(request, userId, { ...command,
    ...(command.operation === 'update' && command.changes?.localDate ? { localDate: command.changes.localDate } : {}),
    ...(command.operation === 'delete' ? { id: undefined } : {}),
  }, io)
  const current = after.find((row) => String(row.id) === command.id)
  if (command.operation === 'delete') {
    if (current) throw new Error('The app has not confirmed removal of that record. Please check it before retrying.')
  } else {
    if (!current) throw new Error('The app has not confirmed the updated record. Please reopen it before retrying.')
    for (const [key, expected] of Object.entries(command.changes || {})) {
      const actual = key === 'nutrition' && command.entity === 'food' ? current.nutrients ?? current.nutrition
        : key === 'caloriesOverride' && command.entity === 'exercise' ? current.rawPayload?.caloriesOverride ?? null : current[key]
      if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) throw new Error('The saved record does not yet match the reviewed change. Please check it before retrying.')
      if (key === 'caloriesOverride' && command.entity === 'exercise' && expected !== null && current.calories !== expected) throw new Error('The saved exercise calories do not yet match the reviewed override. Please check it before retrying.')
    }
  }
  return { kind: command.entity, id: command.id, operation: command.operation, message: `${command.operation === 'delete' ? 'Deleted' : command.operation === 'create' ? 'Created' : 'Updated'} the reviewed ${command.entity.replace(/_/g, ' ')} record.` }
}
