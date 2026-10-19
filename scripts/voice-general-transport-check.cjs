#!/usr/bin/env node
'use strict'
// Actual mounted-client callback and normal app host; all I/O synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm')
const client=require('./voice-client-integrity-check.cjs'),host=require('./voice2-app-host-check.cjs'),root=path.resolve(__dirname,'..')
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/generalAssistantSession.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports})
const clone=value=>JSON.parse(JSON.stringify(value));let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function send(f,text,command,draft=null){
 const calls=[],alerts=[]
 const result=await client.draftRequest(text,null,true,{draft,voiceMemoryUserId:'owner',voiceAccountUserIdRef:{current:'owner'},generalAssistantSessionRef:{current:'app-owned-session'},launchContext:{section:'journal',date:'2026-10-17'},todayLocalDate:()=> '2026-10-17',acceptGeneralAssistantResponse:m.exports.acceptGeneralAssistantResponse,
  requestOptions:{realtimeActionHint:{action:'assistant_plan',assistantCommand:command}},loadVoiceFavorites:async()=>{throw Error('Structured command must not fetch unused favorites')},Alert:{alert:(...args)=>alerts.push(args)},
  fetchNativeVoiceAssistant:async factory=>{const response=await factory('https://synthetic.invalid');return{res:response,data:await response.json()}},
  fetch:async(url,init)=>{calls.push({url,method:init.method,body:JSON.parse(init.body),bytes:Buffer.byteLength(init.body)});const response=await f.route.POST(new Request(url,init));calls[calls.length-1].response={status:response.status,body:await response.clone().json()};return response}})
 return{...result,calls,alerts}
}
// Simulate only the server's separately verified, current pending job.
function permitDecision(f,view,text,command){
 const at=require('./voice-symptom-analysis-check.cjs').base.AuditDate.now()
 const decisionReceipt=f.load('native-assistant-decision').issueAssistantDecisionReceipt({actorId:'owner',sessionId:'app-owned-session',reviewId:command.reviewId,revision:view.revision,text,decision:command.type,turnId:'synthetic-fresh-human-turn-'+view.revision+'-'+command.type,assessmentReceiptId:'synthetic-settled-decision-assessment-'+view.revision+'-'+command.type},{decision:command.type,directHuman:true,completeTurn:true,quoted:false,historical:false,injected:false,ambiguous:false,conditional:false,correcting:false,mixed:false},{secret:'synthetic-control-secret-not-production',nowMs:at})
 f.db.db.voiceSessionRuntime.findMany=async()=>[{userId:'owner',state:'ready',expiresAt:new Date(at+120000),configuration:{assistantSessionId:'app-owned-session',deadlineMs:at+120000},toolJobs:{jobs:[{status:'pending',actualHumanText:text,args:{assistantCommand:command},decisionReceipt}]}}]
}
async function main(){
 await check('structured prepare uses one small normal-host request without favorites/history or another planner',async()=>{
  const f=host.setup(),command={type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content:'Exact synthetic note.',localDate:'2026-10-17'}}]},r=await send(f,'Prepare my note. Do not save it yet.',command)
  assert.equal(r.result.ok,true);assert.equal(r.result.needsReview,true);assert.equal(r.calls.length,1);assert.equal(new URL(r.calls[0].url).pathname,'/api/native/assistant');assert(r.calls[0].bytes<2000);assert.deepEqual(Object.keys(r.calls[0].body).sort(),['aiConsentGranted','channel','command','localDate','selectedLocalDate','sessionId','text','timeZone'].sort());assert.equal(f.counts().plannerCalls,0);assert.equal(f.counts().providerCalls,0);assert.equal(f.counts().postCalls,0);assert.equal(r.alerts.length,0)
 })
 await check('structured spoken yes bypasses the old phrase shortcut and saves only its current reviewed command',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),command={type:'confirm',reviewId:prepared.draft.assistantPlan.reviewId};permitDecision(f,prepared.assistant,'Yes, save it.',command);const r=await send(f,'Yes, save it.',command,prepared.draft)
  assert.equal(r.result.ok,true);assert.equal(r.saveOptions.length,0);assert.equal(r.calls.length,1);assert.deepEqual(r.calls[0].body.command,command);assert.equal(f.counts().postCalls,1);assert.equal(f.counts().plannerCalls,1);assert.equal(f.counts().providerCalls,0);assert(r.result.assistantContext);assert.equal(r.result.assistantContext.status,'completed')
 })
 await check('structured spoken no uses only its immutable decline and never resets or saves another plan',async()=>{
  const f=host.setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),command={type:'decline',reviewId:prepared.draft.assistantPlan.reviewId};permitDecision(f,prepared.assistant,'No',command);const r=await send(f,'No',command,prepared.draft)
  assert.equal(r.result.ok,true,JSON.stringify({result:r.result,calls:r.calls}));assert.equal(r.calls.length,1);assert.deepEqual(r.calls[0].body.command,command);assert.equal(r.saveOptions.length,0);assert.equal(f.counts().postCalls,0);assert.equal(r.result.assistantContext.steps[0].status,'cancelled')
 })
 await check('typed general planning also excludes irrelevant large snapshots and retains its billed planner endpoint',async()=>{
  let body,url,favoriteReads=0
  const r=await client.draftRequest('A new general request',null,false,{draft:null,requestConversationHistory:[{role:'user',text:'x'.repeat(500000)}],loadVoiceFavorites:async()=>{favoriteReads++;return[{items:['x'.repeat(7000000)]}]},fetch:async(u,init)=>{url=u;body=JSON.parse(init.body);return{}},fetchNativeVoiceAssistant:async factory=>{await factory('https://synthetic.invalid');throw Error('Synthetic response loss')}})
  assert.equal(favoriteReads,0);assert.equal(new URL(url).pathname,'/api/native-voice-assistant');assert(Buffer.byteLength(JSON.stringify(body))<1000);for(const key of['favorites','conversationHistory','confirmationDraft','followUpDraft'])assert.equal(body[key],undefined);assert.equal(r.result.ok,false)
 })
 await check('actual stop after a completed normal read acknowledges stopping without repeating the old answer',async()=>{
  const f=host.setup(),read=await send(f,'Read my day totals.',{type:'plan',steps:[{id:'read',operation:'food.day_context.read',values:{}}]})
  assert.equal(read.result.ok,true);assert.equal(read.result.assistantContext.steps[0].status,'completed')
  const before=f.counts(),stopped=await send(f,'Stop the current plan.',{type:'stop'})
  assert.equal(stopped.result.ok,true);assert.equal(stopped.result.message,'This request has stopped.');assert.equal(stopped.result.assistantContext.status,'stopped');assert.equal(f.counts().readCalls,before.readCalls);assert.equal(f.counts().postCalls,0);assert.equal(f.counts().plannerCalls,0)
 })
 console.log(`General assistant transport: ${groups} actual-source offline groups passed. No provider, real auth, network, account or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main,send,permitDecision}
