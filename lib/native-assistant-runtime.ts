import { createHash, randomUUID } from 'crypto'
import { AssistantContractError, AssistantNotSubmittedError, AssistantContext, AssistantOperation, AssistantPrepared, AssistantRegistry, AssistantValue, validateAssistantValue } from './native-assistant-registry'

type Reference = { $from: string; path: string[] }
export type AssistantArguments = Record<string, AssistantValue | Reference>
export type AssistantPlanStep = { id: string; operation: string; values: AssistantArguments }
type StepState = AssistantPlanStep & {
  status: 'pending' | 'needs_details' | 'review' | 'executing' | 'awaiting_person' | 'completed' | 'uncertain' | 'cancelled'
  missing?: string[]
  clarification?: { message: string; choices?: unknown[] }
  prepared?: AssistantPrepared
  reviewId?: string
  reviewedAt?: number
  reviewDigest?: string
  actionId?: string
  result?: unknown
}
export type AssistantSession = { id: string; actorId: string; revision: number; status: 'active' | 'completed' | 'stopped'; steps: StepState[]; currentStepIds?: string[] }
/** The app supplies durable owned storage and an exclusive renewable lease.
 * Persist the executing claim before calling any normal write handler. */
export type AssistantSessionStore = {
  runExclusive<T>(actorId: string, sessionId: string, work: (session: AssistantSession | null, persist: (session: AssistantSession) => Promise<void>) => Promise<T>): Promise<T>
}
export type AssistantCommand =
  | { type: 'plan'; steps: AssistantPlanStep[] }
  | { type: 'advance' }
  | { type: 'correct'; stepId: string; values: AssistantArguments }
  | { type: 'confirm'; reviewId: string }
  | { type: 'decline'; reviewId: string }
  | { type: 'recover'; actionId: string }
  | { type: 'stop' }
