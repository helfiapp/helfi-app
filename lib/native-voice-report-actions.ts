import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { hasAiSharingConsent } from '@/lib/ai-consent'
import { getWeeklyReportRequestUser, isWeeklyReportHealthSetupComplete } from '@/lib/weekly-report-request-auth'
import { getWeeklyReportState, getWeeklyReportByPeriod, getWeeklyReportById } from '@/lib/weekly-health-report'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export const VOICE_REPORT_ACTION_SCHEMAS = { 'reports.weekly.generate': {} } as const
export type VoiceReportAccess = { userId:string; email:string|null; aiConsent:boolean; healthSetupComplete:boolean; reportsEnabled:boolean; availableCredits:number; existingReport:{id:string;status:string}|null; periodStart:string;periodEnd:string }
export type VoiceReportIo = {
  access:(request:NextRequest,userId:string)=>Promise<VoiceReportAccess>
  run:(request:NextRequest)=>Promise<{status?:string;reportId?:string;reason?:string}>
  report:(userId:string,reportId:string)=>Promise<{id:string;status:string}|null>
}
export function voiceWeeklyReportPricePolicy() {
  const configured=Number(process.env.WEEKLY_REPORT_PREFLIGHT_CENTS||400)
  return {minimumAvailableCredits:Number.isFinite(configured)&&configured>0?configured:CREDIT_COSTS.INSIGHTS_GENERATION,chargeMode:'normal_usage_based' as const}
}
const defaultIo:VoiceReportIo={
  access:async(request,userId)=>{
    const authenticated=await getWeeklyReportRequestUser(request)
    if(!authenticated||authenticated.id!==userId)throw new Error('Please sign in to the same account to request a report.')
    const now=new Date(),periodStart=new Date(now.getTime()-7*24*60*60*1000).toISOString().slice(0,10),periodEnd=now.toISOString().slice(0,10)
    const [aiConsent,healthSetupComplete,state,wallet,existing]=await Promise.all([hasAiSharingConsent(userId),isWeeklyReportHealthSetupComplete(userId),getWeeklyReportState(userId),new CreditManager(userId).getWalletStatus(),getWeeklyReportByPeriod(userId,periodStart,periodEnd)])
    return {userId,email:authenticated.email,aiConsent,healthSetupComplete,reportsEnabled:state?.reportsEnabled===true,availableCredits:wallet.totalAvailableCents,existingReport:existing?{id:existing.id,status:existing.status}:null,periodStart,periodEnd}
  },
  run:async original=>{
    const headers=new Headers(original.headers);headers.set('content-type','application/json')
    // Retain the caller's real account credentials, never scheduler/admin auth.
    const request=new NextRequest(new URL('/api/reports/weekly/run',original.url),{method:'POST',headers,body:JSON.stringify({triggerSource:'manual'})})
    const response=await(await import('@/app/api/reports/weekly/run/route')).POST(request)
    const data=await response.json()
    if(!response.ok)throw new Error(data?.error||data?.reason||'The normal report request was refused.')
    return data
  },
  report:async(userId,reportId)=>{const row=await getWeeklyReportById(userId,reportId);return row?{id:row.id,status:row.status}:null},
}
function policyHash(access:VoiceReportAccess){return crypto.createHash('sha256').update(JSON.stringify({userId:access.userId,email:access.email?.toLowerCase(),aiConsent:access.aiConsent,healthSetupComplete:access.healthSetupComplete,reportsEnabled:access.reportsEnabled,existingReport:access.existingReport?{id:access.existingReport.id,status:access.existingReport.status}:null,periodStart:access.periodStart,periodEnd:access.periodEnd,minimumAvailableCredits:voiceWeeklyReportPricePolicy().minimumAvailableCredits})).digest('hex')}
function allowed(access:VoiceReportAccess,userId:string){
  if(access.userId!==userId||String(access.email||'').toLowerCase()!==String(process.env.WEEKLY_REPORT_MANUAL_EMAIL||'info@sonicweb.com.au').toLowerCase())throw new Error('Manual weekly report generation is not available for this account.')
  if(!access.aiConsent)throw new Error('Please allow AI help before requesting a weekly report.')
  if(!access.healthSetupComplete)throw new Error('Please finish your basic health profile and at least one real health goal first.')
  const reusable=access.existingReport&&access.existingReport.status!=='FAILED'
  if(!reusable&&(!Number.isFinite(access.availableCredits)||access.availableCredits<voiceWeeklyReportPricePolicy().minimumAvailableCredits))throw new Error('There are not enough available credits for the normal report request. Please review Billing.')
}
export async function prepareVoiceReportAction(request:NextRequest,userId:string,input:any,transcript:string,localDate:string,io:VoiceReportIo=defaultIo){
  if(!input||input.action!=='reports.weekly.generate'||Object.keys(input).some(key=>!['action','values'].includes(key))||!input.values||typeof input.values!=='object'||Array.isArray(input.values)||Object.keys(input.values).length)throw new Error('Please use the normal weekly report request.')
  if(!/\b(?:generate|create|make|run|prepare)\b.{0,60}\breport\b/i.test(transcript)||/\b(?:do not|don't|dont|never)\s+(?:generate|create|make|run|prepare)\b|\b(?:why|how|cannot|can't)\b/i.test(transcript))throw new Error('Please explicitly ask to create your weekly report.')
  const access=await io.access(request,userId);allowed(access,userId)
  const price=voiceWeeklyReportPricePolicy()
  const existing=access.existingReport&&access.existingReport.status!=='FAILED'
  const summary=existing?'Request your existing weekly report':'Request a new weekly report'
  const pricing=existing?'The normal report service will check the existing report for this period.':`The normal report service requires at least ${price.minimumAvailableCredits} credits available. Its final charge is calculated from actual usage, not a fixed ${price.minimumAvailableCredits}-credit fee. Your current available balance is ${access.availableCredits} credits.`
  const enable=!access.reportsEnabled?' This normal manual action also turns on weekly reports.':''
  const draft:any={action:'report_action',transcript,localDate,summary,confirmationMessage:`${summary}. ${pricing}${enable} Would you like me to request it?`,canConfirm:true,autoSave:false,reviewIssuedAt:Date.now(),reportAction:{action:'reports.weekly.generate',userId,beforeHash:policyHash(access),pricePolicy:price,periodStart:access.periodStart,periodEnd:access.periodEnd}}
  draft.reviewToken=signNativeVoiceDraft(userId,draft);return draft
}
/** Caller must claim the normal voice receipt before execution, store this
 * result before replay, and retain pending receipts on uncertain timeouts. */
