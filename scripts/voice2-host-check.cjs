#!/usr/bin/env node
'use strict'
// Actual host/bridge/runtime/persistent token store and actual normal water
// confirmation + receipt recovery. All domain tables/auth/planner are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto')
const storage=require('./voice2-session-store-check.cjs'),normalFixture=require('./voice2-normal-actions-check.cjs'),clone=value=>JSON.parse(JSON.stringify(value)),modules=new Map()
function load(name){if(modules.has(name))return modules.get(name);assert(['native-assistant-registry','native-assistant-runtime','native-assistant-tool-bridge','native-assistant-session-store','native-assistant-host','native-assistant-readable','native-assistant-completions','generalAssistantEffects'].includes(name));const exports={},code=ts.transpileModule(fs.readFileSync(name==='generalAssistantEffects'?path.resolve(__dirname,'../native/src/voice/generalAssistantEffects.ts'):path.resolve(__dirname,'../lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,id=>{if(id==='crypto')return crypto;if(id==='../native/src/voice/generalAssistantEffects')return load('generalAssistantEffects');if(id.startsWith('./native-assistant-'))return load(id.slice(2));throw Error('Forbidden dependency '+id)});modules.set(name,exports);return exports}
const {createAssistantRegistry}=load('native-assistant-registry'),{createNativeAssistantHost,nativeAssistantReadable}=load('native-assistant-host'),{createPrismaAssistantSessionStore}=load('native-assistant-session-store')
const object=properties=>({type:'object',properties,required:Object.keys(properties)}),text={type:'string',maxLength:100},ctx=()=>({actorId:'synthetic-user',localDate:'2026-10-17',capabilities:[]}),sessionId='owned-host-session'
function setup(){
 const db=storage.database(),normal=normalFixture.setup();let actor='synthetic-user',plannerCalls=0,selected=false,readAllowed=true,plan=[]
 const ops=[{id:'owned.read',description:'Synthetic source read',kind:'read',input:object({}),normalHandler:'synthetic-owned-read',read:async context=>({actorId:context.actorId,actualText:'Source-backed current value'}),verify:async(context,result)=>readAllowed&&result.actorId===context.actorId,plannerResult:result=>({actualText:result.actualText})},
 {id:'water.create',description:'Normal plain water save',kind:'write',input:object({amount:{type:'number',minimum:1,maximum:1000},unit:{type:'string',enum:['ml'],maxLength:2}}),normalHandler:'actual normal confirmation saveWater',prepare:(context,values)=>normal.creations.prepare(context,'water.create',values),execute:(context,prepared,receipt)=>normal.creations.execute(context,prepared.data,receipt),verify:(context,result,prepared)=>normal.creations.verify(context,result,prepared.data),recover:async(context,actionId,prepared)=>{const result=await normal.recover(context,'creation',prepared.data,actionId);return result?{...result,actionId,actorId:context.actorId,saved:true,verified:true,status:'completed'}:null},plannerResult:result=>({message:result.message,id:result.id,saved:result.saved})},
 {id:'person.choose',description:'Synthetic actual person selection',kind:'person',input:object({}),normalHandler:'synthetic-person-workflow',prepare:async()=>({data:{},summary:'Choose the requested item on your device.',cost:{kind:'free',maximumCredits:0}}),execute:async(_context,_prepared,receipt)=>({actionId:receipt.actionId,selected:false}),recover:async(_context,actionId)=>selected?{actionId,selected:true}:null,verify:async(_context,result)=>result.selected===true,plannerResult:result=>({selected:result.selected})},
 {id:'write.unverified',description:'Synthetic unverified result',kind:'write',input:object({}),normalHandler:'synthetic-lost-history',prepare:async()=>({data:{},summary:'Create synthetic result.',cost:{kind:'free',maximumCredits:0}}),execute:async(_context,_prepared,receipt)=>({actionId:receipt.actionId,status:'generated_not_saved',saved:false,message:'Generated synthetic result; saving history was not verified.'}),verify:async()=>false,plannerResult:result=>({status:result.status,saved:result.saved,message:result.message})}]
 const registry=createAssistantRegistry(ops),make=()=>createNativeAssistantHost({registry,persistence:createPrismaAssistantSessionStore(db.db),authenticate:async()=>actor,plannerKind:'synthetic',planner:async turn=>{plannerCalls++;if(turn.text==='Unrelated question?')return{command:{type:'confirm',reviewId:turn.session.steps.find(step=>step.status==='review').review.id}};if(turn.text==='Yes, save that.')return{command:{type:'confirm',reviewId:turn.session.steps.find(step=>step.status==='review').review.id}};return{command:{type:'plan',steps:clone(plan)}}}})
 const host=make(),run=(command,controlId,context=ctx())=>host.run(context,sessionId,{channel:'typed',text:'',command,controlId})
 return{host,make,normal,db,run,plan:value=>{plan=value},actor:value=>{actor=value},selected:value=>{selected=value},readAllowed:value=>{readAllowed=value},plannerCalls:()=>plannerCalls}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('one combined request reads actual source then reviews each normal write separately',async()=>{
  const f=setup();f.plan([{id:'read',operation:'owned.read',values:{}},{id:'first',operation:'water.create',values:{amount:250,unit:'ml'}},{id:'second',operation:'water.create',values:{amount:300,unit:'ml'}}])
  let result=await f.host.run(ctx(),sessionId,{channel:'typed',text:'Read my saved state and prepare these two drinks.'});assert.equal(result.session.steps[0].result.actualText,'Source-backed current value');assert.equal(result.session.steps[1].status,'review');assert.equal(f.normal.calls.post,0)
  const first=result.session.steps[1].review.id;result=await f.run({type:'confirm',reviewId:first},'confirm:'+first);assert.equal(result.session.steps[1].status,'completed');assert.equal(result.session.steps[2].status,'review');assert.equal(f.normal.calls.post,1);const second=result.session.steps[2].review.id
  const replay=await f.run({type:'confirm',reviewId:first},'confirm:'+first);assert.equal(replay.session.steps[2].review.id,second);assert.equal(f.normal.calls.post,1)
  result=await f.run({type:'confirm',reviewId:second},'confirm:'+second);assert.equal(result.session.status,'completed');assert.equal(f.normal.calls.post,2);assert.equal(f.plannerCalls(),1)
 })
 await check('unrelated planner confirmation, wrong review and mismatched controls cannot authorize saving',async()=>{
  const f=setup();f.plan([{id:'water',operation:'water.create',values:{amount:250,unit:'ml'}}]);const view=(await f.host.run(ctx(),sessionId,{channel:'realtime',text:'Prepare my drink.'})).session,reviewId=view.steps[0].review.id
  await assert.rejects(()=>f.host.run(ctx(),sessionId,{channel:'typed',text:'Unrelated question?'}),/confirm or decline/);await assert.rejects(()=>f.run({type:'confirm',reviewId},'confirm:wrong'));await assert.rejects(()=>f.run({type:'confirm',reviewId:'wrong'},'confirm:wrong'));assert.equal(f.normal.calls.post,0)
  const saved=await f.host.run(ctx(),sessionId,{channel:'realtime',text:'Yes, save that.'});assert.equal(saved.session.status,'completed');assert.equal(f.normal.calls.post,1)
 })
 await check('restart recovery returns the exact existing normal receipt with no new POST or planner',async()=>{
  const f=setup();f.plan([{id:'water',operation:'water.create',values:{amount:250,unit:'ml'}}]);const view=(await f.host.run(ctx(),sessionId,{channel:'typed',text:'Prepare water.'})).session,reviewId=view.steps[0].review.id;f.normal.lose(true)
  const uncertain=(await f.run({type:'confirm',reviewId},'confirm:'+reviewId)).session;assert.equal(uncertain.steps[0].status,'uncertain');assert(uncertain.steps[0].recoveryActionId);assert.equal(f.normal.calls.post,1)
  const restarted=f.make(),persisted=await restarted.snapshot(ctx(),sessionId);assert.equal(persisted.steps[0].recoveryActionId,uncertain.steps[0].recoveryActionId)
  const actionId=persisted.steps[0].recoveryActionId,recovered=await restarted.run(ctx(),sessionId,{channel:'typed',text:'',command:{type:'recover',actionId},controlId:'recover:'+actionId});assert.equal(recovered.session.status,'completed');assert.equal(f.normal.calls.post,1);assert.equal(f.normal.calls.get,1);assert.equal(f.plannerCalls(),1)
 })
 await check('failed source verification cannot claim completion or proceed to a write',async()=>{
  const f=setup();f.readAllowed(false);f.plan([{id:'read',operation:'owned.read',values:{}},{id:'water',operation:'water.create',values:{amount:250,unit:'ml'}}]);await assert.rejects(()=>f.host.run(ctx(),sessionId,{channel:'typed',text:'Read then save.'}),error=>error.code==='unverified_read');const view=await f.host.snapshot(ctx(),sessionId);assert.equal(view.status,'active');assert.equal(view.steps[0].status,'pending');assert.equal(f.normal.calls.post,0);assert(!nativeAssistantReadable(view).includes('Saved note'))
 })
 await check('unverified generated result stays uncertain and projects truthful saved false',async()=>{
  const f=setup();f.plan([{id:'write',operation:'write.unverified',values:{}}]);const view=(await f.host.run(ctx(),sessionId,{channel:'typed',text:'Prepare synthetic result.'})).session,reviewId=view.steps[0].review.id,result=(await f.run({type:'confirm',reviewId},'confirm:'+reviewId)).session
  assert.equal(result.status,'active');assert.equal(result.steps[0].status,'uncertain');assert.equal(result.steps[0].unverifiedResult.saved,false);assert.equal(result.steps[0].unverifiedResult.status,'generated_not_saved');assert.match(nativeAssistantReadable(result),/not been confirmed/);assert.equal(f.normal.calls.post,0)
 })
 await check('awaiting a person exposes exact recovery control and completes only after real synthetic selection',async()=>{
  const f=setup();f.plan([{id:'choose',operation:'person.choose',values:{}}]);const view=(await f.host.run(ctx(),sessionId,{channel:'typed',text:'Choose an item.'})).session,reviewId=view.steps[0].review.id,awaiting=(await f.run({type:'confirm',reviewId},'confirm:'+reviewId)).session
  assert.equal(awaiting.steps[0].status,'awaiting_person');const actionId=awaiting.steps[0].recoveryActionId;assert(actionId);assert.equal((await f.run({type:'recover',actionId},'recover:'+actionId)).session.steps[0].status,'awaiting_person');f.selected(true);assert.equal((await f.run({type:'recover',actionId},'recover:'+actionId)).session.status,'completed');assert.equal(f.plannerCalls(),1)
 })
 await check('cross-account and revoked ownership cannot read another conversation or execute its controls',async()=>{
  const f=setup();f.plan([{id:'water',operation:'water.create',values:{amount:250,unit:'ml'}}]);const view=(await f.host.run(ctx(),sessionId,{channel:'typed',text:'Prepare water.'})).session,reviewId=view.steps[0].review.id;f.actor('other')
  await assert.rejects(()=>f.host.snapshot(ctx(),sessionId));await assert.rejects(()=>f.run({type:'confirm',reviewId},'confirm:'+reviewId));assert.equal(f.normal.calls.post,0);assert.equal(f.plannerCalls(),1)
 })
 console.log(`VOICE 2 host: ${groups} actual-source offline groups passed. Controls/recovery never invoke a planner; no real providers or database.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,run}
