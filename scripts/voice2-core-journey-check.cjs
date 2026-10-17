#!/usr/bin/env node
'use strict'
// One actual registry/host/runtime + transactional session store spans normal
// source-resolved food, normal water confirmation and normal journal POST/GET.
// Domain row stores are independent synthetic fixtures, not a shared real DB.
// No current-day answer, provider, account, key, network or credit is used.
const assert=require('node:assert/strict')
const foodFixture=require('./voice2-food-normal-save-check.cjs')
const waterFixture=require('./voice2-normal-actions-check.cjs')
const appFixture=require('./voice2-app-host-check.cjs')
const copy=value=>JSON.parse(JSON.stringify(value)),actorId='synthetic-user',sessionId='cross_domain_owned_journey'
const context=()=>({actorId,localDate:'2026-10-17',capabilities:[]})
async function main(){
 const food=foodFixture.setup(),water=waterFixture.setup(),app=appFixture.setup();app.actor(actorId)
 // The reused fixtures share their synthetic signing clock; align it once so
 // no fixture's fixed clock invalidates another fixture's normal signed food.
 require('./voice-symptom-analysis-check.cjs').base.AuditDate.setNow(Date.now())
 const sourceApp=app.app.createNativeAssistantApp(app.request(app.body()),'Australia/Melbourne')
 const core=app.load('native-assistant-core-actions').createNativeAssistantCoreActions(water.dependencies)
 const normalWater=core.find(op=>op.id==='water.create');assert(normalWater)
 // Same normal recovery helper and creation-envelope binding as the app host;
 // the fixture exposes its actual normal helper instead of a live bootstrap.
 const waterOperation={...normalWater,recover:async(ctx,actionId,prepared)=>{
  assert.equal(prepared.data.actorId,ctx.actorId)
  const result=await water.recover(ctx,'creation',prepared.data.normal,actionId)
  return result?{...result,actionId,actorId:ctx.actorId,saved:true,verified:true,status:'completed'}:null
 }}
 const operations=[food.ops.get('food.recipe.log'),waterOperation,sourceApp.registry.get('journal.health.create'),sourceApp.registry.get('journal.health.read')]
 const registry=app.load('native-assistant-registry').createAssistantRegistry(operations)
 const storeApi=app.load('native-assistant-session-store'),hostApi=app.load('native-assistant-host')
 let plannerCalls=0,persistence,host
 const recipe=foodFixture.recipe(),literal=recipe.steps[1]
 const steps=[
  {id:'meal',operation:'food.recipe.log',values:{recipe,meal:'dinner',servingsEaten:.5,localDate:'2026-10-17'}},
  {id:'water',operation:'water.create',values:{amount:{$from:'meal',path:['recipe','servings']},unit:'l',category:'dinner',localDate:{$from:'meal',path:['localDate']}}},
  {id:'note',operation:'journal.health.create',values:{content:{$from:'meal',path:['recipe','steps','1']},localDate:{$from:'meal',path:['localDate']}}},
  {id:'reopen',operation:'journal.health.read',values:{id:{$from:'note',path:['entry','id']},localDate:{$from:'meal',path:['localDate']}}},
 ]
 function restart(){persistence=storeApi.createPrismaAssistantSessionStore(app.db.db);host=hostApi.createNativeAssistantHost({registry,persistence,authenticate:async()=>actorId,plannerKind:'synthetic',planner:async turn=>{plannerCalls++;assert.equal(plannerCalls,1,'Controls/restart must never plan again');assert.equal(turn.text,'Log the recipe, then its yield in litres of water, and journal its second instruction.');return{command:{type:'plan',steps:copy(steps)}}}})}
 restart()
 const run=(text,command)=>host.run(context(),sessionId,{channel:'typed',text,...(command?{command}:{})})
 const control=command=>host.run(context(),sessionId,{channel:'typed',text:'',command,controlId:command.type+':'+(command.reviewId||command.actionId)})
 const raw=()=>persistence.readSession(actorId,sessionId)
 const counts=()=>({food:food.calls.post,water:water.calls.post,journal:app.counts().postCalls})
 const first=await run('Log the recipe, then its yield in litres of water, and journal its second instruction.'),oldReview=first.session.steps[0].review.id
 assert.equal(first.session.steps[0].status,'review');assert.equal((await raw()).steps[0].prepared.data.normal.normalDraft.food.nutrition.calories,37.5);assert.deepEqual(counts(),{food:0,water:0,journal:0})
 const correction=await run('Actually log one serving.',{type:'correct',stepId:'meal',values:{servingsEaten:1}}),mealReview=correction.session.steps[0].review.id
 assert.notEqual(mealReview,oldReview);assert.equal((await raw()).steps[0].prepared.data.normal.normalDraft.food.nutrition.calories,75)
 await assert.rejects(()=>control({type:'confirm',reviewId:oldReview}));assert.deepEqual(counts(),{food:0,water:0,journal:0})
 const afterMeal=await control({type:'confirm',reviewId:mealReview});assert.equal(afterMeal.session.steps[1].status,'review',JSON.stringify({question:afterMeal.question,statuses:afterMeal.session.steps.map(step=>[step.id,step.status]),counts:counts()}));const waterReview=afterMeal.session.steps.find(step=>step.id==='water').review.id
 assert.equal(afterMeal.session.steps[0].status,'completed');assert.equal(afterMeal.session.steps[1].status,'review');assert.equal(afterMeal.session.steps[2].status,'pending');assert.deepEqual(counts(),{food:1,water:0,journal:0})
 const mealRow=food.h.state().food[0];assert.equal(mealRow.userId,actorId);assert.equal(mealRow.nutrients.calories,75);assert.equal(mealRow.nutrients.fiber_g,null);assert.equal(mealRow.nutrients.sugar_g,0);assert.equal(mealRow.nutrients.__portionScale,.5);assert.equal(mealRow.nutrients.__importRecipe.servings,2);assert.deepEqual(copy(mealRow.nutrients.__importRecipe.steps),recipe.steps);assert(food.calls.foodRead>0)
 const waterPrepared=(await raw()).steps[1].prepared;assert.equal(waterPrepared.data.normal.draft.water.amount,2);assert.equal(waterPrepared.data.normal.draft.water.unit,'l');assert.equal(waterPrepared.data.normal.draft.localDate,'2026-10-17')
 console.log('PASS one durable plan corrects a source-measured recipe portion and independently reviews referenced water before any later save')
 water.lose(true)
 const lost=await control({type:'confirm',reviewId:waterReview}),uncertain=lost.session.steps.find(step=>step.id==='water')
 assert.equal(uncertain.status,'uncertain');assert.equal(lost.session.steps[2].status,'pending');assert.deepEqual(counts(),{food:1,water:1,journal:0});assert.equal(water.h.state().water.length,1)
 const submitted=(await raw()).steps[1];assert(submitted.actionId);assert.deepEqual(submitted.prepared,waterPrepared)
 restart();const restored=await raw();assert.equal(restored.steps[1].status,'uncertain');assert.equal(restored.steps[1].actionId,submitted.actionId)
 await assert.rejects(()=>control({type:'confirm',reviewId:waterReview}));assert.deepEqual(counts(),{food:1,water:1,journal:0})
 const afterRecovery=await control({type:'recover',actionId:submitted.actionId}),noteReview=afterRecovery.session.steps.find(step=>step.id==='note').review.id
 assert.equal(afterRecovery.session.steps[1].status,'completed');assert.equal(afterRecovery.session.steps[2].status,'review');assert.equal(water.calls.get,1);assert.deepEqual(counts(),{food:1,water:1,journal:0});assert.equal((await raw()).steps[2].prepared.data.content,literal)
 const recovered=(await raw()).steps[1];assert.equal(recovered.result.actorId,actorId);assert.equal(recovered.result.id,water.h.state().water[0].id);assert.equal(water.h.state().water[0].amount,2);assert.equal(water.h.state().water[0].unit,'l')
 const replay=await control({type:'recover',actionId:submitted.actionId});assert.equal(replay.session.steps[2].review.id,noteReview);assert.equal(water.calls.get,1);assert.deepEqual(counts(),{food:1,water:1,journal:0})
 console.log('PASS lost normal water reply survives host/store restart and exact GET-only recovery without another food or water save')
 const finished=await control({type:'confirm',reviewId:noteReview}),final=await raw()
 assert.equal(finished.session.status,'completed');assert(final.steps.every(step=>step.status==='completed'));assert.deepEqual(counts(),{food:1,water:1,journal:1});assert.equal(app.entries.length,1);assert.equal(app.entries[0].userId,actorId);assert.equal(app.entries[0].content,literal);assert.equal(final.steps[2].result.entry.id,app.entries[0].id);assert.equal(final.steps[3].result.entry.id,app.entries[0].id);assert.equal(final.steps[3].result.entry.content,literal);assert.equal(final.steps[3].result.safeToClaimSaved,false);assert(app.counts().readCalls>=3)
 assert.equal(final.steps[0].result.actorId,actorId);assert.equal(final.steps[1].result.actorId,actorId);assert.equal(final.steps[2].result.actorId,actorId);assert.equal(new Set(final.steps.filter(step=>step.actionId).map(step=>step.actionId)).size,3)
 assert.equal(plannerCalls,1);assert.equal(app.counts().providerCalls,0);assert.equal(app.counts().meteredCalls,0);assert.equal((await persistence.conversation.read(actorId,sessionId)).filter(turn=>turn.role==='user'&&turn.text.startsWith('Log the recipe')).length,1)
 restart();assert.deepEqual(await raw(),final);await control({type:'confirm',reviewId:mealReview});await control({type:'recover',actionId:submitted.actionId});await control({type:'confirm',reviewId:noteReview});assert.deepEqual(counts(),{food:1,water:1,journal:1});assert.equal(water.calls.get,1)
 assert.equal(await persistence.readSession('other',sessionId),null)
 console.log('PASS literal nested recipe instruction saves once to the owned normal journal and exact returned journal ID drives final readback; completed controls never replay effects')
 console.log('Voice2 core journey:3 cross-domain actual-source offline groups passed. One registry/host/durable session; independent synthetic domain row stores. No current-day calculation, provider, live account, credits or network.')
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
