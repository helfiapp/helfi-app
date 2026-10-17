/** Provider-free bridges using the local host's fixed normal app services,
 * never model-selected routes. Writes retain normal signed review, durable
 * claims and verified outcomes. A POST failure must never be retried here.
 */
import { nativeAssistantJournalEntryId } from './native-assistant-action-id'

export type AdapterContext = { actorId: string; localDate: string; signal?: AbortSignal }
export type AdapterCost = { kind: 'free' | 'metered'; maximumCredits: number | null }
export type AdapterPreparation = { data: unknown; summary: string; sourceVersion?: string; cost: AdapterCost; resultReserveCharacters?: number; resultReserveBytes?: number }
export type AdapterClaim = { actionId: string; receiptClaimed: true }
export type DomainAdapter = {
  read?: (context: AdapterContext, values: unknown) => Promise<any>
  prepare?: (context: AdapterContext, values: unknown) => Promise<AdapterPreparation>
  execute?: (context: AdapterContext, prepared: unknown, claim: AdapterClaim) => Promise<any>
  verify?: (context: AdapterContext, result: any, prepared?: unknown) => Promise<boolean>
  recover?: (context: AdapterContext, actionId: string, prepared: unknown) => Promise<unknown | null>
}
export type DomainAdapterServices = {
  /** Resolve the current authenticated account from the host request/session. */
  authenticatedActor: (context: AdapterContext) => Promise<string | null>
  /** Wrap prepareVoiceFoodManagement with fixed injected normal read I/O. */
  foodRead: (context: AdapterContext, action: 'diary.list' | 'diary.detail' | 'diary.totals', values: Record<string, unknown>) => Promise<any>
  /** Fixed normal /api/health-journal POST and GET, retaining normal auth. */
  healthJournal: {
    create: (context: AdapterContext, values: { content: string; localDate: string }, actionId?: string) => Promise<unknown>
    read: (context: AdapterContext, values: { localDate: string }) => Promise<unknown>
    actionIdsSupported?: boolean
  }
}
export class DomainAdapterError extends Error {
  constructor(public code: string, message: string, public retrySafe = true, public possibleEntryId?: string) {
    super(message); this.name = 'DomainAdapterError'
  }
}
const fail = (message = 'The app could not verify this exact selection.'): never => { throw new DomainAdapterError('invalid_domain_action', message) }
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  return value as Record<string, any>
}
function fields(value: unknown, allowed: string[]) {
  const row = object(value)
  if (Object.keys(row).some(key => !allowed.includes(key))) fail('That field is not supported for this action.')
  return row
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) return fail('Please give the complete exact text.')
  return value.trim()
}
function day(value: unknown): string {
  const result = text(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T12:00:00Z`)) || new Date(`${result}T12:00:00Z`).toISOString().slice(0, 10) !== result) fail('Please choose a valid calendar date.')
  return result
}
function active(context: AdapterContext) {
  if (context.signal?.aborted) throw new DomainAdapterError('cancelled', 'This request stopped before completion.')
}
function journalValues(value: unknown, context: AdapterContext) {
  const values = fields(value, ['content', 'localDate'])
  // The normal text journal trims only outer whitespace. Keep literal internal
  // punctuation, newlines, journal names and quoted instructions unchanged.
  return { content: text(values.content, 20000), localDate: day(values.localDate ?? context.localDate) }
}
function journalPrepared(value: unknown, context: AdapterContext) {
  const row = fields(value, ['operation', 'actorId', 'content', 'localDate'])
  if (row.operation !== 'journal.health.create' || row.actorId !== context.actorId) fail('Please review this note in the same account again.')
  return journalValues({ content: row.content, localDate: row.localDate }, context)
}
function ownedJournalEntry(value: unknown, context: AdapterContext, expectedDate: string) {
  const row = object(value)
  const id = text(row.id, 200)
  if (row.userId !== context.actorId || row.localDate !== expectedDate || typeof row.content !== 'string') fail()
  return { id, localDate: row.localDate as string, content: row.content as string }
}
const FREE: AdapterCost = { kind: 'free', maximumCredits: 0 }

export function createNativeAssistantDomainAdapters(services: DomainAdapterServices): Record<string, DomainAdapter> {
  async function authorize(context: AdapterContext) {
    active(context); text(context.actorId, 200); day(context.localDate)
    if (await services.authenticatedActor(context) !== context.actorId) throw new DomainAdapterError('unauthorized', 'Please use the same signed-in account for this request.')
    active(context)
  }
  async function journals(context: AdapterContext, localDate: string) {
    await authorize(context)
    const response = object(await services.healthJournal.read(context, { localDate }))
    await authorize(context)
    if (!Array.isArray(response.entries) || response.entries.length > 5000) fail()
    const rows = (response.entries as unknown[]).map(row => ownedJournalEntry(row, context, localDate))
    if (new Set(rows.map(row => row.id)).size !== rows.length) fail()
    return rows
  }
  async function journalRead(context: AdapterContext, raw: unknown) {
    await authorize(context)
    const values = fields(raw, ['id', 'localDate']), id = text(values.id, 200), localDate = day(values.localDate ?? context.localDate)
    const matches = (await journals(context, localDate)).filter(row => row.id === id)
    if (matches.length !== 1) fail('That exact saved note was not found in this account on that date.')
    return { verified: true, safeToClaimSaved: false, entry: matches[0] }
  }
  async function verifyJournal(context: AdapterContext, result: any, prepared?: unknown) {
    await authorize(context)
    const values = journalPrepared(prepared, context)
    if (result?.status !== 'completed' || result.saved !== true || result.verified !== true || result.actorId !== context.actorId || typeof result.actionId !== 'string' || !result.actionId.trim() || typeof result.entry?.id !== 'string') return false
    const rows = (await journals(context, values.localDate)).filter(row => row.id === result.entry.id)
    return rows.length === 1 && rows[0].content === values.content && rows[0].localDate === values.localDate && result.entry.content === values.content && result.entry.localDate === values.localDate
  }
  const adapters: Record<string, DomainAdapter> = {
    'journal.health.read': { read: journalRead },
    'journal.health.create': {
      prepare: async (context, raw) => {
        await authorize(context)
        const values = journalValues(raw, context)
        // Bound exactly one full possible owned verified result, including
        // JSON escaping/Unicode. The planner never supplies this reservation.
        const result = JSON.stringify({ status:'completed',saved:true,verified:true,actorId:context.actorId,actionId:'x'.repeat(200),entry:{id:'x'.repeat(200),localDate:values.localDate,content:values.content} })
        return { data: { operation: 'journal.health.create', actorId: context.actorId, ...values }, summary: `Save this complete note to Health Journal for ${values.localDate}:\n${values.content}`, cost: { ...FREE },resultReserveCharacters:result.length+4096,resultReserveBytes:Buffer.byteLength(result,'utf8')+4096 }
      },
      execute: async (context, prepared, claim) => {
        await authorize(context)
        const values = journalPrepared(prepared, context)
        if (claim?.receiptClaimed !== true || !text(claim.actionId, 200)) fail('This note needs its reviewed save receipt before execution.')
        let possibleEntryId: string | undefined
        try {
          // The normal service supplies an owned action identity when declared.
          // Never repeat POST on exception; recover its exact derived ID.
          const response = object(await services.healthJournal.create(context, values, claim.actionId))
          const posted = ownedJournalEntry(response.entry, context, values.localDate)
          possibleEntryId = posted.id
          if (posted.content !== values.content) fail()
          const read = await journalRead(context, { id: posted.id, localDate: values.localDate })
          if (read.entry.content !== values.content) fail()
          return { status: 'completed', saved: true, verified: true, actorId: context.actorId, actionId: claim.actionId, entry: read.entry }
        } catch {
          // Even a rejected/lost HTTP result may follow a committed write.
          // Keep the durable action pending and recover by exact read only.
          throw new DomainAdapterError('journal_save_uncertain', 'Saving this note could not be verified. Check the journal before trying to save it again.', false, possibleEntryId)
        }
      },
      verify: verifyJournal,
      ...(services.healthJournal.actionIdsSupported ? { recover: async (context: AdapterContext, actionId: string, prepared: unknown) => {
        await authorize(context)
        const values = journalPrepared(prepared, context), id = nativeAssistantJournalEntryId(context.actorId, actionId)
        const rows = (await journals(context, values.localDate)).filter(row => row.id === id)
        if (rows.length !== 1 || rows[0].content !== values.content) return null
        return { status: 'completed', saved: true, verified: true, actorId: context.actorId, actionId, entry: rows[0] }
      } } : {}),
    },
  }
  for (const action of ['diary.list', 'diary.detail', 'diary.totals'] as const) {
    adapters[`food.${action}`] = {
      read: async (context, raw) => {
        await authorize(context)
        const values = object(raw)
        const response = object(await services.foodRead(context, action, values))
        await authorize(context)
        if (response.canConfirm !== false || response.reviewToken !== undefined || response.foodManagement?.operation !== 'read') fail()
        return { verified: true, safeToClaimSaved: false, message: response.confirmationMessage, data: response.foodManagement.data }
      },
    }
  }
  return adapters
}
