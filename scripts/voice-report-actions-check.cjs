#!/usr/bin/env node
'use strict'
// Real reviewed adapter and real normal weekly-run auth/preflight source up to
// its provider boundary. Synthetic accounts/state/credit/HTTP only; no model.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),user='synthetic-user'
function load(relative,deps,env={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module,exports:module.exports,URL,Headers,Date,Buffer,process:{env:{NODE_ENV:'test',AUTH_SECRET:'synthetic-report-secret',...env}},require:name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Forbidden dependency '+name)}},{filename:relative});return module.exports}
let account,consent,health,enabled,credits,existing,posts,bodySeen,authSeen,priceFallback=7
const review=load('lib/native-voice-review-token.ts',{crypto})
const siteUrl=load('lib/site-url.ts',{})
const runSource=fs.readFileSync(path.join(root,'app/api/reports/weekly/run/route.ts'),'utf8')
const prefix=runSource.slice(runSource.indexOf('  const body = await request.json()',runSource.indexOf('export async function POST')),runSource.indexOf('  const userBase = await prisma.user.findUnique',runSource.indexOf('export async function POST')))
assert(prefix.includes("triggerSource === 'manual'"));assert(prefix.includes('MANUAL_REPORT_EMAIL'))
class Request{constructor(url,options={}){this.url=String(url);this.headers=options.headers;this.body=options.body}async json(){return JSON.parse(this.body||'{}')}}
const ctx=vm.createContext({Date,MANUAL_REPORT_EMAIL:'info@sonicweb.com.au',WEEKLY_PREFLIGHT_CENTS:400,CREDIT_COSTS:{INSIGHTS_GENERATION:7},isAuthorized:()=>false,getWeeklyReportRequestUser:async()=>account,hasAiSharingConsent:async()=>consent,isWeeklyReportHealthSetupComplete:async()=>health,getWeeklyReportState:async()=>({reportsEnabled:enabled,nextReportDueAt:'2026-10-18T00:00:00Z'}),setWeeklyReportsEnabled:async()=>{enabled=true},markWeeklyReportOnboardingComplete:async()=>{},upsertWeeklyReportState:async()=>{},toDateOnly:d=>d.toISOString().slice(0,10),getWeeklyReportByPeriod:async()=>existing,createWeeklyReportRecord:async()=>{existing={id:'actual-created-at-provider-boundary',status:'RUNNING'};return existing},CreditManager:class{async getWalletStatus(){return{totalAvailableCents:credits}}},updateWeeklyReportRecord:async(_u,id,changes)=>{existing={id,...changes};return existing},getNextDueAt:d=>d,queueWeeklyReportNotification:async()=>{},NextResponse:{json:(data,options)=>({ok:(options?.status||200)<400,status:options?.status||200,json:async()=>data})}})
vm.runInContext(ts.transpileModule(`async function normalRunProviderBoundary(request){${prefix}\nreturn NextResponse.json({status:'running',reportId:report.id});}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const helper=load('lib/native-voice-report-actions.ts',{crypto,'next/server':{NextRequest:Request},'@/lib/site-url':siteUrl,'@/lib/ai-consent':{hasAiSharingConsent:async()=>consent},'@/lib/weekly-report-request-auth':{getWeeklyReportRequestUser:async()=>account,isWeeklyReportHealthSetupComplete:async()=>health},'@/lib/weekly-health-report':{getWeeklyReportState:async()=>({reportsEnabled:enabled}),getWeeklyReportByPeriod:async()=>existing,getWeeklyReportById:async(u,id)=>u===user&&existing?.id===id?existing:null},'@/lib/credit-system':{CreditManager:class{async getWalletStatus(){return{totalAvailableCents:credits}}},CREDIT_COSTS:{INSIGHTS_GENERATION:7}},'@/lib/native-voice-review-token':review,'@/app/api/reports/weekly/run/route':{POST:async request=>{posts++;bodySeen=await request.json();authSeen=request.headers.get('authorization');return ctx.normalRunProviderBoundary(request)}}})
const request=new Request('https://helfi.invalid/api/native/voice-assistant',{headers:new Headers({authorization:'Bearer synthetic-original-auth'})})
const prepare=()=>helper.prepareVoiceReportAction(request,user,{action:'reports.weekly.generate',values:{}},'Create my weekly report','2026-10-17')
const execute=draft=>helper.executeVoiceReportAction(request,user,draft,{receiptClaimed:true,actionId:'synthetic-report-receipt'})
let count=0
async function check(name,fn){account={id:user,email:'info@sonicweb.com.au'};consent=true;health=true;enabled=true;credits=1000;existing=null;posts=0;await fn();count++;console.log('PASS '+name)}
async function run(){
await check('prepare is free of generation and quotes true variable charge/minimum balance',async()=>{
 const draft=await prepare();assert.equal(posts,0);assert.equal(draft.canConfirm,true);assert.equal(draft.reportAction.pricePolicy.minimumAvailableCredits,400);assert.equal(draft.reportAction.pricePolicy.chargeMode,'normal_usage_based');assert.match(draft.confirmationMessage,/actual usage/);assert.match(draft.confirmationMessage,/not a fixed 400/)
})
await check('normal manual report request preserves account auth and uses no scheduler credentials',async()=>{
 const draft=await prepare(),result=await execute(draft)
 assert.deepEqual(bodySeen,{triggerSource:'manual'});assert.equal(authSeen,'Bearer synthetic-original-auth');assert.equal(posts,1)
 assert.equal(result.reportId,'actual-created-at-provider-boundary');assert.equal(result.status,'preparing');assert.equal(result.generated,false);assert.equal(result.unlocked,false);assert.equal(result.emailDeliveryVerified,false)
})
await check('owner restriction, persisted AI consent, real health setup and credit minimum remain',async()=>{
 account.email='ordinary@example.invalid';await assert.rejects(prepare,/not available/);account.email='info@sonicweb.com.au'
 consent=false;await assert.rejects(prepare,/allow AI/);consent=true;health=false;await assert.rejects(prepare,/real health goal/);health=true;credits=399;await assert.rejects(prepare,/not enough/);assert.equal(posts,0)
})
await check('manual enabling is disclosed and retained in the normal route',async()=>{
 enabled=false;const draft=await prepare();assert.match(draft.confirmationMessage,/turns on weekly reports/);await execute(draft);assert.equal(enabled,true)
})
await check('same-period ready or locked report is reused and never fabricated as generated/unlocked',async()=>{
 existing={id:'existing-owned-report',status:'READY'};credits=0
 const draft=await prepare(),ready=await execute(draft);assert.equal(ready.reportId,'existing-owned-report');assert.equal(ready.reportStatus,'READY');assert.equal(ready.generated,false)
 existing.status='LOCKED';const locked=await execute(await prepare());assert.equal(locked.reportStatus,'LOCKED');assert.match(locked.message,/locked/);assert.equal(locked.unlocked,false)
})
await check('access/period changes, lost consent and altered signature refuse before generation',async()=>{
 const draft=await prepare();consent=false;await assert.rejects(()=>execute(draft),/allow AI/);consent=true;enabled=false;await assert.rejects(()=>execute(draft),/changed/);enabled=true
 await assert.rejects(()=>execute({...draft,summary:'tampered'}),/review/);assert.equal(posts,0)
})
await check('reviewed existing report identity and state cannot turn reuse into a new charged run',async()=>{
 existing={id:'reviewed-ready',status:'READY'};const draft=await prepare()
 existing={id:'reviewed-ready',status:'FAILED'};await assert.rejects(()=>execute(draft),/changed/)
 existing={id:'replacement-ready',status:'READY'};await assert.rejects(()=>execute(draft),/changed/)
 existing=null;await assert.rejects(()=>execute(draft),/changed/);assert.equal(posts,0)
})
await check('ordinary reading questions and arbitrary report/user payloads cannot become generation',async()=>{
 await assert.rejects(()=>helper.prepareVoiceReportAction(request,user,{action:'reports.weekly.generate',values:{}},'Show my report','2026-10-17'),/explicitly ask/)
 await assert.rejects(()=>helper.prepareVoiceReportAction(request,user,{action:'reports.weekly.generate',values:{userId:'other-user'}},'Create weekly report','2026-10-17'),/normal weekly/)
 assert.equal(posts,0)
})
await check('skipped/unverified/foreign report identity is never completion proof',async()=>{
 const draft=await prepare()
 const access={userId:user,email:account.email,aiConsent:true,healthSetupComplete:true,reportsEnabled:true,availableCredits:credits,existingReport:null,periodStart:draft.reportAction.periodStart,periodEnd:draft.reportAction.periodEnd}
 await assert.rejects(()=>helper.executeVoiceReportAction(request,user,draft,{receiptClaimed:true,actionId:'test'},{access:async()=>access,run:async()=>({status:'skipped',reason:'not_due'}),report:async()=>null}),/not_due/)
 await assert.rejects(()=>helper.executeVoiceReportAction(request,user,draft,{receiptClaimed:true,actionId:'test'},{access:async()=>access,run:async()=>({status:'ready',reportId:'foreign'}),report:async()=>null}),/not confirmed/)
})
console.log(`Voice report actions: ${count} actual-source offline groups passed; normal provider boundary simulated, no real generation/credits.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
