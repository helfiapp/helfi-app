import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { hasAiSharingConsent } from '@/lib/ai-consent'
import { getWeeklyReportRequestUser, isWeeklyReportHealthSetupComplete } from '@/lib/weekly-report-request-auth'
import { getWeeklyReportState, getWeeklyReportByPeriod, getWeeklyReportById, listWeeklyReports } from '@/lib/weekly-health-report'
import { CreditManager, CREDIT_COSTS } from '@/lib/credit-system'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'
import { getSiteUrl } from '@/lib/site-url'

export const VOICE_REPORT_ACTION_SCHEMAS = { 'reports.weekly.generate': {}, 'reports.weekly.export_pdf': { reportId: 'optional exact owned report ID', periodStart: 'optional exact YYYY-MM-DD with periodEnd', periodEnd: 'optional exact YYYY-MM-DD with periodStart; omit all selectors for latest owned READY report' } } as const
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
  if(input?.action==='reports.weekly.export_pdf')return prepareVoiceReportPdfAction(request,userId,input,transcript,localDate)
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

type PdfReport = { id:string; userId:string; status:string; periodStart:string; periodEnd:string; updatedAt?:string; report?:unknown; dataSummary?:unknown; summary?:unknown }
export type VoiceReportPdfIo = {
  authenticate:(request:NextRequest)=>Promise<{id:string}|null>
  byId:(userId:string,id:string)=>Promise<PdfReport|null>
  byPeriod:(userId:string,start:string,end:string)=>Promise<PdfReport|null>
  list:(userId:string)=>Promise<PdfReport[]>
  link:(request:NextRequest,reportId:string)=>Promise<{url:string}>
}
function pdfPublicOrigin(){
  try{
    const url=new URL(getSiteUrl())
    const productionDefaultOrigin='https://master.d2n4u4zm85ooe.amplifyapp.com'
    if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.pathname!=='/'||!['https://helfi.ai','https://www.helfi.ai','https://stg.helfi.ai',productionDefaultOrigin].includes(url.origin))throw new Error()
    return url.origin==='https://www.helfi.ai'||url.origin===productionDefaultOrigin?'https://helfi.ai':url.origin
  }catch{throw new Error('The app could not verify its secure public PDF address. Please use Save as PDF in Insights.')}
}
function pdfOriginClass(url:URL){
  if(url.origin==='https://helfi.ai')return 'canonical_public'
  if(url.origin==='https://www.helfi.ai')return 'www_public'
  if(/\.(?:amplifyapp\.com|cloudfront\.net|amazonaws\.com|on\.aws)$/i.test(url.hostname))return 'aws_runtime'
  return 'other'
}
const defaultPdfIo:VoiceReportPdfIo={
  authenticate:getWeeklyReportRequestUser,byId:getWeeklyReportById,byPeriod:getWeeklyReportByPeriod,
  list:userId=>listWeeklyReports(userId,50,'READY'),
  link:async(original,reportId)=>{
    const headers=new Headers(original.headers);headers.set('content-type','application/json');headers.delete('content-length');headers.delete('host')
    // The deployed Next request may carry an AWS runtime origin. Only the
    // configured, allowlisted public site may receive a temporary PDF token.
    const request=new NextRequest(new URL('/api/reports/weekly/pdf',pdfPublicOrigin()),{method:'POST',headers,body:JSON.stringify({reportId,...(pdfInlineCapability(original)?{view:'inline'}:{})})})
    const response=await(await import('@/app/api/reports/weekly/pdf/route')).POST(request)
    const data=await response.json().catch(()=>({}))
    if(!response.ok||typeof data?.url!=='string')throw new Error('The app could not prepare the selected report PDF. Please check Insights.')
    return {url:data.url}
  },
}
function pdfInlineCapability(request:NextRequest){return String(request.headers.get('x-helfi-voice-capabilities')||'').split(',').map(value=>value.trim()).includes('report-pdf-inline-v1')}
function pdfActive(request:NextRequest){if(request.signal?.aborted)throw new Error('The PDF request stopped. No opened or saved file is being claimed.')}
function pdfCapability(request:NextRequest){
  pdfActive(request)
  if(!String(request.headers.get('x-helfi-voice-capabilities')||'').split(',').map(value=>value.trim()).includes('report-pdf-v1'))throw new Error('Please update the Helfi app or use Save as PDF in Insights for this action.')
}
async function pdfOwner(request:NextRequest,userId:string,io:VoiceReportPdfIo){pdfCapability(request);const user=await io.authenticate(request);if(!user||user.id!==userId)throw new Error('Please sign in to the same account before opening a report PDF.')}
function pdfDate(value:any){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T12:00:00Z`))||new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)!==value)throw new Error('Please choose the exact report period.');return value}
function pdfReady(report:PdfReport|null,userId:string):PdfReport{
  if(!report||report.userId!==userId||typeof report.id!=='string'||!report.id.trim()||report.status!=='READY')throw new Error('Please choose an owned report that is ready. Locked or preparing reports cannot be exported.')
  pdfDate(report.periodStart);pdfDate(report.periodEnd);return report
}
function pdfCanonical(value:any):any{if(Array.isArray(value))return value.map(pdfCanonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,pdfCanonical(value[key])]));return value??null}
function pdfVersion(report:PdfReport){return crypto.createHash('sha256').update(JSON.stringify(pdfCanonical({id:report.id,userId:report.userId,status:report.status,periodStart:report.periodStart,periodEnd:report.periodEnd,report:report.report,dataSummary:report.dataSummary,summary:report.summary}))).digest('hex')}
export async function prepareVoiceReportPdfAction(request:NextRequest,userId:string,input:any,transcript:string,localDate:string,io:VoiceReportPdfIo=defaultPdfIo){
  await pdfOwner(request,userId,io)
  if(!input||input.action!=='reports.weekly.export_pdf'||Object.keys(input).some(key=>!['action','values'].includes(key))||!input.values||typeof input.values!=='object'||Array.isArray(input.values)||Object.keys(input.values).some(key=>!['reportId','periodStart','periodEnd'].includes(key)))throw new Error('Please choose the exact weekly report PDF to open.')
  if(!/\b(?:pdf|export|download)\b/i.test(transcript)||! /\b(?:open|save|export|download|create|make)\b/i.test(transcript)||/\b(?:do not|don't|dont|never)\s+(?:open|save|export|download|create|make)\b|\b(?:why|how|cannot|can't)\b/i.test(transcript))throw new Error('Please explicitly ask to open or export your report PDF.')
  const values=input.values
  if((values.periodStart===undefined)!==(values.periodEnd===undefined))throw new Error('Please give both dates of the report period.')
  let selected:PdfReport|null
  if(values.reportId!==undefined){if(typeof values.reportId!=='string'||!values.reportId.trim()||values.reportId.length>200)throw new Error('Please choose the exact report.');selected=await io.byId(userId,values.reportId)}
  else if(values.periodStart!==undefined)selected=await io.byPeriod(userId,pdfDate(values.periodStart),pdfDate(values.periodEnd))
  else selected=(await io.list(userId)).filter(report=>report.userId===userId&&report.status==='READY').sort((a,b)=>String(b.periodEnd).localeCompare(String(a.periodEnd))||String(b.periodStart).localeCompare(String(a.periodStart))||a.id.localeCompare(b.id))[0]||null
  const report=pdfReady(selected,userId)
  if(values.periodStart!==undefined&&(pdfDate(values.periodStart)!==report.periodStart||pdfDate(values.periodEnd)!==report.periodEnd))throw new Error('That report does not match the requested period.')
  pdfActive(request)
  const draft:any={action:'report_action',transcript,localDate,summary:`Open weekly report PDF, ${report.periodStart} to ${report.periodEnd}`,confirmationMessage:`Open the PDF for your ready weekly report from ${report.periodStart} to ${report.periodEnd}?`,canConfirm:true,autoSave:false,reviewIssuedAt:Date.now(),reportAction:{action:'reports.weekly.export_pdf',userId,reportId:report.id,periodStart:report.periodStart,periodEnd:report.periodEnd,reportStatus:'READY',sourceVersion:pdfVersion(report)}}
  draft.reviewToken=signNativeVoiceDraft(userId,draft);return draft
}
async function pdfAccess(request:NextRequest,userId:string,result:any,io:VoiceReportPdfIo){
  await pdfOwner(request,userId,io)
  if(result?.kind!=='report_action'||result.action!=='reports.weekly.export_pdf'||result.status!=='pdf_ready'||result.reportStatus!=='READY'||typeof result.actionId!=='string'||!result.actionId||typeof result.reportId!=='string'||!/^[a-f0-9]{64}$/.test(result.sourceVersion))throw new Error('Please review the selected report PDF again.')
  const report=pdfReady(await io.byId(userId,result.reportId),userId)
  if(report.periodStart!==result.periodStart||report.periodEnd!==result.periodEnd||pdfVersion(report)!==result.sourceVersion)throw new Error('The report changed after review. Please review its PDF again.')
  const publicOrigin=pdfPublicOrigin()
  const link=await io.link(request,report.id);pdfActive(request)
  const after=pdfReady(await io.byId(userId,result.reportId),userId)
  if(pdfVersion(after)!==result.sourceVersion)throw new Error('The report changed while preparing its PDF. Please review it again.')
  try{
    const origin=new URL(request.url),url=new URL(link.url),inline=pdfInlineCapability(request),allowedKeys=inline?['reportId','accessToken','view']:['reportId','accessToken']
    if(url.protocol!=='https:'||url.origin!==publicOrigin||url.username||url.password||url.hash||url.pathname!=='/api/reports/weekly/pdf'||url.searchParams.getAll('reportId').length!==1||url.searchParams.get('reportId')!==report.id||url.searchParams.getAll('accessToken').length!==1||[...url.searchParams.keys()].some(key=>!allowedKeys.includes(key))||(inline&&(url.searchParams.getAll('view').length!==1||url.searchParams.get('view')!=='inline')))throw new Error()
    const token=url.searchParams.get('accessToken')||''
    if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))throw new Error()
    const payload=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'))
    if(payload.userId!==userId||payload.reportId!==report.id||!Number.isInteger(payload.expiresAt)||payload.expiresAt<=Date.now()||payload.expiresAt>Date.now()+61000||payload.view!==(inline?'inline':undefined)||Object.keys(payload).some(key=>!['userId','reportId','expiresAt',...(inline?['view']:[])].includes(key)))throw new Error()
    console.info('[native voice PDF]',{event:'report_pdf_link_validated',requestOriginClass:pdfOriginClass(origin),linkOriginClass:pdfOriginClass(url),trustedPublicOriginMatch:true,sameRequestOrigin:url.origin===origin.origin,requestProtocol:origin.protocol==='https:'?'https':origin.protocol==='http:'?'http':'other',linkProtocol:'https',pathMatch:true,queryKeysValid:true,queryCount:inline?3:2})
    return {url:url.toString(),reportId:report.id,actionId:result.actionId,expiresAt:payload.expiresAt}
  }catch{throw new Error('The app could not verify the temporary PDF link. Please request it again from Insights.')}
}
export async function executeVoiceReportPdfAction(request:NextRequest,userId:string,draft:any,receipt:{receiptClaimed:true;actionId:string},io:VoiceReportPdfIo=defaultPdfIo){
  const prepared=draft?.reportAction
  if(!receipt?.receiptClaimed||!receipt.actionId||draft?.action!=='report_action'||prepared?.action!=='reports.weekly.export_pdf'||prepared.userId!==userId||!verifyNativeVoiceDraft(userId,draft))throw new Error('Please review this exact report PDF request again.')
  const result={kind:'report_action',action:'reports.weekly.export_pdf',actionId:receipt.actionId,status:'pdf_ready',reportId:prepared.reportId,periodStart:prepared.periodStart,periodEnd:prepared.periodEnd,reportStatus:'READY',sourceVersion:prepared.sourceVersion,generated:false,unlocked:false,opened:false,downloaded:false,message:'Your report PDF is ready to open.'}
  return {result,reportPdfAccess:await pdfAccess(request,userId,result,io)}
}
/** Completed opaque receipts are owner-scoped. Regenerate only ephemeral access
 * after fresh normal auth/READY/source checks; never persist or replay old URLs. */
export async function refreshVoiceReportPdfAccess(request:NextRequest,userId:string,result:any,io:VoiceReportPdfIo=defaultPdfIo){return pdfAccess(request,userId,result,io)}
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
