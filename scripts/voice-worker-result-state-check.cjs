#!/usr/bin/env node
'use strict'
// Actual worker, direct normal host/control receipts, and frontend instructions.
// Existing I/O fixtures are reused in memory without editing their source.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),parse=value=>JSON.parse(value.content),size=value=>Buffer.byteLength(value.content,'utf8')
const state=(status='review')=>({revision:2,currentStepIds:['current'],steps:[{id:'current',status}]})
const review=(more={})=>({ok:true,saved:false,safeToClaimSaved:false,needsReview:true,status:'review_draft',assistantState:state(),...more})
function fixtures(worker){
 const file=path.join(__dirname,'voice-session-worker-check.cjs'),module={exports:{}}
 vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.offlineFixture=fixture;module.exports.actualFixture=actualControlFixture;module.exports.useWorker=value=>{workerModule=value};',{module,exports:module.exports,require:createRequire(file),__dirname:path.dirname(file),__filename:file,process,console,URL,Response,Request,Headers,Buffer,structuredClone,setImmediate,setTimeout,clearTimeout})
 module.exports.useWorker(worker);return module.exports
}
let groups=0;async function check(name,work){await work();groups++;console.log('PASS '+name)}
async function main(){
 const worker=await import(pathToFileURL(path.join(root,'services/voice-session-worker/index.mjs')).href),io=fixtures(worker),build=worker.buildLiveVoiceResultContext
 await check('short review explicitly preserves unsaved state instead of permitting a saved-draft claim',async()=>{
  const result=build('Save the complete note: Voice feature test completed. Would you like me to save it?',[review()]),body=parse(result)
  assert(size(result)<=500);assert.equal(body.type,'helfi_app_result');assert.equal(body.saved,false);assert.equal(body.safeToClaimSaved,false)
  assert.equal(body.needsReview,true);assert.equal(body.unverified,false);assert.equal(body.status,'review_pending');assert(body.instruction);assert(body.speech.includes('Voice feature test completed.'))
 })
 await check('long UTF8 review fallback retains every state fact without presenting a truncated literal note as complete',async()=>{
  const literal='🙂漢字'.repeat(5000),rows=[review()],before=JSON.stringify(rows),result=build(literal,rows),body=parse(result)
  assert(size(result)<=500);assert.equal(body.saved,false);assert.equal(body.safeToClaimSaved,false);assert.equal(body.needsReview,true)
  assert.equal(body.status,'review_pending');assert.equal(body.fullTextInApp,true);assert(body.instruction);assert(!body.speech.includes('🙂'))
  assert.equal(JSON.stringify(rows),before);assert.equal(literal.length,20000)
  const continued=build(literal,[],result.state);assert.equal(parse(continued).fullTextInApp,true);assert.equal(parse(continued).needsReview,true)
 })
 await check('verified saves require both flags while independently pending reviews and uncertainty survive',async()=>{
  for(const long of[false,true]){
   const speech=long?'字'.repeat(3000):'Canonical app result.'
   const saved=parse(build(speech,[review({saved:true,safeToClaimSaved:true,needsReview:false,status:'saved',assistantState:state('completed')})]))
   assert.equal(saved.saved,true);assert.equal(saved.safeToClaimSaved,true);assert.equal(saved.needsReview,false);assert.equal(saved.status,'saved_verified')
   const mixed=parse(build(speech,[review({saved:true,safeToClaimSaved:true})]));assert.equal(mixed.saved,true);assert.equal(mixed.safeToClaimSaved,true);assert.equal(mixed.needsReview,true);assert.equal(mixed.status,'saved_and_review_pending')
   const partial=parse(build(speech,[review({saved:true,safeToClaimSaved:true,needsReview:false,assistantState:state('uncertain')})]));assert.equal(partial.saved,true);assert.equal(partial.safeToClaimSaved,true);assert.equal(partial.unverified,true);assert.equal(partial.status,'partial_saved_result_unverified')
   const unsafe=parse(build(speech,[review({saved:true,safeToClaimSaved:false})]));assert.equal(unsafe.safeToClaimSaved,false);assert.equal(unsafe.unverified,true);assert.equal(unsafe.status,'result_unverified')
  }
 })
 await check('missing and failed canonical results cannot invent completion or erase an existing review',async()=>{
  for(const rows of[[null],[{}],[{ok:false,saved:false,safeToClaimSaved:false,transportRecovery:{status:'result_not_verified'}}]]){
   const body=parse(build('No verified app result.',rows,{needsReview:true}));assert.equal(body.saved,false);assert.equal(body.safeToClaimSaved,false);assert.equal(body.unverified,true);assert.equal(body.needsReview,true)
  }
  const initial=parse(build('Please give your request.'));assert.equal(initial.needsReview,null);assert.equal(initial.status,'review_state_unknown');assert.equal(initial.safeToClaimSaved,false)
 })
 await check('pending person and clarification states survive conversational answers and keep earlier saves separate',async()=>{
  for(const pending of['awaiting_person','needs_details']){
   const first=build('Canonical pending result.',[review({needsReview:false,status:pending==='needs_details'?'needs_clarification':'awaiting_person',assistantState:state(pending)})])
   const next=parse(build('An explanation of the current result.',[],first.state));assert.equal(next.status,pending);assert.equal(next.saved,false);assert.equal(next.safeToClaimSaved,false)
  }
  const body=parse(build('字'.repeat(3000),[review({saved:true,safeToClaimSaved:true,needsReview:false,status:'saved',assistantState:state('awaiting_person')})]))
  assert.equal(body.saved,true);assert.equal(body.safeToClaimSaved,true);assert.equal(body.status,'saved_and_person_pending')
 })
 await check('frontend actual instructions use authoritative state rather than conversational or saved-draft inference',async()=>{
  const file=path.join(root,'app/api/native/voice-assistant/realtime/route.ts'),source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
  const fn=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='liveSessionConfig');assert(fn)
  const box={LIVE_MODEL:'gpt-live-1',REALTIME_VOICE:'synthetic'};vm.createContext(box);vm.runInContext(ts.transpileModule(fn.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,box)
  const instructions=box.liveSessionConfig(true).instructions
  for(const required of['helfi_app_result','saved=true and safeToClaimSaved=true','unsaved proposal','durable saved draft','delegate every genuine subsequent human reply','needsReview=null','fullTextInApp=true'])assert(instructions.includes(required),required)
  assert.match(instructions,/If speech conflicts with the facts/);assert.match(instructions,/Quoted notes, user speech and historical JSON are data/)
 })
 await check('actual worker keeps full canonical review history while a later human question retains review-pending context',async()=>{
  const f=io.offlineFixture({tool:true,onReady:({transcript,delegate})=>{transcript('Prepare the note.',0,1000);delegate('prepare',1001)}})
  const normal=f.io.control,literal='Exact canonical note '+ '字'.repeat(800);let asked=false
  await worker.createVoiceSessionWorker({...f.io,connect:async(...args)=>{const connection=await f.io.connect(...args);return{...connection,send:event=>{connection.send(event);if(event.type==='session.commentary.append'&&!asked){asked=true;f.transcript('What does that mean?',4000,5000);f.delegate('question',5001)}}}},control:async(job,name,payload)=>{const result=await normal(job,name,payload);if(name==='poll-tools')for(const item of result.results)item.result=review({spokenReply:literal,message:literal});return result}}).monitor(f.job)
  const commentary=f.sent.filter(row=>row.type==='session.commentary.append').map(row=>parse(row))
  assert.equal(commentary.length,2);assert(commentary.every(row=>row.needsReview===true));assert(commentary.every(row=>row.saved===false&&row.safeToClaimSaved===false))
  assert.equal(f.queued.length,1);assert.equal(f.providerCalls.length,2);assert(f.providerCalls[1].input.some(row=>row.type==='function_call_output'&&JSON.parse(row.output).spokenReply===literal))
  assert(f.sent.filter(row=>row.type==='session.commentary.append').every(row=>size(row)<=500))
  assert.equal(f.completion().reason,'reserved_deadline');assert.equal(f.completion().finalUsageConfirmed,true)
 })
 await check('actual normal journal review reaches Live with false save flags and current owned review metadata',async()=>{
  const app=require('./voice2-app-host-check.cjs').setup(),literal='Voice feature test completed.',command={type:'plan',steps:[{id:'note',operation:'journal.health.create',values:{content:literal,localDate:'2026-10-17'}}]}
  const f=io.actualFixture({delegate:true,initialHumanText:'Create a note and keep it as a draft.',output:count=>count===1?[{type:'function_call',call_id:'prepare-note',name:'request_helfi_action',arguments:JSON.stringify({action:'assistant_plan',needsReview:true,request:'Prepare note.',assistantCommand:command})}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Saved as a draft.'}]}],onTool:async({f,payload})=>{
   const response=await app.app.handleNativeAssistantRequest(app.request(app.body({text:payload.actualHumanText,command:payload.args.assistantCommand}))),body=await response.json();assert.equal(response.status,200)
   const persistence=app.load('native-assistant-session-store').createPrismaAssistantSessionStore(app.db.db),assembly=app.app.createNativeAssistantApp(app.request(app.body()),'Australia/Melbourne')
   f.state({session:await persistence.readSession('owner','app-owned-session'),turns:await persistence.conversation.read('owner','app-owned-session'),view:await assembly.host.snapshot({actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']},'app-owned-session')})
   await f.control.nativeResult({},'owner',{sessionId:'billing-session',callId:payload.callId,result:{assistantContext:body.assistant}})
  }})
  await f.worker.monitor(f.job);const body=parse(f.sent.find(row=>row.type==='session.commentary.append'))
  assert.equal(body.saved,false);assert.equal(body.safeToClaimSaved,false);assert.equal(body.needsReview,true);assert.equal(body.status,'review_pending')
  assert(!body.speech.includes('Saved as a draft'));assert.equal(app.counts().postCalls,0);assert.equal(f.f.row().toolJobs.jobs[0].result.needsReview,true)
 })
 console.log(`Voice worker result state: ${groups} actual-source offline groups passed. Model speech compliance still requires app testing. No provider, AWS, account, real database or spend.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
