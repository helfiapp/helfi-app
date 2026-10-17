import { AssistantContext, AssistantContractError, AssistantRegistry } from './native-assistant-registry'
import { formatNativeAssistantView } from './native-assistant-readable'
import { completionForStep } from './native-assistant-completions'
import { AssistantCommand, AssistantSession, createAssistantRuntime } from './native-assistant-runtime'
import { AssistantDecisionEvidence, AssistantPlanner, createAssistantToolBridge } from './native-assistant-tool-bridge'
import { createPrismaAssistantSessionStore } from './native-assistant-session-store'

export function authorizeAssistantDecision(command: AssistantCommand, evidence: AssistantDecisionEvidence, session: AssistantSession | null) {
  const currentReview = session?.steps.find(step => step.status === 'review')?.reviewId
  if (command.type === 'confirm' || command.type === 'decline') {
    const replay = command.type === 'confirm' && evidence.channel === 'control' && session?.steps.some(step => step.status === 'completed' && step.reviewId === command.reviewId)
    if (!replay && (!currentReview || command.reviewId !== currentReview)) throw new Error('Please review the current requested change again.')
    if (evidence.channel === 'control') {
      if (evidence.controlId !== `${command.type}:${command.reviewId}`) throw new Error('Please use the current review control.')
    } else {
      const answer = evidence.text.trim().toLowerCase().replace(/[.!]+$/g, '')
      const allowed = command.type === 'confirm' ? /^(?:yes|yes please|yes,? save (?:it|that)|confirm|save (?:it|that)|go ahead)$/ : /^(?:no|no thanks|cancel|discard|don't save|do not save)$/
      if (!allowed.test(answer)) throw new Error('Please confirm or decline this exact review directly.')
    }
    return
  }
  if (evidence.channel === 'control') {
    const expected = command.type === 'recover' ? `recover:${command.actionId}` : command.type
    if (evidence.controlId !== expected || !['advance', 'recover', 'stop'].includes(command.type)) throw new Error('This control does not authorize a new action.')
  } else if (!evidence.text.trim()) throw new Error('Please give the request directly in this conversation.')
}

/** The app and tests use the same host. A supplied planner is the only possible
 * AI boundary; controls and persisted recovery never call that planner. */
export function createNativeAssistantHost(options: {
  registry: AssistantRegistry
  persistence: ReturnType<typeof createPrismaAssistantSessionStore>
  authenticate: (context: AssistantContext) => Promise<string | null>
  planner: AssistantPlanner
  plannerKind: 'synthetic' | 'provider'
  spendingAllowed?: boolean
  actionSpendingAllowed?: boolean
  authorizePlanning?: (context: AssistantContext) => Promise<void>
  /** One preserves existing hosts; the normal app explicitly enables up to six
   * bounded planner passes after free read-only progress. */
  maxPlannerPasses?: number
}) {
  const maxPlannerPasses = options.maxPlannerPasses ?? 1
  if (!Number.isInteger(maxPlannerPasses) || maxPlannerPasses < 1 || maxPlannerPasses > 6) throw new Error('Assistant planning must use between one and six bounded passes.')
  const authenticate = async (context: AssistantContext) => {
    if (!context.actorId || context.signal?.aborted || await options.authenticate(context) !== context.actorId || context.signal?.aborted) throw new Error('Please continue in the same signed-in account.')
  }
  const runtime = createAssistantRuntime({ registry: options.registry, store: options.persistence.store, spendingAllowed: options.actionSpendingAllowed === true,
    authorize: async (context) => { await authenticate(context) },
  })
  const bridge = createAssistantToolBridge({ runtime, planner: options.planner, plannerKind: options.plannerKind, spendingAllowed: options.spendingAllowed === true,
    readSession: options.persistence.readSession, conversation: options.persistence.conversation, runTurnExclusive: options.persistence.runTurnExclusive,
    authorizePlanning: async context => { await authenticate(context); await options.authorizePlanning?.(context) },
    verifyCompletedSession: async (context, session) => {
      await authenticate(context)
      if (session.actorId !== context.actorId || session.status !== 'completed' || !session.steps.length || session.steps.some(step => step.status !== 'completed' || !Object.hasOwn(step, 'result'))) return false
      for (const step of session.steps) {
        const operation = options.registry.get(step.operation)
        // A stored completed write already passed normal receipt verification.
        // Its preparation may have been compacted; never repeat it here.
        if (operation.kind === 'read') {
          try { if (!await operation.verify(context, step.result)) return false } catch { return false }
          await authenticate(context)
        }
      }
      return true
    },
    authorizeCommand: async (context, command, evidence, session) => { await authenticate(context); authorizeAssistantDecision(command, evidence, session) },
  })
  const project = (context: AssistantContext, session: AssistantSession | null, recoveredThisTurn: ReadonlyMap<string,{actionId:string;completion:ReturnType<typeof completionForStep>}> = new Map()) => {
    const snapshot = runtime.plannerSnapshot(context, session)
    if (!session || !snapshot) return null
    const completionStepIds = [...new Set([...snapshot.currentStepIds,...[...recoveredThisTurn].filter(([id,recovered])=>session.steps.some(step=>step.id===id&&step.status==='completed'&&step.actionId===recovered.actionId&&options.registry.get(step.operation).kind==='write')).map(([id])=>id)])]
    return { id: session.id, actorId: context.actorId, revision: session.revision, ...snapshot,completionStepIds,
      steps: snapshot.steps.map(step => {
        const state = session.steps.find(item => item.id === step.id)!
        const op = options.registry.get(state.operation)
        const recovered = recoveredThisTurn.get(state.id)
        return { ...step, kind: op.kind, ...(state.status === 'completed' && state.reviewId ? { confirmedReviewId: state.reviewId } : {}), ...(state.actionId && ['uncertain', 'executing', 'awaiting_person'].includes(state.status) ? { recoveryActionId: state.actionId } : {}),
          ...(op.kind === 'write' && state.status === 'completed' && state.actionId ? { completionId: state.actionId, completion: recovered?.actionId === state.actionId ? recovered.completion : completionForStep(context, state) } : {}),
          ...(state.status === 'uncertain' && state.result && op.plannerResult ? { unverifiedResult: op.plannerResult(state.result) } : {}),
        }
      }),
    }
  }
  const pendingQuestionRevision = async (context: AssistantContext, sessionId: string): Promise<number | null> => {
      await authenticate(context)
      return options.persistence.runTurnExclusive(context.actorId, sessionId, async assertCurrent => {
        const session = await options.persistence.readSession(context.actorId, sessionId)
        if (session && (session.actorId !== context.actorId || session.id !== sessionId)) throw new Error('Please use your own assistant conversation.')
        const turns = await options.persistence.conversation.read(context.actorId, sessionId)
        if (!Array.isArray(turns) || turns.some(turn => turn.actorId !== context.actorId || turn.sessionId !== sessionId || Object.hasOwn(turn,'questionRevision') && (turn.role !== 'assistant' || !Number.isSafeInteger(turn.questionRevision) || turn.questionRevision! < 0))) throw new Error('Please use your own verified assistant conversation.')
        await authenticate(context); await assertCurrent()
        const latest = turns.at(-1)
        return latest?.role === 'assistant' && latest.questionRevision !== undefined && latest.questionRevision === (session?.revision ?? 0) ? latest.questionRevision : null
      })
  }
  return Object.freeze({ runtime, bridge, project,
    discover(context: AssistantContext) { return runtime.discover(context) },
    async snapshot(context: AssistantContext, sessionId: string) { await authenticate(context); return project(context, await options.persistence.readSession(context.actorId, sessionId)) },
    pendingQuestionRevision,
    async hasPendingQuestion(context: AssistantContext, sessionId: string) { return await pendingQuestionRevision(context, sessionId) !== null },
    async run(context: AssistantContext, sessionId: string, input: { channel: 'typed' | 'realtime'; text: string; command?: AssistantCommand; controlId?: string }, hostState: { expectedQuestionRevision?: number } = {}) {
      await authenticate(context)
      let recoveringPriorAction = false
      const recoveredThisTurn = new Map<string,{actionId:string;completion:ReturnType<typeof completionForStep>}>()
      const turnStepIds = new Set<string>()
      const projectRun = (session: AssistantSession | null) => {
        const visible=project(context,session,recoveredThisTurn)
        if(!visible)return null
        const retained=new Set(visible.steps.map(step=>step.id)),added=[...turnStepIds].filter(id=>retained.has(id))
        if(!added.length)return visible
        return{...visible,currentStepIds:added,completionStepIds:[...new Set([...added,...visible.completionStepIds])]}
      }
      if (input.command) {
        if (hostState.expectedQuestionRevision !== undefined) throw new Error('A clarification answer must continue through its current question.')
        const before = await options.persistence.readSession(context.actorId, sessionId)
        const replay = before?.steps.some(step => step.status === 'completed' && (input.command!.type === 'confirm' && step.reviewId === input.command!.reviewId || input.command!.type === 'recover' && step.actionId === input.command!.actionId))
        const evidence: AssistantDecisionEvidence = input.controlId ? { channel: 'control', controlId: input.controlId } : { channel: input.channel, text: input.text }
        let session = await bridge.dispatch(context, sessionId, input.command, evidence)
        if (['confirm', 'recover'].includes(input.command.type) && session.status === 'active' && session.steps.find(step => !['completed', 'cancelled'].includes(step.status))?.status === 'pending') {
          if (replay) return { session: projectRun(session), question: 'The earlier change is confirmed. The next action still needs its details checked. Please correct it or continue from the current pending step.' }
          try {
            session = await bridge.dispatch(context, sessionId, { type: 'advance' }, { channel: 'control', controlId: 'advance' })
          } catch (error: any) {
            // A failure preparing a later action cannot erase an already
            // verified save. Recheck ownership and exact durable receipt;
            // revoked access/cancellation must still leave this response path.
            await authenticate(context)
            if (error?.name === 'AbortError' || [401,403].includes(error?.status) || /(?:unauthoriz|forbidden|consent|cancel|stopped)/i.test(String(error?.code || ''))) throw error
            const current = await options.persistence.readSession(context.actorId, sessionId)
            await authenticate(context)
            const completed = session.steps.find(step => step.status === 'completed' && (input.command!.type === 'confirm' && step.reviewId === input.command!.reviewId || input.command!.type === 'recover' && step.actionId === input.command!.actionId))
            if (!current || current.actorId !== context.actorId || current.id !== sessionId || !completed?.actionId || !current.steps.some(step => step.id === completed.id && step.status === 'completed' && step.actionId === completed.actionId)) throw error
            const detail = error instanceof AssistantContractError ? ` ${error.message.slice(0,500)}` : ' Please check its details or try continuing from the current pending step.'
            return { session: projectRun(current), question: `The earlier change is confirmed. I could not prepare the next action.${detail}` }
          }
        }
        return { session: projectRun(session) }
      }
      if (input.controlId) throw new Error('That control needs its exact reviewed command.')
      const pending = await options.persistence.readSession(context.actorId, sessionId)
      const submitted = pending?.steps.find(step => !['completed', 'cancelled'].includes(step.status))
      if (hostState.expectedQuestionRevision === undefined && submitted?.actionId && ['uncertain', 'executing'].includes(submitted.status)) {
        const recovered = await bridge.dispatch(context, sessionId, { type: 'recover', actionId: submitted.actionId }, { channel: 'control', controlId: `recover:${submitted.actionId}` })
        const completed = recovered.steps.find(step=>step.id===submitted.id&&step.actionId===submitted.actionId&&step.status==='completed'&&options.registry.get(step.operation).kind==='write')
        if(completed)recoveredThisTurn.set(completed.id,{actionId:submitted.actionId,completion:completionForStep(context,completed)})
        if (recovered.steps.some(step => ['uncertain', 'executing'].includes(step.status)) || options.plannerKind === 'provider' && !options.spendingAllowed) {
          await options.persistence.conversation.append(context.actorId, sessionId, { role: 'user', text: input.text })
          const question = recovered.status === 'completed' ? 'The earlier save is verified. Your latest message is retained in this conversation; use Helfi’s normal assistant to continue with it.' : 'The earlier save is still unverified. Your latest request is retained here while that result is checked.'
          await options.persistence.conversation.append(context.actorId, sessionId, { role: 'assistant', text: question })
          return { session: projectRun(recovered), question }
        }
        recoveringPriorAction = true
      }
      let prior = await options.persistence.readSession(context.actorId, sessionId)
      let userTurnIndex: number | undefined
      for (let pass = 0; pass < maxPlannerPasses; pass++) {
        let result: Awaited<ReturnType<typeof bridge.turn>>
        try { result = await bridge.turn(context, sessionId, { channel: input.channel, text: input.text }, { recoveringPriorAction, ...(pass ? { planningContinuation: true, expectedUserTurnIndex: userTurnIndex, expectedSessionRevision: prior?.revision } : hostState.expectedQuestionRevision !== undefined ? { expectedQuestionRevision: hostState.expectedQuestionRevision } : {}) }) }
        catch(error){
          if(!recoveredThisTurn.size)throw error
          const denied=error as {name?:string;code?:string;status?:number}
          if(denied?.name==='AbortError'||denied?.status===401||denied?.status===403||/unauthor|forbidden|consent|stopped|cancelled/i.test(String(denied?.code||'')))throw error
          await authenticate(context)
          const current=await options.persistence.readSession(context.actorId,sessionId)
          if(!current||current.actorId!==context.actorId)throw error
          const previousIds=new Set(prior?.steps.map(step=>step.id)??[])
          for(const step of current.steps)if(!previousIds.has(step.id))turnStepIds.add(step.id)
          const question='The earlier save is verified. I could not complete the next request; please review the saved result and clarify the next step.'
          await options.persistence.conversation.append(context.actorId,sessionId,{role:'assistant',text:question})
          await authenticate(context)
          return{session:projectRun(current),question}
        }
        const previousIds = new Set(prior?.steps.map(step => step.id) ?? [])
        const added = result.session?.steps.filter(step => !previousIds.has(step.id))??[]
        for(const step of added)turnStepIds.add(step.id)
        if (result.question || result.done || !result.session || result.session.status !== 'completed') {
          const visible = result.session ?? (recoveredThisTurn.size ? await options.persistence.readSession(context.actorId,sessionId) : null)
          return { ...(result.question ? { question: result.question } : {}), ...(visible ? { session: projectRun(visible) } : {}) }
        }
        if (!added.length || added.some(step => step.status !== 'completed' || options.registry.get(step.operation).kind !== 'read' || !Object.hasOwn(step, 'result'))) {
          if (pass) {
            const question = 'The saved results are available, but the next planning step made no verified read-only progress. Please clarify what you want to do next.'
            await options.persistence.conversation.append(context.actorId, sessionId, { role: 'assistant', text: question })
            return { session: projectRun(result.session), question }
          }
          return { session: projectRun(result.session) }
        }
        prior = result.session
        userTurnIndex = result.userTurnIndex
        if (pass + 1 === maxPlannerPasses) {
          if (maxPlannerPasses === 1) return { session: projectRun(result.session) }
          const question = 'I read the saved information, but need more context to finish this request. Please tell me which result or next step you want.'
          await options.persistence.conversation.append(context.actorId, sessionId, { role: 'assistant', text: question })
          return { session: projectRun(result.session), question }
        }
      }
      throw new Error('The assistant reached its bounded planning limit.')
    },
  })
}

export type NativeAssistantView = NonNullable<ReturnType<ReturnType<typeof createNativeAssistantHost>['project']>>
export function nativeAssistantReadable(view: NativeAssistantView | null, question?: string): string {
  return formatNativeAssistantView(view, question)
}
