#!/usr/bin/env node
'use strict'
// Actual registry/runtime, structured clinical adapter/helper and normal
// analysis/chat/history handlers. Provider, storage, credits and auth are
// synthetic. No app bootstrap, real data, environment, key or network access.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript'), crypto=require('node:crypto')
const fixture=require('./voice-symptom-analysis-check.cjs'),root=path.resolve(__dirname,'..'),modules=new Map(),clone=value=>JSON.parse(JSON.stringify(value))
function load(name){
 if(modules.has(name))return modules.get(name)
 assert(['native-assistant-registry','native-assistant-runtime'].includes(name))
 const exports={},code=ts.transpileModule(fs.readFileSync(path.join(root,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('exports','require',code)(exports,id=>{if(id==='crypto')return crypto;if(id==='./native-assistant-registry')return load('native-assistant-registry');throw Error('Forbidden dependency '+id)});modules.set(name,exports);return exports
}
const {createAssistantRegistry,validateAssistantValue,AssistantContractError}=load('native-assistant-registry'),{createAssistantRuntime}=load('native-assistant-runtime')
function setup(extra={}){
 const f=fixture.setup();fixture.base.AuditDate.setNow(Date.UTC(2026,9,16,14,0,0))
 const adapter=fixture.base.load('lib/native-assistant-clinical-actions.ts',{...f.helper,validateAssistantValue,AssistantContractError})
 const ctx=()=>({actorId:fixture.owner,localDate:'2026-10-17',capabilities:['symptom-analysis-v1']}),services={requestForContext:()=>f.request(),trustedTimeZone:()=> 'Australia/Melbourne'}
 const registry=createAssistantRegistry(adapter.createAssistantClinicalOperations(services));let state=null,tail=Promise.resolve()
 const store={async runExclusive(actor,id,work){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before;try{return await work(state&&clone(state),async value=>{assert.equal(value.actorId,actor);assert.equal(value.id,id);state=clone(value)})}finally{release()}}}
 const runtime=createAssistantRuntime({registry,store,authorize:async()=>{},...extra}),handle=(command,context=ctx())=>runtime.handle(context,'clinical-synthetic-plan',command)
 const prepare=(operation,values,context=ctx())=>registry.get(operation).prepare(context,values)
 const execute=(operation,prepared,actionId='synthetic-durable-claim',context=ctx())=>registry.get(operation).execute(context,prepared,{receiptClaimed:true,actionId})
 return{...f,legacyExecute:f.execute,ctx,registry,runtime,handle,prepare,execute,state:()=>clone(state),clock:{localDate:'2026-10-17',timeZone:'Australia/Melbourne'}}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('fixed strict registry uses direct structured values and prepares without any metered call',async()=>{
  const f=setup(),values={symptoms:['headache'],duration:'two hours',notes:'Literal note: do not rewrite this.'},prepared=await f.prepare('symptoms.analyze',values)
  assert.deepEqual(f.registry.ids(),['symptoms.history.list','symptoms.history.detail','symptoms.analyze','symptoms.follow_up']);assert.equal(prepared.cost.kind,'metered');assert.equal(prepared.cost.maximumCredits,1);assert.equal(prepared.data.draft.transcript,'');assert.deepEqual(clone(prepared.data.draft.clinicalAction.values),values);assert.equal(f.providers.length,0);assert.equal(f.effects.length,0)
  for(const key of ['ownerId','endpoint','analysisData','timeZone'])await assert.rejects(()=>f.prepare('symptoms.analyze',{...values,[key]:'untrusted'}));assert.equal(f.providers.length,0)
 })
 await check('runtime refuses all metered clinical execution without separate spending approval',async()=>{
  const f=setup(),review=await f.handle({type:'plan',steps:[{id:'analyze',operation:'symptoms.analyze',values:{symptoms:['headache']}}]})
  await assert.rejects(()=>f.handle({type:'confirm',reviewId:review.steps[0].reviewId}),error=>error.code==='spending_not_approved');assert.equal(f.providers.length,0);assert.equal(f.rows().length,0)
 })
 await check('explicit synthetic spending uses actual normal analysis and exact source history receipt once',async()=>{
  const f=setup({spendingAllowed:true}),review=await f.handle({type:'plan',steps:[{id:'analyze',operation:'symptoms.analyze',values:{symptoms:['headache'],duration:'two hours',notes:'Exact note'}}]})
  const saved=await f.handle({type:'confirm',reviewId:review.steps[0].reviewId});assert.equal(saved.status,'completed');assert.equal(saved.steps[0].result.analysisId,f.rows()[0].id);assert.equal(saved.steps[0].result.analysis.summary,fixture.generated.summary);assert.equal(saved.steps[0].result.actorId,fixture.owner);assert.equal(f.providers.length,1);assert.equal(f.rows().length,1)
  await f.handle({type:'confirm',reviewId:review.steps[0].reviewId});assert.equal(f.providers.length,1);assert.equal(f.rows().length,1)
 })
 await check('full owned history/detail use trusted local date rather than UTC calendar date',async()=>{
  const f=setup(),saved=await f.execute('symptoms.analyze',await f.prepare('symptoms.analyze',{symptoms:['headache']}));assert.equal(saved.saved,true);assert.match(f.rows()[0].createdAt,/2026-10-16/)
  const read=f.registry.get('symptoms.history.list'),result=await read.read(f.ctx(),{localDate:'2026-10-17'});assert.equal(result.analyses.length,1);assert.equal(await read.verify(f.ctx(),result),true)
  const absent=await read.read(f.ctx(),{localDate:'2026-10-16'});assert.equal(absent.analyses.length,0)
  const detail=await f.registry.get('symptoms.history.detail').read(f.ctx(),{analysisId:saved.analysisId});assert.equal(detail.analyses[0].analysis.summary,fixture.generated.summary);await assert.rejects(()=>read.read(f.ctx(),{analysisId:'foreign'}))
 })
 await check('normal eligible free use stays normal and does not invent a zero-cost entitlement',async()=>{
  const f=setup();f.setPremium(false);f.setFree(true);const prepared=await f.prepare('symptoms.analyze',{symptoms:['headache']});assert.equal(prepared.cost.maximumCredits,1)
  const result=await f.execute('symptoms.analyze',prepared);assert.equal(result.saved,true);assert.equal(result.coveredByFreeUse,true);assert.equal(result.chargedCredits,0);assert.equal(f.charges.length,0)
 })
 await check('generated result with failed history remains full truthful generated_not_saved without another submission',async()=>{
  const f=setup({spendingAllowed:true}),review=await f.handle({type:'plan',steps:[{id:'analyze',operation:'symptoms.analyze',values:{symptoms:['headache']}}]});f.setMode('save-failure')
  const result=await f.handle({type:'confirm',reviewId:review.steps[0].reviewId});assert.equal(result.steps[0].status,'uncertain');assert.equal(result.steps[0].result.status,'generated_not_saved');assert.equal(result.steps[0].result.saved,false);assert.equal(result.steps[0].result.analysis.summary,fixture.generated.summary);assert.equal(f.providers.length,1);assert.equal(f.rows().length,0)
  await assert.rejects(()=>f.handle({type:'confirm',reviewId:review.steps[0].reviewId}));assert.equal(f.providers.length,1)
 })
 await check('account mismatch, consent denial and signed review edits refuse before synthetic provider',async()=>{
  const f=setup(),prepared=await f.prepare('symptoms.analyze',{symptoms:['headache']});f.setNative('foreign');await assert.rejects(()=>f.execute('symptoms.analyze',prepared));assert.equal(f.providers.length,0)
  f.setNative(fixture.owner);f.setConsent(false);await assert.rejects(()=>f.execute('symptoms.analyze',prepared));assert.equal(f.providers.length,0)
  f.setConsent(true);const changed=clone(prepared);changed.data.draft.clinicalAction.values.symptoms=['altered'];await assert.rejects(()=>f.execute('symptoms.analyze',changed));assert.equal(f.providers.length,0)
 })
 await check('timezone changes, midnight and unsupported backdating refuse before analysis generation',async()=>{
  const f=setup(),prepared=await f.prepare('symptoms.analyze',{symptoms:['headache']});await assert.rejects(()=>f.execute('symptoms.analyze',prepared,undefined,{...f.ctx(),localDate:'2026-10-18'}));assert.equal(f.providers.length,0)
  fixture.base.AuditDate.setNow(Date.UTC(2026,9,17,14,0,0));await assert.rejects(()=>f.execute('symptoms.analyze',prepared));assert.equal(f.providers.length,0)
  await assert.rejects(()=>f.prepare('symptoms.analyze',{symptoms:['headache']},{...f.ctx(),localDate:'2026-10-15'}));assert.equal(f.providers.length,0)
 })
 await check('follow-up is structured, exact-source-bound and remains non-executable without enforceable maximum',async()=>{
  const f=setup(),saved=await f.execute('symptoms.analyze',await f.prepare('symptoms.analyze',{symptoms:['headache']})),prepared=await f.prepare('symptoms.follow_up',{analysisId:saved.analysisId,question:'What should I write down?'})
  assert.equal(prepared.cost.maximumCredits,null);assert.equal(prepared.data.draft.transcript,'');assert.equal(prepared.data.draft.clinicalAction.values.question,'What should I write down?');assert(prepared.sourceVersion)
  const before=f.providers.length;await assert.rejects(()=>f.execute('symptoms.follow_up',prepared));assert.equal(f.providers.length,before);assert.equal(f.threads().length,0)
  const misrouted=clone(prepared);misrouted.data.operation='symptoms.analyze';await assert.rejects(()=>f.execute('symptoms.analyze',misrouted));assert.equal(f.providers.length,before)
 })
 await check('changed saved analysis and changed complete conversation are rejected before paid normal chat',async()=>{
  const f=setup(),saved=await f.execute('symptoms.analyze',await f.prepare('symptoms.analyze',{symptoms:['headache']}))
  const created=await f.legacyExecute(await f.follow(saved.analysisId));
  const make=()=>f.helper.prepareStructuredVoiceSymptomAction(f.request(),fixture.owner,{action:'symptoms.follow_up',values:{analysisId:saved.analysisId,threadId:created.threadId,question:'Exact structured question?'}},f.clock)
  const prepared=await make(),before=f.providers.length;f.messages().push({id:'external-message',threadId:created.threadId,role:'user',content:'New actual conversation message',createdAt:new Date(fixture.base.AuditDate.now()).toISOString()})
  await assert.rejects(()=>f.legacyExecute(prepared),/changed/);assert.equal(f.providers.length,before)
  const fresh=await make();f.rows()[0].notes='Changed after review';await assert.rejects(()=>f.legacyExecute(fresh),/changed/);assert.equal(f.providers.length,before)
 })
 await check('normal 60-message truncation cannot masquerade as a complete conversation snapshot',async()=>{
  const f=setup(),saved=await f.execute('symptoms.analyze',await f.prepare('symptoms.analyze',{symptoms:['headache']})),created=await f.legacyExecute(await f.follow(saved.analysisId)),before=f.providers.length
  for(let i=0;i<60;i++)f.messages().push({id:'history-'+i,threadId:created.threadId,role:'user',content:'Synthetic long conversation',createdAt:new Date(fixture.base.AuditDate.now()).toISOString()})
  await assert.rejects(()=>f.prepare('symptoms.follow_up',{analysisId:saved.analysisId,threadId:created.threadId,question:'What should I track?'}),/complete verified snapshot/);assert.equal(f.providers.length,before)
 })
 console.log(`VOICE 2 clinical: ${groups} actual-source offline groups passed. No real provider, credits, health data or account writes.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,run}
