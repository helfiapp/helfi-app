import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { AssistantContext, AssistantOperation, validateAssistantValue } from './native-assistant-registry'
import { AssistantCommand } from './native-assistant-runtime'
import { AssistantPlanner } from './native-assistant-tool-bridge'
import { createPrismaAssistantSessionStore } from './native-assistant-session-store'
import { createNativeAssistantHost, nativeAssistantReadable } from './native-assistant-host'
import { createNativeAssistantCatalog } from './native-assistant-catalog'
import { createNativeAssistantCoreActions } from './native-assistant-core-actions'
import { createNativeAssistantNormalActions } from './native-assistant-normal-actions'
import { createCurrentStateNormalServices, createNativeAssistantCurrentStateOperation } from './native-assistant-current-state'
import { createNativeAssistantRecordReadNormalServices, createNativeAssistantRecordReadOperations, RECORD_READ_IDS } from './native-assistant-record-reads'
import { createAssistantClinicalOperations } from './native-assistant-clinical-actions'
import { createNativeAssistantFoodReadService } from './native-assistant-food-reads'
import { normalizeVoiceTimeZone } from './native-voice-time'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from './native-voice-review-token'
import { createNativeAssistantFoodOperations } from './native-assistant-food-actions'
import { createNativeAssistantFoodNormalServices } from './native-assistant-food-normal-services'

async function authenticatedActor(request: NextRequest) {
  const session = await getServerSession(authOptions), native = await getUserIdFromNativeAuth(request), web = session?.user?.id
  if (session?.user?.email && !web || web && native && web !== native) return null
  return web || native || null
}
function ownedRequest(original: NextRequest) {
  const headers = new Headers(original.headers)
  headers.set('x-helfi-assistant-read-only', '1'); headers.delete('x-vercel-ip-country'); headers.delete('cf-ipcountry')
  return new NextRequest(original.url, { headers, signal: original.signal })
}
async function journalCall(original: NextRequest, method: 'GET' | 'POST', values: any, actionId?: string) {
  const headers = new Headers(original.headers); headers.delete('content-length'); headers.delete('host'); headers.set('cache-control', 'no-store')
  const url = new URL('/api/health-journal', original.url)
  if (method === 'GET') { url.searchParams.set('date', values.localDate); url.searchParams.set('voiceReadOnly', '1') }
  else headers.set('content-type', 'application/json')
  const normal = await import('@/app/api/health-journal/route')
  const response = await normal[method](new NextRequest(url, { method, headers, signal: original.signal, ...(method === 'POST' ? { body: JSON.stringify({ ...values, clientActionId: actionId }) } : {}) }))
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.error || method === 'GET' && data.readOnly !== true) throw new Error('The normal Health Journal could not verify this request.')
  return data
}

