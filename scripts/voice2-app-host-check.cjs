#!/usr/bin/env node
'use strict'
// Actual app assembly, endpoint, early voice branch, host/runtime/persistence
// and normal Health Journal POST/GET. Synthetic auth, tables and planner only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const storage=require('./voice2-session-store-check.cjs'),clinicalFixture=require('./voice-symptom-analysis-check.cjs'),base=clinicalFixture.base,clone=value=>JSON.parse(JSON.stringify(value)),root=path.resolve(__dirname,'..')
class Req extends Request{}
const json=(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200,headers:{'content-type':'application/json',...Object.fromEntries(new Headers(init.headers))}})
function setup(){
 base.AuditDate.setNow(Date.UTC(2026,9,17,1));const db=storage.database(),entries=[];let actor='owner',webActor='owner',postCalls=0,readCalls=0,losePost=false,plannerCalls=0,providerCalls=0,domainPrepares=0,meteredCalls=0,customPlan=null,consentGranted=true
 db.db.healthJournalEntry={findUnique:async({where})=>clone(entries.find(row=>row.id===where.id)||null),findMany:async({where})=>clone(entries.filter(row=>row.userId===where.userId&&row.localDate===where.localDate)),create:async({data})=>{if(entries.some(row=>row.id===data.id)){const error=Error('Synthetic duplicate');error.code='P2002';throw error}const row={id:data.id||'manual-'+entries.length,...clone(data),createdAt:'2026-10-17T01:00:00.000Z'};entries.push(row);return clone(row)}}
 const modules=new Map(),allowed=new Set(['native-assistant-app','native-assistant-registry','native-assistant-runtime','native-assistant-tool-bridge','native-assistant-session-store','native-assistant-host','native-assistant-catalog','native-assistant-domain-adapters','native-assistant-core-actions','native-assistant-action-id','native-assistant-readable','native-assistant-food-actions','native-voice-resolved-food','native-voice-recipe-metadata','native-assistant-completions','generalAssistantEffects'])
 const forbidden=label=>(()=>{throw Error('Forbidden offline boundary: '+label)})
 const stateOperation={id:'food.day_context.read',description:'Synthetic fixed current-day read',input:{type:'object',properties:{},required:[]},kind:'read',normalHandler:'synthetic normal services',read:async()=>({verified:true}),verify:async()=>true,plannerResult:()=>({verified:true})}
 let journal
 const coreDependencies={request:()=>new Req('https://helfi.example.invalid/native'),authenticate:async()=>actor,preferences:{prepare:forbidden('unused preference prepare'),execute:forbidden('unused preference execute')},notifications:{prepare:forbidden('unused notification prepare'),execute:forbidden('unused notification execute')},records:{prepare:forbidden('unused record prepare'),execute:forbidden('unused record execute')},appReads:{read:forbidden('unused app read')}}
 function requireFor(name){
  if(name==='crypto')return crypto
  if(name==='../native/src/voice/generalAssistantEffects')return load('generalAssistantEffects')
  if(name==='next/server')return{NextRequest:Req,NextResponse:{json}}
  if(name==='next-auth')return{getServerSession:async()=>webActor?{user:{id:webActor,email:webActor+'@example.invalid'}}:null}
  if(name==='@/lib/auth')return{authOptions:{}}
  if(name==='@/lib/native-auth')return{getUserIdFromNativeAuth:async()=>actor}
  if(name==='@/lib/prisma')return{prisma:db.db}
  if(name==='@/lib/health-journal-db')return{ensureHealthJournalSchema:async()=>{}}
  if(name==='@/lib/native-assistant-action-id')return load('native-assistant-action-id')
  if(name==='@/lib/native-assistant-app')return load('native-assistant-app')
  if(name==='@/lib/ai-consent')return{aiConsentRequiredResponse:async()=>consentGranted?null:json({error:'Synthetic AI consent required',code:'ai_consent_required'},{status:403})}
  if(name==='@/lib/native-voice-action-observability')return{beginVoiceActionTrace:(...values)=>observability.beginVoiceActionTrace(...values),finishVoiceActionTrace:(...values)=>observability.finishVoiceActionTrace(...values)}
  if(name==='@/lib/native-voice-structured-safety')return base.load('lib/native-voice-structured-safety.ts')
  if(name==='@/app/api/health-journal/route')return{GET:async request=>{readCalls++;return journal.GET(request)},POST:async request=>{postCalls++;const result=await journal.POST(request);if(losePost)throw Error('Synthetic lost committed journal response');return result}}
  if(name==='./native-assistant-normal-actions')return{createNativeAssistantNormalActions:()=>({dependencies:coreDependencies,recover:forbidden('unused normal recover')})}
  if(name==='./native-assistant-current-state')return{createCurrentStateNormalServices:()=>({}),createNativeAssistantCurrentStateOperation:()=>stateOperation}
  if(name==='./native-assistant-record-reads')return{RECORD_READ_IDS:[],createNativeAssistantRecordReadNormalServices:()=>({}),createNativeAssistantRecordReadOperations:()=>[]}
  if(name==='./native-assistant-clinical-actions')return{createAssistantClinicalOperations:()=>[{id:'clinical.synthetic_metered',description:'Synthetic separately metered domain',kind:'write',input:{type:'object',properties:{},required:[]},normalHandler:'synthetic metered boundary',prepare:async()=>({data:{},summary:'Separate synthetic paid action.',cost:{kind:'metered',maximumCredits:1}}),execute:async(_context,_prepared,claim)=>{meteredCalls++;return{actionId:claim.actionId,saved:true}},verify:async()=>true}]}
  if(name==='./native-assistant-food-normal-services')return{createNativeAssistantFoodNormalServices:()=>({authenticate:async()=>actor,prepare:forbidden('unused actual-food service prepare'),execute:forbidden('unused actual-food service execute'),verify:forbidden('unused actual-food service verify'),recover:forbidden('unused actual-food service recover')})}
  if(name==='./native-voice-resolved-food')return load('native-voice-resolved-food')
  if(name==='./native-voice-recipe-metadata')return load('native-voice-recipe-metadata')
  if(name==='./native-voice-food-management')return{nativeVoiceFoodManagementIo:{},prepareVoiceFoodManagement:async()=>{domainPrepares++;throw Error('Unexpected food call')}}
  if(name==='./native-assistant-food-reads')return{createNativeAssistantFoodReadService:()=>async()=>{domainPrepares++;throw Error('Unexpected fixed food read')}}
  if(name==='./native-voice-time')return base.load('lib/native-voice-time.ts')
  if(name==='./native-voice-review-token')return base.tokens
  if(name.startsWith('./native-assistant-'))return load(name.slice(2))
  throw Error('Forbidden application import '+name)
 }
 function load(name){if(modules.has(name))return modules.get(name);assert(allowed.has(name),'Unexpected source '+name);const module={exports:{}};modules.set(name,module.exports);const code=ts.transpileModule(fs.readFileSync(name==='generalAssistantEffects'?path.join(root,'native/src/voice/generalAssistantEffects.ts'):path.join(root,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:requireFor,Request,Response,Headers,URL,Buffer,crypto,Date:base.AuditDate,setInterval,clearInterval,console:{log(){},warn(){},error(){}},process:{env:Object.freeze({NODE_ENV:'test'})}},{filename:name+'.ts'});return module.exports}
 const journalCode=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/health-journal/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,journalModule={exports:{}}
 vm.runInNewContext(journalCode,{module:journalModule,exports:journalModule.exports,require:requireFor,Request,Response,Headers,URL,Date:base.AuditDate,console:{error(){}}});journal=journalModule.exports
 db.db.user={findUnique:async({where})=>({id:where.id||actor,country:'AU'})}
 const app=load('native-assistant-app'),body=(extra={})=>({sessionId:'app-owned-session',localDate:'2026-10-17',timeZone:'Australia/Melbourne',channel:'typed',text:'Save this literal note.',aiConsentGranted:true,...extra}),request=values=>new Req('https://helfi.example.invalid/api/native/assistant',{method:'POST',headers:{'content-type':'application/json','x-helfi-voice-capabilities':'general-assistant-v1'},body:JSON.stringify(values)})
 const planner=async turn=>{plannerCalls++;return{command:{type:'plan',steps:customPlan||[{id:'note',operation:'journal.health.create',values:{content:turn.text,localDate:'2026-10-17'}}]}}}
 const routeCode=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/native/assistant/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,routeModule={exports:{}}
 vm.runInNewContext(routeCode,{module:routeModule,exports:routeModule.exports,require:requireFor});const route=routeModule.exports
 const traces=[],traceEvents=[];let legacyCalls=0
 const observability=base.load('lib/native-voice-action-observability.ts',{crypto,Date:base.AuditDate,Headers,Response,NextResponse:{json},console:{info:(...values)=>traces.push(values)},logAiUsageEvent:async event=>traceEvents.push(event)})
 const voice=base.load('app/api/native/voice-assistant/route.ts',{NextRequest:Req,NextResponse:{json},Headers,URL,Intl,URLSearchParams,resolveHelfiTtsVoice:()=> 'synthetic',aiConsentRequiredResponse:async()=>null,getServerSession:async()=>webActor?{user:{id:webActor}}:null,getUserIdFromNativeAuth:async()=>actor,authOptions:{},prisma:db.db,handleNativeAssistantRequest:app.handleNativeAssistantRequest,CreditManager:class{constructor(){providerCalls++;throw Error('Control attempted paid wallet/planner')}},chatCompletionWithCost:()=>{providerCalls++;throw Error('Provider forbidden')},assertAiUsageAllowed:()=>{throw Error('Provider forbidden')},beginVoiceActionTrace:observability.beginVoiceActionTrace,finishVoiceActionTrace:observability.finishVoiceActionTrace})
 voice.prepareVoiceAction=()=>{legacyCalls++;throw Error('General request entered legacy phrase routing')}
 return{app,route,voice,load,body,request,planner,entries,db,journal,traces,traceEvents,counts:()=>({postCalls,readCalls,plannerCalls,providerCalls,domainPrepares,meteredCalls,legacyCalls}),plan:value=>{customPlan=value},lose:value=>{losePost=value},consent:value=>{consentGranted=Boolean(value)},actor:(native,web=native)=>{actor=native;webActor=web},provider:()=>{providerCalls++}}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('yes can answer an owned clarification but must produce a fresh review before any save',async()=>{
  const f=setup(),first=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json()
  const question=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'What does that date mean?'})),async()=>({question:'Do you mean the original date?'}))).json()
  assert.equal(question.draft.canConfirm,false);assert.equal(question.assistant.steps[0].status,'needs_details')
  const fresh=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'yes'})),async turn=>{assert.equal(turn.text,'yes');assert.equal(turn.session.steps[0].status,'needs_details');return{command:{type:'advance'}}},{decision:'confirm'})).json()
  assert.equal(fresh.draft.canConfirm,true);assert.notEqual(fresh.draft.assistantPlan.reviewId,first.draft.assistantPlan.reviewId);assert.equal(f.counts().postCalls,0)
  const saved=await f.app.handleNativeAssistantConfirmation(f.request(f.body()),fresh.draft);assert.equal(saved.status,200);assert.equal(f.counts().postCalls,1)
 })
 await check('current day and selected screen day stay separate validated planner context',async()=>{
  const f=setup();let seen
  const response=await f.app.handleNativeAssistantRequest(f.request(f.body({selectedLocalDate:'2026-10-16'})),async turn=>{seen=turn;return{question:'Please choose the saved entry.'}})
  assert.equal(response.status,200);assert.equal(seen.localDate,'2026-10-17');assert.equal(seen.selectedLocalDate,'2026-10-16');assert.equal(f.counts().postCalls,0)
  const refused=await f.app.handleNativeAssistantRequest(f.request(f.body({sessionId:'invalid-screen-day',selectedLocalDate:'2026-02-30'})),async()=>{throw Error('Invalid source day reached planner')})
  assert.equal(refused.status,400);assert.equal(f.counts().postCalls,0)
 })
 await check('actual app assembly creates a unique fixed registry and new route refuses planning without an installed approved planner',async()=>{
  const f=setup(),app=f.app.createNativeAssistantApp(f.request(f.body()),'Australia/Melbourne');assert.equal(new Set(app.registry.ids()).size,app.registry.ids().length);for(const id of ['food.diary.create','recipe.library.create','food.recipe.log'])assert(app.registry.ids().includes(id))
  const response=await f.route.POST(f.request(f.body()));assert.equal(response.status,400);assert.equal(f.counts().postCalls,0);assert.equal(f.counts().plannerCalls,0)
 })
 await check('literal journal plan saves through actual normal POST and signed app confirmation returns exact confirmed review',async()=>{
  const f=setup(),literal='Literal first line.\n“Keep every word.”',prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:literal})),f.planner)).json();assert.equal(prepared.success,true);assert.equal(prepared.draft.action,'assistant_plan');assert.equal(prepared.draft.canConfirm,true);assert.equal(f.entries.length,0)
  const reviewId=prepared.draft.assistantPlan.reviewId,response=await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft),saved=await response.json();assert.equal(response.status,200);assert.equal(saved.assistant.status,'completed');assert.equal(saved.assistant.steps[0].confirmedReviewId,reviewId);assert.equal(saved.assistant.steps[0].result.entry.content,literal);assert.equal(f.entries[0].content,literal);assert.equal(f.counts().postCalls,1);assert.equal(f.counts().plannerCalls,1)
  const replay=await(await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).json();assert.equal(replay.assistant.steps[0].confirmedReviewId,reviewId);assert.equal(f.counts().postCalls,1)
 })
 await check('lost actual journal response survives app restart and recovers by exact owned GET without another POST',async()=>{
  const f=setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Exact lost-response note.'})),f.planner)).json();f.lose(true);const uncertain=await(await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).json();assert.equal(uncertain.assistant.steps[0].status,'uncertain');assert.equal(f.entries.length,1);assert.equal(f.counts().postCalls,1)
  const actionId=uncertain.assistant.steps[0].recoveryActionId,recovered=await(await f.route.POST(f.request(f.body({text:'',command:{type:'recover',actionId},controlId:'recover:'+actionId})))).json();assert.equal(recovered.assistant.status,'completed');assert.equal(recovered.assistant.steps[0].result.entry.content,'Exact lost-response note.');assert.equal(f.counts().postCalls,1);assert.equal(f.counts().plannerCalls,1)
 })
 await check('new route rejects arbitrary account/provider/field controls and mismatched existing sessions',async()=>{
  const f=setup();for(const extra of [{actorId:'other'},{provider:'openai'},{endpoint:'/anything'},{timeZone:'Invalid/Zone'},{localDate:'2026-02-31'}])assert.equal((await f.route.POST(f.request(f.body(extra)))).status,400)
  f.actor('owner','other');assert.equal((await f.route.POST(f.request(f.body()))).status,401);assert.equal(f.counts().postCalls,0);assert.equal(f.counts().plannerCalls,0)
 })
 await check('tampered signed plan and wrong account cannot save or replay an existing journal action',async()=>{
  const f=setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json(),changed=clone(prepared.draft);changed.assistantPlan.reviewId='other-review';assert.equal((await f.app.handleNativeAssistantConfirmation(f.request(f.body()),changed)).status,409);f.actor('other');assert.equal((await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).status,409);assert.equal(f.counts().postCalls,0)
 })
 await check('actual main voice POST early branch forwards structured confirmation without planner, billing or legacy routing',async()=>{
  const f=setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Exact early-branch note.'})),f.planner)).json(),reviewId=prepared.draft.assistantPlan.reviewId
  const response=await f.voice.POST(f.request({assistantSessionId:'app-owned-session',localDate:'2026-10-17',timeZone:'Australia/Melbourne',transcript:'Yes, save that.',assistantCommand:{type:'confirm',reviewId},aiConsentGranted:true})),saved=await response.json()
  assert.equal(response.status,200);assert.equal(saved.assistant.status,'completed');assert.equal(saved.assistant.steps[0].confirmedReviewId,reviewId);assert.equal(saved.chargedCredits,0);assert.equal(f.counts().providerCalls,0);assert.equal(f.counts().plannerCalls,1);assert.equal(f.counts().postCalls,1)
  assert.equal(f.counts().legacyCalls,0);assert.equal(f.traces.length,1);assert.equal(response.headers.get('x-helfi-voice-action-id'),saved.voiceActionRunId);const trace=JSON.parse(f.traces[0][1]);assert.equal(trace.action,'assistant_plan');assert.equal(trace.status,'answered');assert.equal(trace.reasonCode,'assistant_results_returned');assert.equal(f.traceEvents[0].costCents,0);assert(!JSON.stringify(f.traces).includes('Exact early-branch note.'))
 })
 await check('actual native response validator accepts only exact owner/session/current or confirmed review',async()=>{
  const nativeExports={},nativeCode=ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/generalAssistantSession.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',nativeCode)(nativeExports,name=>{throw Error('Unexpected native dependency '+name)})
  const f=setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Native validator proof.'})),f.planner)).json(),reviewId=prepared.draft.assistantPlan.reviewId,accept=nativeExports.acceptGeneralAssistantResponse
  assert.equal(accept(prepared,'owner','app-owned-session').needsReview,true);assert.equal(accept(prepared,'other','app-owned-session'),null);assert.equal(accept(prepared,'owner','other-session'),null);assert.equal(accept(prepared,'owner','app-owned-session','wrong-review'),null)
  const completed=await(await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).json(),accepted=accept(completed,'owner','app-owned-session',reviewId);assert(accepted);assert.equal(accepted.saved,true);assert.equal(accepted.view.actorId,'owner');assert.equal(accepted.view.steps[0].confirmedReviewId,reviewId)
 })
 await check('ordinary typed retry recovers an uncertain committed journal action without any planner or repeated POST',async()=>{
  const f=setup(),prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body({text:'Typed recovery proof.'})),f.planner)).json();f.lose(true);const uncertain=await(await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft)).json();assert.equal(uncertain.assistant.steps[0].status,'uncertain')
  const recovered=await(await f.route.POST(f.request(f.body({text:'Please check whether that saved.'})))).json();assert.equal(recovered.assistant.status,'completed');assert.equal(f.counts().postCalls,1);assert.equal(f.counts().plannerCalls,1)
 })
 await check('an installed planner never grants permission for a separately metered domain action',async()=>{
  const f=setup();f.plan([{id:'metered',operation:'clinical.synthetic_metered',values:{}}]);const prepared=await(await f.app.handleNativeAssistantRequest(f.request(f.body()),f.planner)).json();assert.equal(prepared.draft.canConfirm,true)
  const response=await f.app.handleNativeAssistantConfirmation(f.request(f.body()),prepared.draft),result=await response.json();assert.equal(response.status,400);assert.equal(result.code,'spending_not_approved');assert.equal(f.counts().meteredCalls,0);assert.equal(f.counts().postCalls,0)
 })
 await check('private provider diagnostics never become a public response while known wallet messages remain clear',async()=>{
  const f=setup(),response=await f.app.handleNativeAssistantRequest(f.request(f.body()),async()=>{throw Error('PRIVATE_PROVIDER_DETAIL synthetic account payload')}),body=await response.json();assert.equal(response.status,400);assert(!JSON.stringify(body).includes('PRIVATE_PROVIDER_DETAIL'));assert.match(body.error,/could not understand/)
  const wallet=await(await f.app.handleNativeAssistantRequest(f.request(f.body({sessionId:'other-owned-session'})),async()=>{throw Error('Insufficient credits')})).json();assert.equal(wallet.error,'Insufficient credits');assert.equal(f.counts().postCalls,0)
 })
 console.log(`VOICE 2 app host: ${groups} actual-source offline groups passed. App assembly and normal journal are real source; planner/auth/storage are synthetic.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,run}
