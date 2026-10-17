import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CREDIT_COSTS } from '@/lib/credit-system'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export const VOICE_SYMPTOM_ACTION_SCHEMAS = {
  'symptoms.analyze': { symptoms: 'explicit symptom text list', duration: 'optional literal duration', notes: 'optional literal notes; normal action generates general information and saves history' },
  'symptoms.follow_up': { analysisId: 'exact existing owned analysis ID OR query/latest', query: 'exact saved symptom list or summary', localDate: 'optional YYYY-MM-DD selector', latest: 'true only when explicitly requested', threadId: 'optional exact owned symptom conversation', question: 'exact follow-up question' },
} as const
type Action = keyof typeof VOICE_SYMPTOM_ACTION_SCHEMAS
type Call = { operation: 'history' | 'analyze' | 'thread' | 'follow_up'; body?: Record<string, any>; threadId?: string; messageIds?: string[] }
export type VoiceSymptomIo = { userId: (request: NextRequest) => Promise<string | null>; call: (request: NextRequest, call: Call) => Promise<any> }
export class VoiceSymptomActionError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'VoiceSymptomActionError' }
}
const fail = (message = 'The app could not verify this symptom-notes action. Please check Symptom Notes before trying again.'): never => { throw new VoiceSymptomActionError('symptom_action_unverified', message) }
const record = (value: any): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : fail()
function exactKeys(value: any, allowed: string[]) { if (Object.keys(record(value)).some(key => !allowed.includes(key))) fail('That field is not supported for symptom notes.') }
function text(value: any, max: number, empty = false): string { if (typeof value !== 'string' || value.length > max || value.includes('\0') || !empty && !value.trim()) fail('Please give the exact symptom text or question.'); return value.trim() }
const id = (value: any) => text(value, 200)
function date(value: any) { const day = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) fail('Please choose a valid saved-note date.'); return day }
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value ?? null
const version = (userId: string, value: any) => crypto.createHash('sha256').update(JSON.stringify(stable({ userId, value }))).digest('hex')
function stringList(value: any, max = 100, length = 5000) { if (!Array.isArray(value) || value.length > max) fail(); return value.map((item: any) => text(item, length)) }
function spokenResult(message: string, content: string | null) {
  // Speak only complete sentences from the verified normal result, never an
  // invented diagnosis or a silently cut sentence. The full result stays visible.
  const cleanContent = (content || '').trim()
  const sentences = cleanContent.match(/[^.!?]+[.!?]+(?:[”’"']|$)?/g) || []
  let excerpt = cleanContent.length <= 1200 ? cleanContent : ''
  if (!excerpt)
  for (const sentence of sentences) { const clean = sentence.trim(); if (excerpt.length + clean.length + 1 > 1200) break; excerpt += `${excerpt ? ' ' : ''}${clean}` }
  return `${message}${excerpt ? ` ${excerpt}` : ''} Please read the full result and its warnings. For medical concerns, speak with a qualified healthcare professional.`
}
function analysis(value: any) {
  const raw = record(value), nullableText = (value: any, max: number) => value == null ? null : text(value, max, true) || null, result = { summary: nullableText(raw.summary, 20000), analysisText: nullableText(raw.analysisText, 100000), possibleCauses: raw.possibleCauses ?? [], redFlags: stringList(raw.redFlags ?? []), nextSteps: stringList(raw.nextSteps ?? []), disclaimer: text(raw.disclaimer, 10000) }
  if (!Array.isArray(result.possibleCauses) || result.possibleCauses.length > 100 || result.possibleCauses.some((item: any) => !item || typeof item !== 'object' || typeof item.name !== 'string' || typeof item.whyLikely !== 'string') || JSON.stringify(result).length > 1_000_000) fail()
  return result
}
function source(row: any) {
  const value = record(row), symptoms = typeof value.symptoms === 'string' ? [text(value.symptoms, 5000)] : stringList(value.symptoms, 100)
  const data = record(value.analysisData)
  if (!Number.isFinite(Date.parse(value.createdAt))) fail()
  return { id: id(value.id), symptoms, duration: text(value.duration ?? '', 5000, true), notes: text(value.notes ?? '', 20000, true), createdAt: new Date(value.createdAt).toISOString(), analysis: analysis({ ...data, summary: value.summary ?? data.summary, analysisText: value.analysisText }) }
}
function sourceContext(row: ReturnType<typeof source>) { return { symptoms: row.symptoms, duration: row.duration, notes: row.notes, analysisResult: row.analysis } }
function comparableContext(value: any) {
  const raw = record(value)
  return { symptoms: stringList(raw.symptoms, 100), duration: text(raw.duration ?? '', 5000, true), notes: text(raw.notes ?? '', 20000, true), analysisResult: analysis(raw.analysisResult) }
}
const defaultIo: VoiceSymptomIo = {
  userId: async request => {
    const native = await getUserIdFromNativeAuth(request), session = await getServerSession(authOptions)
    if (native && session?.user?.id && native !== session.user.id) fail('Please use the same signed-in account for this action.')
    return native || session?.user?.id || null
  },
  call: async (original, call) => {
    const url = new URL(call.operation === 'history' ? '/api/symptoms/history' : call.operation === 'analyze' ? '/api/analyze-symptoms' : '/api/analyze-symptoms/chat', original.url), headers = new Headers(original.headers)
    headers.delete('host'); headers.delete('content-length'); headers.set('cache-control', 'no-store'); headers.set('accept', 'application/json')
    if (call.threadId) url.searchParams.set('threadId', call.threadId)
    for (const messageId of call.messageIds || []) url.searchParams.append('messageId', messageId)
    const method = call.body ? 'POST' : 'GET'
    if (call.body) headers.set('content-type', 'application/json')
    const request = new NextRequest(url, { method, headers, ...(call.body ? { body: JSON.stringify(call.body) } : {}) })
    const response = call.operation === 'history' ? await (await import('@/app/api/symptoms/history/route')).GET(request) : call.operation === 'analyze' ? await (await import('@/app/api/analyze-symptoms/route')).POST(request) : call.body ? await (await import('@/app/api/analyze-symptoms/chat/route')).POST(request) : await (await import('@/app/api/analyze-symptoms/chat/route')).GET(request)
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload || payload.error) throw new VoiceSymptomActionError(payload?.code === 'ai_consent_required' ? 'ai_consent_required' : 'normal_symptom_handler_failed', response.status === 402 ? 'The normal Symptom Notes tool needs available credits or an eligible free use. Nothing is being claimed as completed.' : payload?.code === 'ai_consent_required' ? 'Please allow AI help in Settings before creating symptom notes.' : 'The normal Symptom Notes tool could not confirm this request. Please check its history before trying again.')
    return payload
  },
}
async function authorize(request: NextRequest, userId: string, io: VoiceSymptomIo) {
  if (!request.headers.get('x-helfi-voice-capabilities')?.split(',').map(item => item.trim()).includes('symptom-analysis-v1')) fail('Please update the Helfi app before using the full Symptom Notes tool by voice.')
  if (!userId || await io.userId(request) !== userId) fail('Please sign in to the same account before opening symptom notes.')
  if (request.signal?.aborted) fail('This symptom-notes request was cancelled before execution.')
}
async function history(request: NextRequest, io: VoiceSymptomIo) {
  const result = await io.call(request, { operation: 'history' })
  if (result.success !== true || !Array.isArray(result.history) || result.history.some((row: any) => typeof row?.id !== 'string') || new Set(result.history.map((row: any) => row.id)).size !== result.history.length) fail()
  return result.history as any[]
}
async function ownedSource(request: NextRequest, analysisId: string, io: VoiceSymptomIo) {
  const found = (await history(request, io)).filter(row => row.id === analysisId)
  if (found.length !== 1) fail('Please choose an existing symptom note from this account. It may have changed or been deleted.')
  return source(found[0])
}
async function ownedThread(request: NextRequest, threadId: string, row: ReturnType<typeof source>, io: VoiceSymptomIo, conversationSnapshot = false) {
  const result = await io.call(request, { operation: 'thread', threadId })
  if (result.threadId !== threadId || !Array.isArray(result.messages) || version('', comparableContext(result.context)) !== version('', sourceContext(row))) fail('That conversation does not match the selected symptom notes. Please choose the exact conversation again.')
  if (!conversationSnapshot) return { threadId, context: result.context }
  // The normal GET returns at most 60 oldest messages. A full snapshot cannot
  // be claimed at that boundary, so structured actions fail closed there.
  if (result.messages.length >= 60 || new Set(result.messages.map((item: any) => item?.id)).size !== result.messages.length) fail('This conversation needs a complete verified snapshot before another assistant question can be sent.')
  const messages = result.messages.map((item: any) => {
    const value = record(item)
    if (!['user', 'assistant'].includes(value.role) || !Number.isFinite(Date.parse(value.createdAt))) fail('The saved conversation could not be verified.')
    return { id: id(value.id), role: value.role, content: text(value.content, 100000, true), createdAt: new Date(value.createdAt).toISOString() }
  })
  return { threadId, context: result.context, messages }
}
export type VoiceSymptomTrustedClock = { localDate: string; timeZone: string }
function trustedClock(clock: VoiceSymptomTrustedClock) {
  exactKeys(clock, ['localDate', 'timeZone']); date(clock.localDate)
  const timeZone = text(clock.timeZone, 100)
  try { new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()) } catch { fail('Please use the verified device time zone before preparing symptom notes.') }
  return { localDate: clock.localDate, timeZone }
}
function localDay(value: string | number, timeZone: string): string {
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime())) fail('The saved symptom date could not be verified.')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

