#!/usr/bin/env node
'use strict'
// Actual host/runtime/durable store and real normal water confirmation source.
// Synthetic app tables, auth and network only. No provider or real account.
const assert=require('node:assert/strict'),fixture=require('./voice2-host-check.cjs'),appFixture=require('./voice2-app-host-check.cjs'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm')
function nativePure(name){const exports={},source=fs.readFileSync(path.resolve(__dirname,'../native/src/voice',name+'.ts'),'utf8');new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,()=>{throw Error('Unexpected pure native import')});return exports}
const context=()=>({actorId:'synthetic-user',localDate:'2026-10-17',capabilities:[]}),sessionId='owned-host-session'
async function prepare(f,second={id:'later',operation:'water.create',values:{amount:-1,unit:'ml'}}){
 f.plan([{id:'saved',operation:'water.create',values:{amount:250,unit:'ml'}},second])
 const result=await f.host.run(context(),sessionId,{channel:'typed',text:'Log the first drink, then continue with the second action.'})
 return result.session.steps[0].review.id
}
function retained(result,f){assert.equal(f.normal.calls.post,1);assert.equal(result.session.status,'active');assert.equal(result.session.steps[0].status,'completed');assert.equal(result.session.steps[0].result.message,'Water saved.');assert(result.session.steps[0].confirmedReviewId);assert(result.session.steps[0].completionId);assert.equal(result.session.steps[1].status,'pending');assert.match(result.question,/earlier change is confirmed/i);assert.match(result.question,/next action/i)}
let groups=0
async function check(name,fn){await fn();groups++;console.log('PASS '+name)}
async function run(){
 await check('next invalid literal never hides the verified normal save and old review replay never repeats submission',async()=>{
  const f=fixture.setup(),reviewId=await prepare(f),result=await f.run({type:'confirm',reviewId},'confirm:'+reviewId);retained(result,f);assert.match(result.question,/supported number/)
  const again=await f.run({type:'confirm',reviewId},'confirm:'+reviewId);retained(again,f);assert.match(again.question,/still needs/)
  const corrected=await f.host.run(context(),sessionId,{channel:'typed',text:'Change the next amount to300mL.',command:{type:'correct',stepId:'later',values:{amount:300}}});assert.equal(corrected.session.steps[1].status,'review');assert.equal(f.normal.calls.post,1)
 })
 await check('transient later preparation failure returns existing receipt without exposing private error diagnostics',async()=>{
  const f=fixture.setup(),original=f.normal.creations.prepare;let laterCalls=0
  f.normal.creations.prepare=async(ctx,operation,values)=>{if(values.amount===300){laterCalls++;throw Error('PRIVATE_DATABASE_HOST password=PRIVATE_SECRET')}return original(ctx,operation,values)}
  const reviewId=await prepare(f,{id:'later',operation:'water.create',values:{amount:300,unit:'ml'}}),result=await f.run({type:'confirm',reviewId},'confirm:'+reviewId);retained(result,f);assert(!result.question.includes('PRIVATE_'))
  retained(await f.run({type:'confirm',reviewId},'confirm:'+reviewId),f);assert.equal(laterCalls,1,'A completed confirm replay must not automatically retry the later failing preparation')
 })
 await check('failed later read verification preserves exact first normal write instead of claiming full plan completion',async()=>{
  const f=fixture.setup(),reviewId=await prepare(f,{id:'later',operation:'owned.read',values:{}});f.readAllowed(false)
  const result=await f.run({type:'confirm',reviewId},'confirm:'+reviewId);retained(result,f);assert.match(result.question,/could not verify/)
 })
 await check('successful read-only recovery retains its existing normal save even if the next preparation fails',async()=>{
  const f=fixture.setup(),reviewId=await prepare(f);f.normal.lose(true)
  const uncertain=await f.run({type:'confirm',reviewId},'confirm:'+reviewId);assert.equal(uncertain.session.steps[0].status,'uncertain');const actionId=uncertain.session.steps[0].recoveryActionId
  const result=await f.run({type:'recover',actionId},'recover:'+actionId);retained(result,f);assert.equal(f.normal.calls.get,1)
  const replay=await f.run({type:'recover',actionId},'recover:'+actionId);retained(replay,f);assert.equal(f.normal.calls.get,1);assert.match(replay.question,/still needs/)
 })
 await check('authentication/permission revocation during next preparation still propagates instead of exposing saved output',async()=>{
  for(const mode of['actor','403','unauthorized']){
   const f=fixture.setup(),original=f.normal.creations.prepare
   f.normal.creations.prepare=async(ctx,operation,values)=>{if(values.amount===300){if(mode==='actor')f.actor('other');const error=Error('Synthetic access denied');if(mode==='403')error.status=403;if(mode==='unauthorized')error.code='unauthorized';throw error}return original(ctx,operation,values)}
   const reviewId=await prepare(f,{id:'later',operation:'water.create',values:{amount:300,unit:'ml'}})
   await assert.rejects(()=>f.run({type:'confirm',reviewId},'confirm:'+reviewId));assert.equal(f.normal.calls.post,1)
  }
 })
 await check('abort after the first verified save never publishes a catch-path completion response',async()=>{
  const f=fixture.setup(),original=f.normal.creations.prepare,controller=new AbortController()
  f.normal.creations.prepare=async(ctx,operation,values)=>{if(values.amount===300){controller.abort();throw Error('Synthetic cancelled preparation')}return original(ctx,operation,values)}
  const reviewId=await prepare(f,{id:'later',operation:'water.create',values:{amount:300,unit:'ml'}})
  await assert.rejects(()=>f.run({type:'confirm',reviewId},'confirm:'+reviewId,{...context(),signal:controller.signal}));assert.equal(f.normal.calls.post,1)
 })
 await check('actual app confirmation returns200 with exact saved journal and native refresh evidence after the next literal fails',async()=>{
  const f=appFixture.setup(),literal='First exact journal note.\nKeep both lines.'
  f.plan([{id:'saved',operation:'journal.health.create',values:{content:literal}},{id:'later',operation:'journal.health.create',values:{content:''}}])
  const prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json();assert.equal(prepared.draft.canConfirm,true)
  const response=await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft),data=await response.json();assert.equal(response.status,200);assert.equal(f.counts().postCalls,1);assert.equal(data.assistant.steps[0].result.entry.content,literal);assert.equal(data.assistant.steps[1].status,'pending');assert.match(data.draft.confirmationMessage,/earlier change is confirmed/)
  const accepted=nativePure('generalAssistantSession').acceptGeneralAssistantResponse(data,'owner','app-owned-session',prepared.draft.assistantPlan.reviewId);assert(accepted);assert.equal(accepted.saved,false,'The whole combined request must not be called saved')
  const effects=nativePure('generalAssistantEffects').generalAssistantCompletionEvents(accepted.view,'owner',[]);assert(effects.events.some(event=>event.name==='helfi:health-journal-changed'));assert.equal(effects.events.filter(event=>event.name==='helfi:health-journal-changed').length,1)
  const again=await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft);assert.equal(again.status,200);assert.equal(f.counts().postCalls,1)
 })
 await check('typed general request uses actual current day even when the selected diary screen shows an earlier day',async()=>{
  const h=require('./voice2-native-session-check.cjs').requestHarness()
  h.box.launchContext={section:'food',date:'2026-10-16'}
  const result=await h.run('How many calories do I have left today?');assert.equal(result.ok,true)
  assert.equal(h.calls[0].body.localDate,h.box.todayLocalDate());assert.equal(h.calls[0].body.localDate,'2026-10-17')
  assert.equal(h.calls[0].body.launchContext.date,'2026-10-16','Selected source date stays distinct in the native transport')
  assert.equal(h.calls[0].body.selectedLocalDate,'2026-10-16','Selected source date is carried separately from the actual current day')
 })
 await check('structured dictated journal content never enters the legacy local conversation deletion shortcut',async()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../native/src/voice/VoiceAssistant.tsx'),'utf8'),ast=ts.createSourceFile('VoiceAssistant.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback
  function walk(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='onActionRequest'&&node.initializer.getText(ast).includes('generalAssistantHeardRef'))callback=node.initializer.getText(ast);ts.forEachChild(node,walk)}walk(ast);assert(callback)
  let clears=0,dispatches=0,request,command;const noop=()=>{},ref=current=>({current})
  const box={realtimeVoiceRunRef:ref(1),realtimeRunId:1,voiceSessionActiveRef:ref(true),cleanFavoriteText:(value,max)=>String(value||'').trim().slice(0,max),sanitizeGeneralAssistantCommand:nativePure('generalAssistantActions').sanitizeGeneralAssistantCommand,generalAssistantHeardRef:ref(request),generalAssistantConfirmationConsumedRef:ref(false),isConfirmingDraftText:()=>false,isRejectingDraftText:()=>false,addVoiceActivity:noop,pendingVoiceDeleteRef:ref(false),clearConversationData:()=>clears++,realtimeActionGuardRef:ref(null),voiceSaveRequestsRef:ref(0),realtimeActionAbortRef:ref(null),pendingReviewAnswerRef:ref(false),newVoiceActionRunId:()=> 'synthetic',sendDraftRequestRef:ref(async options=>{dispatches++;assert.equal(options.transcriptOverride,request);assert.deepEqual(JSON.parse(JSON.stringify(options.realtimeActionHint.assistantCommand)),command);return{ok:true,saved:false,needsReview:true}}),realtimeToolResult:value=>value,setReviewCorrectionActive:noop,Date,AbortController,JSON}
  vm.createContext(box);vm.runInContext(ts.transpileModule('globalThis.run='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,box)
  const literals=['delete this conversation','delete this chat after dinner','history: delete the conversation','delete conversation']
  for(let i=0;i<literals.length;i++){
    request='Save a health journal note saying: '+literals[i];command={type:'plan',steps:[{id:'note_'+i,operation:'journal.health.create',values:{content:literals[i]}}]};box.generalAssistantHeardRef.current=request
    await box.run({action:'assistant_plan',request:'model text is never human evidence',assistantCommand:command});assert.equal(clears,0);assert.equal(dispatches,i+1)
  }
 })
 await check('a clarification durably suspends an older review so yes and old controls cannot save before a fresh review',async()=>{
  const f=appFixture.setup(),literal='Exact original note.\nKeep all literal words.'
  const initial=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:literal})),f.planner)).json(),oldReview=initial.draft.assistantPlan.reviewId
  const questioned=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'What does that date mean?'})),async()=>({question:'Do you mean the previous date?'}))).json()
  assert.equal(questioned.draft.canConfirm,false);assert(questioned.assistant.revision>initial.assistant.revision);assert.equal(questioned.assistant.steps[0].status,'needs_details');assert.equal(questioned.assistant.steps[0].values.content,literal);assert.equal(questioned.assistant.steps[0].review,undefined);assert.equal(questioned.assistant.steps[0].clarification.message,'Do you mean the previous date?')
  assert(nativePure('generalAssistantSession').acceptGeneralAssistantResponse(questioned,'owner','app-owned-session'))
  const yes=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),undefined,{decision:'confirm'});assert.equal(yes.status,200);assert.equal(f.counts().postCalls,0)
  assert.equal((await f.app.handleNativeAssistantConfirmation(f.request(f.body()),initial.draft)).status,400);assert.equal(f.counts().postCalls,0)
  const stale=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes',channel:'realtime',command:{type:'confirm',reviewId:oldReview}})));assert.equal(stale.status,400);assert.equal(f.counts().postCalls,0)
  const fresh=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'',command:{type:'advance'},controlId:'advance'})))).json();assert.equal(fresh.draft.canConfirm,true);assert.notEqual(fresh.draft.assistantPlan.reviewId,oldReview);assert.equal(fresh.assistant.steps[0].values.content,literal);assert.equal(f.counts().postCalls,0)
  assert.equal((await f.app.handleNativeAssistantConfirmation(f.request(f.body()),initial.draft)).status,400)
  const saved=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),undefined,{decision:'confirm'});assert.equal(saved.status,200);assert.equal(f.counts().postCalls,1);assert.equal(f.entries[0].content,literal)
 })
 await check('private review suspension checks exact revision account lease fence and abort before changing durable state',async()=>{
  const f=fixture.setup(),reviewId=await prepare(f),before=await f.host.snapshot(context(),sessionId),expected={reviewId,revision:before.revision}
  await assert.rejects(()=>f.host.runtime.suspendReview(context(),sessionId,{...expected,revision:expected.revision+1},'Question?'),error=>error.code==='stale_review')
  await assert.rejects(()=>f.host.runtime.suspendReview(context(),sessionId,expected,'Question?',async()=>{throw Error('Synthetic lost turn fence')}),/turn fence/)
  const controller=new AbortController();controller.abort();await assert.rejects(()=>f.host.runtime.suspendReview({...context(),signal:controller.signal},sessionId,expected,'Question?'))
  f.actor('other');await assert.rejects(()=>f.host.runtime.suspendReview(context(),sessionId,expected,'Question?'));f.actor('synthetic-user')
  const after=await f.host.snapshot(context(),sessionId);assert.equal(after.revision,before.revision);assert.equal(after.steps[0].review.id,reviewId);assert.equal(after.steps[0].status,'review');assert.equal(f.normal.calls.post,0)
 })
 await check('initial question survives restart and yes answers it without saving until a fresh explicit review is confirmed',async()=>{
  const f=appFixture.setup(),literal='Exact journal words.\nPreserve this line.',ctx={actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']};let calls=0
  const question=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:literal})),async()=>({question:'Should I use today for this Health Journal note?'}))).json();assert.equal(question.draft.canConfirm,false);assert.equal(question.draft.assistantPlan.revision,0);assert.equal(f.counts().postCalls,0)
  const make=()=>f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne').host
  assert.equal(await make().hasPendingQuestion(ctx,'app-owned-session'),true)
  const answer=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),async turn=>{calls++;assert.equal(turn.answeringQuestion,true);assert.equal(turn.text,'yes');assert(turn.history.some(item=>item.text===literal));assert(turn.history.some(item=>item.text==='Should I use today for this Health Journal note?'));assert(turn.history.every(item=>item.questionRevision===undefined));return{command:{type:'plan',steps:[{id:'new_note',operation:'journal.health.create',values:{content:literal,localDate:'2026-10-17'}}]}}},{decision:'confirm'}),prepared=await answer.json()
  assert.equal(answer.status,200);assert.equal(prepared.draft.canConfirm,true);assert.equal(f.counts().postCalls,0);assert.equal(await make().hasPendingQuestion(ctx,'app-owned-session'),false)
  const saved=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),async()=>{throw Error('Explicit save must not call a planner')},{decision:'confirm'});assert.equal(saved.status,200);assert.equal(f.counts().postCalls,1);assert.equal(f.entries[0].content,literal);assert.equal(calls,1);assert.equal(await make().hasPendingQuestion(ctx,'app-owned-session'),false)
 })
 await check('stale question revision after completed state cannot trigger an extra planner request or save',async()=>{
  const f=appFixture.setup(),ctx={actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']},prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json();await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)
  const persistence=f.load('native-assistant-session-store').createPrismaAssistantSessionStore(f.db.db);await persistence.conversation.append('owner','app-owned-session',{role:'assistant',text:'An older question?',questionRevision:0})
  const host=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne').host;assert.equal(await host.hasPendingQuestion(ctx,'app-owned-session'),false);let calls=0
  const response=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),async()=>{calls++;throw Error('Stale marker may not start a planner')},{decision:'confirm'});assert.equal(response.status,200);assert.equal(calls,0);assert.equal(f.counts().postCalls,1)
 })
 await check('question markers validate durable role revision and ownership while aborted or foreign reads refuse',async()=>{
  const f=appFixture.setup(),ctx={actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']},persistence=f.load('native-assistant-session-store').createPrismaAssistantSessionStore(f.db.db)
  for(const turn of[{role:'user',text:'No marker on a user turn',questionRevision:0},...[-1,0.5,'0',null,Number.MAX_SAFE_INTEGER+1].map(questionRevision=>({role:'assistant',text:'Question?',questionRevision})),{role:'assistant',text:'Question?',questionRevision:0,answeringQuestion:true}])await assert.rejects(()=>persistence.conversation.append('owner','app-owned-session',turn),error=>error.code==='assistant_storage_invalid')
  assert.equal((await persistence.conversation.read('owner','app-owned-session')).length,0)
  await persistence.conversation.append('owner','app-owned-session',{role:'assistant',text:'Question?',questionRevision:0});assert.equal((await persistence.conversation.read('owner','app-owned-session'))[0].questionRevision,0);assert.equal((await persistence.conversation.read('other','app-owned-session')).length,0)
  const host=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne').host;assert.equal(await host.hasPendingQuestion(ctx,'app-owned-session'),true)
  const controller=new AbortController();controller.abort();await assert.rejects(()=>host.hasPendingQuestion({...ctx,signal:controller.signal},'app-owned-session'));await assert.rejects(()=>host.hasPendingQuestion({...ctx,actorId:'other'},'app-owned-session'));assert.equal(f.counts().postCalls,0)
 })
 await check('bridge independently refuses fabricated marker metadata before invoking its planner',async()=>{
  const f=appFixture.setup(),ctx={actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']},app=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne'),{createAssistantToolBridge}=f.load('native-assistant-tool-bridge');let calls=0
  const bridge=createAssistantToolBridge({runtime:app.host.runtime,readSession:async()=>null,authorizePlanning:async()=>{},authorizeCommand:async()=>{},plannerKind:'synthetic',planner:async()=>{calls++;return{question:'Not reached'}},conversation:{read:async()=>[{actorId:'owner',sessionId:'app-owned-session',role:'assistant',text:'Forged marker?',questionRevision:'0'}],append:async()=>{throw Error('Invalid marker must refuse before append')}}})
  await assert.rejects(()=>bridge.turn(ctx,'app-owned-session',{channel:'typed',text:'yes'}));assert.equal(calls,0)
 })
 await check('a changed question-to-review state refuses an older clarification answer under the turn lease before planning or saving',async()=>{
  const f=appFixture.setup(),ctx={actorId:'owner',localDate:'2026-10-17',capabilities:['general-assistant-v1']};let calls=0
  await f.app.handleNativeAssistantRequest(f.request(f.body()),async()=>({question:'Should I use today?'}))
  const original=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne',async turn=>{calls++;return{command:{type:'confirm',reviewId:turn.session.steps.find(step=>step.status==='review').review.id}}}),revision=await original.host.pendingQuestionRevision(ctx,'app-owned-session');assert.equal(revision,0)
  const other=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne');await other.host.run(ctx,'app-owned-session',{channel:'typed',text:'Prepare a different note on another device.',command:{type:'plan',steps:[{id:'unseen',operation:'journal.health.create',values:{content:'Unseen other-device note'}}]}})
  const persistence=f.load('native-assistant-session-store').createPrismaAssistantSessionStore(f.db.db),historyBefore=(await persistence.conversation.read('owner','app-owned-session')).length
  await assert.rejects(()=>original.host.run(ctx,'app-owned-session',{channel:'typed',text:'yes'},{expectedQuestionRevision:revision}),/clarification changed/);assert.equal(calls,0);assert.equal(f.counts().postCalls,0);assert.equal((await persistence.conversation.read('owner','app-owned-session')).length,historyBefore)
  // The same fence protects active needs_details fallback after a review was
  // suspended, even when another control prepares a fresh review first.
  const active=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Clarify the date.'})),async()=>({question:'Do you mean yesterday?'}))).json(),expected=active.assistant.revision
  await other.host.run(ctx,'app-owned-session',{channel:'typed',text:'',command:{type:'advance'},controlId:'advance'})
  await assert.rejects(()=>original.host.run(ctx,'app-owned-session',{channel:'typed',text:'yes'},{expectedQuestionRevision:expected}),/clarification changed/);assert.equal(calls,0);assert.equal(f.counts().postCalls,0)
 })
 await check('No answers a genuine initial question while No to a current review still declines without a planner',async()=>{
  const f=appFixture.setup();let calls=0
  await f.app.handleNativeAssistantRequest(f.request(f.body({text:'I want a journal note.'})),async()=>({question:'Should I use today?'}))
  const response=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'no'})),async turn=>{calls++;assert.equal(turn.answeringQuestion,true);assert.equal(turn.text,'no');return{question:'Which date should I use?'}},{decision:'decline'}),data=await response.json();assert.equal(response.status,200);assert.equal(data.draft.confirmationMessage,'Which date should I use?');assert.equal(f.counts().postCalls,0);assert.equal(calls,1)
  const prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Use today and keep the exact note.'})),f.planner)).json();assert.equal(prepared.draft.canConfirm,true)
  const declined=await f.app.handleNativeAssistantRequest(f.request(f.body({text:'no'})),async()=>{calls++;throw Error('A current review decline must not start a planner')},{decision:'decline'});assert.equal(declined.status,200);assert.equal((await declined.json()).assistant.status,'stopped');assert.equal(calls,1);assert.equal(f.counts().postCalls,0)
 })
 console.log(`VOICE 2 final integration audit: ${groups} actual-source offline groups passed. No providers, live credits or real database.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={run}
