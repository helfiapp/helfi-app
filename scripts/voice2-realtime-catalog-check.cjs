#!/usr/bin/env node
'use strict'
// Actual realtime config and native handshake source; synthetic host discovery,
// owned snapshots and WebRTC/HTTP transport. No real provider/audio/credits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),fixture=require('./voice-symptom-analysis-check.cjs')
const root=path.resolve(__dirname,'..'),base=fixture.base,tool={}
new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'lib/native-assistant-command-tool.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(tool,name=>{throw Error('Forbidden tool dependency '+name)})
const registrySource={},registryCode=ts.transpileModule(fs.readFileSync(path.join(root,'lib/native-assistant-registry.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',registryCode)(registrySource,name=>{throw Error('Forbidden registry dependency '+name)})
const actions=[{id:'food.day_context.read',description:'Read actual owned current-day targets.',kind:'read',input:{type:'object',properties:{},required:[]}},{id:'journal.health.create',description:'Save literal journal text.',kind:'write',input:{type:'object',properties:{content:{type:'string',maxLength:20000}},required:['content']}}]
function setup(){let snapshots=0,discovery=0;const snapshot={id:'owned-session',actorId:'private-owned-user',revision:2,status:'active',steps:[{id:'note',operation:'journal.health.create',kind:'write',status:'review',review:{id:'exact-current-review',summary:'Complete literal note',cost:{kind:'free',maximumCredits:0}}}]}
 const route=base.load('app/api/native/voice-assistant/realtime/route.ts',{...tool,...registrySource,...base.load('lib/native-voice-time.ts'),resolveHelfiRealtimeVoice:()=> 'synthetic',exactChatGptVoiceAvailable:()=>false,createNativeAssistantApp:(request,zone)=>{assert.equal(zone,'Australia/Melbourne');return{host:{snapshot:async(context,id)=>{snapshots++;assert.equal(context.actorId,'private-owned-user');assert.equal(id,'owned-session');return snapshot},discover:context=>{discovery++;assert(context.capabilities.includes('general-assistant-v1'));return actions}}}}})
 const request=(extra={})=>new Request('https://helfi.example.invalid/realtime',{headers:{'x-helfi-voice-capabilities':'general-assistant-v1','x-helfi-assistant-session-id':'owned-session','x-helfi-assistant-local-date':'2026-10-17','x-helfi-assistant-time-zone':'Australia/Melbourne',...extra}})
 return{route,request,snapshot,counts:()=>({snapshots,discovery})}
}
// Reuse the existing offline WebRTC harness without changing app source. Only
// the harness's start params gain the new optional context under test.
const protocolRaw=fs.readFileSync(path.join(__dirname,'voice-live-protocol-check.cjs'),'utf8').replace(/^#!.*\n/,'')
const prefix=protocolRaw.slice(0,protocolRaw.indexOf('async function main()')).replace("token: 'synthetic-token', billingSessionId: 'synthetic-conversation-123', signal:","token: 'synthetic-token', billingSessionId: 'synthetic-conversation-123', ...(options.generalParams || {}), signal:")
const nativeHarness=new Function('require','__dirname',prefix+'\nreturn nativeHarness')(require,__dirname)
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('new capability reads one owned snapshot and discovers the exact fixed registry once',async()=>{
  const f=setup(),config=await f.route.generalAssistantSessionConfig(f.request(),'private-owned-user');assert.deepEqual(f.counts(),{snapshots:1,discovery:1});assert.deepEqual(config.actions,actions);assert.equal(config.snapshot,f.snapshot);assert.equal(config.sessionId,'owned-session')
  assert.equal(await f.route.generalAssistantSessionConfig(new Request('https://helfi.example.invalid/realtime'),'private-owned-user'),undefined);assert.deepEqual(f.counts(),{snapshots:1,discovery:1})
 })
 await check('invalid or missing context refuses before discovery/snapshot and never silently starts the new contract',async()=>{
  for(const changes of [{'x-helfi-assistant-session-id':'../other'},{'x-helfi-assistant-local-date':'2026-02-31'},{'x-helfi-assistant-time-zone':'Invalid/Zone'},{'x-helfi-assistant-session-id':''}]){const f=setup();await assert.rejects(()=>f.route.generalAssistantSessionConfig(f.request(changes),'private-owned-user'));assert.deepEqual(f.counts(),{snapshots:0,discovery:0})}
 })
 await check('one structured tool supports all seven commands and only discovered operation IDs',async()=>{
  const f=setup(),config=await f.route.generalAssistantSessionConfig(f.request(),'private-owned-user'),session=f.route.realtimeSessionConfig(true,config),tools=session.tools;assert.equal(tools.length,1);assert.equal(tools[0].name,'request_helfi_action');assert.deepEqual(Array.from(tools[0].parameters.properties.action.enum),['assistant_plan']);assert.equal(tools[0].parameters.additionalProperties,false)
  const variants=tools[0].parameters.properties.assistantCommand.oneOf;assert.deepEqual(variants.map(item=>item.properties.type.enum[0]),['plan','advance','correct','confirm','decline','recover','stop']);assert(variants.every(item=>item.additionalProperties===false));assert.deepEqual(variants[0].properties.steps.items.properties.operation.enum,actions.map(action=>action.id));assert.match(session.instructions,/\$from/);assert.match(session.instructions,/content.*maxLength.*20000/);assert.match(session.instructions,/exact-current-review/);assert(!session.instructions.includes('private-owned-user'));assert(!session.instructions.includes('Use record_action'))
 })
 await check('Live delegates to the same general registry contract with enough output room for full dictated notes',async()=>{
  const f=setup(),config=await f.route.generalAssistantSessionConfig(f.request(),'private-owned-user'),session=f.route.liveSessionConfig(false,true,config);assert.equal(session.delegation.responses.max_output_tokens,10000);assert.equal(session.delegation.responses.parallel_tool_calls,false);assert.deepEqual(Array.from(session.delegation.responses.tools[0].parameters.properties.action.enum),['assistant_plan']);assert.match(session.delegation.responses.instructions,/Complete literal note/);assert.match(session.delegation.responses.instructions,/saved=true|saved true/)
  const legacy=f.route.liveSessionConfig();assert.equal(legacy.delegation.responses.max_output_tokens,2048);assert(legacy.delegation.responses.tools[0].parameters.properties.action.enum.includes('water'));assert(!legacy.delegation.responses.tools[0].parameters.properties.assistantCommand)
 })
 await check('valid native context sends new session/date/zone headers while preserving protocol and billing ID',async()=>{
  const h=nativeHarness({generalParams:{assistantSessionId:'owned-session',localDate:'2026-10-17',timeZone:'Australia/Melbourne'}}),result=await h.started;assert(result.session,result.error?.message);const headers=h.requests[0].request.headers;assert.equal(headers['x-helfi-voice-capabilities'],'general-assistant-v1,symptom-analysis-v1');assert.equal(headers['x-helfi-assistant-session-id'],'owned-session');assert.equal(headers['x-helfi-assistant-local-date'],'2026-10-17');assert.equal(headers['x-helfi-assistant-time-zone'],'Australia/Melbourne');assert.equal(headers['x-helfi-voice-protocol'],'live-v1');assert.equal(headers['x-helfi-voice-session-id'],'synthetic-conversation-123');await result.session.stop()
 })
 await check('invalid or partial optional native context keeps the legacy handshake and does not advertise unsupported state',async()=>{
  for(const generalParams of [{},{assistantSessionId:'owned-session'},{assistantSessionId:'owned-session',localDate:'2026-02-31',timeZone:'Australia/Melbourne'},{assistantSessionId:'owned-session',localDate:'2026-10-17',timeZone:'Invalid/Zone'}]){const h=nativeHarness({generalParams}),result=await h.started;assert(result.session,result.error?.message);const headers=h.requests[0].request.headers;assert.equal(headers['x-helfi-voice-capabilities'],undefined);assert.equal(headers['x-helfi-assistant-session-id'],undefined);await result.session.stop()}
 })
 console.log(`VOICE 2 realtime registry: ${groups} actual-source offline groups passed. No actual provider, voice session or credits.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,nativeHarness,run}