export function createNativeAssistantApp(request: NextRequest, timeZone: string, planner?: AssistantPlanner) {
  const normalRequest = ownedRequest(request)
  const authenticate = async () => authenticatedActor(normalRequest)
  const normal = createNativeAssistantNormalActions({ request: normalRequest, authenticate, trustedTimeZone: () => timeZone, db: prisma })
  const core = createNativeAssistantCoreActions(normal.dependencies).map((operation): AssistantOperation => {
    if (operation.kind !== 'write') return operation
    return { ...operation, recover: async (context, actionId, prepared) => {
      const data = prepared.data as any, family = data.family || 'creation'
      if (data.actorId !== context.actorId) throw new Error('Please use the same account for this saved action.')
      const result = await normal.recover(context, family, data.normal, actionId)
      if (!result) return null
      if (family === 'creation') return { ...result, actionId, actorId: context.actorId, saved: true, verified: true, status: 'completed' }
      const verified = family === 'records' ? result.id === data.normal.id && result.kind === data.normal.entity && result.operation === data.normal.operation : result.saved === true && ['saved', 'already_set'].includes(result.status)
      return { action: operation.id, actionId, actorId: context.actorId, status: verified ? 'completed' : 'uncertain', saved: verified, verified, normal: result }
    } }
  })
  const currentDay = createNativeAssistantCurrentStateOperation(createCurrentStateNormalServices(normalRequest, { trustedTimeZone: async () => timeZone }))
  const reads = createNativeAssistantRecordReadOperations(createNativeAssistantRecordReadNormalServices(normalRequest, { readOnlyOperations: RECORD_READ_IDS, moodJournalCreate: true }))
  const clinical = createAssistantClinicalOperations({ requestForContext: () => normalRequest, trustedTimeZone: () => timeZone })
  const food = createNativeAssistantFoodOperations(createNativeAssistantFoodNormalServices({ request: normalRequest, authenticate,
    readDayContext: (context, localDate) => currentDay.read!(context, { localDate }),
  }))
  const registry = createNativeAssistantCatalog({ authenticatedActor: authenticate,
    foodRead: createNativeAssistantFoodReadService({ request: normalRequest, authenticate, trustedTimeZone: () => timeZone }),
    healthJournal: { actionIdsSupported: true, create: (_context, values, actionId) => journalCall(normalRequest, 'POST', values, actionId), read: (_context, values) => journalCall(normalRequest, 'GET', values) },
  }, [...core, currentDay, ...reads, ...clinical, ...food])
  const host = createNativeAssistantHost({ registry, persistence: createPrismaAssistantSessionStore(prisma), authenticate,
    planner: planner ? async turn => {
      try { return await planner(turn) }
      catch (error: any) {
        // Provider diagnostics may contain private request/account details.
        // Only these existing public wallet messages cross this boundary.
        const publicMessages = new Set(['Insufficient credits', 'Talk to Helfi needs an active subscription or purchased credits.', 'AI service not configured'])
        throw new Error(publicMessages.has(error?.message) ? error.message : 'The assistant could not understand this request. Please try again.')
      }
    } : (async () => { throw new Error('Please use the normal Helfi assistant to understand a new request.') }),
    plannerKind: 'provider', spendingAllowed: Boolean(planner), actionSpendingAllowed: false, maxPlannerPasses: 6,
  })
  return { host, registry }
}

function draftForView(actorId: string, localDate: string, timeZone: string, sessionId: string, result: Awaited<ReturnType<ReturnType<typeof createNativeAssistantApp>['host']['run']>>) {
  const view = result.session || null, review = view?.steps.find(step => step.status === 'review')?.review
  const summary = nativeAssistantReadable(view, result.question)
  const draft: any = { action: 'assistant_plan', transcript: '', localDate, timeZone, summary, confirmationMessage: summary,
    canConfirm: Boolean(review), autoSave: false, assistantPlan: { sessionId, revision: view?.revision ?? 0, ...(review ? { reviewId: review.id } : {}) },
    reviewIssuedAt: Date.now(),
  }
  draft.reviewToken = signNativeVoiceDraft(actorId, draft)
  return { success: true, draft, assistant: view, chargedCredits: 0, audio: null, voiceReply: false }
}

/** Restore only an already-owned, exact version after a lost action reply.
 * This path never plans, prepares, confirms or repeats an app command. */
export async function readNativeAssistantSnapshot(request: NextRequest) {
  try {
    const actorId = await authenticatedActor(request)
    if (!actorId) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    const params = new URL(request.url).searchParams
    const names = ['sessionId', 'localDate', 'timeZone', 'revision']
    if ([...params.keys()].some(key => !names.includes(key)) || names.some(key => params.getAll(key).length !== 1)) throw new Error('Please use the current assistant result.')
    const sessionId = params.get('sessionId') || '', localDate = params.get('localDate') || '', timeZone = normalizeVoiceTimeZone(params.get('timeZone'))
    const revisionText = params.get('revision') || ''
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !/^[1-9]\d{0,12}$/.test(revisionText) || !timeZone) throw new Error('Please use the current assistant result.')
    validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, localDate)
    const context: AssistantContext = { actorId, localDate, capabilities: (request.headers.get('x-helfi-voice-capabilities') || '').split(',').map(item => item.trim()), signal: request.signal }
    const { host } = createNativeAssistantApp(request, timeZone)
    const view = await host.snapshot(context, sessionId)
    if (!view || view.actorId !== actorId || view.revision !== Number(revisionText) || request.signal.aborted) return NextResponse.json({ error: 'The assistant result has changed. Please check its normal screen.' }, { status: 409 })
    return NextResponse.json(draftForView(actorId, localDate, timeZone, sessionId, { session: view }), { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'The existing assistant result could not be read. Please check its normal screen.' }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }
}

