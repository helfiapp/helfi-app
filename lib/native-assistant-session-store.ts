import { createHash, randomUUID } from 'crypto'
import { AssistantSession, AssistantSessionStore } from './native-assistant-runtime'

const CHUNK = 1024, MAX_CHUNKS = 256, TTL_MS = 24 * 60 * 60 * 1000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type Db = { verificationToken: any; $transaction: any }
export type AssistantConversationTurn = { actorId: string; sessionId: string; role: 'user' | 'assistant'; text: string; questionRevision?: number }
export class AssistantStorageError extends Error {
  constructor(public code: 'assistant_busy' | 'assistant_storage_invalid' | 'assistant_lease_lost', message: string) { super(message) }
}
/** Uses the app's existing bounded token storage, with no schema migration.
 * No database/provider is imported or contacted until an authenticated host
 * supplies its normal DB instance. Payloads never belong in indexed IDs. */
export function createPrismaAssistantSessionStore(db: Db, options: { now?: () => number; leaseMs?: number; renewEveryMs?: number } = {}) {
  const now = options.now ?? Date.now, leaseMs = options.leaseMs ?? 90000, renewEveryMs = options.renewEveryMs ?? 20000
  if (leaseMs < 1000 || renewEveryMs < 10 || renewEveryMs >= leaseMs / 2) throw new Error('Invalid assistant lease configuration.')
  const key = (actor: string, id: string, kind: string) => {
    if (!actor || actor.length > 200 || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new AssistantStorageError('assistant_storage_invalid', 'Please use your own active conversation.')
    return hash(JSON.stringify(['helfi-assistant-v1', actor, id, kind]))
  }
  const chunkPrefix = (token: string, generation: string) => `assistant-chunk:v1:${token}:${generation}:`
  const read = async (tx: any, actor: string, id: string, kind: string) => {
    const token = key(actor, id, kind), row = await tx.verificationToken.findUnique({ where: { token } })
    if (!row || new Date(row.expires).getTime() <= now()) return null
    const prefix = `assistant-value:v1:${token}:`
    if (!row.identifier.startsWith(prefix)) throw new AssistantStorageError('assistant_storage_invalid', 'This conversation could not be verified.')
    try {
      const marker = JSON.parse(row.identifier.slice(prefix.length))
      if (!Number.isInteger(marker.count) || marker.count < 1 || marker.count > MAX_CHUNKS || !Number.isInteger(marker.bytes) || marker.bytes < 1 || marker.bytes > MAX_CHUNKS * CHUNK * 3 / 4 || !/^[a-f0-9]{64}$/.test(marker.sha256) || !/^[a-f0-9]{64}$/.test(marker.generation)) throw Error('Invalid manifest')
      const piecesPrefix = chunkPrefix(token, marker.generation)
      const chunks = await tx.verificationToken.findMany({ where: { identifier: { startsWith: piecesPrefix }, expires: { gt: new Date(now()) } } })
      if (chunks.length !== marker.count) throw Error('Incomplete payload')
      const parts = new Map<number, string>()
      for (const chunk of chunks) {
        const match = chunk.identifier.slice(piecesPrefix.length).match(/^(0|[1-9]\d*):([A-Za-z0-9+/]+={0,2})$/)
        if (!match) throw Error('Invalid chunk')
        const index = Number(match[1]), data = match[2]
        if (index >= marker.count || parts.has(index) || data.length > CHUNK || index < marker.count - 1 && data.length !== CHUNK || chunk.token !== hash(JSON.stringify([token, marker.generation, index]))) throw Error('Invalid chunk identity')
        parts.set(index, data)
      }
      const encoded = Array.from({ length: marker.count }, (_, index) => parts.get(index)).join(''), bytes = Buffer.from(encoded, 'base64')
      if (bytes.toString('base64') !== encoded || bytes.length !== marker.bytes || hash(bytes.toString('utf8')) !== marker.sha256) throw Error('Payload checksum mismatch')
      const envelope = JSON.parse(bytes.toString('utf8'))
      if (envelope.actorId !== actor || envelope.sessionId !== id || envelope.kind !== kind) throw Error('Wrong owned envelope')
      return envelope.value
    } catch { throw new AssistantStorageError('assistant_storage_invalid', 'This conversation could not be verified. Check saved results before trying again.') }
  }
  const write = async (tx: any, actor: string, id: string, kind: string, value: unknown) => {
    const token = key(actor, id, kind), payload = JSON.stringify({ actorId: actor, sessionId: id, kind, value }), bytes = Buffer.from(payload, 'utf8'), encoded = bytes.toString('base64')
    const count = Math.ceil(encoded.length / CHUNK), generation = hash(randomUUID())
    if (!count || count > MAX_CHUNKS) throw new AssistantStorageError('assistant_storage_invalid', 'This conversation has reached its safe storage limit.')
    const expires = new Date(now() + TTL_MS), prefix = chunkPrefix(token, generation), marker = { generation, count, bytes: bytes.length, sha256: hash(payload) }
    // Replace one owned generation atomically; another account's rows and
    // unrelated normal app tokens are never selected or cleaned up.
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `assistant-chunk:v1:${token}:` } } })
    const created = await tx.verificationToken.createMany({ data: Array.from({ length: count }, (_, index) => ({ token: hash(JSON.stringify([token, generation, index])), identifier: `${prefix}${index}:${encoded.slice(index * CHUNK, (index + 1) * CHUNK)}`, expires })) })
    if (created.count !== count) throw new AssistantStorageError('assistant_storage_invalid', 'The conversation was not stored completely.')
    await tx.verificationToken.upsert({ where: { token }, create: { token, identifier: `assistant-value:v1:${token}:${JSON.stringify(marker)}`, expires }, update: { identifier: `assistant-value:v1:${token}:${JSON.stringify(marker)}`, expires } })
    const stored = await read(tx, actor, id, kind)
    if (JSON.stringify(stored) !== JSON.stringify(value)) throw new AssistantStorageError('assistant_storage_invalid', 'The stored conversation did not match.')
  }
  const leased = async <T>(actor: string, id: string, lane: string, work: (held: (tx: any) => Promise<void>) => Promise<T>): Promise<T> => {
    const token = key(actor, id, `lease:${lane}`), identifier = `assistant-lease:v1:${hash(randomUUID())}`
    try {
      await db.$transaction(async (tx: any) => {
        await tx.verificationToken.deleteMany({ where: { token, expires: { lte: new Date(now()) } } })
        await tx.verificationToken.create({ data: { token, identifier, expires: new Date(now() + leaseMs) } })
      }, { maxWait: 5000, timeout: 15000 })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new AssistantStorageError('assistant_busy', 'This conversation is still handling its previous request. Please wait for its result.')
      throw error
    }
    let lost = false, renewing: Promise<void> | null = null
    const held = async (tx: any) => {
      if (lost) throw new AssistantStorageError('assistant_lease_lost', 'This request lost its conversation lock. Check saved results before retrying.')
      const result = await tx.verificationToken.updateMany({ where: { token, identifier, expires: { gt: new Date(now()) } }, data: { expires: new Date(now() + leaseMs) } })
      if (result.count !== 1) { lost = true; throw new AssistantStorageError('assistant_lease_lost', 'This request lost its conversation lock. Check saved results before retrying.') }
    }
    const timer = setInterval(() => {
      if (renewing || lost) return
      renewing = held(db).catch(() => { lost = true }).finally(() => { renewing = null })
    }, renewEveryMs)
    timer.unref?.()
    try { return await work(held) }
    finally {
      clearInterval(timer)
      if (renewing) await renewing
      await db.verificationToken.deleteMany({ where: { token, identifier } }).catch(() => {})
    }
  }
  const store: AssistantSessionStore = {
    runExclusive: (actor, id, work) => leased(actor, id, 'plan', async held => {
      const stored = await db.$transaction((tx: any) => read(tx, actor, id, 'plan'), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 })
      if (stored && (stored.actorId !== actor || stored.id !== id)) throw new AssistantStorageError('assistant_storage_invalid', 'Please use your own conversation.')
      let revision = stored?.revision ?? 0
      return work(stored, session => db.$transaction(async (tx: any) => {
        await held(tx)
        const current = await read(tx, actor, id, 'plan')
        if ((current?.revision ?? 0) !== revision || session.actorId !== actor || session.id !== id || session.revision !== revision + 1) throw new AssistantStorageError('assistant_storage_invalid', 'The conversation changed. Please review its current state.')
        await write(tx, actor, id, 'plan', session); revision = session.revision
      }, { maxWait: 5000, timeout: 15000 }))
    }),
  }
  const conversationRows = (value: any, actor: string, id: string): AssistantConversationTurn[] => {
    if (!Array.isArray(value) || value.length > 80 || value.some(turn => !turn || typeof turn !== 'object' || Array.isArray(turn) || Object.keys(turn).some(key => !['actorId','sessionId','role','text','questionRevision'].includes(key)) || turn.actorId !== actor || turn.sessionId !== id || !['user','assistant'].includes(turn.role) || typeof turn.text !== 'string' || !turn.text || turn.text.length > 24000 || Object.hasOwn(turn,'questionRevision') && (turn.role !== 'assistant' || !Number.isSafeInteger(turn.questionRevision) || turn.questionRevision < 0)) || value.reduce((total, turn) => total + turn.text.length, 0) > 100000) throw new AssistantStorageError('assistant_storage_invalid', 'This conversation could not be verified.')
    return value
  }
  return {
    store,
    readSession: (actor: string, id: string): Promise<AssistantSession | null> => db.$transaction((tx: any) => read(tx, actor, id, 'plan'), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 }),
    runTurnExclusive: <T>(actor: string, id: string, work: (assertCurrent: () => Promise<void>) => Promise<T>) => leased(actor, id, 'turn', async held => work(() => held(db))),
    conversation: {
      read: async (actor: string, id: string): Promise<AssistantConversationTurn[]> => conversationRows((await db.$transaction((tx: any) => read(tx, actor, id, 'conversation'), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 })) ?? [], actor, id),
      append: (actor: string, id: string, turn: { role: 'user' | 'assistant'; text: string; questionRevision?: number }) => leased(actor, id, 'history', async held => db.$transaction(async (tx: any) => {
        await held(tx)
        const previous = conversationRows(await read(tx, actor, id, 'conversation') ?? [], actor, id)
        if (!turn || typeof turn !== 'object' || Array.isArray(turn) || Object.keys(turn).some(key => !['role','text','questionRevision'].includes(key))) throw new AssistantStorageError('assistant_storage_invalid', 'This conversation turn could not be verified.')
        conversationRows([{ actorId: actor, sessionId: id, ...turn }], actor, id)
        if (previous.length >= 80 || previous.reduce((sum: number, item: any) => sum + item.text.length, turn.text.length) > 100000) throw new AssistantStorageError('assistant_storage_invalid', 'This conversation has reached its safe context limit.')
        await write(tx, actor, id, 'conversation', [...previous, { actorId: actor, sessionId: id, ...turn }])
      }, { maxWait: 5000, timeout: 15000 })),
    },
  }
}
