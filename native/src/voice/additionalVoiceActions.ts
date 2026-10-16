import { nativeVoiceReviewTokenDigest } from './nativeDeviceActions'

export type AdditionalVoiceAction = {
  action: 'devices.interest.update' | 'health_image_note.delete' | 'chat_history.rename' | 'chat_history.delete' | 'coach_history.delete' | 'checkin_history.delete'
  userId: string
  operation?: 'update' | 'rename' | 'delete'
  values: { ids?: string[]; provider?: 'googleFit' | 'oura' | 'polar'; interested?: boolean; targetId?: string; context?: 'general' | 'food'; title?: string; id?: string; threadId?: string; query?: string }
  count?: number
  expectedRows?: Array<{ id: string; userId?: string; [key: string]: unknown }>
  beforeHash?: string
  preparedAt?: number
}
type AdditionalDraft = { action: string; canConfirm: boolean; reviewToken?: string; additionalAction?: AdditionalVoiceAction }
const accepted = new Map<string, { expiresAt: number; actionId: string; fingerprint: string }>()
const receiptMatchesReview = (result: any, draft: AdditionalDraft) => typeof draft.reviewToken === 'string' && Boolean(draft.reviewToken) && draft.reviewToken.length <= 4096 && result?.actionId === nativeVoiceReviewTokenDigest(draft.reviewToken)
const identity = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,200}$/.test(value)
function verifiedHistoryVoiceReceipt(data: any, draft: AdditionalDraft) {
  const reviewed = draft.additionalAction, result = data?.result, ids = reviewed?.values.ids
  if (data?.success !== true || draft.action !== 'additional_action' || draft.canConfirm !== true || !reviewed || !identity(reviewed.userId) || !['coach_history.delete','checkin_history.delete'].includes(reviewed.action) || reviewed.operation !== 'delete' || !Array.isArray(ids) || ids.length < 1 || ids.length > 1000 || ids.some(id=>!identity(id)) || new Set(ids).size !== ids.length || Object.keys(reviewed.values).length !== 1 || reviewed.count !== ids.length || !Array.isArray(reviewed.expectedRows) || reviewed.expectedRows.length !== ids.length || reviewed.expectedRows.some(row=>!row || !ids.includes(row.id) || (row.userId !== undefined && row.userId !== reviewed.userId)) || new Set(reviewed.expectedRows.map(row=>row.id)).size !== ids.length || !result || result.kind !== 'history_action' || result.action !== reviewed.action || result.operation !== 'delete' || !identity(result.actionId) || !receiptMatchesReview(result,draft)) return null
  const sameIds = (value: unknown) => Array.isArray(value) && value.length === ids.length && new Set(value).size === value.length && value.every(id=>typeof id === 'string' && ids.includes(id))
  if (Object.keys(result).some(key=>!['kind','action','actionId','operation','status','ids','deletedIds','count','saved','changed','message'].includes(key)) || !sameIds(result.ids)) return null
  let message = ''
  if (result.status === 'completed' && result.saved === true && result.changed === true && result.count === ids.length && sameIds(result.deletedIds)) message = reviewed.action === 'coach_history.delete' ? 'The reviewed Health Coach history entries were deleted.' : 'The reviewed daily check-in history entries were deleted.'
  if (result.status === 'already_absent' && result.saved === false && result.changed === false && result.count === 0 && Array.isArray(result.deletedIds) && result.deletedIds.length === 0) message = 'The reviewed history entries are already absent. No deletion was performed by this action.'
  if (!message || result.message !== message) return null
  return { kind:'history_action',action:reviewed.action,actionId:result.actionId as string,operation:'delete' as const,status:result.status as 'completed' | 'already_absent',saved:result.saved as boolean,changed:result.changed as boolean,ids:[...ids],deletedIds:result.status === 'completed' ? [...ids] : [],count:result.count as number,values:{ids:[...ids]},changedAreas:[reviewed.action === 'coach_history.delete' ? 'coach-history' : 'checkin-history'],message }
}
export function verifiedAdditionalVoiceReceipt(data: any, draft: AdditionalDraft) {
  if (['coach_history.delete','checkin_history.delete'].includes(draft.additionalAction?.action || '')) return verifiedHistoryVoiceReceipt(data,draft)
  const reviewed = draft.additionalAction, result = data?.result, values = reviewed?.values
  if (data?.success !== true || draft.action !== 'additional_action' || draft.canConfirm !== true || !reviewed || !identity(reviewed.userId) || !result || result.action !== reviewed.action || !identity(result.actionId) || !receiptMatchesReview(result,draft) || result.operation !== reviewed.operation || !values || !result.values || Array.isArray(values) || Array.isArray(result.values)) return null
  const action = reviewed.action
  const interest = action === 'devices.interest.update', rename = action === 'chat_history.rename', image = action === 'health_image_note.delete'
  if (!interest && !rename && !image && action !== 'chat_history.delete') return null
  const keys = interest ? ['provider','interested'] : rename ? ['targetId','context','title'] : image ? ['targetId'] : ['targetId','context']
  if (Object.keys(values).length !== keys.length || Object.keys(values).some(key=>!keys.includes(key)) || Object.keys(result.values).length !== keys.length || Object.keys(result.values).some(key=>!keys.includes(key)) || keys.some(key=>result.values[key] !== (values as any)[key] || result[key] !== (values as any)[key])) return null
  if (interest ? !['googleFit','oura','polar'].includes(values.provider || '') || typeof values.interested !== 'boolean' || reviewed.operation !== 'update' || result.id !== undefined || result.targetId !== undefined || result.context !== undefined : !identity(values.targetId) || result.id !== values.targetId || result.provider !== undefined || (!image && !['general','food'].includes(values.context || '')) || (rename ? reviewed.operation !== 'rename' || typeof values.title !== 'string' || !values.title.trim() || values.title.length > 200 : reviewed.operation !== 'delete' || result.title !== undefined)) return null
  const kind = interest ? 'device_interest' : image ? 'health_image_note' : 'chat_thread', area = interest ? 'devices' : image ? 'health-images' : 'chat-history'
  if (result.kind !== kind || !Array.isArray(result.changedAreas) || result.changedAreas.length !== 1 || result.changedAreas[0] !== area) return null
  let message = ''
  if (result.status === 'completed' && result.saved === true && result.changed === true) message = interest ? 'The reviewed device interest preference is saved. This did not connect a device or grant Health permissions.' : image ? 'The selected saved health image note and file reference were removed. Physical storage deletion is not separately verified.' : rename ? 'The selected saved Chat History thread has the exact reviewed title. The current voice conversation was not changed.' : 'The selected saved Chat History thread was removed. The current voice conversation was not changed.'
  if (result.status === 'already_set' && result.saved === true && result.changed === false && (interest || rename)) message = interest ? 'That device interest preference is already set. No connection or Health permission was changed.' : 'That saved Chat History title already matches. The current voice conversation was not changed.'
  if (result.status === 'already_absent' && result.saved === false && result.changed === false && reviewed.operation === 'delete') message = 'The selected saved item is already absent. No deletion was performed by this action.'
  if (!message || result.message !== message) return null
  return { kind, action, actionId: result.actionId as string, operation: reviewed.operation, status: result.status as 'completed' | 'already_set' | 'already_absent', saved: result.saved as boolean, changed: result.changed as boolean, values: { ...values }, ...(values.targetId ? { id:values.targetId,targetId:values.targetId } : {}), ...(values.provider ? { provider:values.provider,interested:values.interested } : {}), ...(values.context ? { context:values.context } : {}), ...(values.title ? { title:values.title } : {}), changedAreas:[area], message }
}
export function acceptAdditionalVoiceReceipt(data: any, draft: AdditionalDraft, accountId: string, isCurrent: () => boolean, now: number) {
  if (!isCurrent() || draft.additionalAction?.userId !== accountId || !draft.reviewToken || draft.reviewToken.length > 4096) return null
  const receipt = verifiedAdditionalVoiceReceipt(data,draft)
  if (!receipt) throw new Error('The app did not verify the exact reviewed saved-item action. Please check its normal screen before retrying.')
  for (const [key,value] of accepted) if (value.expiresAt < now) accepted.delete(key)
  const key = `${accountId}:${draft.reviewToken}`, previous = accepted.get(key), fingerprint = JSON.stringify(receipt)
  if (previous && (previous.actionId !== receipt.actionId || previous.fingerprint !== fingerprint)) throw new Error('The saved-item receipt changed. Please check the selected item before retrying.')
  if (!previous && accepted.size >= 128) throw new Error('Too many recent saved-item actions need checking. Please use the normal screen.')
  accepted.set(key,{expiresAt:now+30*60*1000,actionId:receipt.actionId,fingerprint})
  return { success:true,result:receipt,idempotentReplay:Boolean(previous || data.idempotentReplay) }
}
