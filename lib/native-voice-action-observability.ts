import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'

type VoiceActionTrace = {
  id: string
  phase: 'prepare' | 'save'
  startedAt: number
  userId?: string
  action?: string
}

export function beginVoiceActionTrace(request: NextRequest, phase: VoiceActionTrace['phase']): VoiceActionTrace {
  const supplied = request.headers.get('x-helfi-voice-action-id') || ''
  return {
    id: /^[a-zA-Z0-9_:.\-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID(),
    phase,
    startedAt: Date.now(),
  }
}

export function voiceActionOutcome(data: any, httpStatus: number, phase: VoiceActionTrace['phase'], requestedAction?: string) {
  const action = typeof data?.draft?.action === 'string' ? data.draft.action : phase === 'save' ? data?.result?.kind || requestedAction : requestedAction
  const safeAction = typeof action === 'string' && /^[a-z_]{1,40}$/.test(action) ? action : 'unknown'
  const draftCode = ['food_amount_ambiguous', 'food_source_unavailable', 'food_serving_unavailable', 'app_read_unverified'].includes(data?.draft?.reasonCode) ? data.draft.reasonCode : undefined
  const rawCode = data?.code || draftCode
  const code = typeof rawCode === 'string' && /^[a-z_]{1,80}$/.test(rawCode) ? rawCode : undefined
  if (httpStatus >= 400 || data?.success === false) {
    return { action: safeAction, status: 'failed', reasonCode: code || `http_${httpStatus}`, success: false }
  }
  if (phase === 'save' && data?.localPreferenceAuthorized === true) return { action: 'local_preference_action', status: 'device_change_authorized', reasonCode: 'device_write_not_yet_verified', success: true }
  if (phase === 'save' && data?.deviceActionAuthorized === true && data?.safeToClaimSaved === false) return { action: 'device_action', status: 'device_change_authorized', reasonCode: 'device_write_not_yet_verified', success: true }
  if (phase === 'save') {
    const result = data?.result
    if (data?.success === true && result?.kind === 'recipe_import' && result?.status === 'imported_not_saved' && result.saved === false && typeof result.actionId === 'string' && result.actionId && result.nextRecipeDraft) return { action: 'recipe_import', status: 'imported_for_review', reasonCode: 'recipe_imported_not_saved', success: true }
    if (data?.success === true && result?.kind === 'report_action' && result.action === 'reports.weekly.generate' && typeof result.actionId === 'string' && result.actionId && typeof result.reportId === 'string' && result.reportId && ['READY', 'RUNNING', 'LOCKED'].includes(result.reportStatus) && ['requested', 'preparing'].includes(result.status) && result.generated === false && result.unlocked === false) return { action: 'report_action', status: 'report_request_recorded', reasonCode: 'report_state_verified', success: true }
    const receipt = result?.kind === 'food'
      ? Array.isArray(result.ids) && result.ids.length > 0 && result.ids.every((id: unknown) => typeof id === 'string' && id.length > 0)
      : result?.kind === 'health_intake'
      ? result.counts && ['supplements', 'medications'].every((key) => typeof result.counts[key] === 'number' && result.counts[key] >= 0)
      : typeof result?.id === 'string' && result.id.length > 0
    const validResult = data?.success === true && ['food', 'water', 'mood', 'exercise', 'journal', 'health_journal', 'symptom_note', 'health_intake', 'record_action', 'preference_action', 'notification_action', 'support_action'].includes(result?.kind) && typeof result?.message === 'string' && Boolean(receipt)
    return { action: safeAction, status: validResult ? 'saved' : 'failed', reasonCode: validResult ? 'save_receipt_returned' : 'save_receipt_missing', success: validResult }
  }
  if (data?.rejectNow) return { action: safeAction, status: 'discarded', reasonCode: 'review_rejected', success: true }
  if (data?.confirmNow) return { action: safeAction, status: 'confirmation_requested', reasonCode: 'save_not_yet_confirmed', success: true }
  if (data?.draft?.canConfirm) return { action: safeAction, status: 'needs_review', reasonCode: 'review_ready_not_saved', success: true }
  if (data?.draft?.appTarget) return { action: safeAction, status: 'handoff_ready', reasonCode: 'screen_target_prepared', success: true }
  const unresolved = code === 'app_read_unverified' || ['food_draft', 'unknown'].includes(safeAction) || (data?.draft && !data.draft.canConfirm && !['recipe', 'health_question', 'greeting'].includes(safeAction))
  return { action: safeAction, status: unresolved ? 'needs_clarification' : 'answered', reasonCode: unresolved ? code || 'action_details_unresolved' : 'answer_returned', success: !unresolved }
}

// Record the result of the app action, separately from vendor usage. Never retain
// speech, food/health content, quantities, auth headers or signed review tokens.
export async function finishVoiceActionTrace(response: Response, trace: VoiceActionTrace) {
  let data: any
  try { data = await response.clone().json() } catch { data = null }
  const outcome = voiceActionOutcome(data, response.status, trace.phase, trace.action)
  const details = { voiceActionRunId: trace.id, phase: trace.phase, ...outcome, durationMs: Math.max(0, Date.now() - trace.startedAt), httpStatus: response.status }
  console.info('[native voice action]', JSON.stringify(details))
  if (trace.userId) {
    await logAiUsageEvent({
      feature: `voice-action:${trace.phase}-outcome`, userId: trace.userId,
      endpoint: trace.phase === 'save' ? '/api/native/voice-assistant/confirm' : '/api/native/voice-assistant',
      model: 'helfi-app-action', promptTokens: 0, completionTokens: 0, costCents: 0,
      runId: trace.id, success: outcome.success, errorMessage: outcome.success ? null : outcome.reasonCode,
      detail: JSON.stringify(details),
    })
  }
  const headers = new Headers(response.headers)
  headers.set('x-helfi-voice-action-id', trace.id)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    headers.delete('content-length')
    return NextResponse.json({ ...data, voiceActionRunId: trace.id }, { status: response.status, headers })
  }
  return new Response(response.body, { status: response.status, headers })
}
