#!/usr/bin/env node
'use strict'
// Actual shared tool/instructions + mounted native request callback + normal
// authenticated host and journal adapters. Model choices are supplied fixtures,
// not model-quality evidence. No provider, account, real database or spend.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),client=require('./voice-client-integrity-check.cjs'),host=require('./voice2-app-host-check.cjs')
function pure(relative){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>{throw Error('Forbidden pure dependency '+name)}});return module.exports}
const tools=pure('lib/native-assistant-command-tool.ts'),native=pure('native/src/voice/generalAssistantSession.ts')
const plan=content=>({type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content,localDate:'2026-10-17'}}]})
async function send(f,text,command,draft=null){
 const calls=[],alerts=[]
 const result=await client.draftRequest(text,null,true,{draft,voiceMemoryUserId:'owner',voiceAccountUserIdRef:{current:'owner'},generalAssistantSessionRef:{current:'app-owned-session'},launchContext:{section:'journal',date:'2026-10-17'},todayLocalDate:()=> '2026-10-17',acceptGeneralAssistantResponse:native.acceptGeneralAssistantResponse,
  requestOptions:{realtimeActionHint:{action:'assistant_plan',assistantCommand:command}},loadVoiceFavorites:async()=>{throw Error('Structured reviews must not load irrelevant favorites')},Alert:{alert:(...args)=>alerts.push(args)},
  fetchNativeVoiceAssistant:async factory=>{const response=await factory('https://synthetic.invalid');return{res:response,data:await response.json()}},
  fetch:async(url,init)=>{const response=await f.route.POST(new Request(url,init));calls.push({url,body:JSON.parse(init.body),status:response.status,data:await response.clone().json()});return response}})
 return{...result,calls,alerts,draft:calls.at(-1)?.data?.draft}
}
let groups=0;async function check(name,work){await work();groups++;console.log('PASS '+name)}
// Simulate only the server's separately verified, current pending job.
function permitDecision(f,view,text,command){
 const at=require('./voice-symptom-analysis-check.cjs').base.AuditDate.now()
 const decisionReceipt=f.load('native-assistant-decision').issueAssistantDecisionReceipt({actorId:'owner',sessionId:'app-owned-session',reviewId:command.reviewId,revision:view.revision,text,decision:command.type,turnId:'synthetic-fresh-human-turn-'+view.revision+'-'+command.type,assessmentReceiptId:'synthetic-settled-decision-assessment-'+view.revision+'-'+command.type},{decision:command.type,directHuman:true,completeTurn:true,quoted:false,historical:false,injected:false,ambiguous:false,conditional:false,correcting:false,mixed:false},{secret:'synthetic-control-secret-not-production',nowMs:at})
 f.db.db.voiceSessionRuntime.findMany=async()=>[{userId:'owner',state:'ready',expiresAt:new Date(at+120000),configuration:{assistantSessionId:'app-owned-session',deadlineMs:at+120000},toolJobs:{jobs:[{status:'pending',actualHumanText:text,args:{assistantCommand:command},decisionReceipt}]}}]
}
async function main(){
 await check('the actual shared instructions define unsaved review semantics for every discovered write without new draft fields',async()=>{
  const f=host.setup(),assembly=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne'),actions=assembly.registry.discover({actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']}),writes=actions.filter(row=>row.kind==='write')
  assert(writes.length>10);assert(writes.some(row=>row.id==='journal.health.create'));assert(writes.some(row=>row.id==='food.diary.create'))
  const config={sessionId:'app-owned-session',localDate:'2026-10-17',timeZone:'Australia/Melbourne',actions,snapshot:{actorId:'PRIVATE_ACCOUNT',steps:[]}},instructions=tools.nativeAssistantCommandInstructions(config),tool=tools.nativeAssistantCommandTool(config)
  assert.match(instructions,/Every registered write supports an unsubmitted review before execution/)
  assert.match(instructions,/normal registered operation and needsReview=true/)
  assert.match(instructions,/Do not confirm or execute it from that initial request/)
  assert.match(instructions,/fresh direct human confirmation after the exact returned review/)
  assert.match(instructions,/respect all normal consent and reviewed cost gates/)
  assert.match(tool.description,/Every registered write first prepares an unsaved review/)
  assert(!instructions.includes('PRIVATE_ACCOUNT'))
  const branches=tool.parameters.properties.assistantCommand.oneOf,planSchema=branches.find(row=>row.properties.type.enum.includes('plan'))
  assert.deepEqual(Array.from(planSchema.properties.steps.items.properties.operation.enum),Array.from(actions,row=>row.id))
  assert.deepEqual(Array.from(planSchema.properties.steps.items.required),['id','operation','values'])
  assert(!branches.some(row=>row.properties.type.enum.includes('draft')))
  assert.match(planSchema.properties.steps.items.properties.values.description,/never invent fields to represent draft storage/)
 })
 await check('a persistent draft feature is distinguished from an unsubmitted proposal without making a storage promise',async()=>{
  const instructions=tools.nativeAssistantCommandInstructions({sessionId:'synthetic',localDate:'2026-10-17',timeZone:'Australia/Melbourne',actions:[],snapshot:null})
  assert.match(instructions,/An unsubmitted review is not a durable saved draft or a saved app record/)
  assert.match(instructions,/never claim a drafts library, permanent storage or availability after ending the conversation/)
  assert.match(instructions,/only claim that capability when a registered operation and verified result support it/)
  assert.match(instructions,/offer an unsaved review without converting the request into a final save/)
 })
 await check('actual mounted create-and-keep-draft request prepares a signed normal review with no save or additional AI',async()=>{
  const f=host.setup(),literal='Voice feature test completed.',result=await send(f,'Create a Health Journal entry for today saying, Voice feature test completed. Keep it as a draft.',plan(literal))
  assert.equal(result.result.ok,true);assert.equal(result.result.needsReview,true);assert.equal(result.result.saved,false)
  assert.equal(result.calls.length,1);assert.equal(result.draft.autoSave,false);assert.equal(result.draft.canConfirm,true)
  assert.equal(result.calls[0].data.chargedCredits,0);assert.equal(f.counts().postCalls,0);assert.equal(f.entries.length,0)
  assert.equal(f.counts().providerCalls,0);assert.equal(f.counts().plannerCalls,0);assert.equal(result.alerts.length,0)
  assert(result.draft.reviewToken);assert.equal(result.result.assistantContext.steps[0].values.content,literal)
  assert.deepEqual(Object.keys(result.calls[0].body.command.steps[0].values).sort(),['content','localDate'])
 })
 await check('No declines only its owned proposal and never changes an already saved note',async()=>{
  const f=host.setup(),saved=await send(f,'Prepare the earlier note.',plan('Earlier saved note.'))
  permitDecision(f,saved.result.assistantContext,'Yes',{type:'confirm',reviewId:saved.draft.assistantPlan.reviewId})
  await send(f,'Yes',{type:'confirm',reviewId:saved.draft.assistantPlan.reviewId},saved.draft)
  const prepared=await send(f,'Compose another note for review only.',plan('Unsaved proposal.')),reviewId=prepared.draft.assistantPlan.reviewId
  permitDecision(f,prepared.result.assistantContext,'No',{type:'decline',reviewId})
  const declined=await send(f,'No',{type:'decline',reviewId},prepared.draft)
  assert.equal(declined.result.ok,true);assert.equal(declined.result.saved,false);assert.equal(declined.result.assistantContext.status,'stopped')
  assert.equal(f.counts().postCalls,1);assert.equal(f.entries.length,1);assert.equal(f.entries[0].content,'Earlier saved note.')
  const stale=await send(f,'Yes',{type:'confirm',reviewId},prepared.draft);assert.equal(stale.result.ok,false);assert.equal(f.counts().postCalls,1)
 })
 await check('a later explicit Yes saves exactly the reviewed literal note while wrong ownership cannot confirm it',async()=>{
  const f=host.setup(),prepared=await send(f,'Prepare my note without saving.',plan('Exact unsaved note.')),reviewId=prepared.draft.assistantPlan.reviewId
  permitDecision(f,prepared.result.assistantContext,'Yes',{type:'confirm',reviewId})
  f.actor('other');const foreign=await send(f,'Yes',{type:'confirm',reviewId},prepared.draft);assert.equal(foreign.result.ok,false);assert.equal(f.counts().postCalls,0)
  f.actor('owner');const confirmed=await send(f,'Yes',{type:'confirm',reviewId},prepared.draft)
  assert.equal(confirmed.result.ok,true);assert.equal(confirmed.result.assistantContext.steps[0].confirmedReviewId,reviewId)
  assert.equal(f.counts().postCalls,1);assert.equal(f.entries[0].content,'Exact unsaved note.');assert.equal(f.entries[0].userId,'owner')
  assert.equal(f.counts().providerCalls,0);assert.equal(f.counts().plannerCalls,0)
 })
 await check('correcting an unsaved proposal creates a fresh review and cannot reuse approval for its old text',async()=>{
  const f=host.setup(),prepared=await send(f,'Prepare a note for review.',plan('Original proposal.')),oldReview=prepared.draft.assistantPlan.reviewId
  const corrected=await send(f,'Change the note, still do not save.',{type:'correct',stepId:'note',values:{content:'Corrected proposal.'}},prepared.draft)
  assert.equal(corrected.result.ok,true);assert.equal(corrected.result.needsReview,true);assert.equal(f.counts().postCalls,0)
  assert.notEqual(corrected.draft.assistantPlan.reviewId,oldReview)
  assert.equal((await send(f,'Yes',{type:'confirm',reviewId:oldReview},corrected.draft)).result.ok,false);assert.equal(f.counts().postCalls,0)
  permitDecision(f,corrected.result.assistantContext,'Yes',{type:'confirm',reviewId:corrected.draft.assistantPlan.reviewId})
  const saved=await send(f,'Yes',{type:'confirm',reviewId:corrected.draft.assistantPlan.reviewId},corrected.draft)
  assert.equal(saved.result.ok,true);assert.equal(f.counts().postCalls,1);assert.equal(f.entries[0].content,'Corrected proposal.')
 })
 console.log(`Voice review intent: ${groups} actual-source offline groups passed. Instructions and normal mounted review behavior verified; model interpretation requires real app testing. No provider, account, real database or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