/** No client can request a provider, select an account or skip a review.
 * The existing voice route alone supplies its normal billed planner. */
export async function handleNativeAssistantRequest(request: NextRequest, planner?: AssistantPlanner, policy: { decision?: 'confirm' | 'decline'; safetyMessage?: string } = {}) {
  try {
    const actorId = await authenticatedActor(request)
    if (!actorId) return NextResponse.json({ error: 'Please sign in to the same Helfi account.' }, { status: 401 })
    const body = await request.json().catch(() => null)
    const allowed = ['sessionId', 'localDate', 'selectedLocalDate', 'timeZone', 'text', 'channel', 'command', 'controlId', 'aiConsentGranted']
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || !/^[A-Za-z0-9_-]{1,120}$/.test(body.sessionId)) throw new Error('Please use the active assistant conversation.')
    validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, body.localDate)
    if (body.selectedLocalDate !== undefined) validateAssistantValue({ type: 'string', maxLength: 10, format: 'date' }, body.selectedLocalDate)
    const timeZone = normalizeVoiceTimeZone(body.timeZone)
    if (!timeZone) throw new Error('Please use a valid device time zone.')
    if (!['typed', 'realtime'].includes(body.channel) || typeof body.text !== 'string' || body.text.length > 20000 || !body.command && body.aiConsentGranted !== true) throw new Error('Please give the request in the active Helfi conversation.')
    const context: AssistantContext = { actorId, localDate: body.localDate, ...(body.selectedLocalDate !== undefined ? { selectedLocalDate: body.selectedLocalDate } : {}), capabilities: (request.headers.get('x-helfi-voice-capabilities') || '').split(',').map(item => item.trim()), signal: request.signal }
    const { host } = createNativeAssistantApp(request, timeZone, planner)
    let expectedQuestionRevision: number | undefined
    // This policy comes only from the normal server's existing safety matcher;
    // it is never accepted as a client field or model-selected command.
    if (policy.safetyMessage !== undefined) {
      if (typeof policy.safetyMessage !== 'string' || !policy.safetyMessage.trim() || policy.safetyMessage.length > 2000) throw new Error('The existing support response could not be verified.')
      const current = await host.snapshot(context, body.sessionId)
      const result = current ? await host.run(context, body.sessionId, { channel: body.channel, text: '', command: { type: 'stop' }, controlId: 'stop' }) : {}
      return NextResponse.json(draftForView(actorId, body.localDate, timeZone, body.sessionId, { ...result, question: policy.safetyMessage }))
    }
    if (!body.command && policy.decision) {
      const current = await host.snapshot(context, body.sessionId), review = current?.steps.find(step => step.status === 'review')?.review
      if (review) {
        const type = policy.decision
        const result = await host.run(context, body.sessionId, { channel: body.channel, text: '', command: { type, reviewId: review.id }, controlId: `${type}:${review.id}` })
        return NextResponse.json(draftForView(actorId, body.localDate, timeZone, body.sessionId, result))
      }
      const questionRevision = planner ? await host.pendingQuestionRevision(context, body.sessionId) : null
      if (planner && questionRevision !== null) {
        expectedQuestionRevision = questionRevision
      } else if (policy.decision === 'decline' && current?.status === 'active') {
        const result = await host.run(context, body.sessionId, { channel: body.channel, text: '', command: { type: 'stop' }, controlId: 'stop' })
        return NextResponse.json(draftForView(actorId, body.localDate, timeZone, body.sessionId, result))
      } else if (planner && policy.decision === 'confirm' && current?.status === 'active' && current.steps.find(step => !['completed', 'cancelled'].includes(step.status))?.status === 'needs_details') {
        expectedQuestionRevision = current.revision
      } else {
        return NextResponse.json(draftForView(actorId, body.localDate, timeZone, body.sessionId, { question: policy.decision === 'confirm' ? 'There is no current reviewed change to save. Please give the change you want to make.' : 'There is no pending reviewed change to discard. Earlier saved records remain as they are.' }))
      }
    }
    // Only a matching pending job in this account's active server-owned voice
    // runtime may supply semantic authorization or a fallback review fence.
    // Neither value is accepted from the public request body.
    const voiceEvidence = body.channel === 'realtime' && body.command && !body.controlId
      ? await resolvePendingVoiceDecisionEvidence(actorId, body.sessionId, body.text, body.command)
      : undefined
    if (body.channel === 'realtime' && ['confirm', 'decline'].includes(body.command?.type) && !body.controlId && !voiceEvidence?.decisionReceipt) throw new Error('Please give a fresh direct decision about the current voice review.')
    const result = await host.run(context, body.sessionId, { text: body.text, channel: body.channel, ...(body.command ? { command: body.command as AssistantCommand } : {}), ...(body.controlId ? { controlId: body.controlId } : {}), ...(voiceEvidence?.decisionReceipt ? { decisionReceipt: voiceEvidence.decisionReceipt } : {}) }, { ...(expectedQuestionRevision !== undefined ? { expectedQuestionRevision } : {}), ...(voiceEvidence?.reviewFence ? { expectedReviewFence: voiceEvidence.reviewFence } : {}) })
    return NextResponse.json(draftForView(actorId, body.localDate, timeZone, body.sessionId, result))
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'The assistant could not verify this request.', code: typeof error?.code === 'string' ? error.code : 'assistant_request_failed' }, { status: 400 })
  }
}

