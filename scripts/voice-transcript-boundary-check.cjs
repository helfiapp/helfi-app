#!/usr/bin/env node
'use strict'
// Actual worker/boundary source. All clocks, captions, receipts, provider and
// transport boundaries are synthetic. No environment, network, keys or spend.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url')
function clockFixture(module){
 let now=0,active=true;const events=[]
 const boundary=module.createVoiceTranscriptBoundary({now:()=>now,isActive:()=>active,sleep:async ms=>{const target=now+ms;while(events.length&&events[0].at<=target){const event=events.shift();now=event.at;event.work()}now=target}})
 const at=(when,work)=>{events.push({at:when,work});events.sort((a,b)=>a.at-b.at)}
 const add=(text,start_ms,end_ms,speaker='user')=>boundary.add({speaker,text,start_ms,end_ms})
 return{boundary,add,at,now:()=>now,stop:()=>{active=false},settle:id=>boundary.settle(id,20000)}
}
async function workerFixture(module,{ambiguous=false}={}){
 let now=1000000,receive,tailAdded=false,nextAdded=false;const sent=[],backend=[],callbacks=[],enqueued=[]
 const job={sessionId:'offline-session',controlToken:'offline-scoped-token-not-real',appOrigin:'https://offline.invalid',expiresAtMs:now+720000},start=now
 const pricing={scale:'60000000000',voiceUnitsPerSecond:'50000000',inputUnitsPerToken:'6000',cachedInputUnitsPerToken:'600',cacheWriteUnitsPerToken:'7500',outputUnitsPerToken:'30000',longInputUnitsPerToken:'12000',longCachedInputUnitsPerToken:'1200',longCacheWriteUnitsPerToken:'15000',longOutputUnitsPerToken:'45000'}
 const config={claimed:true,leaseToken:'offline-lease',providerKey:'offline-placeholder-not-a-key',providerSessionId:'offline-provider-session',backendModel:'gpt-6-luna',instructions:'Use the exact human captions and normal app results.',tools:[{type:'function',name:'request_helfi_action',parameters:{type:'object'}}],maxInputBytes:160000,maxOutputTokens:4096,deadlineMs:now+60000,voiceHoldKey:'voice-hold',infrastructureHoldKey:'infra-hold',voiceReservedCostUnits:'9000000000',watchdogReady:true,pricing}
 const caption=(text,start_ms,end_ms,id)=>receive({type:'session.input_transcript.delta',event_id:id,delta:text,start_ms,end_ms})
 const delegate=(id,offset_ms)=>receive({type:'session.delegation.created',event_id:'event-'+id,offset_ms,delegation:{id,target:'client'}})
 const io={now:()=>now,allowOrigin:origin=>origin==='https://offline.invalid',sleep:async ms=>{
  now+=ms
  if(!ambiguous&&!tailAdded&&now-start>=700){tailAdded=true;caption(' plan.',1010,1300,'late-final-word')}
  await new Promise(setImmediate)
 },control:async(_job,command,payload)=>{
  callbacks.push({command,payload:structuredClone(payload)})
  if(command==='attach')return config
  if(command==='ready'){
   caption('Stop the current',0,1000,'human-first');delegate('first',1001)
   if(ambiguous){caption(' Yes',1200,1500,'nearby-yes');delegate('second',1501)}
  }
  if(command==='enqueue-tool'){enqueued.push(payload);return{allowed:true,jobId:payload.callId}}
  if(command==='poll-tools')return{results:payload.callIds.map(callId=>({callId,status:'completed',result:{ok:true,saved:false,safeToClaimSaved:false,spokenReply:'The normal app returned a verified result.'}}))}
  if(command==='complete')return{allowed:true,state:'complete'}
  return{allowed:true}
 },connect:async(_config,onEvent)=>{receive=onEvent;return{send:event=>{
  sent.push(structuredClone(event))
  if(event.type==='session.close')receive({type:'session.closed',session:{id:config.providerSessionId},usage:{seconds:30},reason:'close_requested'})
  if(!ambiguous&&!nextAdded&&event.type==='session.commentary.append'&&event.delegation_id==='first'){
   nextAdded=true;caption('Prepare a meal. Do not save it yet.',3000,6000,'human-second');delegate('second',6001)
  }
 },close:()=>{}}},respond:async(_config,body)=>{
  backend.push(structuredClone(body));const number=backend.length
  const output=number%2===1?[{type:'function_call',call_id:'call-'+number,name:'request_helfi_action',arguments:JSON.stringify({request:'Actual current request',action:'assistant_plan',needsReview:true,assistantCommand:{type:'advance'}})}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Use the verified normal result.'}]}]
  return{id:'response-'+number,model:'gpt-6-luna',status:'completed',output,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,cache_write_tokens:10}}}
 }}
 const result=await module.createVoiceSessionWorker(io).monitor(job)
 return{result,sent,backend,callbacks,enqueued}
}
let groups=0;async function check(name,work){await work();groups++;console.log('PASS '+name)}
async function main(){
 const module=await import(pathToFileURL(path.resolve(__dirname,'../services/voice-session-worker/index.mjs')).href)
 await check('a delayed final word starting after delegation offset stays in the first command and never leads the next',async()=>{
  const f=clockFixture(module);f.add('Stop the current',0,1000);f.boundary.register('first',1001)
  f.at(1400,()=>f.add(' plan.',1010,1300));const first=await f.settle('first')
  assert.equal(first.ok,true);assert.equal(first.actualHumanText,'Stop the current plan.');assert(f.now()>=2400)
  f.add('Prepare a meal. Do not save it yet.',3000,6000);f.boundary.register('second',6001)
  const second=await f.settle('second');assert.equal(second.actualHumanText,'Prepare a meal. Do not save it yet.')
  assert(!second.actualHumanText.startsWith('plan'));assert.equal(second.snapshot.filter(row=>row.text===' plan.').length,1)
 })
 await check('an offset-straddling fragment is retained whole rather than split or reused',async()=>{
  const f=clockFixture(module);f.add('Keep the exact ',0,700);f.boundary.register('first',1000)
  f.at(600,()=>f.add('last words.',700,1300));const first=await f.settle('first')
  assert.equal(first.actualHumanText,'Keep the exact last words.');assert.equal(first.snapshot.at(-1).end_ms,1300)
  f.add('Next request.',3000,3500);f.boundary.register('second',3501);assert.equal((await f.settle('second')).actualHumanText,'Next request.')
 })
 await check('clearly separate queued human turns stay separate even before the first request is processed',async()=>{
  const f=clockFixture(module);f.add('Read my water.',0,1000);f.boundary.register('first',1001);f.add('No',2500,3000);f.boundary.register('second',3001)
  const first=await f.settle('first'),second=await f.settle('second')
  assert.equal(first.actualHumanText,'Read my water.');assert(!JSON.stringify(first.snapshot).includes('No'));assert.equal(second.actualHumanText,'No')
 })
 await check('a nearby queued Yes or No cannot be borrowed across an ambiguous caption boundary',async()=>{
  for(const answer of['Yes','No']){
   const f=clockFixture(module);f.add('Prepare the note.',0,1000);f.boundary.register('first',1001);f.add(' '+answer,1200,1500);f.boundary.register('second',1501)
   const first=await f.settle('first'),second=await f.settle('second')
   assert.equal(first.ok,false);assert.equal(first.reason,'transcript_ownership_ambiguous');assert.equal(second.ok,false)
  }
 })
 await check('unclaimed late old captions stay quarantined rather than authorizing a later turn',async()=>{
  const f=clockFixture(module);f.add('Read the note.',0,1000);f.boundary.register('first',1001);await f.settle('first')
  f.add(' old tail',1005,1250);f.add('No',3000,3500);f.boundary.register('second',3501)
  const next=await f.settle('second');assert.equal(next.actualHumanText,'No');assert(!JSON.stringify(next.snapshot).includes('old tail'))
 })
 await check('delivery order spaces and repeated words survive without fabricated word timestamps',async()=>{
  const f=clockFixture(module);f.add('very ',0,300);f.add('very ',300,600);f.add('clear.',600,1200);f.boundary.register('first',1000)
  const result=await f.settle('first');assert.equal(result.actualHumanText,'very very clear.');assert.equal(result.snapshot.length,3)
  assert.deepEqual(result.snapshot.map(row=>[row.start_ms,row.end_ms]),[[0,300],[300,600],[600,1200]])
 })
 await check('missing empty and assistant-only captions fail closed within a bounded wait',async()=>{
  for(const kind of['missing','empty','assistant']){
   const f=clockFixture(module);if(kind!=='missing')f.add(kind==='empty'?'':'Assistant words.',0,1000,kind==='assistant'?'assistant':'user')
   f.boundary.register('first',1001);const result=await f.settle('first');assert.equal(result.ok,false);assert(f.now()<=4500)
  }
 })
 await check('continuous changing captions reach the hard bound without sending a truncated command',async()=>{
  const f=clockFixture(module);f.add('A',0,500);f.boundary.register('first',501)
  for(let at=500;at<=4500;at+=500)f.at(at,()=>f.add(' x',at,at+500))
  const result=await f.settle('first');assert.equal(result.ok,false);assert.equal(f.now(),4500)
 })
 await check('End or the reserved deadline prevents a pending capture from becoming an app command',async()=>{
  const stopped=clockFixture(module);stopped.add('Pending speech.',0,1000);stopped.boundary.register('first',1001);stopped.at(500,stopped.stop)
  assert.equal((await stopped.settle('first')).reason,'transcript_stopped')
  const deadline=clockFixture(module);deadline.add('Pending speech.',0,1000);deadline.boundary.register('first',1001)
  assert.equal((await deadline.boundary.settle('first',500)).ok,false);assert.equal(deadline.now(),500)
 })
 await check('actual worker queues complete stop and subsequent meal captions exactly once each',async()=>{
  const f=await workerFixture(module);assert.equal(f.enqueued.length,2);assert.equal(f.enqueued[0].actualHumanText,'Stop the current plan.')
  assert.equal(f.enqueued[1].actualHumanText,'Prepare a meal. Do not save it yet.');assert.equal(f.backend.length,4)
  assert.equal(f.callbacks.filter(row=>row.command==='reserve').length,4);assert.equal(f.result.financialFinalizationConfirmed,true)
 })
 await check('actual ambiguous queued captions cause no backend reservation or app dispatch and leave voice healthy',async()=>{
  const f=await workerFixture(module,{ambiguous:true});assert.equal(f.enqueued.length,0);assert.equal(f.backend.length,0)
  assert.equal(f.callbacks.filter(row=>row.command==='reserve').length,0)
  const notices=f.sent.filter(row=>row.type==='session.commentary.append');assert.equal(notices.length,2);assert(notices.every(row=>row.content.includes('No app command was submitted')))
  assert.equal(f.result.financialFinalizationConfirmed,true)
 })
 console.log(`Voice transcript boundaries: ${groups} actual-source offline groups passed. Settling is a bounded heuristic, not provider turn-completion proof. No provider, AWS, account, database or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
