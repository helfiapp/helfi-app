#!/usr/bin/env node
'use strict'
// Actual new normal adapter + normal confirmation/recovery/token source.
// Synthetic owned storage, profile and fixed normal record-read boundary only.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),fixture=require('./voice-symptom-analysis-check.cjs'),crypto=require('node:crypto')
const base=fixture.base,clone=value=>JSON.parse(JSON.stringify(value)),owner='synthetic-user'
const mood=base.load('lib/native-voice-mood-context.ts')
const duration=base.load('lib/exercise/voice-duration.ts')
const registry={},registryCode=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../lib/native-assistant-registry.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',registryCode)(registry,name=>{throw Error('Forbidden registry dependency '+name)});const time=base.load('lib/native-voice-time.ts')
function setup(options={}){
 base.AuditDate.setNow(Date.UTC(2026,9,17,1));const h=base.harness(),calls={post:0,get:0,read:0},drafts=[];let weight=70,actor=owner,loseResponse=false,readMode='ok',type={id:1,name:'yoga',met:3},typeReads=0,healthReads=0
 h.route.URL=URL;h.route.estimateVoiceExerciseDurationMinutes=duration.estimateVoiceExerciseDurationMinutes;
 const request=()=>new fixture.NextRequest('https://helfi.example.invalid/api/native/assistant',{headers:{authorization:'Bearer synthetic'}})
 const response=result=>new Response(JSON.stringify(result.body),{status:result.status})
 const confirmation={POST:async req=>{calls.post++;drafts.push(clone((await req.clone().json()).draft));const result=await h.route.POST(req);if(result.status!==200)throw Error('Synthetic normal handler rejected: '+result.body.error);if(loseResponse)throw Error('Synthetic lost POST response');return response(result)},GET:async req=>{calls.get++;return response(await h.route.GET(req))}}
 const helpers={NextRequest:fixture.NextRequest,Headers,URL,AssistantContractError:registry.AssistantContractError,AssistantNotSubmittedError:registry.AssistantNotSubmittedError,signNativeVoiceDraft:base.tokens.signNativeVoiceDraft,...time,...mood,...duration,getHealthProfileForUser:async()=>{const index=healthReads++;return{weightKg:options.healthWeights?.[index]??weight}},normalConfirmation:confirmation,
  prepareNativeVoiceRecordAction:async()=>{throw Error('Unexpected unprepared record path')},prepareVoicePreferenceAction:async()=>{throw Error('Unexpected unprepared preference path')},prepareVoiceNotificationAction:async()=>{throw Error('Unexpected unprepared notification path')},readVoiceAppData:async()=>{throw Error('Unexpected unprepared read path')},
  invokeNativeVoiceRecordRoute:async(_req,call)=>{calls.read++;assert.equal(call.method,'GET');let rows=clone(call.entity==='water'?h.state().water:call.entity==='exercise'?h.state().exercise:h.state().mood);if(readMode==='other')rows=rows.map(row=>({...row,userId:'other'}));if(readMode==='missing')rows=[];if(readMode==='changed')rows=rows.map(row=>({...row,amount:999,note:'changed',durationMinutes:999}));if(readMode==='time')rows=rows.map(row=>({...row,createdAt:'2026-10-17T02:00:00.000Z',startTime:'2026-10-17T02:00:00.000Z'}));return call.entity==='water'?{logs:rows}:{entries:rows}},
 }
 const module=base.load('lib/native-assistant-normal-actions.ts',helpers),api=module.createNativeAssistantNormalActions({request:request(),authenticate:async()=>actor,trustedTimeZone:()=> 'Australia/Melbourne',db:{exerciseType:{findUnique:async({where})=>{const index=typeReads++,current=options.typeSequence?.[index]||type;return where.id===current.id?clone(current):null}}}})
 const ctx=()=>({actorId:owner,localDate:'2026-10-17',capabilities:[]}),receipt={actionId:'09ae4b2a-2d4a-4550-8c53-f69094bf179e',receiptClaimed:true}
 return{...api,h,calls,drafts,ctx,receipt,request,typeReads:()=>typeReads,healthReads:()=>healthReads,weight:value=>{weight=value},actor:value=>{actor=value},type:value=>{type=value},lose:value=>{loseResponse=value},readMode:value=>{readMode=value},...options}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('creation seal remains byte-stable for the same stored review/action and changes only for a distinct claim',async()=>{
  const f=setup(),prepared=await f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml',localTime:'13:30'}),normal=prepared.data
  const first=f.seal(f.ctx(),'creation',normal,f.receipt.actionId);base.AuditDate.setNow(base.AuditDate.now()+10000);const again=f.seal(f.ctx(),'creation',normal,f.receipt.actionId)
  assert.deepEqual(clone(first),clone(again));assert(base.tokens.verifyNativeVoiceDraft(owner,first));assert.notEqual(f.seal(f.ctx(),'creation',normal,'other-action').reviewToken,first.reviewToken);assert.equal(f.calls.post,0)
 })
 await check('normal water POST returns exact saved owned record and recovery uses only GET with original token',async()=>{
  const f=setup(),normal=(await f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml',localTime:'13:30',category:'lunch'})).data,result=await f.creations.execute(f.ctx(),normal,f.receipt)
  assert.equal(result.kind,'water');assert.equal(result.saved,true);assert.equal(await f.creations.verify(f.ctx(),result,normal),true);assert.equal(f.h.state().water.length,1);assert.equal(new Date(f.h.state().water[0].createdAt).toISOString(),'2026-10-17T02:30:00.000Z')
  const token=f.drafts[0].reviewToken;const recovered=await f.recover(f.ctx(),'creation',normal,f.receipt.actionId);assert.equal(recovered.id,result.id);assert.equal(f.calls.post,1);assert.equal(f.calls.get,1);assert.equal(f.seal(f.ctx(),'creation',normal,f.receipt.actionId).reviewToken,token);assert.equal(f.h.state().water.length,1)
 })
 await check('lost POST response recovers one actual normal write without repeating submission',async()=>{
  const f=setup(),normal=(await f.creations.prepare(f.ctx(),'water.create',{amount:1,unit:'l'})).data;f.lose(true)
  await assert.rejects(()=>f.creations.execute(f.ctx(),normal,f.receipt));assert.equal(f.h.state().water.length,1);const result=await f.recover(f.ctx(),'creation',normal,f.receipt.actionId);assert.equal(result.kind,'water');assert.equal(f.calls.post,1);assert.equal(f.calls.get,1);assert.equal(f.h.state().water.length,1)
 })
 await check('unknown receipt recovery is pending and never submits a normal POST',async()=>{const f=setup(),normal=(await f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml'})).data;assert.equal(await f.recover(f.ctx(),'creation',normal,f.receipt.actionId),null);assert.equal(f.calls.post,0);assert.equal(f.h.state().water.length,0)})
 await check('mood forwards exact literal note/tags and all supported context through actual normal mood save',async()=>{
  const f=setup(),note='Literal: I said “exactly this”.\nSecond line.',context={intensityPercent:70,feelings:['hopeful'],energyLevel:4,sleepQuality:3},normal=(await f.creations.prepare(f.ctx(),'mood.create',{score:5,note,tags:['test'],context,localTime:'09:15'})).data
  assert.deepEqual(clone(normal.draft.mood.context),context);const result=await f.creations.execute(f.ctx(),normal,f.receipt);assert.equal(await f.creations.verify(f.ctx(),result,normal),true);assert.equal(f.h.state().mood[0].note,note);for(const key of Object.keys(context))assert.deepEqual(f.h.state().mood[0].context[key],context[key]);assert.equal(f.h.state().mood[0].context.localHour,9)
 })
 await check('exercise binds source type/weight and forwards supported measured speed/steps with exact local timestamp',async()=>{
  const f=setup(),normal=(await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:20,distanceKm:2,steps:2500,speedKph:6,caloriesKcal:150,localTime:'07:30'})).data
  assert.equal(normal.draft.exercise.speedKph,6);const result=await f.creations.execute(f.ctx(),normal,f.receipt),row=f.h.state().exercise[0];assert.equal(row.rawPayload.steps,2500);assert.equal(row.rawPayload.speedKph,6);assert.equal(row.calories,150);assert.equal(new Date(row.startTime).toISOString(),'2026-10-16T20:30:00.000Z');assert.equal(await f.creations.verify(f.ctx(),result,normal),true)
 })
 await check('steps and stated calories reuse actual normal duration estimator only after resolving the saved exercise type',async()=>{
  for(const[name,values]of [['Walking',{steps:5000}],['Running',{steps:5000}],['Cycling',{caloriesKcal:400}],['Strength training',{caloriesKcal:350}],['Walking',{steps:5000,caloriesKcal:450}]]){const f=setup();f.type({id:1,name,met:3});const prepared=await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,...values}),normal=prepared.data,expected=duration.estimateVoiceExerciseDurationMinutes({exerciseName:name,...values});assert.equal(normal.draft.exercise.durationMinutes,expected);assert.match(prepared.summary,new RegExp(expected+' minutes \\(estimated from the stated '+(values.steps?'steps':'calories')));const result=await f.creations.execute(f.ctx(),normal,f.receipt),row=f.h.state().exercise[0];assert.equal(row.durationMinutes,expected);if(values.steps)assert.equal(row.rawPayload.steps,values.steps);if(values.caloriesKcal)assert.equal(row.calories,values.caloriesKcal);assert.equal(await f.creations.verify(f.ctx(),result,normal),true)}
 })
 await check('general exercise estimate matches actual normal confirmation fallback with the same saved type and stated counts',async()=>{
  for(const values of [{steps:3200},{caloriesKcal:275},{steps:3200,caloriesKcal:275}]){const f=setup();f.type({id:1,name:'Running',met:3});const normal=(await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,...values})).data,expected=normal.draft.exercise.durationMinutes,draft=f.seal(f.ctx(),'creation',normal,f.receipt.actionId);delete draft.exercise.durationMinutes;draft.reviewToken=base.tokens.signNativeVoiceDraft(owner,draft);const response=await f.h.send(draft);assert.equal(response.status,200,response.body.error);assert.equal(f.h.state().exercise[0].durationMinutes,expected)}
 })
 await check('explicit duration wins over count estimate and keeps distance, steps, calories and speed in actual normal save/readback',async()=>{
  const f=setup(),prepared=await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:12.6,steps:5000,caloriesKcal:450,distanceKm:3,speedKph:6.55});assert.equal(prepared.data.draft.exercise.durationMinutes,13);assert.doesNotMatch(prepared.summary,/estimated/);const result=await f.creations.execute(f.ctx(),prepared.data,f.receipt),row=f.h.state().exercise[0];assert.equal(row.durationMinutes,13);assert.equal(row.distanceKm,3);assert.equal(row.rawPayload.steps,5000);assert.equal(row.rawPayload.speedKph,6.6);assert.equal(row.calories,450);assert.equal(await f.creations.verify(f.ctx(),result,prepared.data),true)
 })
 await check('missing duration without supported counts asks for that field; zero, unsupported and absent saved types cannot prepare',async()=>{
  for(const values of [{},{distanceKm:2,speedKph:6}]){const f=setup();await assert.rejects(()=>f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,...values}),error=>error.code==='missing_fields'&&error.fields?.includes('values.durationMinutes'));assert.equal(f.calls.post,0)}for(const values of [{steps:0},{caloriesKcal:0},{durationMinutes:0,steps:5000},{steps:1.5},{steps:500001},{durationMinutes:20,intensity:'vigorous'}]){const f=setup();await assert.rejects(()=>f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,...values}));assert.equal(f.calls.post,0)}const f=setup();await assert.rejects(()=>f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:99,steps:5000}),error=>error.code==='missing_fields'&&error.fields?.includes('values.exerciseTypeId'));assert.equal(f.calls.post,0)
 })
 await check('actual core schema accepts discovered type plus counts without duration and still refuses zero or arbitrary duration fields',async()=>{
  const core=require('./voice2-core-actions-check.cjs'),f=setup(),op=core.core.createNativeAssistantCoreActions(f.dependencies).find(op=>op.id==='exercise.create');assert.deepEqual(clone(op.input.required),['exerciseTypeId']);assert.equal(op.input.properties.intensity,undefined);for(const values of [{exerciseTypeId:1,steps:5000},{exerciseTypeId:1,caloriesKcal:250}]){const p=await op.prepare(f.ctx(),values);assert.match(p.summary,/estimated/)}for(const values of [{steps:5000},{exerciseTypeId:1,steps:0},{exerciseTypeId:1,durationMinutes:0},{exerciseTypeId:1,caloriesKcal:0},{exerciseTypeId:1,steps:5000,estimatedMinutes:50},{exerciseTypeId:1,steps:5000,intensity:'vigorous'}])await assert.rejects(()=>op.prepare(f.ctx(),values));assert.equal(f.calls.post,0)
 })
 await check('unsupported exercise intensity cannot be silently accepted and discarded',async()=>{const f=setup();await assert.rejects(()=>f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:20,intensity:'vigorous'}));assert.equal(f.calls.post,0)})
 await check('changed exercise source or weight refuse before normal POST',async()=>{
  for(const mode of ['weight','type']){const f=setup(),normal=(await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:20})).data;if(mode==='weight')f.weight(80);else f.type({id:1,name:'changed exercise',met:8});await assert.rejects(()=>f.creations.execute(f.ctx(),normal,f.receipt),/changed/);assert.equal(f.calls.post,0);assert.equal(f.h.state().exercise.length,0)}
 })
 await check('one preparation snapshot binds exercise review and saved-source version; sequential type or weight changes refuse before POST',async()=>{
  for(const options of [{typeSequence:[{id:1,name:'Running',met:8},{id:1,name:'Walking',met:3}]},{healthWeights:[70,80]}]){const f=setup(options),p=await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,steps:3200});assert.equal(f.typeReads(),1);if(options.typeSequence){assert.equal(p.data.source.type.name,'Running');assert.equal(p.data.draft.exercise.exerciseName,'Running');assert.equal(p.data.draft.exercise.durationMinutes,duration.estimateVoiceExerciseDurationMinutes({exerciseName:'Running',steps:3200}));assert.match(p.summary,/Running/)}else{assert.equal(f.healthReads(),1);assert.equal(p.data.source.weightKg,70)}await assert.rejects(()=>f.creations.execute(f.ctx(),p.data,f.receipt),/changed/);assert.equal(f.typeReads(),2);assert.equal(f.calls.post,0);assert.equal(f.h.state().exercise.length,0)}
 })
 await check('missing, foreign or changed owned readback never verifies the saved creation',async()=>{
  for(const operation of ['water.create','mood.create','exercise.create']){const f=setup(),values=operation==='water.create'?{amount:250,unit:'ml'}:operation==='mood.create'?{score:5,note:'Exact note'}:{exerciseTypeId:1,durationMinutes:20},normal=(await f.creations.prepare(f.ctx(),operation,values)).data,result=await f.creations.execute(f.ctx(),normal,f.receipt);for(const mode of ['other','missing','changed']){f.readMode(mode);assert.equal(await f.creations.verify(f.ctx(),result,normal),false)}}
 })
 await check('a changed timestamp refuses verification of a precisely reviewed water/exercise time',async()=>{
  for(const operation of ['water.create','exercise.create']){const f=setup(),values=operation==='water.create'?{amount:250,unit:'ml',localTime:'13:30'}:{exerciseTypeId:1,durationMinutes:20,localTime:'13:30'},normal=(await f.creations.prepare(f.ctx(),operation,values)).data,result=await f.creations.execute(f.ctx(),normal,f.receipt);f.readMode('time');assert.equal(await f.creations.verify(f.ctx(),result,normal),false)}
 })
 await check('DST gaps/repeated wall times require clarification before a review or POST',async()=>{for(const [localDate,localTime]of [['2026-10-04','02:30'],['2026-04-05','02:30']]){const f=setup();await assert.rejects(()=>f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml',localDate,localTime}),error=>error.code==='missing_fields');assert.equal(f.calls.post,0)}})
 await check('revoked account access and absent durable claims refuse before POST or receipt GET',async()=>{
  const f=setup(),normal=(await f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml'})).data
  await assert.rejects(()=>f.creations.execute(f.ctx(),normal,{actionId:f.receipt.actionId,receiptClaimed:false}));assert.equal(f.calls.post,0)
  f.actor('other');await assert.rejects(()=>f.creations.execute(f.ctx(),normal,f.receipt));await assert.rejects(()=>f.recover(f.ctx(),'creation',normal,f.receipt.actionId));assert.equal(f.calls.post,0);assert.equal(f.calls.get,0)
 })
 await check('normal rounding/caps are reviewed explicitly before exercise saving',async()=>{
  const f=setup(),prepared=await f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:20.6,caloriesKcal:150.6,speedKph:6.55});assert.equal(prepared.data.draft.exercise.durationMinutes,21);assert.equal(prepared.data.draft.exercise.caloriesKcal,151);assert.match(prepared.summary,/21 minutes/);assert.match(prepared.summary,/151 stated calories/);assert.match(prepared.summary,/6.6 km/)
  await assert.rejects(()=>f.creations.prepare(f.ctx(),'exercise.create',{exerciseTypeId:1,durationMinutes:20,caloriesKcal:10001}));assert.equal(f.calls.post,0)
 })
 await check('existing preference/record envelope names and literal content reach the actual normal confirm dispatch',async()=>{
  const f=setup(),seen={profile:0,record:0},literal='Exact first line.\n“Preserve this note.”'
  f.h.route.executeVoicePreferenceAction=async(_request,actor,normal)=>{seen.profile++;assert.equal(actor,owner);assert.equal(normal.values.bio,literal);return{saved:true,verified:true,status:'saved',message:'Synthetic profile saved and checked.',values:clone(normal.values)}}
  f.h.route.executeNativeVoiceRecordAction=async(_request,actor,normal)=>{seen.record++;assert.equal(actor,owner);assert.equal(normal.changes.content,literal);return{id:normal.id,operation:'update',saved:true,verified:true,message:'Synthetic exact record saved and checked.'}}
  const preference={userId:owner,action:'profile.update',values:{bio:literal},beforeHash:'synthetic-owned-before-hash',summary:'Exact profile change',preparedAt:base.AuditDate.now()}
  const prefResult=await f.dependencies.preferences.execute(f.request(),owner,preference,f.receipt);assert.equal(prefResult.kind,'preference_action');assert.equal(seen.profile,1);assert.equal(f.drafts[0].preferenceAction.values.bio,literal)
  await f.recover(f.ctx(),'preferences',preference,f.receipt.actionId);assert.equal(seen.profile,1)
  const record={entity:'journal',operation:'update',id:'owned-note',localDate:'2026-10-17',changes:{content:literal},beforeHash:'synthetic-owned-note-hash',summary:'Exact journal edit',preparedAt:base.AuditDate.now()},recordReceipt={...f.receipt,actionId:'430d1370-b5a6-4ab4-bc34-f3e79ffda39d'}
  const recordResult=await f.dependencies.records.execute(f.request(),owner,record,recordReceipt);assert.equal(recordResult.kind,'journal');assert.equal(f.drafts[1].recordAction.changes.content,literal);assert.equal(seen.record,1)
  await f.recover(f.ctx(),'records',record,recordReceipt.actionId);assert.equal(seen.record,1);assert.equal(f.calls.post,2);assert.equal(f.calls.get,2)
 })
 await check('stored normal receipt remains recoverable after review expiry without a new POST',async()=>{
  const f=setup(),normal=(await f.creations.prepare(f.ctx(),'water.create',{amount:250,unit:'ml'})).data,result=await f.creations.execute(f.ctx(),normal,f.receipt);base.AuditDate.setNow(base.AuditDate.now()+31*60*1000)
  assert.equal((await f.recover(f.ctx(),'creation',normal,f.receipt.actionId)).id,result.id);assert.equal(f.calls.post,1);assert.equal(f.calls.get,1)
 })
 console.log(`VOICE 2 normal actions: ${groups} actual-source offline groups passed. No real providers, database or account writes.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,run,registry}
