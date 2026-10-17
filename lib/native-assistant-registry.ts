/** Server-owned action contract. No provider, network, storage or app bootstrap.
 * This is an offline foundation; it is not advertised to installed clients. */
export type AssistantValue = null | boolean | number | string | AssistantValue[] | { [key: string]: AssistantValue }
export type AssistantField =
  | { type: 'string'; maxLength: number; minLength?: number; enum?: readonly string[]; format?: 'date' }
  | { type: 'number'; minimum: number; maximum: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'array'; items: AssistantField; minItems: number; maxItems: number }
  | { type: 'object'; properties: Readonly<Record<string, AssistantField>>; required: readonly string[] }
export type AssistantContext = { actorId: string; localDate: string; selectedLocalDate?: string; signal?: AbortSignal; capabilities: readonly string[] }
export type AssistantCost = { kind: 'free' | 'metered'; maximumCredits: number | null }
export type AssistantPrepared = { data: unknown; summary: string; sourceVersion?: string; cost: AssistantCost; resultReserveCharacters?: number; resultReserveBytes?: number }
export type AssistantReceipt = { actionId: string; receiptClaimed: true }
export type AssistantOperation = {
  id: string
  description: string
  input: Extract<AssistantField, { type: 'object' }>
  kind: 'read' | 'write' | 'person'
  capability?: string
  normalHandler: string
  coverage?: { manualIds: readonly string[]; status: 'offline-proof' | 'production'; scope: string }
  /** Explicit minimal owned result fields available to a planner. No durable
   * review internals, temporary links, account credentials or receipt bodies. */
  plannerResult?: (result: any) => AssistantValue
  read?: (context: AssistantContext, values: Record<string, AssistantValue>) => Promise<unknown>
  prepare?: (context: AssistantContext, values: Record<string, AssistantValue>) => Promise<AssistantPrepared>
  execute?: (context: AssistantContext, prepared: AssistantPrepared, receipt: AssistantReceipt) => Promise<unknown>
  verify: (context: AssistantContext, result: unknown, prepared?: AssistantPrepared) => Promise<boolean>
  /** Read-only recovery; must NEVER resubmit an uncertain operation. */
  recover?: (context: AssistantContext, actionId: string, prepared: AssistantPrepared) => Promise<unknown | null>
}
export class AssistantContractError extends Error {
  constructor(public code: string, message: string, public fields: string[] = []) { super(message) }
}
/** Trusted server helpers may raise this only after proving that their normal
 * write/provider handler has never been invoked. A name/code from JSON is not
 * this class and must never authorize another attempt at an uncertain save. */
export class AssistantNotSubmittedError extends Error {
  readonly code = 'not_submitted'
  constructor(message: string, public fields: string[], public choices: AssistantValue[] = []) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'AssistantNotSubmittedError'
  }
}
const fail = (code: string, message: string, fields: string[] = []): never => { throw new AssistantContractError(code, message, fields) }
const plain = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || Object.getPrototypeOf(prototype) === null && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value?.name === 'Object'
}
export function validateAssistantValue(schema: AssistantField, value: unknown, path = 'values'): AssistantValue {
  if (schema.type === 'object') {
    if (!plain(value)) return fail('invalid_input', 'Please provide the requested fields.', [path])
    const unknown = Object.keys(value).filter(key => !Object.hasOwn(schema.properties, key))
    if (unknown.length) return fail('unknown_field', 'That action does not support those fields.', unknown.map(key => `${path}.${key}`))
    const missing = schema.required.filter(key => !Object.hasOwn(value, key))
    if (missing.length) return fail('missing_fields', 'Please provide the missing details.', missing.map(key => `${path}.${key}`))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, validateAssistantValue(schema.properties[key], item, `${path}.${key}`)]))
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || value.includes('\0') || value.length < (schema.minLength ?? 1) || value.length > schema.maxLength || schema.enum && !schema.enum.includes(value)) return fail('invalid_input', 'Please provide a supported value.', [path])
    if (schema.format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)) return fail('invalid_input', 'Please choose a valid calendar date.', [path])
    return value
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum || schema.integer && !Number.isInteger(value)) return fail('invalid_input', 'Please give a supported number.', [path])
    return value
  }
  if (schema.type === 'boolean') { if (typeof value !== 'boolean') return fail('invalid_input', 'Please answer yes or no.', [path]); return value }
  if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) return fail('invalid_input', 'Please choose a supported number of items.', [path])
  return value.map((item, index) => validateAssistantValue(schema.items, item, `${path}.${index}`))
}
export function createAssistantRegistry(operations: readonly AssistantOperation[]) {
  const entries = new Map<string, AssistantOperation>()
  for (const operation of operations) {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(operation.id) || entries.has(operation.id) || !operation.normalHandler || !operation.description || typeof operation.verify !== 'function' || operation.kind === 'read' && !operation.read || operation.kind !== 'read' && (!operation.prepare || !operation.execute) || operation.kind === 'person' && !operation.recover) fail('invalid_registry', 'The assistant action registry is incomplete.')
    // Freeze the owned schema/metadata so a caller cannot add an endpoint or
    // swap an executor after discovery/review. Functions stay server-owned.
    const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
    const schema = freeze(JSON.parse(JSON.stringify(operation.input)))
    const coverage = operation.coverage ? freeze(JSON.parse(JSON.stringify(operation.coverage))) : undefined
    entries.set(operation.id, Object.freeze({ ...operation, input: schema, coverage }))
  }
  return Object.freeze({
    get(id: string): AssistantOperation { return entries.get(id) ?? fail('unknown_operation', 'That action is not available in this assistant.') },
    discover(context: AssistantContext) { return [...entries.values()].filter(operation => !operation.capability || context.capabilities.includes(operation.capability)).map(({ id, description, input, kind }) => ({ id, description, input, kind })) },
    ids(): string[] { return [...entries.keys()] },
    coverage() { return [...entries.values()].map(({ id, kind, coverage }) => ({ id, kind, coverage })) },
  })
}
export type AssistantRegistry = ReturnType<typeof createAssistantRegistry>
