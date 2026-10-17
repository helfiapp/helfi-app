import { nativeVoiceReviewTokenDigest } from './nativeDeviceActions'

export type ClinicalVoiceAction = {
  action: 'symptoms.analyze' | 'symptoms.follow_up'
  userId: string
  values: { symptoms?: string[]; duration?: string; notes?: string; analysisId?: string; threadId?: string; question?: string; query?: string; latest?: boolean; localDate?: string }
  sourceVersion?: string
  threadSourceVersion?: string
  threadMode?: 'new' | 'existing'
  normalCreditCost?: number | null
  preparedAt?: number
}
type ClinicalDraft = { action: string; canConfirm: boolean; reviewToken?: string; clinicalAction?: ClinicalVoiceAction }
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && !value.includes('\0') && (empty || Boolean(value.trim()))
const id = (value: unknown): value is string => text(value, 200) && /^[A-Za-z0-9_:-]+$/.test(value)
const list = (value: unknown, count: number, length: number): value is string[] => Array.isArray(value) && value.length <= count && value.every(item => text(item, length))
function validAnalysis(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) && (value.summary === null || text(value.summary, 20000, true)) && (value.analysisText === null || text(value.analysisText, 100000, true)) && list(value.redFlags, 100, 5000) && list(value.nextSteps, 100, 5000) && text(value.disclaimer, 10000) && Array.isArray(value.possibleCauses) && value.possibleCauses.length <= 100 && value.possibleCauses.every((cause: any) => cause && text(cause.name, 20000) && text(cause.whyLikely, 100000, true)) && JSON.stringify(value).length <= 1_000_000
}
/** Keep the normal tool's complete text available. No generated clinical
 * content is inferred from a completion flag or rewritten by the voice client. */
export function clinicalVoiceReadableResult(result: any) {
  const analysis = result.analysis
  return [result.message, result.assistant ? `Follow-up reply:\n${result.assistant}` : '', analysis.summary ? `Summary:\n${analysis.summary}` : '', analysis.analysisText ? `Symptom notes:\n${analysis.analysisText}` : '', analysis.possibleCauses.length ? `Possible causes:\n${analysis.possibleCauses.map((cause: any) => `${cause.name}: ${cause.whyLikely}`).join('\n')}` : '', analysis.redFlags.length ? `Red flags:\n${analysis.redFlags.join('\n')}` : '', analysis.nextSteps.length ? `Next steps:\n${analysis.nextSteps.join('\n')}` : '', analysis.disclaimer].filter(Boolean).join('\n\n')
}
export function verifiedClinicalVoiceResult(data: any, draft: ClinicalDraft, accountId?: string) {
  const reviewed = draft.clinicalAction, result = data?.result
  if (data?.success !== true || draft.action !== 'clinical_action' || draft.canConfirm !== true || !reviewed || !id(reviewed.userId) || accountId !== undefined && reviewed.userId !== accountId || !text(draft.reviewToken, 4096) || !result || result.kind !== 'clinical_action' || result.action !== reviewed.action || result.actionId !== nativeVoiceReviewTokenDigest(draft.reviewToken) || result.generated !== true || typeof result.saved !== 'boolean' || result.historySaved !== result.saved || result.status !== (result.saved ? 'completed' : 'generated_not_saved') || !validAnalysis(result.analysis) || !text(result.message, 2000) || !text(result.spokenMessage, 20000)) return null
  if (reviewed.action === 'symptoms.analyze') {
    if (!list(reviewed.values.symptoms, 12, 80) || !reviewed.values.symptoms.length || !text(reviewed.values.duration, 120, true) || !text(reviewed.values.notes, 1200, true) || typeof result.coveredByFreeUse !== 'boolean' || !Number.isFinite(reviewed.normalCreditCost) || result.chargedCredits !== (result.coveredByFreeUse ? 0 : reviewed.normalCreditCost) || (result.saved ? !id(result.analysisId) : result.analysisId !== null) || result.threadId !== undefined || result.messageIds !== undefined || result.assistant !== undefined || result.threadMode !== undefined) return null
  } else if (reviewed.action === 'symptoms.follow_up') {
    if (!['new', 'existing'].includes(reviewed.threadMode || '') || result.threadMode !== reviewed.threadMode || (reviewed.threadMode === 'new' ? reviewed.values.threadId !== undefined : !id(reviewed.values.threadId)) || !id(reviewed.values.analysisId) || result.analysisId !== reviewed.values.analysisId || !text(reviewed.values.question, 2000) || !/^[a-f0-9]{64}$/.test(reviewed.sourceVersion || '') || !result.saved || !id(result.threadId) || (reviewed.values.threadId !== undefined && (result.threadId !== reviewed.values.threadId || !/^[a-f0-9]{64}$/.test(reviewed.threadSourceVersion || ''))) || !text(result.assistant, 100000) || !result.messageIds || Object.keys(result.messageIds).length !== 2 || !id(result.messageIds.user) || !id(result.messageIds.assistant) || result.messageIds.user === result.messageIds.assistant || !Number.isFinite(result.costCents) || result.costCents < 0 || typeof result.covered !== 'boolean') return null
  } else return null
  return { result, readable: clinicalVoiceReadableResult(result), spoken: result.spokenMessage as string }
}
