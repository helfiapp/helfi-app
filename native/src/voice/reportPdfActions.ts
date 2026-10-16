import { nativeVoiceReviewTokenDigest } from './nativeDeviceActions'

const PDF_ACTION = 'reports.weekly.export_pdf'
const PDF_READY_MESSAGE = 'Your report PDF is ready to open.'
const PDF_OPEN_MESSAGE = 'Your report PDF is opening. Use its save option to keep a copy.'
const PDF_UNCONFIRMED_MESSAGE = 'I couldn’t confirm the PDF opening. Please use Save as PDF in Insights.'

type PdfDraft = { action: string; canConfirm: boolean; reviewToken?: string; reportAction?: { action: string; userId?: string; reportId?: string; periodStart?: string; periodEnd?: string; reportStatus?: string; sourceVersion?: string } }
type PdfIo = { apiBaseUrl: string; accountId: string; isCurrent: () => boolean; now: () => number; openUrl: (url: string) => Promise<unknown> }
type PdfReceipt = { kind: 'report_action'; action: string; actionId: string; status: 'pdf_open_requested' | 'pdf_open_not_verified'; reportId: string; periodStart: string; periodEnd: string; reportStatus: 'READY'; sourceVersion: string; generated: false; unlocked: false; opened: false; downloaded: false; saved: false; openRequestAccepted: boolean; message: string }
const attempts = new Map<string, { expiresAt: number; actionId: string; reportId: string; receipt: PdfReceipt; pending?: Promise<PdfReceipt> }>()
const identity = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,180}$/.test(value)
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value
function matchesReport(result: any, draft: PdfDraft) {
  const reviewed = draft.reportAction
  return draft.action === 'report_action' && draft.canConfirm === true && reviewed?.action === PDF_ACTION && reviewed.reportStatus === 'READY' && typeof reviewed.sourceVersion === 'string' && /^[a-f0-9]{64}$/.test(reviewed.sourceVersion) && result.sourceVersion === reviewed.sourceVersion && identity(reviewed.userId) && identity(reviewed.reportId) && date(reviewed.periodStart) && date(reviewed.periodEnd) && reviewed.periodStart! <= reviewed.periodEnd! && result?.kind === 'report_action' && result.action === PDF_ACTION && identity(result.actionId) && typeof draft.reviewToken === 'string' && Boolean(draft.reviewToken) && draft.reviewToken.length <= 4096 && result.actionId === nativeVoiceReviewTokenDigest(draft.reviewToken) && result.reportId === reviewed.reportId && result.periodStart === reviewed.periodStart && result.periodEnd === reviewed.periodEnd && result.reportStatus === 'READY' && result.generated === false && result.unlocked === false && result.opened === false && result.downloaded === false
}
export function nativeReportPdfCompletionMessage(data: any, draft: PdfDraft) {
  const result = data?.result
  if (data?.success !== true || !matchesReport(result,draft) || result.saved !== false) return ''
  if (result.status === 'pdf_open_requested' && result.openRequestAccepted === true && result.message === PDF_OPEN_MESSAGE) return PDF_OPEN_MESSAGE
  if (result.status === 'pdf_open_not_verified' && result.openRequestAccepted === false && result.message === PDF_UNCONFIRMED_MESSAGE) return PDF_UNCONFIRMED_MESSAGE
  return ''
}
function tokenPayload(token: string) {
  // Decode only the normal signed token's ASCII identity/expiry fields. The
  // server, not this phone, verifies its signature when serving the PDF.
  const [payload,signature,...extra] = token.split('.')
  if (extra.length || !payload || !signature || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{32,128}$/.test(signature) || token.length > 4096) throw new Error('The report PDF access was not verified. Please request it again.')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let bits = 0, value = 0, decoded = ''
  for (const character of payload.replace(/-/g,'+').replace(/_/g,'/')) {
    value = (value << 6) | alphabet.indexOf(character); bits += 6
    if (bits >= 8) { bits -= 8; const byte = (value >> bits) & 255; if (byte < 32 || byte > 126) throw new Error('The report PDF access was not verified. Please request it again.'); decoded += String.fromCharCode(byte) }
  }
  try { return JSON.parse(decoded) } catch { throw new Error('The report PDF access was not verified. Please request it again.') }
}
function verifiedPdfUrl(data: any, draft: PdfDraft, io: PdfIo) {
  const result = data?.result, access = data?.reportPdfAccess
  if (data?.success !== true || !matchesReport(result,draft) || result.status !== 'pdf_ready' || result.message !== PDF_READY_MESSAGE || result.saved === true || access?.reportId !== result.reportId || access.actionId !== result.actionId || typeof access.url !== 'string' || access.url.length > 7000 || /[\s\\]/.test(access.url)) throw new Error('The app did not verify the exact reviewed report PDF. Please request it again in Insights.')
  const now = io.now()
  if (!Number.isFinite(access.expiresAt) || access.expiresAt <= now + 1000 || access.expiresAt > now + 61000) throw new Error('The report PDF link expired or its timing was not verified. Please request a fresh link.')
  let url: URL, base: URL
  try { url = new URL(access.url); base = new URL(io.apiBaseUrl) } catch { throw new Error('The report PDF link was not verified. Please request it again.') }
  if (url.protocol !== 'https:' || base.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.hash || url.pathname !== '/api/reports/weekly/pdf') throw new Error('The report PDF link was not verified. Please request it again.')
  const keys = [...url.searchParams.keys()]
  if (keys.length !== 2 || url.searchParams.getAll('reportId').length !== 1 || url.searchParams.getAll('accessToken').length !== 1 || keys.filter(key=>key==='reportId').length !== 1 || keys.filter(key=>key==='accessToken').length !== 1 || url.searchParams.get('reportId') !== result.reportId) throw new Error('The report PDF link was not verified. Please request it again.')
  const payload = tokenPayload(url.searchParams.get('accessToken') || '')
  if (!payload || Object.keys(payload).some(key=>!['userId','reportId','expiresAt'].includes(key)) || payload.userId !== io.accountId || payload.userId !== draft.reportAction?.userId || payload.reportId !== result.reportId || payload.expiresAt !== access.expiresAt) throw new Error('The report PDF access did not match this account and report. Please request it again.')
  return access.url as string
}
export async function openReviewedNativeReportPdf(data: any, draft: PdfDraft, io: PdfIo) {
  if (!io.isCurrent() || draft.reportAction?.userId !== io.accountId || typeof draft.reviewToken !== 'string' || !draft.reviewToken || draft.reviewToken.length > 4096) return null
  const url = verifiedPdfUrl(data,draft,io)
  if (!io.isCurrent()) return null
  const now = io.now()
  for (const [key,entry] of attempts) if (entry.expiresAt < now && !entry.pending) attempts.delete(key)
  const key = `${io.accountId}:${draft.reviewToken}`
  let entry = attempts.get(key)
  if (entry) {
    if (entry.actionId !== data.result.actionId || entry.reportId !== data.result.reportId) throw new Error('This report PDF review changed. Please review it again.')
    const receipt = entry.pending ? await entry.pending : entry.receipt
    return io.isCurrent() ? { success: true, result: receipt, idempotentReplay: true } : null
  }
  if (attempts.size >= 128) throw new Error('Too many recent PDF requests need checking. Please use Save as PDF in Insights.')
  const receipt: PdfReceipt = { kind:'report_action',action:PDF_ACTION,actionId:data.result.actionId,status:'pdf_open_not_verified',reportId:data.result.reportId,periodStart:data.result.periodStart,periodEnd:data.result.periodEnd,reportStatus:'READY',sourceVersion:draft.reportAction!.sourceVersion!,generated:false,unlocked:false,opened:false,downloaded:false,saved:false,openRequestAccepted:false,message:PDF_UNCONFIRMED_MESSAGE }
  entry = { expiresAt:now+30*60*1000,actionId:receipt.actionId,reportId:receipt.reportId,receipt }
  attempts.set(key,entry)
  const captured = entry
  // Record the attempt before the external handoff. A failed or interrupted
  // response cannot cause an automatic second opening, and no URL is retained.
  captured.pending = (async () => {
    try {
      if (!io.isCurrent()) return receipt
      await io.openUrl(url)
      if (io.isCurrent()) captured.receipt = { ...receipt,status:'pdf_open_requested',openRequestAccepted:true,message:PDF_OPEN_MESSAGE }
    } catch { /* The OS may have begun opening it; never repeat automatically. */ }
    return captured.receipt
  })()
  const completed = await captured.pending
  delete captured.pending
  return io.isCurrent() ? { success:true,result:completed,idempotentReplay:false } : null
}
