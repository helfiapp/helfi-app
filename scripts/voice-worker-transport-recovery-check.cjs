#!/usr/bin/env node
'use strict'
// Actual worker with synthetic clock, canonical app receipts and provider I/O.
// No environment, keys, real network, AWS, database or paid inference.
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const pricing = { scale:'60000000000', voiceUnitsPerSecond:'50000000', inputUnitsPerToken:'6000', cachedInputUnitsPerToken:'600', cacheWriteUnitsPerToken:'7500', outputUnitsPerToken:'30000', longInputUnitsPerToken:'12000', longCachedInputUnitsPerToken:'1200', longCacheWriteUnitsPerToken:'15000', longOutputUnitsPerToken:'45000' }
const unknownMessage = 'Helfi could not verify the result of that request. Please check the normal screen before repeating it. I cannot confirm whether anything was saved.'
const unknown = { ok:false, saved:false, safeToClaimSaved:false, needsReview:false, status:'needs_clarification', action:'assistant_plan', message:unknownMessage, spokenReply:unknownMessage, transportRecovery:{status:'result_not_verified'} }
const known = { ok:true, saved:false, safeToClaimSaved:false, spokenReply:'The normal app returned its verified read.' }
async function fixture(workerModule, options = {}) {
  let now = 1000000, receive, secondHumanSent = false
  const requests = [], callbacks = [], sent = [], queued = [], observations = []
  const job = { type:'monitor', sessionId:'synthetic-session', controlToken:'synthetic-scope-not-a-real-secret', appOrigin:'https://offline.invalid', expiresAtMs:now+720000 }
  const config = { claimed:true, leaseToken:'synthetic-lease', providerKey:'synthetic-placeholder-not-a-key', providerSessionId:'synthetic-provider-session', backendModel:'gpt-6-luna', instructions:'Use actual app receipts and wait for genuine human instructions.', tools:[{type:'function',name:'request_helfi_action',parameters:{type:'object'}}], maxInputBytes:160000, maxOutputTokens:4096, deadlineMs:now+60000, voiceHoldKey:'voice-hold', infrastructureHoldKey:'infra-hold', voiceReservedCostUnits:'9000000000', watchdogReady:true, pricing }
  const human = (number) => {
    receive({type:'session.input_transcript.delta',event_id:'human-'+number,delta:number===1?'Prepare my request.':'Read my water now.',start_ms:number===1?0:2000,end_ms:number===1?1000:3000})
    receive({type:'session.delegation.created',event_id:'delegation-event-'+number,offset_ms:number===1?1001:3001,delegation:{id:'delegation-'+number,target:'client'}})
  }
  const io = {
    now:()=>now, allowOrigin:origin=>origin==='https://offline.invalid', sleep:async ms=>{now+=ms;await new Promise(setImmediate)},
    control:async (_job, command, payload) => {
      callbacks.push({command,payload:structuredClone(payload)})
      if(command==='attach')return config
      assert.equal(payload.leaseToken,config.leaseToken)
      if(command==='ready'){human(1);return{allowed:true}}
      if(command==='enqueue-tool'){queued.push(payload);return{allowed:true,jobId:payload.callId}}
      if(command==='poll-tools')return{results:payload.callIds.map(callId=>({callId,status:'completed',result:Number(callId.split('-').at(-1))===(options.unknownIndex??0)?structuredClone(unknown):structuredClone(known)}))}
      if(command==='complete')return{allowed:true,state:'complete'}
      return{allowed:true}
    },
    connect:async (_config,onEvent)=>{receive=onEvent;return{
      send:event=>{
        sent.push(structuredClone(event))
        if(event.type==='session.close')receive({type:'session.closed',session:{id:config.providerSessionId},usage:{seconds:30},reason:'close_requested'})
        if(event.type==='session.commentary.append'&&event.delegation_id==='delegation-1'){
          observations.push({backend:requests.length,reserves:callbacks.filter(row=>row.command==='reserve').length,enqueues:queued.length,closed:sent.some(row=>row.type==='session.close')})
          if(options.nextHuman&&!secondHumanSent){secondHumanSent=true;human(2)}
        }
      },close:()=>{}
    }},
    respond:async (_config,body,signal)=>{
      assert.equal(signal.aborted,false);requests.push(structuredClone(body))
      const count=requests.length
      const output=count===1?Array.from({length:options.callCount??1},(_,index)=>({type:'function_call',call_id:'call-'+index,name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',request:'Actual request',needsReview:true,assistantCommand:{type:'advance'}})})):[{type:'message',role:'assistant',content:[{type:'output_text',text:'A new genuine human turn was processed.'}]}]
      return{id:'response-'+count,model:'gpt-6-luna',status:'completed',output,usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:20,cache_write_tokens:10}}}
    },
  }
  const result = await workerModule.createVoiceSessionWorker(io).monitor(job)
  return {requests,callbacks,sent,queued,observations,result}
}
let groups=0
async function check(name,work){await work();groups++;console.log('PASS '+name)}
async function main(){
  const workerModule=await import(pathToFileURL(path.resolve(__dirname,'../services/voice-session-worker/index.mjs')).href)
  await check('one unverified canonical result stops paid continuation without closing healthy voice',async()=>{
    const f=await fixture(workerModule)
    assert.equal(f.requests.length,1);assert.equal(f.callbacks.filter(row=>row.command==='reserve').length,1)
    assert.equal(f.callbacks.filter(row=>row.command==='settle').length,1);assert.equal(f.queued.length,1)
    assert.deepEqual(f.observations,[{backend:1,reserves:1,enqueues:1,closed:false}])
    assert.equal(f.sent.find(row=>row.type==='session.commentary.append').content,unknownMessage)
    assert.equal(f.result.financialFinalizationConfirmed,true)
  })
  await check('several returned calls enqueue only through the first unknown result and no further backend request',async()=>{
    for(const unknownIndex of[0,1]){
      const f=await fixture(workerModule,{callCount:3,unknownIndex})
      assert.equal(f.queued.length,unknownIndex+1);assert.equal(f.requests.length,1)
      assert.equal(f.callbacks.filter(row=>row.command==='reserve').length,1)
      assert.equal(f.sent.find(row=>row.type==='session.commentary.append').content,unknownMessage)
      assert.equal(f.observations[0].closed,false)
    }
  })
  await check('the next actual human delegation proceeds with canonical unknown and skipped outputs retained',async()=>{
    const f=await fixture(workerModule,{callCount:3,nextHuman:true})
    assert.equal(f.requests.length,2);assert.equal(f.callbacks.filter(row=>row.command==='reserve').length,2)
    assert.equal(f.callbacks.filter(row=>row.command==='settle').length,2);assert.equal(f.queued.length,1)
    assert.deepEqual(f.observations,[{backend:1,reserves:1,enqueues:1,closed:false}])
    const input=f.requests[1].input, outputs=input.filter(row=>row.type==='function_call_output')
    assert.equal(outputs.length,3);assert.deepEqual(JSON.parse(outputs[0].output),unknown)
    for(const skipped of outputs.slice(1)){
      const value=JSON.parse(skipped.output);assert.equal(value.status,'not_submitted');assert.equal(value.safeToClaimSaved,false)
      assert.match(value.message,/not submitted/)
    }
    const humans=input.filter(row=>row.role==='user').map(row=>JSON.parse(row.content).actualHumanText)
    assert.deepEqual(humans,['Prepare my request.','Read my water now.'])
    assert(input.some(row=>row.role==='assistant'&&row.content===unknownMessage))
    const speech=f.sent.filter(row=>row.type==='session.commentary.append')
    assert.equal(speech.length,2);assert.equal(speech[1].delegation_id,'delegation-2')
    assert.equal(speech[1].content,'A new genuine human turn was processed.')
  })
  console.log(`Voice worker transport recovery: ${groups} actual-source offline groups passed. No provider, AWS, auth, account, database or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