export type AssistantRuntimeOptions = {
  registry: AssistantRegistry
  store: AssistantSessionStore
  /** Reauthenticate + normal per-operation access/consent/entitlement gates.
   * It must throw on denial and is called again before effects/recovery. */
  authorize: (context: AssistantContext, operation: AssistantOperation, phase: 'read' | 'prepare' | 'execute' | 'recover', prepared?: AssistantPrepared) => Promise<void>
  spendingAllowed?: boolean
  now?: () => number
}
const fail = (code: string, message: string): never => { throw new AssistantContractError(code, message) }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function stable(value: any): any { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])); return value }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const matchesAction = (result: any, actionId: string | undefined) => Boolean(actionId) && result !== null && typeof result === 'object' && !Array.isArray(result) && result.actionId === actionId
function bounded(value: unknown, reserveCharacters = 0, reserveBytes = 0): void {
  let size = reserveCharacters, nodes = 0
  const walk = (item: any, depth: number) => {
    if (++nodes > 20000 || depth > 20 || size > 100000) fail('invalid_input', 'The request contains too many fields.')
    if (item === null || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item === 'string') { size += item.length; if (size > 100000) fail('invalid_input', 'The request is too large.'); return }
    if (Array.isArray(item)) { if (item.length > 1000) fail('invalid_input', 'The request has too many items.'); item.forEach(value => walk(value, depth + 1)); return }
    const prototype = item && typeof item === 'object' ? Object.getPrototypeOf(item) : undefined
    if (!item || typeof item !== 'object' || prototype !== null && (Object.getPrototypeOf(prototype) !== null || Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value?.name !== 'Object')) fail('invalid_input', 'Please use ordinary action fields.')
    const keys = Object.keys(item)
    if (keys.length > 1000 || keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) fail('invalid_input', 'Those fields are not supported.')
    keys.forEach(key => { size += key.length; walk(item[key], depth + 1) })
  }
  walk(value, 0)
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') + reserveBytes > 180000) fail('invalid_input', 'The request is too large to retain its exact saved result safely.')
}
function keys(value: object, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) fail('unknown_field', 'That request contains unsupported fields.') }
const reference = (value: unknown): value is Reference => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value as object, '$from')
function references(value: unknown, visit: (value: Reference) => void): void {
  if (reference(value)) { visit(value); return }
  if (Array.isArray(value)) { value.forEach(item => references(item, visit)); return }
  if (value && typeof value === 'object') Object.values(value).forEach(item => references(item, visit))
}
function resolve(step: StepState, session: AssistantSession, registry: AssistantRegistry) {
  const resolveValue = (value: unknown): any => {
    if (!reference(value)) {
      if (Array.isArray(value)) return value.map(resolveValue)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item)]))
      return value
    }
    keys(value, ['$from', 'path'])
    const index = session.steps.indexOf(step), source = session.steps.findIndex(item => item.id === value.$from)
    if (source < 0 || source >= index || session.steps[source].status !== 'completed' || !Array.isArray(value.path) || value.path.length > 10 || value.path.some(key => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))) return fail('invalid_reference', 'Choose a verified result from an earlier step.')
    const sourceStep = session.steps[source], sourceOperation = registry.get(sourceStep.operation)
    // References use exactly the public result contract shown to the planner.
    // Internal receipts/ownership fields cannot become hidden argument inputs.
    // Match snapshot JSON serialization, including omission of undefined keys.
    let result: any = sourceOperation.plannerResult ? copy(sourceOperation.plannerResult(sourceStep.result)) : sourceStep.result
    for (const field of value.path) { if (!result || typeof result !== 'object' || !Object.hasOwn(result, field)) return fail('invalid_reference', 'That earlier result does not contain the requested field.'); result = result[field] }
    // Saved content is returned as data, never interpreted recursively as a
    // second reference or command (including strings containing instructions).
    return copy(result)
  }
  return resolveValue(step.values) as Record<string, AssistantValue>
}
export function createAssistantRuntime(options: AssistantRuntimeOptions) {
  const now = options.now ?? Date.now
  const operation = (context: AssistantContext, id: string) => {
    const op = options.registry.get(id)
    if (!context.actorId || context.signal?.aborted) fail('stopped', 'This assistant request has stopped.')
    if (op.capability && !context.capabilities.includes(op.capability)) fail('unsupported_client', 'This action needs a supported Helfi app version.')
    return op
  }
  return Object.freeze({
    discover: options.registry.discover,
    plannerSnapshot(context: AssistantContext, session: AssistantSession | null) {
      if (!session) return null
      if (session.actorId !== context.actorId) fail('unauthorized', 'Please use your own assistant context.')
      return {
        status: session.status,
        currentStepIds: session.currentStepIds ? [...session.currentStepIds] : session.steps.map(step => step.id),
        steps: session.steps.map(step => {
          const op = operation(context, step.operation)
          return {
            id: step.id, operation: step.operation, status: step.status, values: copy(step.values),
            ...(step.missing ? { missing: [...step.missing] } : {}),
            ...(step.clarification ? { clarification: copy(step.clarification) } : {}),
            ...(step.status === 'review' && step.prepared ? { review: { id: step.reviewId!, summary: step.prepared.summary, cost: copy(step.prepared.cost) } } : {}),
            ...(step.actionId && ['uncertain', 'executing', 'awaiting_person'].includes(step.status) ? { recoveryActionId: step.actionId } : {}),
            ...(step.status === 'completed' && op.plannerResult ? { result: copy(op.plannerResult(step.result)) } : {}),
          }
        }),
      }
    },
    /** Server-only clarification boundary. This is deliberately absent from
     * AssistantCommand/tool schemas: a new question suspends an unsubmitted
     * review, never authorizes or discards any requested action. */
    async suspendReview(context: AssistantContext, sessionId: string, expected: { reviewId: string; revision: number }, message: string, assertCurrent: () => Promise<void> = async () => {}): Promise<AssistantSession> {
      bounded({ expected, message })
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !context.actorId || context.signal?.aborted) fail('unauthorized', 'Please use your active signed-in conversation.')
      if (!expected || typeof expected.reviewId !== 'string' || !expected.reviewId || !Number.isSafeInteger(expected.revision) || expected.revision < 1 || typeof message !== 'string' || !message.trim() || message.length > 2000) fail('invalid_input', 'Please continue from the current assistant question.')
      keys(expected, ['reviewId', 'revision'])
      validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, context.localDate)
      return options.store.runExclusive(context.actorId, sessionId, async (stored, persist) => {
        if (!stored || stored.actorId !== context.actorId || stored.id !== sessionId) return fail('unauthorized', 'Please use your own assistant conversation.')
        const session = copy(stored)
        const step = session.steps.find(item => !['completed', 'cancelled'].includes(item.status))
        if (session.status !== 'active' || session.revision !== expected.revision || step?.status !== 'review' || step.reviewId !== expected.reviewId || step.actionId) return fail('stale_review', 'That review changed before the clarification. Please check the current request.')
        const op = operation(context, step.operation)
        await options.authorize(context, op, 'prepare', step.prepared)
        await assertCurrent()
        if (context.signal?.aborted) fail('stopped', 'This clarification stopped.')
        step.status = 'needs_details'
        step.clarification = { message }
        delete step.prepared; delete step.reviewId; delete step.reviewDigest; delete step.reviewedAt; delete step.missing
        session.revision++
        bounded(session)
        await persist(copy(session))
        await options.authorize(context, op, 'prepare')
        await assertCurrent()
        if (context.signal?.aborted) fail('stopped', 'This clarification stopped.')
        return copy(session)
      })
    },
    async handle(context: AssistantContext, sessionId: string, command: AssistantCommand): Promise<AssistantSession> {
      bounded(command)
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !context.actorId || context.signal?.aborted) fail('unauthorized', 'Please use your active signed-in conversation.')
      validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, context.localDate)
      return options.store.runExclusive(context.actorId, sessionId, async (stored, persist) => {
        if (stored && (stored.actorId !== context.actorId || stored.id !== sessionId)) fail('unauthorized', 'Please use your own conversation.')
        let session = stored ? copy(stored) : { id: sessionId, actorId: context.actorId, revision: 0, status: 'active' as const, steps: [] }
        const ensureCapacity = (currentStepId?: string, reserveCharacters = 0, reserveBytes = 0) => {
          const completed = session.steps.filter(item => item.status === 'completed')
          const protectedIds = new Set([currentStepId, completed.at(-1)?.id, completed.filter(item => options.registry.get(item.operation).kind === 'write').at(-1)?.id].filter((id): id is string => Boolean(id)))
          for (;;) {
            try { bounded(session, reserveCharacters, reserveBytes); break }
            catch (error) {
              if (!(error instanceof AssistantContractError) || error.code !== 'invalid_input') throw error
              // Completed results already contain resolved input. Their old
              // preparation and reference expressions are no longer executed;
              // keep the latest completed/write evidence intact for receipts
              // and completion events before freeing any older metadata.
              const compact = session.steps.find(item => item.status === 'completed' && !protectedIds.has(item.id) && (Object.keys(item.values).length || item.prepared || item.reviewDigest || item.reviewedAt !== undefined))
              if (compact) { compact.values = {}; delete compact.prepared; delete compact.reviewDigest; delete compact.reviewedAt; continue }
              const required = new Set<string>()
              session.steps.filter(item => !['completed', 'cancelled'].includes(item.status)).forEach(item => references(item.values, ref => required.add(ref.$from)))
              const index = session.steps.findIndex(item => item.status === 'completed' && !protectedIds.has(item.id) && !required.has(item.id))
              if (index < 0) throw error
              const removed = session.steps.splice(index, 1)[0]
              if (session.currentStepIds) session.currentStepIds = session.currentStepIds.filter(id => id !== removed.id)
            }
          }
        }
        const save = async (currentStepId?: string) => {
          session.revision++
          ensureCapacity(currentStepId)
          await persist(copy(session))
        }
        const needsSmallerPlan = async (step: StepState) => {
          step.status = 'needs_details'; step.missing = ['plan.steps']
          step.clarification = { message: 'Nothing was submitted. This request contains too much text to safely keep every saved result. Please split it into fewer notes and review the smaller request.' }
          delete step.prepared; delete step.reviewId; delete step.reviewDigest; delete step.reviewedAt; delete step.actionId; delete step.result
          await save(step.id)
          return copy(session)
        }
        if (command.type === 'plan') {
          keys(command, ['type', 'steps'])
          if (stored && !(session.status === 'completed' && session.steps.every(item => item.status === 'completed') || session.status === 'stopped' && session.steps.every(item => ['completed', 'cancelled'].includes(item.status)))) fail('existing_plan', 'Continue or stop the existing conversation plan first. Check submitted results before replacing an uncertain action.')
          if (!Array.isArray(command.steps) || !command.steps.length || command.steps.length > 20) fail('invalid_plan', 'Please choose at most twenty connected actions in this bounded plan.')
          // A stopped unsubmitted proposal may be discarded. Preserve only
          // completed facts/receipts; a submitted uncertain or person action
          // never reaches this branch until its exact result is recovered.
          const retained = session.steps.filter(item => item.status === 'completed')
          const requiredPrevious = new Set<string>(), existingIds = new Set(retained.map(item => item.id))
          // Planner step names belong to one new plan. They are not durable
          // action/replay identities, and ordinary later plans may reuse them.
          const localIds = new Set<string>()
          command.steps.forEach(step => {
            keys(step, ['id', 'operation', 'values'])
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(step.id) || localIds.has(step.id) || !step.values || typeof step.values !== 'object' || Array.isArray(step.values)) return fail('invalid_plan', 'Each action needs its own name and fields.')
            localIds.add(step.id)
          })
          const reservedIds = new Set([...existingIds, ...localIds]), scopedIds = new Map<string, string>()
          command.steps.forEach(step => {
            let id = step.id, attempt = 0
            if (existingIds.has(id)) {
              do { id = `step_${digest({ actorId: context.actorId, sessionId, revision: session.revision, localId: step.id, attempt: attempt++ }).slice(0, 40)}` } while (reservedIds.has(id))
            }
            scopedIds.set(step.id, id); reservedIds.add(id)
          })
          const scopeValues = (value: any): any => {
            if (reference(value)) {
              if (existingIds.has(value.$from) && localIds.has(value.$from)) return fail('invalid_reference', 'That result name refers to both an earlier result and a new action. Please choose an unambiguous result.')
              return { ...copy(value), $from: scopedIds.get(value.$from) ?? value.$from }
            }
            if (Array.isArray(value)) return value.map(scopeValues)
            if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scopeValues(item)]))
            return value
          }
          const planned = command.steps.map(step => ({ ...copy(step), id: scopedIds.get(step.id)!, values: scopeValues(step.values) as AssistantArguments }))
          planned.forEach(item => references(item.values, ref => { if (existingIds.has(ref.$from)) requiredPrevious.add(ref.$from) }))
          let previous = retained.map(item => { const compact = { ...item, values: {} }; delete compact.prepared; delete compact.reviewDigest; delete compact.reviewedAt; return compact })
          const prunePrevious = () => {
            const removable = previous.findIndex(item => !requiredPrevious.has(item.id))
            if (removable < 0) fail('invalid_plan', 'Please use fewer earlier results in this request.')
            previous.splice(removable, 1)
          }
          while (previous.length + command.steps.length > 20) prunePrevious()
          const ids = new Set(previous.map(item => item.id))
          const added = planned.map(step => {
            keys(step, ['id', 'operation', 'values'])
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(step.id) || ids.has(step.id) || !step.values || typeof step.values !== 'object' || Array.isArray(step.values)) return fail('invalid_plan', 'Each action needs its own name and fields.')
            const op = operation(context, step.operation)
            if (Object.keys(step.values).some(key => !Object.hasOwn(op.input.properties, key))) return fail('unknown_field', 'That action does not support those fields.')
            references(step.values, value => {
              keys(value, ['$from', 'path'])
              if (!ids.has(value.$from) || !Array.isArray(value.path) || value.path.length > 10 || value.path.some(part => typeof part !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(part))) return fail('invalid_reference', 'Choose a result from an earlier action.')
            })
            ids.add(step.id)
            return { ...copy(step), status: 'pending' as const }
          })
          for (;;) {
            try { bounded({ ...session, status: 'active', steps: [...previous, ...added] }); break }
            catch (error) { if (!(error instanceof AssistantContractError) || error.code !== 'invalid_input' || !previous.length) throw error; prunePrevious() }
          }
          session.steps = [...previous, ...added]; session.currentStepIds = added.map(step => step.id); session.status = 'active'; await save()
        } else if (!stored) return fail('missing_plan', 'There is no pending assistant plan.')
        if (command.type === 'stop') {
          keys(command, ['type'])
          session.status = 'stopped'
          for (const step of session.steps) if (['pending', 'needs_details', 'review'].includes(step.status)) { step.status = 'cancelled'; delete step.prepared; delete step.reviewId; delete step.reviewDigest }
          await save(); return copy(session)
        }
        if (session.status === 'stopped' && command.type !== 'recover') fail('stopped', 'This plan was stopped. Check submitted results before starting another plan.')
        if (command.type === 'confirm' && session.steps.some(item => item.status === 'completed' && item.reviewId === command.reviewId)) {
          keys(command, ['type', 'reviewId'])
          return copy(session)
        }
        if (command.type === 'recover' && session.steps.some(item => item.status === 'completed' && item.actionId === command.actionId)) {
          keys(command, ['type', 'actionId'])
          return copy(session)
        }
        const step = session.steps.find(item => !['completed', 'cancelled'].includes(item.status))
        if (!step) {
          const replay = command.type === 'confirm' && session.steps.some(item => item.status === 'completed' && item.reviewId === command.reviewId)
            || command.type === 'recover' && session.steps.some(item => item.status === 'completed' && item.actionId === command.actionId)
          if (command.type !== 'advance' && !replay) fail('cannot_correct', 'This plan has completed. Start a new plan for another change.')
          session.status = 'completed'; await save(); return copy(session)
        }
        const op = operation(context, step.operation)
        if (command.type === 'correct') {
          keys(command, ['type', 'stepId', 'values'])
          if (step.id !== command.stepId || !['pending', 'needs_details', 'review'].includes(step.status)) fail('cannot_correct', 'Only the current unsubmitted action can be corrected.')
          if (!command.values || typeof command.values !== 'object' || Array.isArray(command.values)) fail('invalid_input', 'Please give the corrected fields.')
          const proposed = { ...step, values: { ...step.values, ...copy(command.values) } }
          // Invalid corrections must not poison the retained conversation.
          const proposedSession = { ...session, steps: session.steps.map(item => item === step ? proposed : item) }
          try { validateAssistantValue(op.input, resolve(proposed, proposedSession, options.registry)) }
          catch (error) { if (!(error instanceof AssistantContractError) || error.code !== 'missing_fields') throw error }
          step.values = proposed.values; step.status = 'pending'
          delete step.prepared; delete step.reviewId; delete step.reviewDigest; delete step.reviewedAt; delete step.missing
          delete step.clarification
          await save()
        }
        if (command.type === 'decline') {
          keys(command, ['type', 'reviewId'])
          if (step.status !== 'review' || command.reviewId !== step.reviewId) fail('stale_review', 'That review is no longer current.')
          session.status = 'stopped'; step.status = 'cancelled'; delete step.prepared; delete step.reviewId; delete step.reviewDigest
          for (const later of session.steps.slice(session.steps.indexOf(step) + 1)) later.status = 'cancelled'
          await save(); return copy(session)
        }
        if (command.type === 'confirm') {
          keys(command, ['type', 'reviewId'])
          if (step.status !== 'review' || !step.prepared || step.reviewId !== command.reviewId || now() - (step.reviewedAt ?? 0) > 30 * 60 * 1000 || now() < (step.reviewedAt ?? 0) || digest({ operation: step.operation, values: step.values, prepared: step.prepared }) !== step.reviewDigest) fail('stale_review', 'Please review the current action again.')
          const prepared = copy(step.prepared!), cost = prepared.cost
          if (cost.kind === 'metered' && (!options.spendingAllowed || cost.maximumCredits === null)) fail('spending_not_approved', 'This action needs separate spending approval and a bounded reviewed cost.')
          await options.authorize(context, op, 'execute', prepared)
          if (context.signal?.aborted) fail('stopped', 'This request stopped before submission.')
          if (prepared.resultReserveCharacters !== undefined) {
            try { ensureCapacity(step.id, prepared.resultReserveCharacters, prepared.resultReserveBytes!) }
            catch (error) { if (!(error instanceof AssistantContractError) || error.code !== 'invalid_input') throw error; return needsSmallerPlan(step) }
          }
          step.actionId = randomUUID(); step.status = 'executing'; await save()
          if (context.signal?.aborted) {
            // The durable claim exists but the normal operation was never
            // invoked. This is a known cancellation, not an uncertain save.
            session.status = 'stopped'
            for (const item of session.steps) if (item.status !== 'completed') { item.status = 'cancelled'; delete item.actionId; delete item.prepared; delete item.reviewId; delete item.reviewDigest }
            await save(); return copy(session)
          }
          let executeReturned = false
          try {
            const result = await op.execute!(context, prepared, { actionId: step.actionId, receiptClaimed: true })
            executeReturned = true
            bounded(result)
            if (!matchesAction(result, step.actionId)) step.status = 'uncertain'
            else if (op.kind === 'person') { step.status = 'awaiting_person'; step.result = copy(result) }
            else if (await op.verify(context, result, prepared)) { await options.authorize(context, op, 'execute', prepared); step.result = copy(result); step.status = 'completed' }
            else { step.result = copy(result); step.status = 'uncertain' }
          } catch (error) {
            if (!executeReturned && error instanceof AssistantNotSubmittedError) {
              bounded({ message: error.message, fields: error.fields, choices: error.choices })
              step.status = 'needs_details'; step.missing = [...error.fields]
              step.clarification = { message: error.message, ...(error.choices.length ? { choices: copy(error.choices) } : {}) }
              delete step.actionId; delete step.prepared; delete step.reviewId; delete step.reviewDigest; delete step.reviewedAt; delete step.result
              session.status = 'active'; await save(); return copy(session)
            }
            step.status = 'uncertain'
          }
          await save(step.id)
          // Never silently execute another mutation after a single confirmation.
          if (session.steps.every(item => item.status === 'completed')) { session.status = 'completed'; await save(step.id) }
          return copy(session)
        }
        if (command.type === 'recover') {
          keys(command, ['type', 'actionId'])
          if (!['uncertain', 'executing', 'awaiting_person'].includes(step.status) || step.actionId !== command.actionId || !step.prepared) fail('no_submitted_action', 'There is no matching submitted action to check.')
          await options.authorize(context, op, 'recover', step.prepared)
          if (context.signal?.aborted) fail('stopped', 'This receipt check stopped.')
          if (!op.recover) return copy(session)
          const result = await op.recover(context, step.actionId!, step.prepared!)
          if (result !== null) bounded(result)
          if (result !== null && matchesAction(result, step.actionId) && await op.verify(context, result, step.prepared)) { await options.authorize(context, op, 'recover', step.prepared); step.result = copy(result); step.status = 'completed'; if (session.steps.every(item => item.status === 'completed')) session.status = 'completed'; await save(step.id) }
          return copy(session)
        }
        if (command.type === 'advance') {
          keys(command, ['type'])
          if (step.status === 'review' && (now() - (step.reviewedAt ?? 0) > 30 * 60 * 1000 || now() < (step.reviewedAt ?? 0))) {
            step.status = 'pending'; delete step.prepared; delete step.reviewId; delete step.reviewDigest; delete step.reviewedAt; await save()
          }
        }
        else if (!['plan', 'correct'].includes(command.type)) fail('unknown_command', 'That assistant control is not available.')
        // Run free reads until the first clarification/review/person step.
        for (const current of session.steps) {
          if (current.status === 'completed' || current.status === 'cancelled') continue
          if (current.status !== 'pending' && current.status !== 'needs_details') return copy(session)
          const action = operation(context, current.operation)
          let values: Record<string, AssistantValue>
          try { values = validateAssistantValue(action.input, resolve(current, session, options.registry)) as Record<string, AssistantValue> }
          catch (error) { if (error instanceof AssistantContractError && error.code === 'missing_fields') { current.status = 'needs_details'; current.missing = error.fields; await save(); return copy(session) } throw error }
          if (action.kind === 'read') {
            await options.authorize(context, action, 'read')
            if (context.signal?.aborted) fail('stopped', 'This information request stopped before reading.')
            const result = await action.read!(context, values)
            bounded(result)
            if (!await action.verify(context, result)) fail('unverified_read', 'The app could not verify this information.')
            await options.authorize(context, action, 'read')
            if (context.signal?.aborted) fail('stopped', 'This information request stopped.')
            current.result = copy(result); current.status = 'completed'; await save(); continue
          }
          await options.authorize(context, action, 'prepare')
          if (context.signal?.aborted) fail('stopped', 'This request stopped before preparation.')
          let prepared: AssistantPrepared
          try { prepared = await action.prepare!(context, values) }
          catch (error) {
            if (!(error instanceof AssistantContractError) || error.code !== 'missing_fields') throw error
            const choices = (error as any).choices
            current.status = 'needs_details'; current.missing = [...error.fields]
            current.clarification = { message: error.message, ...(Array.isArray(choices) ? { choices: copy(choices) } : {}) }
            await save(); return copy(session)
          }
          bounded(prepared)
          if (!prepared || typeof prepared.summary !== 'string' || !prepared.summary.trim() || !prepared.cost || !['free', 'metered'].includes(prepared.cost.kind) || prepared.cost.kind === 'free' && prepared.cost.maximumCredits !== 0 || prepared.cost.kind === 'metered' && prepared.cost.maximumCredits !== null && (typeof prepared.cost.maximumCredits !== 'number' || !Number.isFinite(prepared.cost.maximumCredits) || prepared.cost.maximumCredits < 0)) fail('invalid_review', 'The app could not prepare a reliable review.')
          if ((prepared.resultReserveCharacters !== undefined || prepared.resultReserveBytes !== undefined) && (!Number.isSafeInteger(prepared.resultReserveCharacters) || prepared.resultReserveCharacters! < 0 || prepared.resultReserveCharacters! > 100000 || !Number.isSafeInteger(prepared.resultReserveBytes) || prepared.resultReserveBytes! < 0 || prepared.resultReserveBytes! > 180000)) fail('invalid_review', 'The app could not reserve space for this exact saved result.')
          if (context.signal?.aborted) fail('stopped', 'This request stopped before review.')
          current.prepared = copy(prepared); current.reviewId = randomUUID(); current.reviewedAt = now(); current.reviewDigest = digest({ operation: current.operation, values: current.values, prepared: current.prepared }); current.status = 'review'; delete current.missing
          if (prepared.resultReserveCharacters !== undefined) {
            try { ensureCapacity(current.id, prepared.resultReserveCharacters, prepared.resultReserveBytes!) }
            catch (error) { if (!(error instanceof AssistantContractError) || error.code !== 'invalid_input') throw error; return needsSmallerPlan(current) }
          }
          await save(); return copy(session)
        }
        session.status = 'completed'; await save(); return copy(session)
      })
    },
  })
}
