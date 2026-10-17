#!/usr/bin/env node
'use strict'
// Concrete cross-layer regression reproductions only. Actual native callback
// and pure validator with synthetic hooks/auth/network; never a real app call.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),file='native/src/voice/VoiceAssistant.tsx',source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let callback
function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='sendDraftRequest'){assert(ts.isCallExpression(node.initializer));callback=node.initializer.arguments[0].getText(ast)}ts.forEachChild(node,find)}find(ast);assert(callback)
const nativeExports={},nativeCode=ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/generalAssistantSession.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',nativeCode)(nativeExports,()=>{throw Error('Unexpected native dependency')})
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}},noop=()=>{},ref=value=>({current:value})
async function reproduceAccountSwitchDuringConsent(){
 const consent=deferred(),requests=[],rendered=[],turns=[]
 const reply=()=>({success:true,transcript:'Read my saved health profile.',draft:{action:'assistant_plan',localDate:'2026-10-17',timeZone:'Australia/Melbourne',summary:'Private old-account health data',confirmationMessage:'Private old-account health data',canConfirm:false,autoSave:false,reviewToken:'synthetic-token',assistantPlan:{sessionId:'session-new-account',revision:1}},assistant:{id:'session-new-account',actorId:'owner-old',revision:1,status:'completed',steps:[{id:'profile',operation:'profile.read',kind:'read',status:'completed',result:{message:'Private old-account health data'}}]}})
 const context={emitGeneralAssistantEffects:noop,Date,Number,JSON,AbortController,console:{log:noop,warn:noop,error:noop},session:{token:'synthetic-old-token'},voiceMemoryUserId:'owner-old',voiceReply:false,draft:null,pendingFollowUpDraft:null,transcript:'',launchContext:{},requestConversationHistory:[],
  generalAssistantSessionRef:ref('session-old-account'),voiceAccountTokenRef:ref('synthetic-old-token'),voiceAccountUserIdRef:ref('owner-old'),realtimeVoiceRunRef:ref(1),voiceProviderMountedRef:ref(true),openRef:ref(true),voiceSaveRequestsRef:ref(0),draftRequestAbortRef:ref(null),nativeDeviceReviewRef:ref(null),
  requestAiDataSharingPermission:()=>consent.promise,newVoiceActionRunId:()=> 'synthetic-action',traceVoiceAction:noop,isExplicitNewVoiceCommand:()=>false,isConfirmingDraftText:()=>false,isRejectingDraftText:()=>false,followUpTranscript:()=>null,Alert:{alert:noop},setTranscript:noop,appendConversationTurns:value=>turns.push(...value),makeConversationTurn:(role,text)=>({role,text}),setBusy:noop,addVoiceActivity:noop,setDraft:value=>rendered.push(value),setChargedCredits:noop,loadVoiceFavorites:async()=>[],normalizeLaunchContext:()=>({}),todayLocalDate:()=> '2026-10-17',nativeVoiceTimeZone:()=> 'Australia/Melbourne',buildNativeAuthHeaders:token=>({authorization:token}),
  fetchNativeVoiceAssistant:async work=>{await work('https://synthetic.invalid');return{res:{ok:true},data:reply()}},fetch:async(url,request)=>{requests.push({url,request});return{}},acceptGeneralAssistantResponse:nativeExports.acceptGeneralAssistantResponse,isPendingFollowUpDraft:()=>false,setSaveError:noop,setReviewCorrectionActive:noop,setPendingFollowUpDraft:noop,voiceResultStatusFromDraft:()=> 'general_answer',requestVoiceReply:noop,
 }
 vm.createContext(context);vm.runInContext(ts.transpileModule('globalThis.actualSend='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context,{filename:file})
 const pending=context.actualSend({transcriptOverride:'Read my saved health profile.'})
 // This models the account effect occurring while the consent promise awaits.
 context.voiceAccountTokenRef.current='synthetic-new-token';context.voiceAccountUserIdRef.current='owner-new';context.generalAssistantSessionRef.current='session-new-account';context.realtimeVoiceRunRef.current=2;context.openRef.current=false
 consent.resolve(true);const result=await pending
 return{requests,rendered,turns,result,currentAccount:context.voiceAccountUserIdRef.current}
}
async function reproduceToolBeforeCaptionFlush(){
 const general={},generalCode=ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/generalAssistantActions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',generalCode)(general,()=>{throw Error('Unexpected general sanitizer dependency')})
 let actionCallback
 function findAction(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='onActionRequest'&&node.initializer.getText(ast).includes('generalAssistantHeardRef'))actionCallback=node.initializer.getText(ast);ts.forEachChild(node,findAction)}findAction(ast);assert(actionCallback)
 const heard={current:''},actionResults=[],forwarded=[],context={Date,AbortController,newVoiceActionRunId:()=> 'synthetic-action',addVoiceActivity:noop,realtimeActionGuardRef:ref(null),voiceSaveRequestsRef:ref(0),realtimeActionAbortRef:ref(null),pendingReviewAnswerRef:ref(false),generalAssistantConfirmationConsumedRef:ref(false),isConfirmingDraftText:value=>String(value).toLowerCase()==='yes',isRejectingDraftText:()=>false,setReviewCorrectionActive:noop,realtimeToolResult:value=>value,sendDraftRequestRef:ref(async options=>{forwarded.push(options.transcriptOverride);return{ok:true,saved:false}}),realtimeVoiceRunRef:{current:1},realtimeRunId:1,voiceSessionActiveRef:{current:true},sanitizeGeneralAssistantCommand:general.sanitizeGeneralAssistantCommand,generalAssistantHeardRef:heard,cleanFavoriteText:(value,max)=>String(value||'').trim().slice(0,max)}
 vm.createContext(context);vm.runInContext(ts.transpileModule('globalThis.actualAction='+actionCallback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context)
 const raw=fs.readFileSync(path.join(__dirname,'voice-live-protocol-check.cjs'),'utf8').replace(/^#!.*\n/,'')
 const prefix=raw.slice(0,raw.indexOf('async function main()')).replace('onTranscript: (text) => transcripts.push(text)','onTranscript: (text) => { transcripts.push(text); options.onTranscript?.(text) }, onHumanTranscript: (text) => options.onHumanTranscript?.(text)')
 const nativeHarness=new Function('require','__dirname',prefix+'\nreturn nativeHarness')(require,__dirname)
 const h=nativeHarness({action:args=>{const result=context.actualAction(args);actionResults.push(result);return result},onHumanTranscript:text=>{heard.current=text}});h.box.sanitizeGeneralAssistantCommand=general.sanitizeGeneralAssistantCommand
 const started=await h.started;assert(started.session,started.error?.message)
 h.emit({type:'session.input_transcript.delta',event_id:'user-caption-first',delta:'Read my current ',start_ms:0,end_ms:400});await h.advance(1000)
 h.emit({type:'session.input_transcript.delta',event_id:'user-caption-last',delta:'targets',start_ms:400,end_ms:800})
 h.emit({type:'response.event',event:{type:'response.output_item.done',item:{type:'function_call',name:'request_helfi_action',call_id:'tool-before-caption',arguments:JSON.stringify({action:'assistant_plan',request:'Read my current targets',needsReview:false,assistantCommand:{type:'plan',steps:[{id:'read',operation:'food.day_context.read',values:{}}]}})}}})
 await new Promise(resolve=>setImmediate(resolve));const before={actions:await Promise.all(actionResults),transcripts:h.transcripts.slice(),forwarded:forwarded.slice()};await h.advance(250);await started.session.stop();return before
}
async function reproduceOneYesTwoReviews(){
 const general={},generalCode=ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/generalAssistantActions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',generalCode)(general,()=>{throw Error('Unexpected sanitizer dependency')})
 let actionCallback;function findAction(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='onActionRequest'&&node.initializer.getText(ast).includes('generalAssistantHeardRef'))actionCallback=node.initializer.getText(ast);ts.forEachChild(node,findAction)}findAction(ast);assert(actionCallback)
 const saves=[],makeDraft=id=>({action:'assistant_plan',canConfirm:true,autoSave:false,localDate:'2026-10-17',assistantPlan:{sessionId:'owned-session',reviewId:id}}),context={emitGeneralAssistantEffects:noop,Date,Number,JSON,AbortController,console:{log:noop,warn:noop,error:noop},session:{token:'synthetic-token'},voiceMemoryUserId:'owner',voiceReply:false,draft:makeDraft('review-one'),pendingFollowUpDraft:null,transcript:'',launchContext:{},requestConversationHistory:[],
  generalAssistantSessionRef:ref('owned-session'),generalAssistantHeardRef:ref('Yes'),voiceAccountTokenRef:ref('synthetic-token'),voiceAccountUserIdRef:ref('owner'),realtimeVoiceRunRef:ref(1),realtimeRunId:1,voiceSessionActiveRef:ref(true),voiceProviderMountedRef:ref(true),openRef:ref(true),voiceSaveRequestsRef:ref(0),draftRequestAbortRef:ref(null),nativeDeviceReviewRef:ref(null),realtimeActionAbortRef:ref(null),realtimeActionGuardRef:ref(null),pendingReviewAnswerRef:ref(false),generalAssistantConfirmationConsumedRef:ref(false),sendDraftRequestRef:ref(null),
  requestAiDataSharingPermission:async()=>true,newVoiceActionRunId:()=> 'synthetic-action',traceVoiceAction:noop,isExplicitNewVoiceCommand:()=>false,isConfirmingDraftText:value=>value.toLowerCase()==='yes',isRejectingDraftText:()=>false,Alert:{alert:noop},setTranscript:noop,appendConversationTurns:noop,makeConversationTurn:(role,text)=>({role,text}),setReviewCorrectionActive:noop,addVoiceActivity:noop,cleanFavoriteText:(value,max)=>String(value||'').trim().slice(0,max),sanitizeGeneralAssistantCommand:general.sanitizeGeneralAssistantCommand,realtimeToolResult:result=>result,
  saveDraft:async target=>{saves.push(target.assistantPlan.reviewId);context.draft=makeDraft('review-two');return{success:true}},confirmationRequestResult:()=>({ok:true,saved:true,safeToClaimSaved:true})
 }
 vm.createContext(context);vm.runInContext(ts.transpileModule('globalThis.actualSend='+callback+';globalThis.actualAction='+actionCallback,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context,{filename:file});context.sendDraftRequestRef.current=context.actualSend
 const first=await context.actualAction({action:'assistant_plan',request:'Yes',needsReview:false,assistantCommand:{type:'confirm',reviewId:'review-one'}})
 context.generalAssistantHeardRef.current='Yes' // late duplicate caption, not a new speech-start
 const second=await context.actualAction({action:'assistant_plan',request:'Yes',needsReview:false,assistantCommand:{type:'confirm',reviewId:'review-two'}})
 return{saves,first,second}
}
async function checkTypedLiveCapabilityParity(){
 const clinical=require('./voice2-clinical-actions-check.cjs').setup(),nativeHarness=require('./voice2-realtime-catalog-check.cjs').nativeHarness
 let typedCapabilities
 function findCapabilities(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast).includes('x-helfi-voice-capabilities')&&ts.isStringLiteral(node.initializer)&&node.initializer.text.includes('general-assistant-v1'))typedCapabilities=node.initializer.text;ts.forEachChild(node,findCapabilities)}findCapabilities(ast);assert(typedCapabilities)
 const h=nativeHarness({generalParams:{assistantSessionId:'owned-session',localDate:'2026-10-17',timeZone:'Australia/Melbourne'}}),started=await h.started;assert(started.session,started.error?.message)
 const liveCapabilities=h.requests[0].request.headers['x-helfi-voice-capabilities'].split(','),typed={...clinical.ctx(),capabilities:typedCapabilities.split(',')},live={...clinical.ctx(),capabilities:liveCapabilities}
 assert.deepEqual(clinical.runtime.discover(live).map(action=>action.id),clinical.runtime.discover(typed).map(action=>action.id),'Installed clinical registry discovery must agree for typed and Live')
 const session={id:'owned-session',actorId:clinical.ctx().actorId,revision:1,status:'completed',steps:[{id:'history',operation:'symptoms.history.list',values:{},status:'completed',result:{actorId:clinical.ctx().actorId,verified:true,safeToClaimSaved:false,analyses:[],totalMatched:0,complete:true}}]}
 assert.equal(clinical.runtime.plannerSnapshot(live,session).steps[0].status,'completed');await started.session.stop()
}
async function main(){
 const result=await reproduceAccountSwitchDuringConsent()
 assert.equal(result.currentAccount,'owner-new')
 assert.equal(result.requests.length,0,'An account change during consent must stop before any old-account request');assert(!result.rendered.some(draft=>draft?.summary==='Private old-account health data'),'Old-account data must not be published after the account changes');console.log('PASS actual callback stops old-account request and publication after consent account switch')
 const confirmations=await reproduceOneYesTwoReviews();assert.deepEqual(confirmations.saves,['review-one'],'One actual human confirmation and a late duplicate caption cannot save the following review');console.log('PASS one human Yes authorizes only one exact review, including late old captions')
 const ordering=await reproduceToolBeforeCaptionFlush();assert.equal(ordering.forwarded.length,1,'The actual structured action must reach its server callback');assert.equal(ordering.forwarded[0],'Read my current targets','Display caption flush must not truncate actual human command evidence');console.log('PASS complete actual human utterance survives caption display batches')
 await checkTypedLiveCapabilityParity();console.log('PASS typed and actual Live handshake discover the same clinical operations and restore owned symptom history')
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={reproduceAccountSwitchDuringConsent,reproduceToolBeforeCaptionFlush,reproduceOneYesTwoReviews,main}
