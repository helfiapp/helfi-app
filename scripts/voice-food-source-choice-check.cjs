#!/usr/bin/env node
'use strict'
// Actual structured POST, adapter, runtime and normal save/readback. Catalog,
// assessment-free conversation commands, auth and storage are synthetic only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto')
const prep=require('./voice2-food-normal-prepare-check.cjs'),save=require('./voice2-food-normal-save-check.cjs'),base=require('./voice-symptom-analysis-check.cjs').base
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value)),registry=prep.load('lib/native-assistant-registry.ts')
function pure(file){const exports={},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,name=>{if(name==='crypto')return crypto;if(name==='./native-assistant-registry')return registry;throw Error('Forbidden dependency '+name)});return exports}
const runtimeApi=pure('lib/native-assistant-runtime.ts'),readable=pure('lib/native-assistant-readable.ts')
const source=(id,name,serving_size='100 g',calories=100)=>({...prep.source(name),id,serving_size,calories})
const egg=(id='fried',name='Egg, whole, cooked, fried')=>{const food=source(id,name);food.servingOptions=[{...food,id:id+'-large',foodId:id,foodName:name,serving_size:'1 large egg (50 g)',calories:70}];return food}
const coffee=()=>source('coffee','Coffee, brewed','1 cup (237 g)',2)
const milk=()=>source('milk','Milk, nonfat','100 ml',34)
const meal=()=>({name:'Exactly my breakfast',meal:'breakfast',localDate:'2026-10-17',ingredients:[{name:'sunny-side-up eggs',quantity:2,unit:'each',size:'large'},{name:'brewed black coffee',quantity:1,unit:'cup'},{name:'skim milk',quantity:30,unit:'ml'}]})
const wire=value=>({...value,destination:'diary',ingredients:value.ingredients.map(item=>({...item,display:`${item.quantity} ${item.unit} ${item.size?item.size+' ':''}${item.name}`}))})
function setup(){
 const f=save.setup(),request=new Request('https://helfi.example.invalid/api/native/assistant',{headers:{authorization:'Bearer synthetic-token'}})
 const adapter=base.load('lib/native-assistant-food-normal-services.ts',{AssistantContractError:registry.AssistantContractError,validateAssistantFoodSourceChoices:prep.food.validateAssistantFoodSourceChoices,NextRequest:Request,Headers,URL,verifyNativeVoiceDraft:base.tokens.verifyNativeVoiceDraft,require:name=>{assert.equal(name,'@/app/api/native/voice-assistant/route');return{POST:req=>prep.ctx.POST(req)}}})
 const transport=adapter.createNativeAssistantFoodNormalServices({request,authenticate:async()=>f.context().actorId,readDayContext:async()=>{throw Error('Unexpected target read')}})
 let stored=null,tail=Promise.resolve()
 const store={async runExclusive(actor,id,work){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before;try{return await work(stored?copy(stored):null,async value=>{assert.equal(value.actorId,actor);assert.equal(value.id,id);stored=copy(value)})}finally{release()}}}
 const runtime=runtimeApi.createAssistantRuntime({registry:registry.createAssistantRegistry(prep.food.createNativeAssistantFoodOperations({...f.services,prepare:transport.prepare})),store,authorize:async()=>{},spendingAllowed:false})
 return{...f,handle:command=>runtime.handle(f.context(),'source-choice-session',command),current:()=>copy(stored)}
}
let groups=0
async function check(name,work){prep.normal.reset();await work();groups++;console.log('PASS '+name)}
async function main(){
 await check('accepted coffee descriptors use normalized retrieval, without a supplier or guessed cup',async()=>{
  const previous=prep.ctx.searchLocalFoods,queries=[]
  prep.ctx.searchLocalFoods=async query=>{queries.push(query);const words=query.toLowerCase().split(/\W+/).filter(Boolean);return words.every(word=>coffee().name.toLowerCase().includes(word))?[coffee()]:[]}
  try{for(const name of['black coffee','brewed black coffee']){queries.length=0;const response=await prep.post('food.diary.create',wire({...meal(),ingredients:[{name,quantity:1,unit:'cup'}]})),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert(queries.some(query=>!query.includes('black')));assert.equal(body.preparation.normalDraft.food.items[0].__voiceSourceFood.id,'coffee');assert.equal(body.preparation.normalDraft.food.items[0].estimatedPortion,false);assert.equal(body.preparation.normalDraft.food.nutrition.calories,2)}}finally{prep.ctx.searchLocalFoods=previous}
 })
 await check('coffee normalization does not admit unrequested instant decaf sweetened dairy or plant additions',()=>{
  for(const name of['Coffee, instant','Coffee, brewed, decaffeinated','Coffee, brewed, sweetened','Coffee, brewed, with milk','Coffee, brewed, with cream','Coffee, brewed, with sugar','Coffee, brewed, with almond milk','Coffee, brewed, with oat milk','Coffee substitute, brewed'])assert.equal(prep.ctx.voiceOrdinaryIdentityMatches('black coffee',source('wrong',name)),false,name)
  assert.equal(prep.ctx.voiceOrdinaryIdentityMatches('brewed black coffee',coffee()),true)
  assert.equal(prep.ctx.voiceOrdinaryIdentityMatches('coffee with skim milk',coffee()),false)
 })
 await check('unknown preparation produces actual bounded catalog options and unmatched words without auto acceptance',async()=>{
  const fried=egg(),boiled=egg('boiled','Egg, whole, cooked, boiled'),raw=egg('raw','Egg, whole, raw'),irrelevant=source('rice','Rice cooked')
  prep.normal.setLocals([fried,boiled,raw,irrelevant,coffee(),milk()])
  const response=await prep.post('food.diary.create',wire(meal())),body=await response.json();assert.equal(response.status,422,JSON.stringify(body));assert.equal(body.preparation,undefined)
  assert.equal(body.choices.length,1);const choice=body.choices[0];assert.equal(choice.ingredientIndex,0);assert.equal(choice.quantity,2);assert.equal(choice.unit,'each');assert.equal(choice.requestedName,'sunny-side-up eggs')
  assert(choice.options.length>0&&choice.options.length<=3);for(const option of choice.options){assert([fried,boiled,raw].some(food=>food.id===option.id&&food.name===option.name));assert.deepEqual(option.unmatchedTerms,['sunny','side','up']);assert.equal(option.source,'usda')}
  assert.match(body.error,/Which record should I use/);assert.doesNotMatch(body.error,/amount of each|how much|What size/);assert.match(body.error,/Nothing has been saved/)
  assert.equal(prep.ctx.voiceOrdinaryIdentityMatches('sunny-side-up eggs',fried),false)
 })
 await check('choosing a catalog label corrects the same owned meal and preserves every quantity date and source until fresh review',async()=>{
  const f=setup();prep.normal.setLocals([egg(),coffee(),milk()]);const original=meal(),pending=await f.handle({type:'plan',steps:[{id:'breakfast',operation:'food.diary.create',values:original}]})
  const before=pending.steps[0];assert.equal(before.status,'needs_details');assert.deepEqual(copy(before.values),original);assert.equal(before.clarification.choices[0].options[0].id,'fried');assert.equal(f.calls.post,0)
  const ingredients=copy(original.ingredients);ingredients[0].name='Egg, whole, cooked, fried'
  const reviewed=await f.handle({type:'correct',stepId:'breakfast',values:{ingredients}}),step=reviewed.steps[0]
  assert.equal(step.id,'breakfast');assert.equal(step.status,'review');assert.equal(reviewed.steps.length,1);assert.equal(step.values.localDate,original.localDate);assert.deepEqual(copy(step.values.ingredients),ingredients);assert.equal(step.values.name,original.name)
  assert.match(step.prepared.summary,/Egg, whole, cooked, fried/);assert.equal(f.calls.post,0)
  const food=step.prepared.data.normal.normalDraft.food;assert.deepEqual(copy(food.items.map(item=>item.__voiceSourceFood.id)),['fried','coffee','milk']);assert.equal(food.items[0].requestedAmount,'2 each large Egg, whole, cooked, fried');assert.equal(food.items[1].requestedAmount,'1 cup brewed black coffee');assert.equal(food.items[2].requestedAmount,'30 ml skim milk');assert.equal(food.nutrition.fiber_g,null)
  const done=await f.handle({type:'confirm',reviewId:step.reviewId});assert.equal(done.steps[0].status,'completed');assert.equal(f.calls.post,1);assert.equal(f.h.state().food.length,1);assert.equal(f.h.state().food[0].items.length,3)
 })
 await check('keeping the original description or stopping cannot save any suggested source',async()=>{
  const f=setup();prep.normal.setLocals([egg(),coffee(),milk()]);const pending=await f.handle({type:'plan',steps:[{id:'breakfast',operation:'food.diary.create',values:meal()}]})
  await assert.rejects(()=>f.handle({type:'confirm',reviewId:'unsubmitted-source-choice'}),error=>error.code==='stale_review')
  const repeated=await f.handle({type:'advance'});assert.equal(repeated.steps[0].status,'needs_details');assert.deepEqual(copy(repeated.steps[0].values),meal())
  await f.handle({type:'stop'});assert.equal(f.calls.post,0);assert.equal(f.h.state().food.length,0);assert.equal(pending.steps[0].reviewId,undefined)
 })
 await check('a later selected source requires another full review and rejects stale earlier approval',async()=>{
  const fried=egg(),boiled=egg('boiled','Egg, whole, cooked, boiled');const f=setup();prep.normal.setLocals([fried,boiled,coffee(),milk()]);const ingredients=meal().ingredients
  await f.handle({type:'plan',steps:[{id:'breakfast',operation:'food.diary.create',values:meal()}]});ingredients[0].name=fried.name
  const first=await f.handle({type:'correct',stepId:'breakfast',values:{ingredients}});ingredients[0].name=boiled.name
  const second=await f.handle({type:'correct',stepId:'breakfast',values:{ingredients}});assert.notEqual(first.steps[0].reviewId,second.steps[0].reviewId)
  await assert.rejects(()=>f.handle({type:'confirm',reviewId:first.steps[0].reviewId}),error=>error.code==='stale_review');assert.equal(f.calls.post,0)
  assert.equal(second.steps[0].prepared.data.normal.normalDraft.food.items[0].__voiceSourceFood.id,'boiled')
 })
 await check('choices are data only and forged amounts sources IDs or extra fields cannot enter clarification',async()=>{
  const values=wire(meal()),valid={ingredientIndex:0,requestedName:values.ingredients[0].name,quantity:2,unit:'each',options:[{id:'fried',source:'usda',name:egg().name,servingSize:'100 g',unmatchedTerms:['sunny','side','up']}]}
  for(const change of[row=>{row.quantity=200},row=>{row.requestedName='invented'},row=>{row.ingredientIndex=30},row=>{row.options[0].source='model'},row=>{row.options[0].calories=1},row=>{row.options.push(copy(row.options[0]))},row=>{row.actorId='other'}]){const changed=copy(valid);change(changed);assert.throws(()=>prep.food.validateAssistantFoodSourceChoices([changed],values))}
  assert.throws(()=>prep.food.validateAssistantFoodServiceValues('food.diary.create',{...values,ingredients:[{...values.ingredients[0],sourceId:'fried'}]}))
  assert.equal(prep.food.validateAssistantFoodSourceChoices([valid],values).length,1)
 })
 await check('actual adapter rejects forged or unrelated 422 choice envelopes rather than treating them as normal clarification',async()=>{
  const values=wire(meal()),valid={ingredientIndex:0,requestedName:values.ingredients[0].name,quantity:2,unit:'each',options:[{id:'fried',source:'usda',name:egg().name,servingSize:'100 g',unmatchedTerms:['sunny','side','up']}]}
  for(const bad of[{choices:[{...valid,quantity:200}],fields:['ingredients.0']},{choices:[valid],fields:['ingredients.1']},{choices:[valid,valid,valid,valid],fields:['ingredients.0']}]){
   const adapter=base.load('lib/native-assistant-food-normal-services.ts',{AssistantContractError:registry.AssistantContractError,validateAssistantFoodSourceChoices:prep.food.validateAssistantFoodSourceChoices,NextRequest:Request,Headers,URL,verifyNativeVoiceDraft:()=>{throw Error('Forged clarification must not enter review')},require:()=>({POST:async()=>Response.json({code:'missing_fields',error:'Choose a food record.',...bad},{status:422})})})
   const services=adapter.createNativeAssistantFoodNormalServices({request:new Request('https://offline.invalid'),authenticate:async()=> 'owner',readDayContext:async()=>{throw Error('Unexpected target read')}})
   await assert.rejects(()=>services.prepare({actorId:'owner',localDate:values.localDate,capabilities:[]},'food.diary.create',values),error=>!(error instanceof registry.AssistantContractError&&error.code==='missing_fields'))
  }
 })
 await check('generic source alternatives retain explicitly requested cooking methods and refuse compound-component substitutions',async()=>{
  const roasted=source('roasted','Mushrooms, cooked, roasted'),raw=source('raw','Mushrooms, raw'),fried=source('fried','Mushrooms, cooked, fried')
  prep.normal.setLocals([roasted,raw,fried,coffee(),milk()]);let values=wire({...meal(),ingredients:[{name:'roasted woodland mushrooms',quantity:100,unit:'g'}]})
  const response=await prep.post('food.diary.create',values),body=await response.json();assert.equal(response.status,422);assert.deepEqual(body.choices[0].options.map(option=>option.id),['roasted']);assert.deepEqual(body.choices[0].options[0].unmatchedTerms,['woodland'])
  values=wire({...meal(),ingredients:[{name:'coffee with skim milk',quantity:1,unit:'cup'}]});const compound=await(await prep.post('food.diary.create',values)).json();assert.equal(compound.choices,undefined);assert.equal(compound.preparation,undefined)
 })
 console.log(`Voice food source choice: ${groups} actual-source offline groups passed. No model, provider, credentials, real wallet, catalog or database calls.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
