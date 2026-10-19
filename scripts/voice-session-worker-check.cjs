#!/usr/bin/env node
'use strict'
// Real worker source, injected clock/transport/app callback. NEVER import the
// production handler's provider adapters or read environment/credentials.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url')
const tick=()=>new Promise(setImmediate)
let workerModule
const pricing={scale:'60000000000',voiceUnitsPerSecond:'50000000',inputUnitsPerToken:'6000',cachedInputUnitsPerToken:'600',cacheWriteUnitsPerToken:'7500',outputUnitsPerToken:'30000',longInputUnitsPerToken:'12000',longCachedInputUnitsPerToken:'1200',longCacheWriteUnitsPerToken:'15000',longOutputUnitsPerToken:'45000'}
function fixture(options={}){
  let now=1000000,receive,lost,responseCount=0,polls=0,stopped=false
  const controlCalls=[],providerCalls=[],sent=[],queued=[],settled=[]
  const job={type:'monitor',sessionId:'owned-synthetic-session',controlToken:'synthetic-scoped-token-only',appOrigin:'https://offline.invalid',expiresAtMs:now+720000}
  const config={claimed:true,leaseToken:'synthetic-fenced-lease',providerKey:'synthetic-provider-placeholder',providerSessionId:'provider-session-one',backendModel:'gpt-6-luna',instructions:'Use actual normal app results. Never claim a save without a verified receipt.',tools:[{type:'function',name:'request_helfi_action',parameters:{type:'object',properties:{},additionalProperties:false}}],maxInputBytes:160000,maxOutputTokens:4096,deadlineMs:now+60000,voiceHoldKey:'voice-owned-hold',infrastructureHoldKey:'infrastructure-owned-hold',voiceReservedCostUnits:'9000000000',watchdogReady:true,pricing,infrastructureAllocationPolicyVersion:'service-overhead-v1',infrastructureAllocationReceiptDigest:'synthetic-allocation-digest',...options.config}
  const emit=event=>receive?.(event)
  const transcript=(text='How much water today?',start=0,end=1000)=>emit({type:'session.input_transcript.delta',event_id:`human-${start}-${text}`,delta:text,start_ms:start,end_ms:end})
  const delegate=(id='delegation-one',offset_ms=1001)=>emit({type:'session.delegation.created',event_id:`delegate-${id}`,offset_ms,delegation:{id,target:'client',type:'delegation'}})
  const response=(output=[],extra={})=>({id:`response-${++responseCount}`,model:'gpt-6-luna',status:'completed',output,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,cache_write_tokens:10}},...extra})
  const io={
    now:()=>now,allowOrigin:origin=>origin==='https://offline.invalid',
    sleep:async ms=>{now+=ms;options.onSleep?.({now,emit,transcript,delegate});await tick()},
    control:async(input,command,payload)=>{
      assert.equal(input.sessionId,job.sessionId);assert.equal(input.controlToken,job.controlToken)
      controlCalls.push({command,payload:JSON.parse(JSON.stringify(payload))})
      if(command==='attach')return options.claimDenied?{claimed:false}:config
      if(command==='watchdog-claim')return options.watchdogHealthy?{closeNeeded:false}:{...config,closeNeeded:true}
      assert.equal(payload.leaseToken,'synthetic-fenced-lease','Every subsequent callback has the exact claimed lease')
      if(command==='ready'){await options.onReady?.({emit,transcript,delegate,config,lost});return {allowed:!options.denyReady}}
      if(command==='reserve')return{allowed:!options.denyReserve}
      if(command==='settle'){settled.push(payload);return{allowed:!options.denySettle}}
      if(command==='enqueue-tool'){queued.push(payload);return{allowed:true,jobId:`tool-${payload.callId}`}}
      if(command==='poll-tools'){
        polls++;return{results:payload.callIds.map(callId=>({callId:options.foreignTool?'foreign-call':callId,status:options.pendingTools&&polls<3?'pending':'completed',result:{ok:true,saved:false,safeToClaimSaved:false,message:'Actual normal water read: 0 mL, goal 2450 mL.'}}))}
      }
      if(command==='heartbeat'&&options.revokeHeartbeat)return{allowed:false}
      if(command==='complete'&&options.failComplete)throw Error('Synthetic receipt persistence unavailable')
      return{allowed:true}
    },
    connect:async(_config,onEvent,onLost)=>{
      assert.equal(_config.providerKey,'synthetic-provider-placeholder');receive=onEvent;lost=onLost
      if(options.connectFailure)throw Error('Synthetic transport failure')
      return{send:event=>{sent.push(event);if(event.type==='session.close'&&!stopped){stopped=true;if(!options.missingFinal)emit({type:'session.closed',session:{id:config.providerSessionId},usage:{seconds:options.finalSeconds??30},reason:'close_requested'})}},close:()=>{stopped=true}}
    },
    respond:async(_config,body,signal)=>{
      assert.equal(signal.aborted,false);assert(controlCalls.some(row=>row.command==='reserve'&&row.payload.key.endsWith(`_${providerCalls.length+1}`)),'Reserve precedes each backend call')
      providerCalls.push(JSON.parse(JSON.stringify(body)))
      if(options.providerFailure)throw Error('Synthetic transport failure with private text')
      if(options.missingUsage)return response([],{usage:{input_tokens:100,output_tokens:10,input_tokens_details:{}}})
      if(options.missingCacheWrite)return response([{type:'message',role:'assistant',content:[{type:'output_text',text:'Actual answer'}]}],{usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20}}})
      if(options.tool&&providerCalls.length===1||options.multipleTools&&providerCalls.length%2===1)return response([{type:'function_call',call_id:options.multipleTools?`exact-tool-call-${providerCalls.length}`:'exact-tool-call',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',assistantCommand:{type:'advance'},request:'Actual request'})}])
      const result=response([{type:'message',role:'assistant',content:[{type:'output_text',text:options.tool?'Invented save claim must not replace the normal result.':'What amount would you like to use?'}]}])
      if(options.afterResponse)options.afterResponse({emit,transcript,delegate,providerCalls})
      return result
    },
  }
  return{worker:workerModule.createVoiceSessionWorker(io),job,config,io,emit,transcript,delegate,sent,queued,settled,controlCalls,providerCalls,completion:()=>controlCalls.filter(row=>row.command==='complete').at(-1)?.payload}
}
let groups=0
async function check(name,fn){await fn();groups++;console.log('PASS '+name)}
function actualControlFixture(options={}){
  const f=require('./voice-session-control-check.cjs').setup(),callbacks=[],sent=[],backend=[],providerSessionId=f.row().providerSessionId
  let receive
  const job={type:'monitor',sessionId:f.row().sessionId,controlToken:f.token,appOrigin:'https://offline.invalid',expiresAtMs:f.clock()+720000}
  const io={now:f.clock,allowOrigin:origin=>origin==='https://offline.invalid',sleep:async ms=>{f.advance(ms);await tick()},
    control:async(_job,command,payload)=>{
      callbacks.push({command,payload:structuredClone(payload)})
      const {leaseToken,...values}=payload
      let result
      try{result=await f.worker(command,values,leaseToken)}catch(error){callbacks.at(-1).error=error.message;throw error}
      if(command==='ready'&&options.delegate){
        receive({type:'session.input_transcript.delta',event_id:'actual-human-one',delta:options.initialHumanText??'How much water have I logged today?',start_ms:0,end_ms:1200})
        receive({type:'session.delegation.created',event_id:'actual-delegation-one',offset_ms:1201,delegation:{id:'actual-delegation',target:'client'}})
      }
      if(command==='settle'&&options.revokeAfterBackend)f.bill.state='UNCERTAIN'
      if(command==='enqueue-tool')await options.onTool?.({f,payload,result})
      return result
    },
    connect:async(config,onEvent)=>{assert.equal(config.providerKey,'fixture-provider-key-not-real');receive=onEvent;return{send:event=>{sent.push(event);if(event.type==='session.close'&&!options.missingFinal)receive({type:'session.closed',session:{id:providerSessionId},usage:{seconds:30},reason:'close_requested'});if(event.type==='session.commentary.append')options.onCommentary?.({receive,event})},close:()=>{}}},
    respond:async(_config,body)=>{
      backend.push(structuredClone(body));if(options.providerFailure)throw Error('Synthetic lost provider response')
      const classifier=body.instructions.startsWith('Independently assess a fresh human reply'),plannerCount=backend.filter(row=>!row.instructions.startsWith('Independently assess a fresh human reply')).length
      const decision={decision:'confirm',directHuman:true,completeTurn:true,quoted:false,historical:false,injected:false,ambiguous:false,conditional:false,correcting:false,mixed:false}
      const output=classifier?[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(decision)}]}]:options.output?.(plannerCount)??[{type:'message',role:'assistant',content:[{type:'output_text',text:'What amount did you drink?'}]}]
      if(!classifier)options.afterResponse?.({receive,body,count:plannerCount})
      return{id:'actual-provider-response-'+backend.length,model:'gpt-6-luna',status:'completed',output,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,...(options.missingCacheWrite?{}:{cache_write_tokens:10})}}}
    },
  }
  return{f,job,io,callbacks,sent,backend,worker:workerModule.createVoiceSessionWorker(io)}
}
async function main(){
  workerModule=await import(pathToFileURL(path.resolve(__dirname,'../services/voice-session-worker/index.mjs')).href)
  await check('module imports without environment provider network SDK or app bootstrap',async()=>{assert.equal(typeof workerModule.handler,'function');assert.equal(typeof workerModule.createVoiceSessionWorker,'function')})
  await check('actual callback adapter binds fixed HTTPS path bearer credential session and lease without provider I/O',async()=>{
    const f=fixture(),previousFetch=globalThis.fetch,captured=[]
    globalThis.fetch=async(url,request)=>{
      assert.equal(url,'https://helfi.ai/api/internal/voice-session-control');assert.equal(request.method,'POST');assert.equal(request.headers.authorization,`Bearer ${f.job.controlToken}`)
      const body=JSON.parse(request.body);captured.push(body);assert.equal(body.sessionId,f.job.sessionId);if(body.command!=='attach')assert.equal(body.leaseToken,f.config.leaseToken)
      return new Response(JSON.stringify(body.command==='attach'?f.config:{allowed:true}),{status:200,headers:{'content-type':'application/json'}})
    }
    try{
      const worker=workerModule.createVoiceSessionWorker({now:f.io.now,sleep:f.io.sleep,connect:f.io.connect,respond:()=>{throw Error('Unexpected inference')}})
      await worker.monitor({...f.job,appOrigin:'https://helfi.ai'});assert.equal(captured[0].command,'attach');assert(captured.some(row=>row.command==='ready'));assert.equal(captured.at(-1).command,'complete');assert(!captured.some(row=>'providerKey'in row))
    }finally{globalThis.fetch=previousFetch}
  })
  await check('scope rejects arbitrary app origin secret header injection and expired monitor jobs before allocation',async()=>{
    const f=fixture();await assert.rejects(()=>f.worker.monitor({...f.job,appOrigin:'https://attacker.invalid'}));await assert.rejects(()=>f.worker.monitor({...f.job,controlToken:'invalid\r\nsecret'}));const r=await f.worker.monitor({...f.job,expiresAtMs:0});assert.equal(r.status,'expired_job');assert.equal(f.controlCalls.length,0)
  })
  await check('duplicate claim creates no transport model request or tool work',async()=>{const f=fixture({claimDenied:true});assert.equal((await f.worker.monitor(f.job)).status,'claim_denied');assert.equal(f.providerCalls.length,0);assert.equal(f.sent.length,0)})
  await check('missing watchdog price drift unsupported model or unreserved deadline refuses before handoff',async()=>{
    for(const config of [{watchdogReady:false},{backendModel:'gpt-6-astra'},{pricing:{...pricing,outputUnitsPerToken:'1'}},{voiceReservedCostUnits:'1'},{maxOutputTokens:4097}]){const f=fixture({config});assert.equal((await f.worker.monitor(f.job)).status,'configuration_refused');assert.equal(f.sent.length,0);assert.equal(f.providerCalls.length,0);assert.equal(f.completion().finalUsageConfirmed,false)}
  })
  await check('independent server clock deadline closes waits final usage and retains cumulative snapshots correctly',async()=>{
    const f=fixture({onReady:({emit})=>{emit({type:'session.usage.updated',usage:{seconds:12}});emit({type:'session.usage.updated',usage:{seconds:15}})}})
    assert.equal((await f.worker.monitor(f.job)).status,'closed');assert.equal(f.sent.filter(e=>e.type==='session.close').length,1);assert.equal(f.completion().seconds,30);assert.equal(f.completion().durationMs,30000);assert(f.controlCalls.some(row=>row.command==='heartbeat'));assert(f.controlCalls.some(row=>row.command==='schedule-watchdog'));assert.equal(f.completion().infrastructureAllocationPolicyVersion,'service-overhead-v1')
    assert.equal(f.completion().reason,'reserved_deadline','A provider close acknowledgement must not erase the app deadline that caused it');assert.equal(f.completion().finalUsageConfirmed,true)
  })
  await check('client delegation uses actual captions reserves every bounded Luna request and settles exact reported counters',async()=>{
    const f=fixture({onReady:({transcript,delegate})=>{transcript();delegate();delegate()}});await f.worker.monitor(f.job)
    assert.equal(f.providerCalls.length,1);const body=f.providerCalls[0];assert.equal(body.model,'gpt-6-luna');assert.equal(body.service_tier,'default');assert.equal(body.store,false);assert.equal(body.max_output_tokens,4096);assert(body.tools.every(tool=>tool.strict===false),'Generic operation fields must not be normalized into a strict fixed schema');assert(!('previous_response_id'in body));assert(JSON.stringify(body.input).includes('How much water today?'));assert.equal(f.settled.length,1);assert.equal(f.settled[0].actualCostUnits,'807000');assert.equal(f.completion().backendUsageConfirmed,true)
    assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,1)
  })
  await check('no backend spend occurs before durable ready acknowledgment or after its rejection',async()=>{
    for(const denyReady of [false,true]){
      const f=fixture({denyReady,onReady:async({transcript,delegate})=>{transcript();delegate();for(let n=0;n<3;n++)await tick();assert.equal(f.providerCalls.length,0,'Ready callback is still pending')}})
      await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,denyReady?0:1);assert.equal(f.sent.filter(e=>e.type==='session.close').length,1)
    }
  })
  await check('delegation metadata alone never fabricates an utterance or calls a backend',async()=>{const f=fixture({onReady:({delegate})=>delegate()});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,0);assert(f.sent.some(e=>e.type==='session.commentary.append'&&e.content.includes('finish saying')))})
  await check('budget denial stops before model inference with no automatic retries',async()=>{const f=fixture({denyReserve:true,onReady:({transcript,delegate})=>{transcript();delegate()}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,0);assert.equal(f.controlCalls.filter(row=>row.command==='reserve').length,1);assert.equal(f.sent.filter(e=>e.type==='session.close').length,1)})
  await check('provider transport or incomplete usage retains reservation and never settles fictional zero',async()=>{
    for(const options of [{providerFailure:true},{missingUsage:true},{denySettle:true}]){const f=fixture({...options,onReady:({transcript,delegate})=>{transcript();delegate()}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,1);assert.equal(f.completion().backendUsageConfirmed,false);if(!options.denySettle)assert.equal(f.settled.length,0);assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,0)}
  })
  await check('missing cache-write detail settles a labelled conservative bound rather than inventing zero',async()=>{
    const f=fixture({missingCacheWrite:true,onReady:({transcript,delegate})=>{transcript();delegate()}});await f.worker.monitor(f.job)
    assert.equal(f.settled.length,1);assert.equal(f.settled[0].actualCostUnits,'912000');assert.equal(f.settled[0].costBasis,'conservative_cache_write_bound');assert.equal(f.settled[0].usage.cacheWriteTokens,null);assert.equal(f.settled[0].usage.cacheWriteTokensMissing,true);assert.equal(f.completion().backendUsageConfirmed,true)
  })
  await check('actual owned native tool lane returns all results and speaks canonical app truth',async()=>{
    const f=fixture({tool:true,pendingTools:true,onReady:({transcript,delegate})=>{transcript();delegate()}});await f.worker.monitor(f.job)
    assert.equal(f.queued.length,1);assert.equal(f.queued[0].callId,'exact-tool-call');assert.equal(f.queued[0].actualHumanText,'How much water today?');assert.equal(f.providerCalls.length,2);assert(f.providerCalls[1].input.some(item=>item.type==='function_call_output'&&item.call_id==='exact-tool-call'));const spoken=f.sent.find(e=>e.type==='session.commentary.append');assert.equal(JSON.parse(spoken.content).speech,'Actual normal water read: 0 mL, goal 2450 mL.');assert.equal(JSON.parse(spoken.content).safeToClaimSaved,false);assert.equal(f.settled.length,2)
  })
  await check('foreign tool result cannot become an answer or repeat an app action',async()=>{const f=fixture({tool:true,foreignTool:true,onReady:({transcript,delegate})=>{transcript();delegate()}});await f.worker.monitor(f.job);assert.equal(f.queued.length,1);assert.equal(f.providerCalls.length,1);assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,0)})
  await check('next delegation receives only new actual human text rather than reusing an older Yes',async()=>{
    const f=fixture({multipleTools:true,onReady:({transcript,delegate})=>{transcript('Yes',0,500);delegate('first',1000)},afterResponse:({transcript,delegate,providerCalls})=>{if(providerCalls.length===2){transcript(' late old Yes',500,900);transcript('No',2000,2500);delegate('second',2501)}}})
    await f.worker.monitor(f.job);assert.equal(f.queued.length,2);assert.equal(f.queued[0].actualHumanText,'Yes');assert.equal(f.queued[1].actualHumanText,'No');assert.equal(f.providerCalls.length,4)
  })
  await check('oversized literal transcript closes without truncation into another paid model request',async()=>{const f=fixture({onReady:({transcript,delegate})=>{transcript('x'.repeat(160001));delegate()}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,0);assert.equal(f.queued.length,0)})
  await check('UTF-8 request bytes are bounded even when character count is much smaller',async()=>{const f=fixture({config:{maxInputBytes:1000},onReady:({transcript,delegate})=>{transcript('界'.repeat(400));delegate()}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,0);assert.equal(f.controlCalls.filter(row=>row.command==='reserve').length,0)})
  await check('eleventh delegation closes before additional paid work',async()=>{const f=fixture({onReady:({transcript,delegate})=>{transcript();for(let n=0;n<11;n++)delegate(`delegation-${n}`,1001+n)}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,0);assert.equal(f.sent.filter(e=>e.type==='session.close').length,1)})
  await check('audio reflection packets do not exhaust the metadata event limit',async()=>{const f=fixture({onReady:({emit,transcript,delegate})=>{for(let n=0;n<5000;n++)emit({type:'session.input_audio.append',audio:'synthetic-reflection'});transcript();delegate()}});await f.worker.monitor(f.job);assert.equal(f.providerCalls.length,1)})
  await check('heartbeat revocation closes and missing final event is truthfully uncertain',async()=>{const f=fixture({revokeHeartbeat:true,missingFinal:true});const r=await f.worker.monitor(f.job);assert.equal(r.status,'finalization_unconfirmed');assert.equal(f.completion().finalUsageConfirmed,false);assert.equal(f.completion().seconds,null)})
  await check('a confirmed provider shutdown never claims financial finalization when receipt persistence failed',async()=>{
    const f=fixture({failComplete:true}),result=await f.worker.monitor(f.job);assert.equal(result.status,'closed');assert.equal(result.finalReceiptRecorded,false);assert.equal(result.financialFinalizationConfirmed,false);assert.equal(f.sent.filter(row=>row.type==='session.close').length,1)
  })
  await check('watchdog does nothing for healthy lease and closes stale provider session without declaring backend usage known',async()=>{
    const healthy=fixture({watchdogHealthy:true});assert.equal((await healthy.worker.watchdog(healthy.job)).status,'no_close_needed');assert.equal(healthy.sent.length,0)
    for(const missingFinal of [false,true]){const f=fixture({missingFinal});await f.worker.watchdog(f.job);assert.equal(f.sent.filter(e=>e.type==='session.close').length,1);assert.equal(f.completion().backendUsageConfirmed,false);assert.equal(f.completion().finalUsageConfirmed,!missingFinal)}
  })
  await check('cost arithmetic uses exact units cache-write reservation and long-context pricing',async()=>{
    assert.equal(workerModule.backendReservation(100,10).toString(),'1050000');assert.equal(workerModule.backendReservation(272001,1).toString(),'4080060000')
    const value=workerModule.backendUsageCost({id:'response',usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,cache_write_tokens:10}}});assert.equal(value.actualCostUnits,'807000')
    assert.throws(()=>workerModule.backendUsageCost({id:'response',usage:{input_tokens:1,output_tokens:1,input_tokens_details:{cached_tokens:2,cache_write_tokens:0}}}))
  })
  await check('actual worker and actual server controls settle every reserved cost and close one owned financial session',async()=>{
    const a=actualControlFixture({delegate:true}),result=await a.worker.monitor(a.job);assert.equal(result.status,'closed');assert.equal(result.finalReceiptRecorded,true);assert.equal(result.financialFinalizationConfirmed,true)
    assert.equal(a.backend.length,1,JSON.stringify(a.callbacks.map(row=>({command:row.command,error:row.error}))));assert.equal(a.f.bill.state,'CLOSED');assert.equal(a.f.row().state,'complete');assert.equal(a.f.calls.keys,1)
    assert.equal(a.f.bill.reservations.length,3);assert(a.f.bill.reservations.every(row=>row.state==='SETTLED'))
    assert.equal(a.f.bill.reservations.find(row=>row.kind==='backend').actualCostUnits,807000n)
    assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.voiceHoldKey).actualCostUnits,1500000000n)
    assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.infrastructureHoldKey).actualCostUnits,3000000000n)
    assert(a.f.calls.queues>=2);assert.equal(a.callbacks.filter(row=>row.command==='complete').length,1)
  })
  await check('actual worker missing cache-write detail agrees with server conservative-cost recomputation',async()=>{
    const a=actualControlFixture({delegate:true,missingCacheWrite:true});await a.worker.monitor(a.job)
    assert.equal(a.f.bill.state,'CLOSED');assert.equal(a.f.bill.reservations.find(row=>row.kind==='backend').actualCostUnits,912000n)
    const settled=a.callbacks.find(row=>row.command==='settle').payload;assert.equal(settled.costBasis,'conservative_cache_write_bound');assert.equal(settled.usage.cacheWriteTokensMissing,true)
  })
  await check('actual worker lost provider response retains its full backend hold through real finalization',async()=>{
    const a=actualControlFixture({delegate:true,providerFailure:true});await a.worker.monitor(a.job)
    assert.equal(a.backend.length,1);assert.equal(a.f.bill.state,'UNCERTAIN');assert.equal(a.f.row().state,'uncertain')
    assert.equal(a.f.bill.reservations.find(row=>row.kind==='backend').state,'PENDING');assert.equal(a.callbacks.filter(row=>row.command==='settle').length,0)
    assert.equal(a.callbacks.find(row=>row.command==='complete').payload.backendUsageConfirmed,false)
  })
  await check('actual watchdog rotates an expired lease and finalizes server-proven zero backend usage',async()=>{
    const a=actualControlFixture(),old=await a.f.attach();a.f.advance(36000)
    assert.equal((await a.worker.watchdog(a.job)).status,'voice_closed_backend_uncertain')
    assert.equal(a.f.row().state,'complete');assert.equal(a.f.bill.state,'CLOSED');assert.equal(a.f.bill.finalUsageConfirmed,true);assert.equal(a.f.bill.reservations.filter(row=>row.kind==='backend').length,0);assert.equal(a.f.row().toolJobs.receipts.length,0);assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.voiceHoldKey).state,'SETTLED')
    assert.equal(a.callbacks.find(row=>row.command==='complete').payload.backendResponseIds.length,0)
    await assert.rejects(()=>a.f.worker('heartbeat',{},old.leaseToken));assert.equal(a.sent.filter(row=>row.type==='session.close').length,1)
  })
  await check('actual financial revocation forces monitor close at next server heartbeat',async()=>{
    const a=actualControlFixture({delegate:true,revokeAfterBackend:true});await a.worker.monitor(a.job)
    assert.equal(a.backend.length,1);assert.equal(a.sent.filter(row=>row.type==='session.close').length,1)
    assert(a.callbacks.some(row=>row.command==='heartbeat'));assert(!a.callbacks.some(row=>row.command==='schedule-watchdog'))
  })
  await check('actual watchdog keeps an independent retry alive when monitor dies before its first heartbeat',async()=>{
    const a=actualControlFixture();await a.f.attach();const initialQueues=a.f.calls.queues;a.f.advance(30000)
    assert.equal((await a.worker.watchdog(a.job)).status,'no_close_needed');assert.equal(a.f.calls.queues,initialQueues+1);assert.equal(a.sent.length,0)
    a.f.advance(30000);assert.equal((await a.worker.watchdog(a.job)).status,'voice_closed_backend_uncertain');assert.equal(a.sent.filter(row=>row.type==='session.close').length,1)
    assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.voiceHoldKey).state,'SETTLED')
  })
  await check('actual failed close keeps voice funds reserved and a later watchdog can retry confirmed final usage',async()=>{
    const options={missingFinal:true,delegate:true,providerFailure:true},a=actualControlFixture(options);await a.worker.monitor(a.job)
    assert.equal(a.backend.length,1);assert.equal(a.f.bill.reservations.find(row=>row.kind==='backend').state,'PENDING')
    assert.equal(a.f.row().toolJobs.completion.finalUsageConfirmed,false);assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.voiceHoldKey).state,'PENDING')
    a.f.advance(36000);options.missingFinal=false;assert.equal((await a.worker.watchdog(a.job)).status,'voice_closed_backend_uncertain')
    assert.equal(a.f.row().toolJobs.completion.finalUsageConfirmed,true);assert.equal(a.f.bill.reservations.find(row=>row.key===a.f.config.voiceHoldKey).state,'SETTLED')
    assert.equal((await a.worker.watchdog(a.job)).status,'no_close_needed');assert.equal(a.f.bill.state,'UNCERTAIN');assert.equal(a.f.bill.reservations.find(row=>row.kind==='backend').state,'PENDING')
  })
  await check('queued later human speech never authorizes an earlier delegation and prior canonical results survive turns',async()=>{
    const f=fixture({multipleTools:true,onReady:({transcript,delegate})=>{transcript('Read my water.',0,1000);delegate('first-turn',1001);transcript('Yes',2000,2500);delegate('second-turn',2501)}})
    await f.worker.monitor(f.job);assert.equal(f.queued.length,2);assert.equal(f.queued[0].actualHumanText,'Read my water.');assert.equal(f.queued[1].actualHumanText,'Yes')
    const first=JSON.parse(f.providerCalls[0].input[0].content);assert.equal(first.actualHumanText,'Read my water.');assert(!JSON.stringify(first).includes('Yes'))
    assert(f.providerCalls[2].input.some(item=>item.type==='function_call_output'),'Next human turn retains server-canonical tool state')
  })
  await check('actual worker control and normal journal host prepare then use fresh owned review on a separate Yes and save once',async()=>{
   for(const {multiple,fallback} of [{multiple:false,fallback:false},{multiple:true,fallback:false},{multiple:false,fallback:true}]){
    const app=require('./voice2-app-host-check.cjs').setup(),literal='Keep this exact offline journal note.',plan={type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content:literal,localDate:'2026-10-17'}}]}
    const confirmation=fallback?'Yes save this note':'Yes'
    let reviewId,latestView,toolCount=0
    const output=count=>count===1?[{type:'function_call',call_id:'prepare_note',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',needsReview:true,request:literal,assistantCommand:plan})},...(multiple?[{type:'function_call',call_id:'refine_note',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',needsReview:true,request:literal,assistantCommand:{type:'correct',stepId:'note',values:{content:literal}}})}]:[])]:count===2?[{type:'function_call',call_id:'confirm_note',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',needsReview:true,request:'Yes',assistantCommand:{type:'confirm',reviewId}})}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'This invented model wording must not replace the exact verified normal app result.'}]}]
    let confirmationSent=false
    const a=actualControlFixture({delegate:true,initialHumanText:literal,output,
      onCommentary:({receive})=>{if(confirmationSent)return;confirmationSent=true;assert.equal(app.counts().postCalls,0);receive({type:'session.input_transcript.delta',event_id:'confirm-human',delta:confirmation,start_ms:2000,end_ms:2400});if(!fallback)receive({type:'session.delegation.created',event_id:'confirm-delegation',offset_ms:2401,delegation:{id:'confirm-delegation',target:'client'}})},
      afterResponse:({body,count})=>{if(count===2)assert(JSON.stringify(body.input).includes(reviewId),'Exact fresh review ID must come from prior server-canonical tool result')},
      onTool:async({f,payload})=>{
        toolCount++;assert.equal(payload.actualHumanText,toolCount<=(multiple?2:1)?literal:confirmation)
        if(fallback&&toolCount===2)assert(payload.reviewFence,'Missing delegation confirmation must carry the exact owned review fence')
        require('./voice-symptom-analysis-check.cjs').base.AuditDate.setNow(f.clock())
        app.db.db.voiceSessionRuntime.findMany=async()=>[f.row()]
        const inbox=await f.control.nativeRead('owner','billing-session');assert.equal(inbox.jobs.length,1);assert.equal(inbox.jobs[0].args.request,payload.actualHumanText)
        const response=await app.app.handleNativeAssistantRequest(app.request(app.body({channel:'realtime',text:payload.actualHumanText,command:inbox.jobs[0].args.assistantCommand})),app.planner),result=await response.json()
        assert.equal(response.status,200);latestView=result.assistant;if(toolCount<=(multiple?2:1)){reviewId=result.draft.assistantPlan.reviewId;assert(reviewId);assert.equal(app.counts().postCalls,0)}
        const persistence=app.load('native-assistant-session-store').createPrismaAssistantSessionStore(app.db.db),assembly=app.app.createNativeAssistantApp(app.request(app.body()),'Australia/Melbourne')
        f.state({session:await persistence.readSession('owner','app-owned-session'),turns:await persistence.conversation.read('owner','app-owned-session'),view:await assembly.host.snapshot({actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']},'app-owned-session')})
        await f.control.nativeResult({},'owner',{sessionId:'billing-session',callId:payload.callId,result:{saved:true,message:'Untrusted client wording',assistantContext:latestView}})
      },
    })
    await a.worker.monitor(a.job);assert.equal(toolCount,multiple?3:2,JSON.stringify(a.callbacks.map(row=>({command:row.command,error:row.error}))));assert.equal(a.backend.length,4);assert.equal(a.backend.filter(row=>row.instructions.startsWith('Independently assess')).length,1);assert.equal(app.counts().postCalls,1);assert.equal(app.entries.length,1);assert.equal(app.entries[0].content,literal)
    assert.equal(a.backend[1].input.filter(row=>row.type==='function_call_output').length,multiple?2:1,'All native outputs reach the next genuine human turn without an unused continuation')
    const spoken=a.sent.filter(row=>row.type==='session.commentary.append');assert.equal(spoken.length,2);assert(JSON.parse(spoken[1].content).speech.includes(literal));assert(!JSON.parse(spoken[1].content).speech.includes('invented model wording'));assert.equal(JSON.parse(spoken[1].content).safeToClaimSaved,true)
    if(fallback)assert.equal(spoken[1].delegation_id,null)
    assert.equal(a.f.bill.state,'CLOSED');assert.equal(a.f.bill.reservations.filter(row=>row.kind==='backend').length,4);assert(a.f.bill.reservations.every(row=>row.state==='SETTLED'))
   }
  })
  console.log(`Voice session worker: ${groups} actual-source offline groups passed. No provider, AWS, microphone, key or credits.`)
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1})
module.exports={main}