export async function executeVoiceReportAction(request:NextRequest,userId:string,draft:any,receipt:{receiptClaimed:true;actionId:string},io:VoiceReportIo=defaultIo){
  const prepared=draft?.reportAction
  if(!receipt?.receiptClaimed||!receipt.actionId||draft?.action!=='report_action'||prepared?.action!=='reports.weekly.generate'||prepared.userId!==userId||!verifyNativeVoiceDraft(userId,draft))throw new Error('Please review this exact report request again.')
  const access=await io.access(request,userId);allowed(access,userId)
  if(policyHash(access)!==prepared.beforeHash)throw new Error('Report access or the report period changed. Please review the current request.')
  const response=await io.run(request)
  const status=String(response.status||'').toLowerCase()
  if(!['ready','running','locked'].includes(status))throw new Error(response.reason||'The normal report service has not confirmed a report request.')
  let reportId=response.reportId
  if(!reportId){const refreshed=await io.access(request,userId);reportId=refreshed.existingReport?.id}
  if(!reportId)throw new Error('The report request has no confirmed report identity. Please check Insights before retrying.')
  const actual=await io.report(userId,reportId)
  if(!actual||actual.id!==reportId||!['READY','RUNNING','LOCKED'].includes(actual.status))throw new Error('The report service has not confirmed the selected report state. Please check Insights.')
  const actualStatus=actual.status.toLowerCase()
  return {kind:'report_action',action:'reports.weekly.generate',actionId:receipt.actionId,status:actualStatus==='running'?'preparing':'requested',reportId,reportStatus:actual.status,message:actualStatus==='locked'?'The report request is recorded, but the report is locked. Please review Billing.':actualStatus==='running'?'Your report request is recorded and is being prepared.':'Your report request is recorded. The report service reports its status as ready.',generated:false,unlocked:false,emailDeliveryVerified:false}
}