async function readSymptomHistory(request: NextRequest, userId: string, values: { analysisId?: string; localDate?: string; limit?: number }, io: VoiceSymptomIo, clock?: VoiceSymptomTrustedClock) {
  await authorize(request, userId, io); exactKeys(values, ['analysisId', 'localDate', 'limit'])
  const targetId = values.analysisId === undefined ? null : id(values.analysisId), day = values.localDate === undefined ? null : date(values.localDate), limit = values.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('Please choose up to 50 saved symptom notes.')
  const rows = (await history(request, io)).filter(row => (!targetId || row.id === targetId) && (!day || (clock ? localDay(row.createdAt, clock.timeZone) : String(row.createdAt).slice(0, 10)) === day)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  if (targetId && rows.length !== 1) fail('The selected saved symptom note was not found in this account.')
  return { verified: true, safeToClaimSaved: false, analyses: rows.slice(0, limit).map(source), totalMatched: rows.length, complete: rows.length <= limit }
}
export async function readVoiceSymptomHistory(request: NextRequest, userId: string, values: { analysisId?: string; localDate?: string; limit?: number } = {}, io: VoiceSymptomIo = defaultIo) {
  return readSymptomHistory(request, userId, values, io)
}
/** Server-only structured access; the time zone comes from authenticated host
 * context, never a model argument or a client override of legacy speech rules. */
export async function readStructuredVoiceSymptomHistory(request: NextRequest, userId: string, values: { analysisId?: string; localDate?: string; limit?: number }, clock: VoiceSymptomTrustedClock, io: VoiceSymptomIo = defaultIo) {
  return readSymptomHistory(request, userId, values, io, trustedClock(clock))
}
async function prepareSymptomAction(request: NextRequest, userId: string, input: { action: Action; values: any }, transcript: string, localDate: string, io: VoiceSymptomIo, clock?: VoiceSymptomTrustedClock) {
  await authorize(request, userId, io); exactKeys(input, ['action', 'values'])
  if (!Object.hasOwn(VOICE_SYMPTOM_ACTION_SCHEMAS, input.action)) fail('Please choose a supported symptom-notes action.')
  const action = input.action, raw = record(input.values)
  exactKeys(raw, Object.keys(VOICE_SYMPTOM_ACTION_SCHEMAS[action]))
  if (!clock && /\b(?:do not|don't|don’t|never)\s+(?:analy[sz]e|create|generate|send|ask|save)\b/i.test(transcript)) fail('Please explicitly request the symptom-notes action before anything is generated or saved.')
  let values: Record<string, any>, sourceVersion: string | undefined, threadSourceVersion: string | undefined, summary: string
  if (action === 'symptoms.analyze') {
    if (!clock && (!/\b(?:analy[sz]e|create|generate|review)\b/i.test(transcript) || !/\bsymptoms?\b/i.test(transcript) || /\b(?:how do i|what happens if|should i|without saving|do not save|don't save|don’t save|never save)\b/i.test(transcript))) fail('The normal symptom tool creates general notes and saves them to history. Please confirm that action, or request a plain note instead.')
    if (clock && localDay(Date.now(), clock.timeZone) !== clock.localDate) fail('The normal symptom tool saves notes now. Please use the current local date; it cannot backdate an analysis.')
    const symptoms = stringList(raw.symptoms, 12, 80); if (!symptoms.length) fail('Please say which symptoms to include.')
    values = { symptoms, duration: text(raw.duration ?? '', 120, true), notes: text(raw.notes ?? '', 1200, true) }
    summary = `Create general symptom notes for ${symptoms.join(', ')}${values.duration ? `; duration: ${values.duration}` : ''}${values.notes ? `; notes: “${values.notes}”` : ''} and save them to Symptom Notes history. The normal cost is ${CREDIT_COSTS.SYMPTOM_ANALYSIS} credit${CREDIT_COSTS.SYMPTOM_ANALYSIS === 1 ? '' : 's'}, or an eligible free use. This provides doctor-discussion information, not a diagnosis`
  } else {
    const question = text(raw.question, 2000)
    if (!clock && !transcript.toLowerCase().includes(question.toLowerCase())) fail('Please dictate the exact follow-up question. It will not be rewritten.')
    const selectors = [raw.analysisId !== undefined, raw.query !== undefined, raw.latest !== undefined].filter(Boolean).length
    if (selectors > 1 || raw.latest !== undefined && raw.latest !== true || raw.latest && !clock && !/\b(?:latest|most recent|newest|last)\b/i.test(transcript)) fail('Please choose one exact symptom note for this question.')
    const rows = await history(request, io), query = raw.query === undefined ? null : text(raw.query, 300), day = raw.localDate === undefined ? null : date(raw.localDate)
    let candidates = rows.filter(row => (!raw.analysisId || row.id === id(raw.analysisId)) && (!query || [Array.isArray(row.symptoms) ? row.symptoms.join(', ') : row.symptoms, row.summary].some(label => typeof label === 'string' && label.toLowerCase() === query.toLowerCase())) && (!day || (clock ? localDay(row.createdAt, clock.timeZone) : String(row.createdAt).slice(0, 10)) === day))
    if (raw.analysisId !== undefined && candidates.length !== 1) fail('Please choose an existing symptom note from this account. It may have changed or been deleted.')
    if (raw.latest) candidates = candidates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 1)
    if ((!selectors && !day) || candidates.length !== 1) return { action: 'clinical_action', transcript, localDate, canConfirm: false, autoSave: false, summary: 'Choose saved symptom notes', confirmationMessage: 'Please choose the exact saved symptom notes for this question. Nothing has been sent.', choices: (candidates.length ? candidates : rows).slice(0, 50).map(row => ({ id: row.id, label: Array.isArray(row.symptoms) ? row.symptoms.join(', ') : row.symptoms, createdAt: row.createdAt })), clinicalAction: { action, userId, values: raw } }
    const selected = source(candidates[0]); sourceVersion = version(userId, selected)
    values = { analysisId: selected.id, question }
    if (raw.threadId !== undefined) { values.threadId = id(raw.threadId); threadSourceVersion = version(userId, await ownedThread(request, values.threadId, selected, io, Boolean(clock))) }
    summary = `Ask this exact follow-up about your saved ${selected.symptoms.join(', ')} notes from ${clock ? localDay(selected.createdAt, clock.timeZone) : selected.createdAt.slice(0, 10)}: “${question}”. ${values.threadId ? 'Use the selected existing conversation' : 'Start a new symptom conversation'}. The normal symptom-chat cost depends on the reply, or an eligible free use. The reply is general information, not a diagnosis`
  }
  const draft: any = { action: 'clinical_action', transcript, localDate, summary, confirmationMessage: `${summary}. Nothing has been generated or changed yet. Confirm this exact request?`, canConfirm: true, autoSave: false, reviewIssuedAt: Date.now(), reviewNonce: crypto.randomUUID(), clinicalAction: { action, userId, values, ...(clock ? { trustedClock: clock } : {}), ...(action === 'symptoms.follow_up' ? { threadMode: values.threadId ? 'existing' : 'new' } : {}), ...(sourceVersion ? { sourceVersion } : {}), ...(threadSourceVersion ? { threadSourceVersion } : {}), normalCreditCost: action === 'symptoms.analyze' ? CREDIT_COSTS.SYMPTOM_ANALYSIS : null, preparedAt: Date.now() } }
  draft.reviewToken = signNativeVoiceDraft(userId, draft); return draft
}
export async function prepareVoiceSymptomAction(request: NextRequest, userId: string, input: { action: Action; values: any }, transcript: string, localDate: string, io: VoiceSymptomIo = defaultIo) {
  return prepareSymptomAction(request, userId, input, transcript, localDate, io)
}
export async function prepareStructuredVoiceSymptomAction(request: NextRequest, userId: string, input: { action: Action; values: any }, clock: VoiceSymptomTrustedClock, io: VoiceSymptomIo = defaultIo) {
  const verifiedClock = trustedClock(clock)
  return prepareSymptomAction(request, userId, input, '', verifiedClock.localDate, io, verifiedClock)
}
/** The caller must claim its durable action receipt before calling the normal
 * paid handler. A lost result must remain pending, never automatically rerun. */
export async function executeVoiceSymptomAction(request: NextRequest, userId: string, draft: any, receipt: { receiptClaimed: true; actionId: string }, io: VoiceSymptomIo = defaultIo) {
  await authorize(request, userId, io)
  const prepared = draft?.clinicalAction
  if (!receipt?.receiptClaimed || typeof receipt.actionId !== 'string' || receipt.actionId !== crypto.createHash('sha256').update(String(draft?.reviewToken || '')).digest('base64url') || draft?.action !== 'clinical_action' || draft.canConfirm !== true || !verifyNativeVoiceDraft(userId, draft) || prepared?.userId !== userId || !Object.hasOwn(VOICE_SYMPTOM_ACTION_SCHEMAS, prepared.action)) fail('Please review this exact symptom-notes request again.')
  const action = prepared.action as Action, values = record(prepared.values)
  const clock = prepared.trustedClock === undefined ? undefined : trustedClock(prepared.trustedClock)
  if (clock && (draft.localDate !== clock.localDate || action === 'symptoms.analyze' && localDay(Date.now(), clock.timeZone) !== clock.localDate)) fail('The local date changed after review. Please review this symptom action again before anything is generated.')
  if (action === 'symptoms.analyze') {
    exactKeys(values, ['symptoms', 'duration', 'notes']); if (prepared.normalCreditCost !== CREDIT_COSTS.SYMPTOM_ANALYSIS) fail('The normal symptom-notes cost changed. Please review it again.')
    await authorize(request, userId, io)
    const result = await io.call(request, { operation: 'analyze', body: values })
    if (result.success !== true) fail()
    const fullAnalysis = analysis(result)
    let saved = false, analysisId: string | null = null
    if (result.historySaved === true && typeof result.analysisId === 'string') {
      const row = await ownedSource(request, result.analysisId, io)
      if (version(userId, { symptoms: row.symptoms, duration: row.duration, notes: row.notes, analysis: row.analysis }) !== version(userId, { ...values, analysis: fullAnalysis })) fail()
      analysisId = row.id; saved = true
    } else if (result.historySaved !== false || result.analysisId !== null) fail()
    const message = saved ? 'Your general symptom notes were created and saved to history. This is information for a doctor discussion, not a diagnosis.' : 'Your general symptom notes are ready, but saving them to history was not verified. Please check Symptom Notes before trying again.'
    if (result.chargedCredits !== (result.coveredByFreeUse === true ? 0 : CREDIT_COSTS.SYMPTOM_ANALYSIS) || typeof result.coveredByFreeUse !== 'boolean') fail()
    return { kind: 'clinical_action', action, actionId: receipt.actionId, status: saved ? 'completed' : 'generated_not_saved', generated: true, saved, historySaved: saved, analysisId, analysis: fullAnalysis, chargedCredits: result.chargedCredits, coveredByFreeUse: result.coveredByFreeUse, message, spokenMessage: spokenResult(message, fullAnalysis.summary || fullAnalysis.analysisText) }
  }
  exactKeys(values, ['analysisId', 'threadId', 'question'])
  if (prepared.threadMode !== (values.threadId ? 'existing' : 'new')) fail('Please review the exact symptom conversation before sending this question.')
  const row = await ownedSource(request, id(values.analysisId), io), question = text(values.question, 2000)
  if (version(userId, row) !== prepared.sourceVersion) fail('The saved symptom notes changed after review. Please review them again before asking this question.')
  if (values.threadId && version(userId, await ownedThread(request, id(values.threadId), row, io, Boolean(clock))) !== prepared.threadSourceVersion) fail('The selected conversation changed after review. Please review it again.')
  await authorize(request, userId, io)
  const result = await io.call(request, { operation: 'follow_up', body: { ...sourceContext(row), message: question, ...(values.threadId ? { threadId: values.threadId } : {}) } })
  const threadId = id(result.threadId), assistant = text(result.assistant, 100000), messageIds = record(result.messageIds)
  if (values.threadId && threadId !== values.threadId || result.responseGenerated !== true || result.historySaved !== true || !Number.isFinite(result.costCents) || result.costCents < 0 || typeof result.covered !== 'boolean') fail()
  const userMessageId = id(messageIds.user), assistantMessageId = id(messageIds.assistant)
  if (userMessageId === assistantMessageId) fail()
  const after = await io.call(request, { operation: 'thread', threadId, messageIds: [userMessageId, assistantMessageId] })
  if (after.threadId !== threadId || version('', comparableContext(after.context)) !== version('', sourceContext(row)) || !Array.isArray(after.messages) || after.messages.length !== 2 || !after.messages.some((item: any) => item.id === userMessageId && item.role === 'user' && item.content === question) || !after.messages.some((item: any) => item.id === assistantMessageId && item.role === 'assistant' && item.content === assistant)) fail()
  const message = 'Your follow-up reply is ready and saved in the symptom conversation. It is general information, not a diagnosis.'
  return { kind: 'clinical_action', action, actionId: receipt.actionId, status: 'completed', generated: true, saved: true, historySaved: true, analysisId: row.id, threadId, threadMode: prepared.threadMode, assistant, analysis: row.analysis, messageIds: { user: userMessageId, assistant: assistantMessageId }, costCents: result.costCents, covered: result.covered, message, spokenMessage: spokenResult(message, assistant) }
}
