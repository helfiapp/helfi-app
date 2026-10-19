#!/usr/bin/env node
'use strict'
// Actual builders/normal confirmation/normal Food GET/recovery with synthetic
// storage only. Captured public source numbers reproduce the call16 roundtrip.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const save=require('./voice2-food-normal-save-check.cjs'),prep=require('./voice2-food-normal-prepare-check.cjs'),base=require('./voice-symptom-analysis-check.cjs').base
const recorded=require('./voice-recorded-source-fixture.cjs'),catalog=require('./fixtures/voice-usda-ordinary-catalog-2026-10-19.json')
const copy=v=>JSON.parse(JSON.stringify(v)),owner='synthetic-user'
const coffee=catalog.rows.find(row=>row.fdcId===171890)
const originalOptions=recorded.verifiedUsdaRecordedPortionOptions(coffee)
const changes=[[1,'calories',0.29600000000000004,0.296],[2,'protein_g',0.21359999999999998,0.2136],[3,'fat_g',0.047400000000000005,0.0474]]
const normalizedSource=()=>({id:String(coffee.fdcId),source:'usda',name:coffee.name,brand:coffee.brand??null,serving_size:coffee.servingSize,calories:coffee.calories,protein_g:coffee.proteinG,carbs_g:coffee.carbsG,fat_g:coffee.fatG,fiber_g:coffee.fiberG,sugar_g:coffee.sugarG,servingOptions:copy(originalOptions)})
function roundSource(source){for(const[index,key,before,after]of changes){assert.equal(source.servingOptions[index][key],before);source.servingOptions[index][key]=after}return source}
const sourceContext=base.load('lib/native-assistant-food-normal-services.ts')
const actualItemsMatch=vm.runInContext('itemsMatch',sourceContext),actualSourceMatch=vm.runInContext('storedSourceMatches',sourceContext)
const routeSource=fs.readFileSync(path.resolve(__dirname,'../lib/native-assistant-food-normal-services.ts'),'utf8'),ast=ts.createSourceFile('normal.ts',routeSource,ts.ScriptTarget.Latest,true)
const itemNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='itemsMatch');assert(itemNode)
const currentCall='storedSourceMatches(item.__voiceSourceFood, reviewed.__voiceSourceFood)'
assert.equal(itemNode.getText(ast).split(currentCall).length,2,'Legacy control replaces exactly the source readback comparison')
const legacyText=itemNode.getText(ast).replace('function itemsMatch','function legacyItemsMatch').replace(currentCall,'same(item.__voiceSourceFood, reviewed.__voiceSourceFood)').replace('same({ ...item, __voiceSourceFood: reviewed.__voiceSourceFood }, reviewed)','same(item, reviewed)')
vm.runInContext(ts.transpileModule(legacyText,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sourceContext)
const legacyItemsMatch=vm.runInContext('legacyItemsMatch',sourceContext)
const meal=()=>({name:'Recorded source test meal',meal:'breakfast',ingredients:[{name:coffee.name,quantity:1,unit:'cup'}]})
async function fixture(options={}){
 const f=save.setup();prep.normal.setLocals([normalizedSource()])
 const transaction=f.h.route.prisma.$transaction
 f.h.route.prisma.$transaction=(work,...args)=>transaction(async tx=>{
  const create=tx.foodLog.create
  return work({...tx,foodLog:{...tx.foodLog,create:async({data})=>{
   const stored=copy(data);if(options.round!==false)stored.items.forEach(item=>roundSource(item.__voiceSourceFood))
   return create({data:stored})
  }}})
 },...args)
 const prepared=await f.prepare('food.diary.create',meal())
 assert.equal(prepared.data.normal.normalDraft.food.items[0].__voiceSourceFood.id,'171890')
 assert.equal(prepared.data.normal.normalDraft.food.items[0].__voiceSourceFood.servingOptions.length,4)
 assert(base.tokens.verifyNativeVoiceDraft(owner,prepared.data.normal.normalDraft))
 return{...f,prepared}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function main(){
 await check('captured real portion calculations reproduce all three machine-precision changes and legacy strict failure',async()=>{
  for(const[index,key,before]of changes)assert.equal(originalOptions[index][key],before)
  const f=await fixture(),result=await f.execute('food.diary.create',f.prepared),stored=f.h.state().food[0],reviewed=f.prepared.data.normal.normalDraft.food.items
  assert.equal(legacyItemsMatch(stored.items,reviewed,true),false,'Pre-fix exact JSON source comparison rejects the three actual storage changes')
  assert.equal(actualItemsMatch(stored.items,reviewed,true),true)
  assert.equal(result.saved,true);assert.equal(result.verified,true);assert.equal(f.calls.post,1);assert(f.calls.foodRead>=1);assert.equal(f.h.state().food.length,1)
  assert.deepEqual(copy(stored.items[0].__voiceSourceFood.servingOptions.map(option=>option.__sourcePortion??null)),copy(reviewed[0].__voiceSourceFood.servingOptions.map(option=>option.__sourcePortion??null)))
  for(const[index,key,before,after]of changes){assert.equal(reviewed[0].__voiceSourceFood.servingOptions[index][key],before);assert.equal(stored.items[0].__voiceSourceFood.servingOptions[index][key],after)}
  assert(base.tokens.verifyNativeVoiceDraft(owner,f.prepared.data.normal.normalDraft),'Storage readback never changes the signed review')
 })
 await check('lost normal POST recovers the existing exact receipt and rounded source through GET with one save only',async()=>{
  const f=await fixture();f.lose(true);await assert.rejects(()=>f.execute('food.diary.create',f.prepared));assert.equal(f.h.state().food.length,1)
  const result=await f.recover('food.diary.create',f.prepared);assert.equal(result.id,f.h.state().food[0].id);assert.equal(result.saved,true);assert.equal(result.verified,true);assert.equal(f.calls.post,1);assert.equal(f.calls.recover,1);assert(f.calls.foodRead>=1)
  const second=await f.recover('food.diary.create',f.prepared);assert.equal(second.id,result.id);assert.equal(f.calls.post,1);assert.equal(f.h.state().food.length,1)
 })
 await check('actual normal GET verification refuses changed source identity serving metadata keys order and unknowns',async()=>{
  const f=await fixture(),result=await f.execute('food.diary.create',f.prepared),row=f.h.state().food[0],original=copy(row.items)
  const mutations=[
   s=>{s.id='different'},s=>{s.name+=' altered'},s=>{s.source='different'},s=>{s.serving_size+=' changed'},s=>{s.selectedServingId='different'},
   s=>{s.servingOptions[3].__sourcePortion.portionId++},s=>{s.servingOptions[3].__sourcePortion.gramWeight+=1e-12},s=>{s.servingOptions[3].__sourcePortion.url+='x'},
   s=>{s.servingOptions.reverse()},s=>{s.extraKey=null},s=>{delete s.brand},s=>{s.brand=''},s=>{s.servingOptions[0].fiber_g=null},
   s=>{s.servingOptions[1].calories=String(s.servingOptions[1].calories)},s=>{s.servingOptions[1].calories+=1e-12},s=>{s.servingOptions[0].calories+=Number.EPSILON},
  ]
  for(const mutate of mutations){row.items=copy(original);mutate(row.items[0].__voiceSourceFood);assert.equal(await f.services.verify(f.context(),result,f.prepared.data.normal.normalDraft,f.prepared.data.values),false)}
  row.items=original;assert.equal(await f.services.verify(f.context(),result,f.prepared.data.normal.normalDraft,f.prepared.data.values),true);assert.equal(f.calls.post,1);assert.equal(f.h.state().food.length,1)
 })
 await check('numeric tolerance is limited to two relative EPSILON steps on finite fractional nutrient aliases without a unit floor',async()=>{
  for(const key of ['calories','calories_kcal','protein','protein_g','carbs','carbs_g','fat','fat_g','fiber','fiber_g','sugar','sugar_g']){
   assert.equal(actualSourceMatch({[key]:0.296},{[key]:0.29600000000000004}),true)
   assert.equal(actualSourceMatch({[key]:1e-12+1e-20},{[key]:1e-12}),false,'Small values never receive an absolute tolerance floor')
   assert.equal(actualSourceMatch({[key]:1+Number.EPSILON},{[key]:1}),false,'Integer expectations stay exact')
   assert.equal(actualSourceMatch({[key]:NaN},{[key]:NaN}),false);assert.equal(actualSourceMatch({[key]:Infinity},{[key]:Infinity}),false)
  }
  for(const key of ['grams','ml','amount','gramWeight','portionId','fdcId','id','unregisteredNutrient'])assert.equal(actualSourceMatch({[key]:0.296},{[key]:0.29600000000000004}),false)
  for(const[a,b]of [[null,0],[0,null],['0.296',0.296],[undefined,null],[{a:1},{}],[[1,2],[2,1]]])assert.equal(actualSourceMatch(a,b),false)
 })
 await check('the signed preparation and trusted source validator stay exact before save',async()=>{
  const f=await fixture(),changed=copy(f.prepared),draft=changed.data.normal.normalDraft
  roundSource(draft.food.items[0].__voiceSourceFood)
  assert.equal(base.tokens.verifyNativeVoiceDraft(owner,draft),false)
  await assert.rejects(()=>f.execute('food.diary.create',changed));assert.equal(f.calls.post,0);assert.equal(f.h.state().food.length,0)
  const resolved=prep.load('lib/native-voice-resolved-food.ts'),original=f.prepared.data.normal.normalDraft.food
  const altered=copy(original);roundSource(altered.items[0].__voiceSourceFood)
  assert.throws(()=>resolved.validateNativeVoiceResolvedFood(altered,f.prepared.data.normal.trustedSources),'Trusted prewrite source comparison remains strict')
 })
 await check('library readback permits the same source-only roundtrip while every other complete recipe field stays exact',async()=>{
  const f=save.setup();prep.normal.setLocals([normalizedSource()]);const recipe={title:'Recorded recipe',yieldServings:2,ingredients:meal().ingredients,steps:['Keep the exact recorded preparation instructions.']}
  const prepared=await f.prepare('recipe.library.create',{recipe}),result=await f.execute('recipe.library.create',prepared)
  const goal=f.goals.find(row=>row.name==='__FOOD_FAVORITES__');assert(goal)
  const category=JSON.parse(goal.category);assert.equal(category.favorites.length,1);const item=category.favorites[0].items[0]
  roundSource(item.__voiceSourceFood);goal.category=JSON.stringify(category)
  assert.equal(await f.services.verify(f.context(),result,prepared.data.normal.normalDraft,prepared.data.values),true)
  const reviewed=prepared.data.normal.normalDraft.food.items
  assert.equal(legacyItemsMatch(category.favorites[0].items,reviewed,false),false);assert.equal(actualItemsMatch(category.favorites[0].items,reviewed,false),true)
  item.requestedAmount+=' changed';goal.category=JSON.stringify(category);assert.equal(await f.services.verify(f.context(),result,prepared.data.normal.normalDraft,prepared.data.values),false)
  assert.equal(f.calls.post,1);assert.equal(f.calls.libraryPost,1);assert.equal(f.h.state().food.length,0)
 })
 console.log(`Voice food source storage: ${groups} actual-source offline groups passed. Synthetic storage only; no provider, account, real database or credits.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={main}
