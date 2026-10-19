import { AssistantContext, AssistantField, AssistantValue } from './native-assistant-registry'
import { AssistantCommand, AssistantSession, createAssistantRuntime } from './native-assistant-runtime'

type Runtime = ReturnType<typeof createAssistantRuntime>
export type AssistantPlannerTurn = {
  localDate: string
  selectedLocalDate?: string
  /** Set by the server host after checking an earlier submitted action. */
  recoveringPriorAction?: boolean
  /** Only the host may continue the same request after verified free reads. */
  planningContinuation?: boolean
  /** Server-owned latest question still matches this owned session revision. */
  answeringQuestion?: boolean
  channel: 'typed' | 'realtime'
  text: string
  actions: ReturnType<Runtime['discover']>
  /** A server-owned, same-account snapshot, not client-submitted history. */
  session: ReturnType<Runtime['plannerSnapshot']>
  history: { role: 'user' | 'assistant'; text: string }[]
}
export type AssistantPlannerReply = { command: AssistantCommand } | { question: string } | { done: true }
export type AssistantPlanner = (turn: AssistantPlannerTurn) => Promise<AssistantPlannerReply>
export type AssistantDecisionEvidence = { channel: 'typed' | 'realtime'; text: string; /** Server-injected only after separately verified fresh-turn assessment. */ decisionReceipt?: string } | { channel: 'control'; controlId: string }
export type AssistantReviewFence = { revision: number; stepId: string; reviewId: string }
/** Host-neutral bridge. A planner chooses/composes registered operations and
 * returns their structured arguments; no request text is reparsed into action
 * families here. The normal voice route supplies its planner; offline tests
 * supply a synthetic planner. This module never calls a provider directly. */
