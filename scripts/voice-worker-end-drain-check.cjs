#!/usr/bin/env node
'use strict'
// Actual worker with synthetic clock, provider and app control only. No keys,
// environment files, account, database, AWS, audio or paid calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url')
const tick=()=>new Promise(setImmediate)
function fixtures(worker){const file=path.join(__dirname,'voice-session-worker-check.cjs'),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.fixture=fixture;module.exports.setWorker=value=>{workerModule=value};',{module,exports:module.exports,require:createRequire(file),__dirname,process,console,URL,Response,Request,Headers,Buffer,structuredClone,setImmediate,setTimeout,clearTimeout});module.exports.setWorker(worker);return module.exports}
let groups=0
async function check(name,fn){await fn();groups++;console.log('PASS '+name)}
async function main(){
 const worker=await import(pathToFileURL(path.resolve(__dirname,'../services/voice-session-worker/index.mjs')).href),io=fixtures(worker)
 for(const status of['review','needs_details','awaiting_person','uncertain'])await check('canonical '+status+' ends model work until a genuine new human turn',async()=>{
  const f=io.fixture({tool:true,onReady:({transcript,delegate})=>{transcript('Prepare my exact request.',0,1000);delegate()}}),original=f.io.control
  const deps={...f.io,control:async(job,command,payload)=>{const result=await original(job,command,payload);if(command==='poll-tools')result.results.forEach(row=>{row.result={ok:true,saved:false,safeToClaimSaved:false,needsReview:status==='review',status:status==='needs_details'?'needs_clarification':status,spokenReply:'The complete literal app review or question is ready; no further submission is authorized.',assistantState:{revision:2,currentStepIds:['current'],steps:[{id:'current',status}]}}});return result}}
  await worker.createVoiceSessionWorker(deps).monitor(f.job);assert.equal(f.providerCalls.length,1);assert.equal(f.settled.length,1);assert.equal(f.queued.length,1);assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,1);assert(f.sent.some(e=>e.type==='session.commentary.append'&&JSON.parse(e.content).saved===false))
 })
 await check('verified free reads still permit a later backend planning step',async()=>{
  const f=io.fixture({tool:true,onReady:({transcript,delegate})=>{transcript('Read my owned water then continue.',0,1000);delegate()}}),original=f.io.control
  await worker.createVoiceSessionWorker({...f.io,control:async(job,command,payload)=>{const result=await original(job,command,payload);if(command==='poll-tools')result.results.forEach(row=>{row.result={ok:true,saved:false,safeToClaimSaved:false,needsReview:false,status:'general_answer',spokenReply:'Actual read: 0 mL.',assistantState:{revision:2,currentStepIds:['read'],steps:[{id:'read',status:'completed'}]}}});return result}}).monitor(f.job);assert.equal(f.providerCalls.length,2);assert.equal(f.settled.length,2)
 })
 for(const delay of[500,3500])await check('End immediately closes voice but drains an existing covered usage receipt within '+delay+'ms',async()=>{
  let entered=false,ended=false,resolve,readAt=0,endAt=0,signal
  const f=io.fixture({onReady:({transcript,delegate})=>{transcript('Read my owned data.',0,1000);delegate()},onSleep:({now,emit})=>{if(entered&&!ended&&now>=readAt+100){ended=true;endAt=now;emit({type:'session.closed',session:{id:'provider-session-one'},usage:{seconds:98}})}if(ended&&resolve&&now>=endAt+delay){const done=resolve;resolve=null;done(answer())}}})
  const answer=()=>({id:'late-but-confirmed-response',model:'gpt-6-luna',status:'completed',usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}},output:[{type:'function_call',call_id:'must-not-run-after-End',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',needsReview:true,assistantCommand:{type:'advance'},request:'not fresh consent'})}]})
  const result=await worker.createVoiceSessionWorker({...f.io,respond:async(_config,_body,s)=>{entered=true;readAt=f.io.now();signal=s;return new Promise(r=>{resolve=r})}}).monitor(f.job)
  assert(ended);assert.equal(f.queued.length,0);assert.equal(f.settled.length,1);assert.equal(f.controlCalls.filter(c=>c.command==='reserve').length,1);assert.equal(f.completion().backendUsageConfirmed,true);assert.equal(result.status,'closed');assert(f.io.now()-endAt<=5000);assert(signal.aborted,'The bounded accounting controller is released at shutdown');assert(f.sent.some(e=>e.type==='session.close'));assert.equal(f.sent.filter(e=>e.type==='session.commentary.append').length,0)
 })
 await check('unknown response at the5s drain limit retains the whole backend hold and never retries or executes late output',async()=>{
  let entered=false,ended=false,resolve,readAt=0,endAt=0,signal
  const f=io.fixture({onReady:({transcript,delegate})=>{transcript('Read the app.',0,1000);delegate()},onSleep:({now,emit})=>{if(entered&&!ended&&now>=readAt+100){ended=true;endAt=now;emit({type:'session.closed',session:{id:'provider-session-one'},usage:{seconds:98}})}}})
  const result=await worker.createVoiceSessionWorker({...f.io,respond:async(_config,_body,s)=>{entered=true;readAt=f.io.now();signal=s;return new Promise(r=>{resolve=r})}}).monitor(f.job)
  assert.equal(result.status,'voice_closed_backend_uncertain');assert(f.io.now()-endAt<=5000);assert(signal.aborted);assert.equal(f.completion().backendUsageConfirmed,false);assert.equal(f.settled.length,0);assert.equal(f.queued.length,0);assert.equal(f.controlCalls.filter(c=>c.command==='reserve').length,1)
  resolve({id:'too-late-response',model:'gpt-6-luna',status:'completed',usage:{input_tokens:100,output_tokens:10,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}},output:[{type:'function_call',call_id:'late-write',name:'request_helfi_action',arguments:'{}'}]});for(let i=0;i<5;i++)await tick();assert.equal(f.settled.length,0);assert.equal(f.queued.length,0);assert.equal(f.controlCalls.filter(c=>c.command==='complete').length,1)
 })
 await check('End arriving during reserve acknowledgement prevents the provider request and retains the unused reservation honestly',async()=>{
  const f=io.fixture({onReady:({transcript,delegate})=>{transcript('Read current data.',0,1000);delegate()}}),original=f.io.control;let providers=0
  await worker.createVoiceSessionWorker({...f.io,control:async(job,name,payload)=>{const result=await original(job,name,payload);if(name==='reserve')f.emit({type:'session.closed',session:{id:'provider-session-one'},usage:{seconds:15}});return result},respond:async()=>{providers++;throw Error('End must prevent this provider call')}}).monitor(f.job)
  assert.equal(providers,0);assert.equal(f.queued.length,0);assert.equal(f.settled.length,0);assert.equal(f.completion().backendUsageConfirmed,false);assert.equal(f.controlCalls.filter(c=>c.command==='reserve').length,1)
 })
 console.log(`Voice worker End accounting: ${groups} actual-source offline groups passed; no paid I/O or release of unknown funds.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
