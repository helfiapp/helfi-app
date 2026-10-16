import crypto from 'crypto'
import { NextRequest } from 'next/server'

export type HealthIntakeRecordEntity = 'supplement' | 'medication'
export const HEALTH_INTAKE_RECORD_FIELDS = ['name', 'dosage', 'timing'] as const
export function isHealthIntakeRecordEntity(value: unknown): value is HealthIntakeRecordEntity { return value === 'supplement' || value === 'medication' }
export function isFactualHealthIntakeRecordRequest(value: unknown) {
  const text = String(value || '')
  if (/\b(?:could|can)\s+(?:i|we|he|she|they)\b|\b(?:should|recommend\w*|safe|interact|interaction|side effects?|treat|treatment|diagnos\w*|start|stop|increase|decrease)\b|\b(?:do not|don't|dont|never)\s+(?:remove|delete|clear|change|correct|update|edit)\b/i.test(text)) return false
  return /\b(?:remove|delete|clear|correct|update|edit|change|rename)\b/i.test(text) && /\b(?:recorded|saved)\s+(?:list|entry|record|dose|dosage|name|timing|medications?|supplements?)\b|\bhealth\s+intake\b|\b(?:my|the)\s+(?:medication|medicine|supplement)\s+list\b/i.test(text)
}
export function hasExplicitHealthIntakeRecordChanges(transcript: string, raw: any) {
  const normalizeDoseUnits = (text: string) => text.replace(/(\d+(?:\.\d+)?)\s*(milligrams?|micrograms?|grams?|mcg|mg|g)\b/gi, (_all, amount, unit) => `${Number(amount)} ${/^microgram|^mcg$/i.test(unit) ? 'mcg' : /^milligram|^mg$/i.test(unit) ? 'mg' : 'g'}`)
  const spoken = transcript.toLowerCase().replace(/\s+/g, ' ').trim()
  return Object.entries(raw || {}).every(([key, value]) => {
    const values = Array.isArray(value) ? value : [value]
    if (!values.length || values.some(item => item === '')) return /\b(?:clear|remove|empty)\b/i.test(transcript) && new RegExp(`\\b${key === 'dosage' ? '(?:dosage|dose|strength)' : key}\\b`, 'i').test(transcript)
    return values.every(item => {
      if (typeof item !== 'string') return false
      const field = item.toLowerCase().replace(/\s+/g, ' ').trim()
      const exact = (key === 'dosage' ? normalizeDoseUnits(field) : field).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^a-z0-9.+-])${exact}($|[^a-z0-9])`, 'i').test(key === 'dosage' ? normalizeDoseUnits(spoken) : spoken)
    })
  })
}
function text(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function hash(value: any): string {
  const stable = (input: any): any => Array.isArray(input) ? input.map(stable) : input && typeof input === 'object' ? Object.fromEntries(Object.keys(input).sort().map(key => [key, stable(input[key])])) : input
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}
function rowVersion(userId: string, entity: HealthIntakeRecordEntity, row: any) {
  return hash({ userId, entity, id: row.id, name: row.name, dosage: row.dosage, timing: row.timing, imageUrl: row.imageUrl, updatedAt: new Date(row.updatedAt).toISOString() })
}
function changesFor(raw: any) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Please give the recorded field to correct.')
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!HEALTH_INTAKE_RECORD_FIELDS.includes(key as any)) throw new Error('Only recorded name, dosage and timing can be corrected here.')
    if (key === 'timing') {
      if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 80)) throw new Error('Please give the exact recorded timing labels.')
      result.timing = Array.from(new Set(value.map(item => item.trim())))
    } else {
      if (typeof value !== 'string' || value.length > 200 || (key === 'name' && !value.trim())) throw new Error('Please give the exact recorded text.')
      result[key] = value.trim()
    }
  }
  return result
}
export async function readNativeVoiceHealthIntakeRecords(db: any, userId: string) {
  const records: any[] = []
  for (const entity of ['supplement', 'medication'] as const) {
    const rows = await db[entity].findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    records.push(...rows.map((row: any) => ({ id: row.id, entity, name: row.name, dosage: row.dosage, timing: row.timing, version: rowVersion(userId, entity, row) })))
  }
  return { records }
}
export async function mutateNativeVoiceHealthIntakeRecord(db: any, userId: string, raw: any) {
  if (!isHealthIntakeRecordEntity(raw?.entity) || !['update', 'delete'].includes(raw?.operation) || !text(raw?.id, 120) || !/^[a-f0-9]{64}$/.test(raw?.beforeHash || '')) throw new Error('Please review the exact recorded Health Intake item first.')
  if (Object.keys(raw).some(key => !['entity', 'operation', 'id', 'beforeHash', 'changes'].includes(key))) throw new Error('Please use the reviewed Health Intake action.')
  const changes = changesFor(raw.changes || {})
  if (raw.operation === 'update' && !Object.keys(changes).length) throw new Error('Please specify the recorded correction.')
  if (raw.operation === 'delete' && Object.keys(changes).length) throw new Error('Please review removal separately from edits.')
  return db.$transaction(async (tx: any) => {
    const row = await tx[raw.entity].findFirst({ where: { id: raw.id, userId } })
    if (!row || rowVersion(userId, raw.entity, row) !== raw.beforeHash) throw new Error('That recorded item changed. Please review it again.')
    if (raw.operation === 'update' && Object.entries(changes).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value))) return { success: true, id: row.id, entity: raw.entity, operation: raw.operation, changed: false }
    const where = { id: row.id, userId, updatedAt: row.updatedAt }
    const result = raw.operation === 'delete' ? await tx[raw.entity].deleteMany({ where }) : await tx[raw.entity].updateMany({ where, data: changes })
    if (result.count !== 1) throw new Error('That recorded item changed while saving. Please review it again.')
    return { success: true, id: row.id, entity: raw.entity, operation: raw.operation, changed: true }
  })
}
export type HealthIntakeRecordIo = (request: NextRequest, method: 'GET' | 'POST', body?: any) => Promise<any>
export async function invokeNativeVoiceHealthIntakeRoute(original: NextRequest, method: 'GET' | 'POST', body?: any) {
  const url = new URL('/api/user-data', original.url)
  if (method === 'GET') url.searchParams.set('scope', 'voice-health-intake')
  const headers = new Headers(original.headers)
  headers.set('content-type', 'application/json')
  const request = new NextRequest(url, { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
  const route = await import('@/app/api/user-data/route')
  const response = method === 'GET' ? await route.GET(request) : await route.POST(request)
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || 'The app could not save this recorded correction.')
  return data
}
export async function prepareNativeVoiceHealthIntakeRecordAction(request: NextRequest, userId: string, raw: any, io: HealthIntakeRecordIo = invokeNativeVoiceHealthIntakeRoute) {
  try {
    if (!isHealthIntakeRecordEntity(raw?.entity) || !['update', 'delete'].includes(raw?.operation)) throw new Error('Please choose a recorded supplement or medication to edit or remove.')
    const changes = changesFor(raw.changes || {})
    if (raw.operation === 'update' && !Object.keys(changes).length) throw new Error('Please give the exact recorded correction.')
    if (raw.operation === 'delete' && Object.keys(changes).length) throw new Error('Please review removal separately from edits.')
    const data = await io(request, 'GET')
    const records = Array.isArray(data.records) ? data.records.filter((row: any) => row.entity === raw.entity) : []
    const query = text(raw.query, 200).toLowerCase()
    let matching = raw.id ? records.filter((row: any) => row.id === raw.id) : records.filter((row: any) => String(row.name).toLowerCase() === query || `${row.name} ${row.dosage}`.trim().toLowerCase() === query)
    if (!raw.id && !matching.length && query) matching = records.filter((row: any) => `${row.name} ${row.dosage}`.toLowerCase().includes(query))
    if (matching.length !== 1) {
      const choices = matching.map((row: any) => ({ id: row.id, label: `${row.name}${row.dosage ? ` (${row.dosage})` : ''}` }))
      return { canConfirm: false, summary: 'Choose a recorded item', confirmationMessage: choices.length ? `Which recorded item do you mean? ${choices.map((choice: any, index: number) => `${index + 1}. ${choice.label}`).join('; ')}` : 'I could not find that recorded item. Please give its exact name and recorded strength.', recordAction: { ...raw, choices } }
    }
    const row = matching[0]
    if (raw.operation === 'update' && Object.entries(changes).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value))) return { canConfirm: false, summary: 'Already recorded', confirmationMessage: 'That recorded item already matches these details. Nothing needs changing.', recordAction: raw }
    const detail = raw.operation === 'update' ? `: ${Object.entries(changes).map(([key, value]) => `${key} to ${Array.isArray(value) ? value.length ? value.join(', ') : 'empty' : value || 'empty'}`).join('; ')}` : ''
    const summary = `${raw.operation === 'delete' ? 'Remove' : 'Correct'} ${row.name}${row.dosage ? ` (${row.dosage})` : ''} in your recorded ${raw.entity} list${detail}`
    return { canConfirm: true, summary, confirmationMessage: `${summary}. This changes your recorded list only. Would you like me to save that?`, recordAction: { operation: raw.operation, entity: raw.entity, id: row.id, localDate: raw.localDate, changes, beforeHash: row.version, ownerId: userId } }
  } catch (error: any) { return { canConfirm: false, summary: 'Review the recorded item', confirmationMessage: text(error?.message, 400), recordAction: raw } }
}
export async function executeNativeVoiceHealthIntakeRecordAction(request: NextRequest, userId: string, raw: any, io: HealthIntakeRecordIo = invokeNativeVoiceHealthIntakeRoute) {
  if (raw?.ownerId !== userId || !raw.id || !raw.beforeHash) throw new Error('Please review this recorded correction again.')
  const before = await io(request, 'GET')
  const row = before.records?.find((item: any) => item.id === raw.id && item.entity === raw.entity)
  if (!row || row.version !== raw.beforeHash) throw new Error('That recorded item changed after review. Please review it again.')
  const changes = changesFor(raw.changes || {})
  await io(request, 'POST', { voiceHealthIntakeMutation: { operation: raw.operation, entity: raw.entity, id: raw.id, beforeHash: raw.beforeHash, changes } })
  const after = await io(request, 'GET')
  const current = after.records?.find((item: any) => item.id === raw.id && item.entity === raw.entity)
  if (raw.operation === 'delete' ? Boolean(current) : !current || Object.entries(changes).some(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))) throw new Error('The app has not confirmed the recorded change. Please check it before retrying.')
  return { kind: raw.entity, id: raw.id, operation: raw.operation, message: `${raw.operation === 'delete' ? 'Removed' : 'Corrected'} the item in your recorded ${raw.entity} list.` }
}
