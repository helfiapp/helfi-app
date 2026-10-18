#!/usr/bin/env node
'use strict'
// Actual owned GET, native validator and job delivery. All I/O is synthetic.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),host=require('./voice2-app-host-check.cjs'),jobs=require('./voice-session-jobs-check.cjs')
const clone=value=>JSON.parse(JSON.stringify(value))
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function native(fetch){
 const modules=new Map()
 const load=file=>{if(modules.has(file))return modules.get(file);const m={exports:{}};vm.runInNewContext(compile(file),{module:m,exports:m.exports,fetch,AbortController,setTimeout,clearTimeout,encodeURIComponent,require:name=>{if(name==='../lib/nativeAuthHeaders')return load('native/src/lib/nativeAuthHeaders.ts');if(name==='./generalAssistantSession')return load('native/src/voice/generalAssistantSession.ts');throw Error('Forbidden import '+name)}});modules.set(file,m.exports);return m.exports}
 return load('native/src/voice/voiceOwnedResultRecovery.ts')
}
const request=(view,extra='')=>new Request(`https://synthetic.invalid/api/native/assistant?sessionId=${view.id}&localDate=2026-10-17&timeZone=Australia%2FMelbourne&revision=${view.revision}${extra}`,{headers:{'x-helfi-voice-capabilities':'general-assistant-v1'}})
const io=view=>({baseUrl:'https://synthetic.invalid',token:'synthetic-token',accountId:'owner',sessionId:view.id,pointer:{id:view.id,actorId:'owner',revision:view.revision},localDate:'2026-10-17',timeZone:'Australia/Melbourne',isCurrent:()=>true})
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function main(){
 await check('actual protected native callback checks a lost reply without an alert or command retry',async()=>{
  const client=require('./voice-client-integrity-check.cjs'),alerts=[],activity=[]
  const result=await client.draftRequest('Synthetic meal request',null,true,{draft:null,Alert:{alert:(...args)=>alerts.push(args)},addVoiceActivity:text=>activity.push(text),fetchNativeVoiceAssistant:async()=>{throw Error('Synthetic Network request failed')},requestOptions:{realtimeActionHint:{action:'assistant_plan',assistantCommand:{type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content:'Literal synthetic note',localDate:'2026-10-17'}}]}}}})
  assert.equal(result.result.ok,false);assert.equal(result.result.saved,false);assert.equal(result.saveOptions.length,0);assert.equal(alerts.length,0);assert(activity.includes('Checking the existing result'))
 })
 await check('actual native recovery callback restores only a current account and run',async()=>{
  const client=require('./voice-client-integrity-check.cjs'),f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),drafts=[],effects=[],box=client.baseBox();let callbacks,reads=0
  Object.assign(box,{API_BASE_URL:'https://synthetic.invalid',voiceMemoryUserId:'owner',voiceAccountUserIdRef:{current:'owner'},generalAssistantSessionRef:{current:prepared.assistant.id},liveVoiceEnabled:true,voiceRecordingSupported:true,checkingRealtimeVoice:false,realtimeVoiceAvailable:true,realtimeVoiceError:'',hasNativeRealtimeVoiceSupport:()=>true,requestAiDataSharingPermission:async()=>true,
   readOwnedVoiceResult:async()=>{reads++;return prepared},acceptGeneralAssistantResponse:data=>({draft:data.draft,needsReview:true,message:data.draft.confirmationMessage}),setDraft:value=>drafts.push(value),emitGeneralAssistantEffects:value=>effects.push(value),
   startHelfiRealtimeVoiceSession:async params=>{callbacks=params.callbacks;params.callbacks.onStatus('live');return{stop:async()=>{},setMicrophoneMuted:()=>{},promptAssistant:()=>{},flushTranscript:()=>{}}}})
  client.evaluate(box,`globalThis.start = ${client.callback('startVoiceSession')}`);await box.start()
  const recovery={transportRecovery:{status:'verified_owned_result'},assistantContext:{id:prepared.assistant.id,actorId:'owner',revision:prepared.assistant.revision}}
  await callbacks.onActionRecovery(recovery);assert.equal(reads,1);assert.equal(drafts.length,1);assert.equal(effects.length,1);assert.equal(box.pendingReviewAnswerRef.current,true)
  box.voiceAccountTokenRef.current='new-account-token';await callbacks.onActionRecovery(recovery);assert.equal(reads,1);assert.equal(drafts.length,1)
 })
 await check('actual owned snapshot restores the signed review without planning or saving',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),before=f.counts()
  const response=await f.route.GET(request(prepared.assistant)),data=await response.json()
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(data.draft.assistantPlan.reviewId,prepared.draft.assistantPlan.reviewId);assert.equal(data.draft.canConfirm,true);assert(data.draft.reviewToken);assert.deepEqual(f.counts(),before)
  const calls=[],client=native(async(url,init)=>{calls.push({url,init});return f.route.GET(new Request(url,init))})
  const restored=await client.readOwnedVoiceResult(io(prepared.assistant));assert(restored);assert.equal(restored.assistant.revision,prepared.assistant.revision);assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);assert.equal(f.counts().postCalls,0);assert.equal(f.counts().plannerCalls,1)
 })
 await check('a committed save is read back without repeating its normal POST',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),saved=await(await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).json(),before=f.counts()
  const result=await(await f.route.GET(request(saved.assistant))).json();assert.equal(result.assistant.status,'completed');assert.equal(result.draft.canConfirm,false);assert.deepEqual(f.counts(),before);assert.equal(f.counts().postCalls,1)
 })
 await check('stale, foreign, malformed and duplicate query versions never restore a review',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),view=prepared.assistant
  assert.equal((await f.route.GET(request({...view,revision:view.revision+1}))).status,409)
  for(const extra of['&actorId=other','&revision=1','&command=confirm'])assert.equal((await f.route.GET(request(view,extra))).status,400)
  f.actor('other');assert.equal((await f.route.GET(request(view))).status,409);f.actor('owner','other');assert.equal((await f.route.GET(request(view))).status,401);assert.equal(f.counts().postCalls,0)
 })
 await check('native retries only the read after a lost response and refuses changed versions/accounts',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),data=clone(prepared);let calls=0
  const client=native(async(_url,init)=>{assert.equal(init.method,'GET');assert.equal(init.body,undefined);if(++calls===1)throw Error('Synthetic -1017');return{ok:true,json:async()=>data}})
  assert(await client.readOwnedVoiceResult(io(data.assistant)));assert.equal(calls,2)
  data.assistant.revision++;assert.equal(await client.readOwnedVoiceResult(io(prepared.assistant)),null)
  const invalid=io(prepared.assistant);invalid.pointer.actorId='other';const before=calls;assert.equal(await client.readOwnedVoiceResult(invalid),null);assert.equal(calls,before)
 })
 await check('End and account changes suppress late owned snapshots',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json();let finish,current=true
  const client=native(()=>new Promise(resolve=>{finish=resolve})),input={...io(prepared.assistant),isCurrent:()=>current},pending=client.readOwnedVoiceResult(input)
  current=false;finish({ok:true,json:async()=>prepared});assert.equal(await pending,null)
  const controller=new AbortController();controller.abort();assert.equal(await client.readOwnedVoiceResult({...io(prepared.assistant),signal:controller.signal}),null)
 })
 await check('lost delivery acknowledgement retries only its result; recovery callback runs once',async()=>{
  let posts=0,recoveries=0;const recovery={transportRecovery:{status:'verified_owned_result'},assistantContext:{id:'assistant_owned',actorId:'owner',revision:2}}
  const f=jobs.setup({onJob:async()=>({ok:false,saved:false}),onRecovery:async result=>{recoveries++;assert.deepEqual(clone(result),recovery)},fetch:async call=>{if(call.method==='GET')return jobs.response({sessionId:'owned_session',state:'ready',jobs:[jobs.job()]});if(++posts===1)throw Error('Synthetic lost acknowledgement');return jobs.response({accepted:true,recovery})}})
  await f.step();await f.step();await f.step();assert.equal(f.effects.length,1);assert.equal(posts,2);assert.equal(recoveries,1);assert.equal(f.errors.length,0);f.run.stop()
 })
 await check('missing-state recovery keeps polling even when optional UI restoration fails',async()=>{
  let callbacks=0;const f=jobs.setup({onJob:async()=>({ok:false}),onRecovery:async()=>{callbacks++;throw Error('Synthetic read failure')},fetch:async call=>jobs.response(call.method==='GET'?{sessionId:'owned_session',state:'ready',jobs:[jobs.job()]}:{accepted:true,recovery:{transportRecovery:{status:'result_not_verified'}}})})
  await f.step();await f.step();assert.equal(f.effects.length,1);assert.equal(callbacks,1);assert.equal(f.errors.length,0);f.run.stop()
 })
 console.log(`Voice owned-result recovery: ${groups} actual-source offline groups passed. No real account, provider, network or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