/** Metadata stays inside the real server. The phone cannot mint, submit or
 * select a decision receipt. Its ordinary action request must match one exact
 * pending job, literal human turn and structured command. */
export async function resolvePendingVoiceDecisionEvidence(actorId: string, sessionId: string, text: string, command: AssistantCommand, options: { nowMs?: number; database?: any } = {}) {
  const at = options.nowMs ?? Date.now(), database = options.database ?? prisma
  const rows = await database.voiceSessionRuntime.findMany({ where: { userId: actorId, state: 'ready', expiresAt: { gt: new Date(at) }, configuration: { path: ['assistantSessionId'], equals: sessionId } }, select: { userId: true, state: true, expiresAt: true, configuration: true, toolJobs: true }, take: 21 })
  if (!Array.isArray(rows) || rows.length > 20) throw new Error('Please check the current voice review again.')
  const matches: any[] = []
  for (const row of rows) {
    if (row.userId !== actorId || row.state !== 'ready' || new Date(row.expiresAt).getTime() <= at || row.configuration?.assistantSessionId !== sessionId || !Number.isSafeInteger(row.configuration?.deadlineMs) || row.configuration.deadlineMs <= at) continue
    const jobs = row.toolJobs?.jobs
    if (!Array.isArray(jobs) || jobs.length > 20) throw new Error('Please check the current voice review again.')
    for (const job of jobs) {
      if (job.status !== 'pending' || job.actualHumanText !== text || digestVoiceCommand(job.args?.assistantCommand) !== digestVoiceCommand(command) || typeof job.decisionReceipt !== 'string' && job.reviewFence === undefined) continue
      matches.push({ ...(typeof job.decisionReceipt === 'string' ? { decisionReceipt: job.decisionReceipt } : {}), ...(job.reviewFence !== undefined ? { reviewFence: job.reviewFence } : {}) })
    }
  }
  if (matches.length > 1) throw new Error('Please check the current voice review again.')
  return matches[0]
}

function digestVoiceCommand(command: any): string | undefined {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return undefined
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
  return JSON.stringify(stable(command))
}

export async function handleNativeAssistantConfirmation(request: NextRequest, draft: any) {
  const actorId = await authenticatedActor(request)
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyNativeVoiceDraft(actorId, draft) || draft?.action !== 'assistant_plan' || draft.autoSave !== false || !draft.canConfirm || !draft.assistantPlan?.reviewId) return NextResponse.json({ error: 'Please review this exact assistant action again.' }, { status: 409 })
  const headers = new Headers(request.headers); headers.set('content-type', 'application/json')
  return handleNativeAssistantRequest(new NextRequest(request.url, { method: 'POST', headers, signal: request.signal,
    body: JSON.stringify({ sessionId: draft.assistantPlan.sessionId, localDate: draft.localDate, timeZone: draft.timeZone, text: '', channel: 'typed', command: { type: 'confirm', reviewId: draft.assistantPlan.reviewId }, controlId: `confirm:${draft.assistantPlan.reviewId}` }),
  }))
}
