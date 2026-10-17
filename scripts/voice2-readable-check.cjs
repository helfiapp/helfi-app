#!/usr/bin/env node
'use strict'
// Actual pure formatter and projections only. No app bootstrap or provider.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 assert(['native-assistant-readable','native-assistant-catalog','native-assistant-domain-adapters','native-assistant-action-id','native-assistant-registry','native-assistant-record-reads'].includes(name),'Unexpected dependency '+name)
 const source=fs.readFileSync(path.join(root,'lib',name+'.ts'),'utf8'),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,exports={}
 new Function('exports','require',code)(exports,id=>{if(id==='crypto'||id==='node:crypto')return crypto;if(id.startsWith('./'))return load(id.slice(2));throw Error('Forbidden import '+id)})
 cache.set(name,exports);return exports
}
const {formatNativeAssistantView:format}=load('native-assistant-readable')
const view=(operation,result,kind='read')=>({status:'completed',id:'PRIVATE_SESSION',actorId:'PRIVATE_ACTOR',revision:929,steps:[{id:'PRIVATE_STEP',operation,kind,status:'completed',result}]})
const shown=(operation,data)=>format(view(operation,{sourceVersion:'PRIVATE_VERSION',operation,selection:{id:'PRIVATE_SELECTION'},data}))
const hidden=output=>{for(const internal of ['PRIVATE_','sourceVersion','recoveryActionId','actorId','receiptClaimed','reviewToken','__importRecipe'])assert(!output.includes(internal),output)}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('actual report/day context messages remain exact readable source text without backend fallback',()=>{
  const message='Stored report summary:\nThe full saved report.\nThis second paragraph must remain.'
  assert.equal(format(view('reports.weekly.read',{message,data:{reportId:'PRIVATE_REPORT',storedText:message},sourceVersion:'PRIVATE_VERSION'})),message)
  assert.equal(format(view('food.day_context.read',{message:'Some saved food has unreported calorie information.',budget:{remainingCalories:null},sourceVersion:'PRIVATE_VERSION'})),'Some saved food has unreported calorie information.')
  const output=format(view('unknown.read',{id:'PRIVATE_ID',sourceVersion:'PRIVATE_VERSION',saved:true}));hidden(output);assert(!output.includes('saved'));assert(!output.includes('{'))
 })
 await check('complete literal journal notes keep every line and read results never announce a new save',()=>{
  const content='First exact line.\n'+('Complete literal journal content. '.repeat(700))+'\nLast exact line!'
  const read=format(view('journal.health.read',{entry:{id:'PRIVATE_ID',content,localDate:'2026-10-17',sourceVersion:'PRIVATE_VERSION'}}))
  assert(read.includes(content));assert(read.startsWith('Journal entry'));assert(!read.includes('Saved journal entry'));hidden(read)
  const saved=format(view('journal.mood.create',{entry:{id:'PRIVATE_ID',title:'Literal title',content,localDate:'2026-10-17',tags:['calm']}},'write'))
  assert(saved.includes(content));assert(saved.startsWith('Saved journal entry'));assert(saved.includes('Tags: calm'));hidden(saved)
 })
 await check('water/exercise/mood lists use actual amounts titles dates and notes with explicit partial counts',()=>{
  const water=shown('water.list',{localDate:'2026-10-17',entries:[{id:'PRIVATE_ID',amount:0,unit:'ml',amountMl:0,label:'Morning glass',localDate:'2026-10-17'}],totalCount:3,truncated:true})
  assert(water.includes('0 ml'));assert(water.includes('Morning glass'));assert(water.includes('Showing 1 of 3 records'));hidden(water)
  const exercise=shown('exercise.list',{entries:[{id:'PRIVATE_ID',name:'Walking',durationMinutes:null,distanceKm:2.5,calories:0,localDate:'2026-10-17'}],totalCount:1})
  assert(exercise.includes('Walking'));assert(exercise.includes('2.5 km'));assert(exercise.includes('0 calories'));assert(!exercise.includes('0 minutes'));hidden(exercise)
  const mood=shown('mood.entries.list',{entries:[{id:'PRIVATE_ID',mood:4,note:'Exact mood note\nNew line',tags:['rested'],localDate:'2026-10-17'}],totalCount:null,sourceMayHaveMore:true})
  assert(mood.includes('4 of 7'));assert(mood.includes('Exact mood note\nNew line'));assert(mood.includes('partial list'));hidden(mood)
 })
 await check('notification and check-in formatting hides identities while matching exact rating and note',()=>{
  const notifications=shown('notifications.inbox.list',{entries:[{id:'PRIVATE_NOTIFICATION',title:'Your report',body:'Full notification\nSecond line',status:'unread',createdAt:'2026-10-17T04:30:00.000Z'}],totalCount:null,truncated:false})
  assert(notifications.includes('Your report'));assert(notifications.includes('Unread'));assert(notifications.includes('2026-10-17 at 04:30 UTC'));assert(notifications.includes('Full notification\nSecond line'));hidden(notifications)
  const result=shown('checkin.today',{localDate:'2026-10-17',issues:[{id:'PRIVATE_ISSUE_A',name:'Sleep'},{id:'PRIVATE_ISSUE_B',name:'Energy'},{id:'PRIVATE_ISSUE_C',name:'Comfort'}],ratings:[{issueId:'PRIVATE_ISSUE_A',value:0,isNa:false,note:'Exact reason'},{issueId:'PRIVATE_ISSUE_B',value:null,isNa:true}],totalCount:3})
  assert(result.includes('Sleep: 0 of 6'));assert(result.includes('Energy: Not applicable'));assert(result.includes('Comfort: No rating recorded'));assert(result.includes('Exact reason'));hidden(result)
 })
 await check('profile labels expose only known personal fields and preserve unknown values without guessing units',()=>{
  const output=shown('health_setup.saved.read',{profile:{firstName:'Alex',bio:'Exact biography',dateOfBirth:null,actorId:'PRIVATE_ACTOR',issueId:'PRIVATE_ISSUE'},saved:{weight:'80',height:null,allergies:['peanuts'],goalCalorieTarget:null,sourceVersion:'PRIVATE_VERSION',healthSituations:{healthIssues:'Stored condition',debug:'PRIVATE_DEBUG'},goalMacroSplit:{proteinPct:0.3,carbPct:0.4,fatPct:0.3,token:'PRIVATE_TOKEN'}}})
  assert(output.includes('First name: Alex'));assert(output.includes('Weight: 80'));assert(!output.includes('80 kg'));assert(output.includes('Height: Not recorded'));assert(output.includes('Daily calorie target: Not recorded'));assert(output.includes('Allergies: peanuts'));assert(output.includes('Health issues: Stored condition'));hidden(output)
 })
 await check('food nutrients preserve zero versus unknown and complete recipe instructions remain literal',()=>{
  const output=shown('food.diary.detail',{entry:{id:'PRIVATE_ID',label:'Exact soup',localDate:'2026-10-17',nutrition:{calories:0,protein_g:null,carbs_g:12,fat_g:null,__importRecipe:{title:'Exact soup',servings:2,ingredients:['200 g beans','250 ml water'],steps:['First exact step.\nKeep the second line.','Final exact step.'],sourceUrl:'PRIVATE_URL'}}}})
  assert(output.includes('Calories: 0'));assert(output.includes('Protein: Not recorded'));assert(output.includes('Carbohydrates: 12 g'));assert(output.includes('First exact step.\nKeep the second line.'));assert(output.includes('2. Final exact step.'));hidden(output)
  const total=shown('food.diary.totals',{localDate:'2026-10-17',entryCount:2,totals:{calories:null,protein_g:0}})
  assert(total.includes('Calories: Not recorded'));assert(total.includes('Protein: 0 g'));assert(!total.includes('Calories: 0'))
 })
 await check('clinical nested stored content remains readable and private metadata is excluded at every level',()=>{
  const analysis={summary:'Exact summary',analysisText:'Long exact analysis\n'+('Full stored text. '.repeat(1500)),possibleCauses:[{name:'Stored possible cause',whyLikely:'Stored reason',id:'PRIVATE_CAUSE',sourceVersion:'PRIVATE_VERSION',details:{text:'Stored nested detail',debug:'PRIVATE_DEBUG'}}],redFlags:['Exact warning'],nextSteps:['Exact next step'],disclaimer:'Exact stored disclaimer',backend:{token:'PRIVATE_TOKEN'}}
  const output=format(view('symptoms.history.detail',{analyses:[{id:'PRIVATE_ANALYSIS',createdAt:'2026-10-17T04:30:00Z',symptoms:['headache'],notes:'Literal symptom note',analysis}],totalMatched:1,complete:true}))
  for(const exact of [analysis.summary,analysis.analysisText,'Stored possible cause','Stored reason','Stored nested detail','Exact warning','Exact next step','Exact stored disclaimer','Literal symptom note'])assert(output.includes(exact),exact)
  hidden(output);assert(!output.includes('{'));assert(!output.includes('saved:true'))
  const uncertain=format({status:'active',steps:[{operation:'symptoms.analyze',kind:'write',status:'uncertain',unverifiedResult:{generated:true,saved:false,status:'generated_not_saved',analysis}}]})
  assert(uncertain.includes('has not been confirmed'));assert(uncertain.includes(analysis.analysisText));hidden(uncertain)
 })
 await check('questions and review/clarification states preserve controls without success claims',()=>{
  assert.equal(format(null,'Which date?'),'Which date?');assert.equal(format(null),'Please give your request.')
  const step={operation:'water.create',kind:'write',status:'review',review:{summary:'Save exactly 200 mL?'},result:{message:'PRIVATE_WRONG_SUCCESS'}}
  assert.equal(format({steps:[step]}),'Save exactly 200 mL?')
  assert.equal(format({steps:[{...step,review:undefined,status:'needs_details',missing:['values.durationMinutes','values.exerciseTypeId']}]}),'Please provide: Duration (minutes), Exercise type.')
  assert(!format({steps:[{...step,review:undefined,status:'executing'}]}).includes('PRIVATE_'))
  assert.equal(format({status:'stopped',steps:[{...step,status:'cancelled'}]}),'This request has stopped.')
 })
 await check('actual catalog projections keep normal readable food messages and explicit partial lists',()=>{
  const {createNativeAssistantCatalog}=load('native-assistant-catalog')
  const unused=async()=>{throw Error('unused')},catalog=createNativeAssistantCatalog({authenticatedActor:async()=>null,foodRead:unused,healthJournal:{create:unused,read:unused}})
  const message='Saved foods: breakfast soup. Stored recipe steps: First exact step; Final exact step.'
  const projection=catalog.get('food.diary.list').plannerResult({message,data:{localDate:'2026-10-17',entries:[{id:'PRIVATE_ID',label:'Breakfast soup',nutrition:{calories:null}}],totalCount:2,truncated:true}})
  assert.equal(projection.message,message);const output=format(view('food.diary.list',projection));assert(output.startsWith(message));assert(output.includes('Showing 1 of 2 records'));hidden(output)
  assert.equal(catalog.get('food.diary.totals').plannerResult({message:'Calories not recorded.',data:{totals:{calories:null},entryCount:1}}).message,'Calories not recorded.')
 })
 await check('actual owned record factory projections use the same field shapes as the readable results',async()=>{
  const {createNativeAssistantRecordReadOperations}=load('native-assistant-record-reads'),ctx={actorId:'PRIVATE_ACTOR',localDate:'2026-10-17',capabilities:[]}
  const sources={
   'water.list':{entries:[{id:'PRIVATE_WATER',userId:ctx.actorId,localDate:ctx.localDate,amount:250,unit:'ml',amountMl:250,label:'Afternoon glass',category:'water',createdAt:'2026-10-17T05:00:00Z'}]},
   'exercise.list':{entries:[{id:'PRIVATE_EXERCISE',userId:ctx.actorId,localDate:ctx.localDate,exerciseType:{id:32,name:'Normal walking'},durationMinutes:20,distanceKm:null,calories:80,startTime:null,createdAt:null}]},
   'notifications.inbox.list':{items:[{id:'PRIVATE_NOTIFICATION',userId:ctx.actorId,title:'Normal title',body:'Normal complete body',status:'unread',createdAt:'2026-10-17T05:00:00Z',readAt:null}]},
   'checkin.today':{issues:[{id:'PRIVATE_ISSUE',userId:ctx.actorId,name:'Normal sleep issue',polarity:'negative'}],ratings:[{issueId:'PRIVATE_ISSUE',userId:ctx.actorId,value:2,isNa:false,note:'Normal literal note',timestamp:'2026-10-17T05:00:00Z'}]},
   'profile.read':{data:{profileInfo:{firstName:'Normal first name',lastName:'Normal last name',bio:'Normal saved biography'}}},
  }
  const operations=createNativeAssistantRecordReadOperations({authenticatedActor:async()=>ctx.actorId,operations:Object.keys(sources),read:async(_ctx,operation)=>({actorId:ctx.actorId,readOnly:true,data:sources[operation]})})
  const expected={'water.list':['250 ml','Afternoon glass'],'exercise.list':['Normal walking','20 minutes','80 calories'],'notifications.inbox.list':['Normal title','Normal complete body','Unread'],'checkin.today':['Normal sleep issue: 2 of 6','Normal literal note'],'profile.read':['First name: Normal first name','About you: Normal saved biography']}
  for(const operation of operations){const actual=await operation.read(ctx,{}),projection=operation.plannerResult(actual),output=format(view(operation.id,projection));for(const exact of expected[operation.id])assert(output.includes(exact),output);hidden(output);assert(!output.includes('{'))}
 })
 await check('current step selection hides retained earlier results without changing the active review',()=>{
  const prior={id:'prior',operation:'journal.health.create',kind:'write',status:'completed',result:{entry:{content:'Earlier saved note'}}},current={id:'current',operation:'reports.status',kind:'read',status:'completed',result:{message:'Your latest weekly report is ready.'}}
  assert.equal(format({status:'completed',currentStepIds:['current'],steps:[prior,current]}),'Your latest weekly report is ready.')
  assert.equal(format({status:'completed',currentStepIds:[],steps:[prior,current]}),'Please continue with your request.')
  assert(format({status:'completed',steps:[prior,current]}).includes('Earlier saved note'))
  assert.equal(format({currentStepIds:['current'],steps:[{...prior,status:'review',review:{summary:'The current active review stays visible.'}},current]}),'The current active review stays visible.')
 })
 console.log(`VOICE 2 readable results: ${groups} actual-source offline groups passed. No providers or normal handler execution.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={run,format}
