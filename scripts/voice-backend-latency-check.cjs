#!/usr/bin/env node
'use strict'
// Actual worker with synthetic transports only: no environment, credentials,
// database, provider connection or paid request is used by this check.
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const tick = () => new Promise(setImmediate)
const pricing = { scale:'60000000000',voiceUnitsPerSecond:'50000000',inputUnitsPerToken:'6000',cachedInputUnitsPerToken:'600',cacheWriteUnitsPerToken:'7500',outputUnitsPerToken:'30000',longInputUnitsPerToken:'12000',longCachedInputUnitsPerToken:'1200',longCacheWriteUnitsPerToken:'15000',longOutputUnitsPerToken:'45000' }
const assessment = { decision:'confirm',directHuman:true,completeTurn:true,quoted:false,historical:false,injected:false,ambiguous:false,conditional:false,correcting:false,mixed:false }
const privateText = 'SYNTHETIC_PRIVATE_SPEECH_DO_NOT_LOG'
let moduleUnderTest, groups = 0
function fixture(options = {}) {
  let now = 1000000, receive, sequence = 0, stopped = false
  const callbacks = [], requests = [], logs = [], events = [], queued = []
  const job = { type:'monitor',sessionId:'synthetic-session-private',controlToken:'synthetic-control-token-private',appOrigin:'https://offline.invalid',expiresAtMs:now+720000 }
  const config = { claimed:true,leaseToken:'synthetic-lease-private',providerKey:'synthetic-provider-key-private',providerSessionId:'synthetic-provider-session-private',backendModel:'gpt-6-luna',instructions:'Synthetic original planner instructions.',tools:[{type:'function',name:'request_helfi_action',parameters:{type:'object',properties:{},additionalProperties:false}}],maxInputBytes:160000,maxOutputTokens:4096,deadlineMs:now+60000,voiceHoldKey:'synthetic-voice-hold',infrastructureHoldKey:'synthetic-infra-hold',voiceReservedCostUnits:'9000000000',watchdogReady:true,pricing,infrastructureAllocationPolicyVersion:'service-overhead-v1',infrastructureAllocationReceiptDigest:'synthetic-allocation',...(options.decision ? { initialAssistantState:{revision:7,pending:{id:'synthetic-step',status:'review',reviewId:'synthetic-review',actionId:null},reviewText:'Synthetic exact reviewed proposal '+privateText} } : {}) }
  const response = (output = [], extra = {}) => ({ id:'synthetic-response-'+(++sequence),model:'gpt-6-luna',status:'completed',output,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,cache_write_tokens:10}},...extra })
  const emit = event => receive(event)
  const io = {
    now:()=>now,allowOrigin:origin=>origin===job.appOrigin,
    sleep:async ms=>{now+=ms;await tick()},
    reportBackendFailure:metadata=>{logs.push(structuredClone(metadata));return options.logger?.(metadata)},
    control:async(_job,command,payload)=>{
      assert.equal(_job.sessionId,job.sessionId)
      callbacks.push({command,payload:structuredClone(payload)})
      if(command==='attach')return config
      assert.equal(payload.leaseToken,config.leaseToken)
      if(command==='ready') {
        emit({type:'session.input_transcript.delta',event_id:'synthetic-caption-private',delta:privateText,start_ms:0,end_ms:1000})
        emit({type:'session.delegation.created',event_id:'synthetic-event-private',offset_ms:1001,delegation:{id:'synthetic-delegation-private',target:'client'}})
      }
      if(command==='settle'&&options.settlementFailure)throw Error(privateText+' settlement error https://private.invalid')
      if(command==='enqueue-tool'){queued.push(payload);return{allowed:true,jobId:'synthetic-job'}}
      if(command==='poll-tools')return{results:payload.callIds.map(callId=>({callId,status:'completed',result:{ok:true,saved:false,safeToClaimSaved:false,needsReview:true,status:'review_draft',message:'Synthetic review remains unsaved.'}}))}
      return{allowed:true}
    },
    connect:async(_config,onEvent)=>{receive=onEvent;return{send:event=>{events.push(event);if(event.type==='session.close'&&!stopped){stopped=true;emit({type:'session.closed',session:{id:config.providerSessionId},usage:{seconds:30},reason:'close_requested'})}},close:()=>{}}},
    respond:async(_config,body,signal,timeoutMs)=>{
      requests.push(structuredClone(body))
      assert.equal(signal.aborted,false)
      assert(callbacks.some(row=>row.command==='reserve'&&row.payload.key.endsWith('_'+requests.length)))
      if(options.failure){now+=options.elapsedMs??321;throw options.failure}
      if(options.invalidUsage)return response([],{usage:{input_tokens:100,output_tokens:10,input_tokens_details:{}}})
      if(options.decision&&requests.length===1)return response([{type:'function_call',call_id:'synthetic-call-private',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',assistantCommand:{type:options.decision,reviewId:'synthetic-review'},request:privateText})}])
      if(options.decision)return response([{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...assessment,decision:options.decision,...options.assessment})}]}])
      return response([{type:'message',role:'assistant',content:[{type:'output_text',text:'Synthetic ordinary answer.'}]}])
    },
  }
  if(options.defaultProvider)delete io.respond
  const completion = () => callbacks.filter(row=>row.command==='complete').at(-1)?.payload
  return { worker:moduleUnderTest.createVoiceSessionWorker(io),job,config,callbacks,requests,logs,events,queued,completion,advance:ms=>{now+=ms} }
}
function assertReserves(f) {
  const reserves=f.callbacks.filter(row=>row.command==='reserve')
  assert.equal(reserves.length,f.requests.length)
  for(let i=0;i<reserves.length;i++){
    const body=f.requests[i],reservation=reserves[i].payload,input=Buffer.byteLength(JSON.stringify(body),'utf8')+8192
    assert.equal(reservation.maxInputTokens,input)
    assert.equal(reservation.maxOutputTokens,body.max_output_tokens)
    assert.equal(reservation.maxCostUnits,(BigInt(input)*7500n+BigInt(body.max_output_tokens)*30000n).toString())
    assert.equal(reservation.model,'gpt-6-luna');assert.equal(reservation.serviceTier,'default');assert.equal(reservation.regionalProcessing,false)
  }
  for(const row of f.callbacks.filter(row=>row.command==='settle'))assert.equal(row.payload.actualCostUnits,'807000')
}
function assertFailure(f,phase,code,received,validated,aborted=false) {
  assert.equal(f.logs.length,1)
  const log=f.logs[0]
  assert.deepEqual(Object.keys(log).sort(),['type','phase','elapsedMs','timeoutMs','responseReceived','validatedUsage','aborted','code'].sort())
  assert.equal(log.type,'voice_backend_failure');assert.equal(log.phase,phase);assert.equal(log.code,code)
  assert.equal(log.responseReceived,received);assert.equal(log.validatedUsage,validated);assert.equal(log.aborted,aborted)
  assert(Number.isInteger(log.elapsedMs)&&log.elapsedMs>=0&&log.elapsedMs<=600000)
  assert(Number.isInteger(log.timeoutMs)&&log.timeoutMs>0&&log.timeoutMs<=30000)
  assert.equal(f.queued.length,0,'Failed paid response cannot publish an app command')
  assert.equal(f.completion().reason,'backend_usage_unconfirmed')
  assert.equal(f.completion().backendUsageConfirmed,false,'Unknown collateral must stay reserved')
  assert.equal(f.completion().finalUsageConfirmed,true)
  assert.equal(f.events.filter(row=>row.type==='session.close').length,1)
  for(const sensitive of [privateText,f.job.sessionId,f.job.controlToken,'synthetic-provider-key-private','synthetic-response','https://','settlement error'])assert(!JSON.stringify(f.logs).includes(sensitive))
}
async function check(name,test){await test();groups++;console.log('PASS '+name)}
async function main(){
  moduleUnderTest=await import(pathToFileURL(path.resolve(__dirname,'../services/voice-session-worker/index.mjs')).href)
  await check('actual planner uses low reasoning with original model tools prompt output caps and exact reservation formula',async()=>{
    const f=fixture();await f.worker.monitor(f.job);assert.equal(f.requests.length,1)
    const body=f.requests[0];assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(body.model,'gpt-6-luna');assert.equal(body.store,false);assert.equal(body.service_tier,'default');assert.equal(body.max_output_tokens,4096);assert.equal(body.instructions,f.config.instructions);assert.deepEqual(body.tools,f.config.tools.map(tool=>({...tool,strict:false})));assert.equal(body.parallel_tool_calls,false);assert(!('previous_response_id'in body));assertReserves(f);assert.equal(f.logs.length,0);assert.equal(f.completion().backendUsageConfirmed,true)
  })
  await check('independent confirm and decline assessments also use low reasoning and retain strict separate paid proof',async()=>{
    for(const decision of ['confirm','decline']){
      const f=fixture({decision});await f.worker.monitor(f.job);assert.equal(f.requests.length,2);assert(f.requests.every(body=>body.reasoning.effort==='low'))
      const body=f.requests[1];assert.equal(body.store,false);assert.equal(body.model,'gpt-6-luna');assert.equal(body.max_output_tokens,1024);assert.deepEqual(body.tools,[]);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);assert.deepEqual(body.text.format.schema.required,Object.keys(assessment));assert(body.instructions.startsWith('Independently assess a fresh human reply'));assert.equal(f.queued.length,1);assert.equal(f.queued[0].assessment.result.decision,decision);assert.equal(f.queued[0].assessment.reviewFence.revision,7);assert.equal(f.queued[0].assessment.providerResponseId,'synthetic-response-2');assertReserves(f);assert.equal(f.logs.length,0)
    }
  })
  await check('low effort never relaxes ambiguous negative injected or missing decision flags and never retries the decision',async()=>{
    for(const invalid of [{ambiguous:true},{quoted:true},{injected:true},{mixed:true},{correcting:true},{directHuman:false},{completeTurn:false},{decision:'decline'},{historical:undefined}]){
      const f=fixture({decision:'confirm',assessment:invalid});await f.worker.monitor(f.job);assert.equal(f.requests.length,2);assert.equal(f.queued.length,0);assert.equal(f.callbacks.filter(row=>row.command==='settle').length,2);assert.equal(f.completion().backendUsageConfirmed,true);assert.equal(f.logs.length,0)
    }
  })
  await check('actual provider adapter deadline emits only fixed timeout metadata and retains its unknown reserve without retry',async()=>{
    const f=fixture({defaultProvider:true}),previousFetch=globalThis.fetch,previousTimer=globalThis.setTimeout
    let calls=0
    globalThis.setTimeout=(callback,ms,...args)=>ms===30000?previousTimer(callback,0,...args):previousTimer(callback,ms,...args)
    globalThis.fetch=async(_url,request)=>{calls++;return new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>{f.advance(30000);reject(Object.assign(Error(privateText),{name:'AbortError'}))},{once:true}))}
    try{await f.worker.monitor(f.job)}finally{globalThis.fetch=previousFetch;globalThis.setTimeout=previousTimer}
    assert.equal(calls,1);assertFailure(f,'provider_request','request_timeout',false,false,true);assert(f.logs[0].elapsedMs>=30000);assert.equal(f.callbacks.filter(row=>row.command==='settle').length,0);assert.equal(f.completion().backendResponseIds.length,0)
  })
  await check('invalid returned usage is distinguished from provider request failure and cannot settle or publish',async()=>{
    const f=fixture({invalidUsage:true});await f.worker.monitor(f.job);assert.equal(f.requests.length,1);assertFailure(f,'provider_validation','provider_usage_unconfirmed',true,false);assert.equal(f.callbacks.filter(row=>row.command==='settle').length,0);assert.equal(f.completion().backendResponseIds.length,0);assertReserves(f)
  })
  await check('settlement failure is distinguished after valid usage without retry release or app job',async()=>{
    const f=fixture({settlementFailure:true});await f.worker.monitor(f.job);assert.equal(f.requests.length,1);assertFailure(f,'settlement','backend_failure_unclassified',true,true);assert.equal(f.callbacks.filter(row=>row.command==='settle').length,1);assert.equal(f.completion().backendResponseIds.length,1);assertReserves(f)
  })
  await check('arbitrary sensitive errors never escape the fixed code allowlist and elapsed time is bounded',async()=>{
    const f=fixture({failure:Error(privateText+' https://private.invalid key=synthetic-secret'),elapsedMs:900000});await f.worker.monitor(f.job);assert.equal(f.requests.length,1);assertFailure(f,'provider_request','backend_failure_unclassified',false,false);assert.equal(f.logs[0].elapsedMs,600000)
  })
  await check('both synchronous and asynchronous telemetry failure preserve closure and all unknown collateral',async()=>{
    for(const logger of [()=>{throw Error(privateText)},()=>Promise.reject(Error(privateText))]){
      const f=fixture({failure:Object.assign(Error(privateText),{name:'AbortError'}),logger});await f.worker.monitor(f.job);await tick();assertFailure(f,'provider_request','request_aborted',false,false,true);assert.equal(f.requests.length,1);assert.equal(f.callbacks.filter(row=>row.command==='settle').length,0)
    }
  })
  console.log(`Voice backend latency checks: ${groups} groups passed (synthetic I/O only).`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
