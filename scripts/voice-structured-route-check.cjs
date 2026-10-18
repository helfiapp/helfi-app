#!/usr/bin/env node
'use strict'
// Actual direct route, normal host/runtime, normal journal handlers and trace
// formatter. Consent/auth/storage are synthetic. No provider, network or spend.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),appFixture=require('./voice2-app-host-check.cjs'),base=require('./voice-symptom-analysis-check.cjs').base
const json=(body,init={})=>Response.json(body,init)
function setup(){
 const f=appFixture.setup(),logs=[],events=[];let allowed=true,consentChecks=0,handlerCalls=0
 const tracing=base.load('lib/native-voice-action-observability.ts',{crypto,Date:base.AuditDate,Headers,Response,NextResponse:{json},console:{info:(...values)=>logs.push(values)},logAiUsageEvent:async event=>events.push(event)})
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/native/assistant/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
  if(name==='next/server')return{NextRequest:Request,NextResponse:{json}}
  if(name==='@/lib/native-assistant-app')return{...f.app,handleNativeAssistantRequest:async(...values)=>{handlerCalls++;return f.app.handleNativeAssistantRequest(...values)}}
  if(name==='@/lib/ai-consent')return{aiConsentRequiredResponse:async()=>{consentChecks++;return allowed?null:json({error:'AI consent required',code:'ai_consent_required'},{status:403})}}
  if(name==='@/lib/native-voice-action-observability')return tracing
  if(name==='@/lib/native-voice-structured-safety')return base.load('lib/native-voice-structured-safety.ts')
  throw Error('Forbidden route import '+name)
 }})
 const request=body=>new Request(f.request(f.body({channel:'realtime',...body})),{headers:{'content-type':'application/json','x-helfi-voice-capabilities':'general-assistant-v1','x-helfi-voice-action-id':'synthetic-structured-action-123'}})
 return{f,route:module.exports,request,logs,events,consent:value=>{allowed=value},counts:()=>({consentChecks,handlerCalls})}
}
const plan=content=>({type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content,localDate:'2026-10-17'}}]})
let groups=0;async function check(name,work){await work();groups++;console.log('PASS '+name)}
async function main(){
 await check('realtime structured requests preserve explicit and current consent before normal execution',async()=>{
  for(const mode of['missing','revoked']){
   const x=setup();if(mode==='revoked')x.consent(false)
   const response=await x.route.POST(x.request({command:plan('PRIVATE_SYNTHETIC_NOTE'),...(mode==='missing'?{aiConsentGranted:false}:{})}))
   assert.equal(response.status,403);assert.equal(x.counts().handlerCalls,0);assert.equal(x.f.counts().postCalls,0)
   assert.equal(x.f.counts().plannerCalls,0);assert.equal(x.f.counts().providerCalls,0)
   assert.equal(x.logs.length,1);assert.equal(x.events.length,0)
   assert(!JSON.stringify(x.logs).includes('PRIVATE_SYNTHETIC_NOTE'))
  }
 })
 await check('structured reads use the actual normal host with no planner or additional charge',async()=>{
  const x=setup(),response=await x.route.POST(x.request({command:{type:'plan',steps:[{id:'read',operation:'food.day_context.read',values:{}}]}})),body=await response.json()
  assert.equal(response.status,200);assert.equal(body.success,true);assert.equal(body.assistant.actorId,'owner');assert.equal(body.assistant.status,'completed')
  assert.equal(body.chargedCredits,0);assert.equal(x.f.counts().providerCalls,0);assert.equal(x.f.counts().plannerCalls,0);assert.equal(x.f.counts().postCalls,0)
  assert.equal(x.events.length,1);assert.equal(x.events[0].userId,'owner');assert.equal(x.events[0].costCents,0)
  assert.equal(body.voiceActionRunId,'synthetic-structured-action-123')
 })
 await check('structured preparation and exact reviewed confirmation preserve the normal save receipt once',async()=>{
  const x=setup(),response=await x.route.POST(x.request({text:'PRIVATE_SYNTHETIC_SPEECH',command:plan('PRIVATE_SYNTHETIC_NOTE')})),prepared=await response.json()
  assert.equal(response.status,200);assert.equal(prepared.draft.canConfirm,true);assert.equal(x.f.counts().postCalls,0);assert.equal(prepared.chargedCredits,0)
  assert(base.tokens.verifyNativeVoiceDraft('owner',prepared.draft))
  const confirmed=await x.route.POST(x.request({text:'Yes',command:{type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId}})),saved=await confirmed.json()
  assert.equal(confirmed.status,200);assert.equal(saved.assistant.status,'completed');assert.equal(saved.assistant.steps[0].confirmedReviewId,prepared.draft.assistantPlan.reviewId)
  assert.equal(x.f.entries[0].content,'PRIVATE_SYNTHETIC_NOTE');assert.equal(x.f.counts().postCalls,1);assert.equal(saved.chargedCredits,0)
  assert.equal(x.f.counts().plannerCalls,0);assert.equal(x.f.counts().providerCalls,0)
  const duplicate=await x.route.POST(x.request({text:'Yes',command:{type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId}}))
  assert.equal(duplicate.status,400,'A repeated spoken Yes must not authorize another action');assert.equal(x.f.counts().postCalls,1)
  assert.equal(x.logs.length,3);assert.equal(x.events.length,2)
  for(const event of x.events){assert.equal(event.costCents,0);assert.equal(event.model,'helfi-app-action');assert.equal(event.userId,'owner')}
  const serialized=JSON.stringify({logs:x.logs,events:x.events});assert(!serialized.includes('PRIVATE_SYNTHETIC'));assert(!serialized.includes(prepared.draft.reviewToken))
  const first=JSON.parse(x.logs[0][1]);assert.equal(first.status,'needs_review');assert.equal(first.action,'assistant_plan')
 })
 await check('the existing normal actor and exact review authorization cannot be bypassed through direct routing',async()=>{
  const x=setup(),prepared=await(await x.route.POST(x.request({command:plan('Private owned note.')}))).json()
  const wrong=await x.route.POST(x.request({text:'Yes',command:{type:'confirm',reviewId:'foreign-review'}}));assert.equal(wrong.status,400);assert.equal(x.f.counts().postCalls,0)
  x.f.actor('owner','other');const foreign=await x.route.POST(x.request({text:'Yes',command:{type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId}}))
  assert.equal(foreign.status,401);assert.equal(x.f.counts().postCalls,0);assert.equal(x.events.length,1,'Only the actual successful owned response supplies a trace user ID')
  assert.equal(x.f.counts().plannerCalls,0);assert.equal(x.f.counts().providerCalls,0)
 })
 await check('typed manual reviewed controls retain their established behavior without a new AI-consent gate',async()=>{
  const x=setup(),prepared=await(await x.f.app.handleNativeAssistantRequest(x.f.request(x.f.body({text:'Manual control compatibility.'})),x.f.planner)).json()
  x.consent(false)
  const response=await x.route.POST(x.request({channel:'typed',text:'',command:{type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId},controlId:'confirm:'+prepared.draft.assistantPlan.reviewId,aiConsentGranted:false}))
  assert.equal(response.status,200);assert.equal(x.f.counts().postCalls,1);assert.equal(x.counts().consentChecks,0);assert.equal(x.logs.length,0)
 })
 await check('pure structured safety helper exactly matches the old source for risk ordinary and quoted inputs',async()=>{
  const x=setup(),safety=base.load('lib/native-voice-structured-safety.ts')
  const samples=[undefined,null,false,0,42,'','Prepare two fried eggs.','Yes','Discard the current draft.','I have a headache.','I want to die','I WANT TO DIE','I am suicidal','self harm','self-harm','selfharm',"I can't go on","I cant go on","I don't want to live",'I do not want to live','I am hurting myself','I am harming myself','End my life','I wish I was dead','The quote says "kill myself".','Please record the words "suicide prevention".','My arm hurts after exercise.','I do not want to dye my hair.','suicidality','self--harm','want\nto die','hurt myself yesterday']
  for(const sample of samples){
   const expected=x.f.voice.hasSelfHarmRisk(sample),message=safety.structuredVoiceSafetyMessage(sample)
   assert.equal(message!==undefined,expected,JSON.stringify(sample))
   if(expected)assert.equal(message,x.f.voice.buildSelfHarmSupportDraft(String(sample),'2026-10-17').confirmationMessage)
  }
 })
 await check('matching safety text prevents both a new structured action and a pending reviewed save without AI',async()=>{
  const safety=base.load('lib/native-voice-structured-safety.ts'),speech='I want to die'
  for(const existingReview of[false,true]){
   const x=setup();let command=plan('PRIVATE_SYNTHETIC_IGNORED_ACTION')
   if(existingReview){const prepared=await(await x.route.POST(x.request({command:plan('PRIVATE_SYNTHETIC_UNSAVED_NOTE')}))).json();command={type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId}}
   const response=await x.route.POST(x.request({text:speech,command})),body=await response.json()
   assert.equal(response.status,200);assert.equal(body.draft.confirmationMessage,safety.structuredVoiceSafetyMessage(speech))
   assert.equal(body.draft.canConfirm,false);assert.equal(body.chargedCredits,0);assert.equal(x.f.counts().postCalls,0)
   assert.equal(x.f.counts().plannerCalls,0);assert.equal(x.f.counts().providerCalls,0)
   if(existingReview){assert.equal(body.assistant.status,'stopped');assert(body.assistant.steps.every(row=>row.status==='cancelled'))}
   else assert.equal(body.assistant,null)
   assert(!JSON.stringify({logs:x.logs,events:x.events}).includes(speech));assert(!JSON.stringify(x.logs).includes('PRIVATE_SYNTHETIC'))
  }
 })
 console.log(`Voice structured direct route: ${groups} actual-source offline groups passed. No real auth, database, network, provider or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