export function createAssistantToolBridge(options: {
  runtime: Runtime
  planner: AssistantPlanner
  readSession: (actorId: string, sessionId: string) => Promise<AssistantSession | null>
  authorizePlanning: (context: AssistantContext) => Promise<void>
  /** Recheck current read sources; completed writes retain their verified
   * durable receipts and are never executed again to finish a reply. */
  verifyCompletedSession?: (context: AssistantContext, session: AssistantSession) => Promise<boolean>
  /** Normal host policy must bind explicit human confirmation/correction to
   * this current turn/review. A planner tool call alone is never consent. */
  authorizeCommand: (context: AssistantContext, command: AssistantCommand, evidence: AssistantDecisionEvidence, session: AssistantSession | null) => Promise<void>
  plannerKind: 'synthetic' | 'provider'
  spendingAllowed?: boolean
  runTurnExclusive?: <T>(actorId: string, sessionId: string, work: (assertCurrent: () => Promise<void>) => Promise<T>) => Promise<T>
  conversation: {
    read: (actorId: string, sessionId: string) => Promise<{ actorId: string; sessionId: string; role: 'user' | 'assistant'; text: string; questionRevision?: number }[]>
    append: (actorId: string, sessionId: string, turn: { role: 'user' | 'assistant'; text: string; questionRevision?: number }) => Promise<void>
  }
}) {
  return Object.freeze({
    async turn(context: AssistantContext, sessionId: string, input: { channel: 'typed' | 'realtime'; text: string }, hostState: { recoveringPriorAction?: boolean; planningContinuation?: boolean; expectedUserTurnIndex?: number; expectedSessionRevision?: number; expectedQuestionRevision?: number } = {}): Promise<{ session?: AssistantSession; question?: string; done?: true; userTurnIndex?: number }> {
      const executeTurn = async (assertCurrent: () => Promise<void> = async () => {}) => {
      if (!context.actorId || context.signal?.aborted || !/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !['typed', 'realtime'].includes(input.channel) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000 || Object.keys(input).some(key => !['channel', 'text'].includes(key))) throw new Error('Please use the active signed-in assistant conversation.')
      if (options.plannerKind === 'provider' && !options.spendingAllowed) throw new Error('Live assistant planning needs separate spending approval.')
      await options.authorizePlanning(context)
      if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
      const session = await options.readSession(context.actorId, sessionId)
      if (session && (session.actorId !== context.actorId || session.id !== sessionId)) throw new Error('Please use your own assistant conversation.')
      if (session?.steps.some(step => step.status === 'completed' && !Object.hasOwn(step, 'result'))) throw new Error('The requested result is not fully verified. Please read the current information or review the pending action.')
      const turns = await options.conversation.read(context.actorId, sessionId)
      if (!Array.isArray(turns) || turns.length > 80 || turns.some(turn => !turn || turn.actorId !== context.actorId || turn.sessionId !== sessionId || !['user', 'assistant'].includes(turn.role) || typeof turn.text !== 'string' || turn.text.length > 24000 || Object.hasOwn(turn,'questionRevision') && (turn.role !== 'assistant' || !Number.isSafeInteger(turn.questionRevision) || turn.questionRevision! < 0)) || turns.reduce((total, turn) => total + turn.text.length, input.text.length) > 100000) throw new Error('This conversation needs a fresh bounded context before continuing.')
      await options.authorizePlanning(context)
      if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
      const continuation = hostState.planningContinuation === true
      const latest = turns.at(-1)
      const answeringQuestion = !continuation && latest?.role === 'assistant' && latest.questionRevision !== undefined && latest.questionRevision === (session?.revision ?? 0)
      if (hostState.expectedQuestionRevision !== undefined) {
        await assertCurrent()
        const needsDetails = session?.status === 'active' && session.steps.find(step => !['completed','cancelled'].includes(step.status))?.status === 'needs_details'
        if (continuation || !Number.isSafeInteger(hostState.expectedQuestionRevision) || hostState.expectedQuestionRevision < 0 || hostState.expectedQuestionRevision !== (session?.revision ?? 0) || !answeringQuestion && !needsDetails) throw new Error('That clarification changed. Please check the current request before answering it.')
      }
      // The current request already exists in durable conversation storage.
      // Remove only that exact latest user position from planner history, so
      // older identical messages remain intact and turn.text appears once.
      const currentUserIndex = continuation ? turns.map(turn => turn.role).lastIndexOf('user') : -1
      if (continuation && (currentUserIndex < 0 || currentUserIndex !== hostState.expectedUserTurnIndex || turns[currentUserIndex].text !== input.text || !session || session.revision !== hostState.expectedSessionRevision || session.status !== 'completed' || !session.steps.length || session.steps.some(step => step.status !== 'completed' || !Object.hasOwn(step, 'result')))) throw new Error('Please continue from the current verified request before planning another step.')
      if (continuation && (!options.verifyCompletedSession || !await options.verifyCompletedSession(context, session!))) throw new Error('Your saved information changed. Please read the current information again before continuing.')
      if (!continuation) await options.conversation.append(context.actorId, sessionId, { role: 'user', text: input.text })
      await options.authorizePlanning(context)
      if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
      const history = turns.filter((_turn, index) => index !== currentUserIndex).map(({ role, text }) => ({ role, text }))
      await assertCurrent()
      const reply = await options.planner({ localDate: context.localDate, ...(context.selectedLocalDate ? { selectedLocalDate: context.selectedLocalDate } : {}), channel: input.channel, text: input.text, actions: options.runtime.discover(context), session: options.runtime.plannerSnapshot(context, session), history, ...(hostState.recoveringPriorAction === true ? { recoveringPriorAction: true } : {}), ...(continuation ? { planningContinuation: true } : {}), ...(answeringQuestion ? { answeringQuestion: true } : {}) })
      await options.authorizePlanning(context)
      await assertCurrent()
      if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
      if (!reply || typeof reply !== 'object' || Array.isArray(reply)) throw new Error('The assistant did not return a supported control.')
      if ('done' in reply) {
        if (Object.keys(reply).length !== 1 || reply.done !== true) throw new Error('The assistant did not return a supported completion.')
        const current = await options.readSession(context.actorId, sessionId)
        if (!current || current.actorId !== context.actorId || current.id !== sessionId || current.status !== 'completed' || !current.steps.length || current.steps.some(step => step.status !== 'completed' || !Object.hasOwn(step, 'result')) || !options.verifyCompletedSession || !await options.verifyCompletedSession(context, current)) throw new Error('The requested result is not fully verified. Please read the current information or review the pending action.')
        await options.authorizePlanning(context)
        await assertCurrent()
        if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
        return { session: current, done: true as const }
      }
      if ('question' in reply) {
        if (Object.keys(reply).length !== 1 || typeof reply.question !== 'string' || !reply.question.trim() || reply.question.length > 2000) throw new Error('The assistant did not return a supported clarification.')
        const reviewed = session?.steps.find(step => !['completed', 'cancelled'].includes(step.status))
        const clarified = session && reviewed?.status === 'review' && reviewed.reviewId
          ? await options.runtime.suspendReview(context, sessionId, { reviewId: reviewed.reviewId, revision: session.revision }, reply.question, assertCurrent)
          : null
        await options.conversation.append(context.actorId, sessionId, { role: 'assistant', text: reply.question, questionRevision: clarified?.revision ?? session?.revision ?? 0 })
        await options.authorizePlanning(context)
        await assertCurrent()
        if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
        return { question: reply.question, ...(clarified ? { session: clarified } : {}) }
      }
      if (Object.keys(reply).length !== 1 || !('command' in reply)) throw new Error('The assistant did not return a supported action.')
      if (continuation && reply.command?.type !== 'plan') throw new Error('A planning continuation can only propose the next registered steps or return the verified result.')
      const current = await options.readSession(context.actorId, sessionId)
      if (current && (current.actorId !== context.actorId || current.id !== sessionId)) throw new Error('Please use your own assistant conversation.')
      await options.authorizeCommand(context, reply.command, input, current)
      await assertCurrent()
      if (context.signal?.aborted) throw new Error('This assistant turn stopped.')
      const result = await options.runtime.handle(context, sessionId, reply.command)
      await options.conversation.append(context.actorId, sessionId, { role: 'assistant', text: result.status === 'completed' ? 'The registered plan returned verified completed results.' : 'The plan is awaiting its next explicit review, details, or verified result.' })
      return { session: result, userTurnIndex: continuation ? currentUserIndex : turns.length }
      }
      return options.runTurnExclusive ? options.runTurnExclusive(context.actorId, sessionId, executeTurn) : executeTurn()
    },
    /** Same callback target for typed/realtime structured tool arguments. The
     * host supplies authenticated context and session ID, never the model. */
    async dispatch(context: AssistantContext, sessionId: string, command: AssistantCommand, evidence: AssistantDecisionEvidence, hostState: { expectedReviewFence?: AssistantReviewFence } = {}) {
      const execute = async (assertCurrent: () => Promise<void> = async () => {}) => {
      const current = await options.readSession(context.actorId, sessionId)
      if (current && (current.actorId !== context.actorId || current.id !== sessionId)) throw new Error('Please use your own assistant conversation.')
      await options.authorizeCommand(context, command, evidence, current)
      await assertCurrent()
      if (hostState.expectedReviewFence !== undefined) {
        const fence = hostState.expectedReviewFence
        const latest = await options.readSession(context.actorId, sessionId)
        const pending = latest?.steps.find(step => !['completed', 'cancelled'].includes(step.status))
        if (!Number.isSafeInteger(fence.revision) || fence.revision < 0 || typeof fence.stepId !== 'string' || !fence.stepId || typeof fence.reviewId !== 'string' || !fence.reviewId || !latest || latest.actorId !== context.actorId || latest.id !== sessionId || latest.status !== 'active' || latest.revision !== fence.revision || pending?.id !== fence.stepId || pending.status !== 'review' || pending.reviewId !== fence.reviewId) throw new Error('That review changed. Please check the current review before replying again.')
        await assertCurrent()
      }
      return options.runtime.handle(context, sessionId, command)
      }
      return options.runTurnExclusive ? options.runTurnExclusive(context.actorId, sessionId, execute) : execute()
    },
  })
}

/** JSON tool definitions derive from the one registry. Provider adapters may
 * format this contract for their supported tool schema; they cannot add URLs,
 * owners, fields, or operations. Each action remains strictly validated again
 * at execution. Missing fields use the runtime's continuing clarification. */
export function assistantActionTools(runtime: Runtime, context: AssistantContext) {
  const jsonSchema = (field: AssistantField): Record<string, AssistantValue> => {
    if (field.type === 'object') return { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(field.properties).map(([key, value]) => [key, jsonSchema(value)])), required: [...field.required] }
    if (field.type === 'array') return { type: 'array', minItems: field.minItems, maxItems: field.maxItems, items: jsonSchema(field.items) }
    if (field.type === 'number') return { type: field.integer ? 'integer' : 'number', minimum: field.minimum, maximum: field.maximum }
    if (field.type === 'boolean') return { type: 'boolean' }
    return { type: 'string', minLength: field.minLength ?? 1, maxLength: field.maxLength, ...(field.enum ? { enum: [...field.enum] } : {}), ...(field.format ? { format: field.format } : {}) }
  }
  return runtime.discover(context).map(action => ({ name: action.id, description: action.description, inputSchema: jsonSchema(action.input) }))
}
