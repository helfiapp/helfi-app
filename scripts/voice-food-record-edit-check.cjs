#!/usr/bin/env node
'use strict'
// Actual food-route functions with synthetic catalog/serving replies. No imports
// of app code, environment secrets, network, real accounts or databases.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const allowed = new Set(['lib/native-voice-drink-label.ts', 'lib/native-voice-spoken-quantities.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts', 'lib/native-voice-recipe-metadata.ts', 'lib/native-voice-resolved-food.ts'])
const cache = new Map()
function measurement(relative) {
  assert(allowed.has(relative), `Unexpected dependency ${relative}`)
  if (cache.has(relative)) return cache.get(relative)
  const module = {exports:{}}
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,require:request=>measurement(path.posix.normalize(path.posix.join(path.posix.dirname(relative),request))+'.ts')},{filename:relative})
  cache.set(relative,module.exports);return module.exports
}
const raw = fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8')
const ast = ts.createSourceFile('route.ts',raw,ts.ScriptTarget.Latest,true)
const source = ast.statements.filter(n=>ts.isFunctionDeclaration(n)||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='INGREDIENT_LOOKUP_FILLER_WORDS'))).map(n=>n.getText(ast).replace(/^export\s+/,'')).join('\n')
const assertNoNetwork = () => { throw Error('Network/provider access forbidden') }
let missing = false, saved = null
const ctx = vm.createContext({ ...measurement('lib/native-voice-spoken-quantities.ts'), ...measurement('lib/food/serving-measurements.ts'), ...measurement('lib/native-voice-recipe-metadata.ts'), URL, console,
  verifiedVoiceMenuAliases: [],
  searchLocalFoods: async q => missing ? [] : [{ id:'source:'+q,name:q,source:'usda_foundation',serving_size:'100 g',calories:100,protein_g:10,carbs_g:5,fat_g:2,fiber_g:null,sugar_g:0 }],
  searchCustomFoodMacros: async()=>[], prisma:{foodLibraryItem:{findMany:async()=>[]}}, fetch:assertNoNetwork,
})
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const confirmRaw=fs.readFileSync(path.join(root,'app/api/native/voice-assistant/confirm/route.ts'),'utf8')
const confirmAst=ts.createSourceFile('confirm.ts',confirmRaw,ts.ScriptTarget.Latest,true)
const selected=['saveBuiltMeal','reviewedNutrient','reviewedTimestamp','localDate']
const confirmSource=confirmAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&selected.includes(n.name.text)).map(n=>n.getText(confirmAst)).join('\n')
vm.runInContext(ts.transpileModule(confirmSource,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
ctx.crypto={randomUUID:()=> 'synthetic-id'}

const recipe={title:'Chicken and rice',servings:4,prepMinutes:10,cookMinutes:20,ingredients:['200 g chicken breast','200 g cooked rice'],steps:['Simmer rice until tender.','Cook chicken thoroughly and serve with rice.'],sourceUrl:null}
const recordModule={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/native-voice-record-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:recordModule,exports:recordModule.exports,require:name=>{
 if(name==='crypto')return require('node:crypto')
 if(name==='@/lib/native-voice-health-intake-record-actions')return {isHealthIntakeRecordEntity:()=>false}
 if(name==='next/server')return {NextRequest:class {constructor(){throw Error('Real request construction forbidden in offline test')}}}
 if(name==='@/lib/native-voice-resolved-food')return measurement('lib/native-voice-resolved-food.ts')
 if(name==='@/lib/native-voice-drink-label')return measurement('lib/native-voice-drink-label.ts')
 throw Error('Forbidden runtime dependency '+name)
}})

let foods=[],waters=[],calls=[]
const io=async(request,call)=>{
 assert.equal(call.method,'GET');calls.push(call)
 return {logs:(call.entity==='food'?foods:waters).filter(row=>!call.id||row.id===call.id)}
}
ctx.isHealthIntakeRecordEntity=()=>false;ctx.normalizeVoiceTimeZone=()=> 'UTC'
ctx.selectNativeVoiceFoodRecordForEdit=(req,userId,raw)=>recordModule.exports.selectNativeVoiceFoodRecordForEdit(req,userId,raw,io)
ctx.prepareNativeVoiceResolvedFoodRecordAction=(req,userId,selection,food,options)=>recordModule.exports.prepareNativeVoiceResolvedFoodRecordAction(req,userId,selection,food,options,io)
ctx.searchLocalFoods=async q=>[{id:'source:'+q,name:q,source:'usda_foundation',serving_size:/milk|coffee/i.test(q)?'100 ml':'100 g',calories:100,protein_g:10,carbs_g:5,fat_g:2,fiber_g:null,sugar_g:0}]
const normalizeNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='normalizeDraft')
const recordBranch=normalizeNode.body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)===`parsedAction === 'record_action'`)
assert(recordBranch)
vm.runInContext(ts.transpileModule(`async function actualNormalizeRecord(parsed,transcript) {
 const parsedAction=parsed.action,actionRequest={headers:{authorization:'synthetic-original-auth'}},userId='synthetic-user',localDate='2026-10-17',country='AU',actionTimeZone='UTC';
 ${recordBranch.getText(ast)}
}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const edit=async(changes,entity='food',query='Chicken and rice')=>(await ctx.actualNormalizeRecord({action:'record_action',recordAction:{operation:'update',entity,localDate:'2026-10-17',query,changes}},'Change the selected entry')).draft
async function reset(){
 const built=await ctx.buildVoiceRecipeReviewDraft(recipe,'Log one serving of this recipe','2026-10-17','AU')
 foods=[{id:'synthetic-food',userId:'synthetic-user',name:recipe.title,localDate:'2026-10-17',meal:'lunch',items:built.food.items,nutrients:built.food.nutrition}];waters=[];calls=[]
}
let count=0
async function check(name,fn){await reset();await fn();count++;console.log('PASS '+name)}
async function run(){
 await check('actual normalize and adapters replace one measured ingredient, retain recipe and eaten portion',async()=>{
  const d=await edit({ingredientChanges:[{match:'chicken breast',quantity:100,unit:'g'}]})
  assert.equal(d.canConfirm,true,JSON.stringify(d));const n=d.recordAction.changes.nutrition
  assert.equal(n.calories,75);assert.equal(n.__portionScale,.25);assert.equal(n.__importRecipe.servings,4)
  assert.equal(n.__importRecipe.steps[0],recipe.steps[0]);assert.equal(n.__importRecipe.ingredients[0],'100 g chicken breast')
  assert.equal(d.recordAction.changes.items[0].calories,100);assert.equal(d.recordAction.id,'synthetic-food')
 })
 await check('portion multiplier is relative to current eaten share, not whole batch',async()=>{
  const d=await edit({portionMultiplier:2});assert.equal(d.canConfirm,true)
  assert.equal(d.recordAction.changes.nutrition.calories,200);assert.equal(d.recordAction.changes.nutrition.__portionAmount,2)
  assert.equal(d.recordAction.changes.items[0].calories,200)
 })
 await check('gram portion survives ingredient weight change and relative multiplier',async()=>{
  Object.assign(foods[0].nutrients,{__portionUnit:'g',__portionAmount:100,__portionTotalWeightG:400,__portionScale:.25,__portionControlEnabled:true})
  const d=await edit({ingredientChanges:[{match:'chicken breast',quantity:100,unit:'g'}],portionMultiplier:2})
  assert.equal(d.canConfirm,true);assert.equal(d.recordAction.changes.nutrition.__portionScale,2/3)
  assert.equal(d.recordAction.changes.nutrition.__portionAmount,200);assert.equal(d.recordAction.changes.nutrition.calories,200)
 })
 await check('add, remove and replacement names rebuild every source ingredient',async()=>{
  const d=await edit({ingredientChanges:[{match:'chicken breast',replacementName:'salmon'}],ingredientsAdd:[{name:'broccoli',quantity:100,unit:'g'}]})
  assert.equal(d.canConfirm,true);assert.equal(d.recordAction.changes.items.length,3);assert.equal(d.recordAction.changes.nutrition.calories,125)
  const removed=await edit({ingredientChanges:[{match:'cooked rice',remove:true}]})
  assert.equal(removed.canConfirm,true);assert.equal(removed.recordAction.changes.items.length,1)
 })
 await check('full measured replacement can repair an old entry without usable ingredient measures',async()=>{
  foods[0].items=[{name:'Unknown food'}]
  const d=await edit({ingredients:['100 g chicken breast','50 g cooked rice']})
  assert.equal(d.canConfirm,true);assert.equal(d.recordAction.changes.nutrition.calories,37.5)
 })
 await check('ambiguous records and ingredient matches do not guess or produce save authority',async()=>{
  foods.push({...foods[0],id:'second'});const ambiguous=await edit({portionMultiplier:.5});assert.equal(ambiguous.canConfirm,false)
  assert.equal(ambiguous.recordAction.changes.portionMultiplier,.5);assert.equal(ambiguous.recordAction.choices.length,2)
  foods.pop();foods[0].items.push({...foods[0].items[0],requestedName:'ground chicken breast',name:'ground chicken breast'})
  assert.equal((await edit({ingredientChanges:[{match:'chicken',quantity:50,unit:'g'}]})).canConfirm,false)
  assert.equal((await edit({ingredientChanges:[{match:'nonexistent',remove:true}]})).canConfirm,false)
 })
 await check('unmeasured, zero and conflicting changes cannot become partial updates',async()=>{
  for(const changes of [{ingredients:['chicken breast']},{ingredientChanges:[{match:'chicken breast',quantity:0,unit:'g'}]},{ingredients:['100 g chicken'],ingredientsAdd:['50 g rice']},{portionMultiplier:0}]) assert.equal((await edit(changes)).canConfirm,false)
 })
 await check('linked drink sugar removal clears old sweetener metadata and preserves linked record',async()=>{
  const built=await ctx.buildVoiceMealDraft({meal:'snacks',mealName:'Coffee',ingredients:[{name:'coffee',quantity:200,unit:'ml'},{name:'sugar',quantity:5,unit:'g'}]},'Log coffee','2026-10-17','AU')
  foods=[{id:'coffee-food',userId:'synthetic-user',name:'Coffee',localDate:'2026-10-17',meal:'snacks',items:built.food.items,nutrients:{...built.food.nutrition,__waterLogId:'coffee-water',__sweetenerType:'sugar',__sweetenerGrams:5,__sweetenerCalories:5}}]
  waters=[{id:'coffee-water',userId:'synthetic-user',label:'Coffee with sugar (5 g)',amount:200,unit:'ml',localDate:'2026-10-17'}]
  const d=await edit({ingredientChanges:[{match:'sugar',remove:true}]},'water','Coffee')
  assert.equal(d.canConfirm,true,JSON.stringify(d));assert.equal(d.recordAction.entity,'water');assert.equal(d.recordAction.id,'coffee-water')
  const n=d.recordAction.resolvedDrinkFood.food.nutrition;assert.equal(n.__sweetenerType,null);assert.equal(n.__sweetenerGrams,0);assert.equal(n.__waterLogId,'coffee-water')
  assert.equal(n.calories,200);assert.equal(n.__drinkAmountMl,200)
  assert.equal(d.recordAction.changes.label,'Coffee')
 })
 await check('voice-generated measured drink labels follow edited amounts while custom labels survive',async()=>{
  const label='coffee with 8 g sugar with 25 ml milk'
  const built=await ctx.buildVoiceMealDraft({meal:'uncategorized',mealName:label,ingredients:['250 ml coffee','8 g sugar','25 ml milk'].map(text=>ctx.parseIngredientPhrase(text))},'Log coffee','2026-10-17','AU')
  assert.equal(built.canConfirm,true)
  foods=[{id:'coffee-food',userId:'synthetic-user',name:label,localDate:'2026-10-17',meal:'uncategorized',items:built.food.items,nutrients:{...built.food.nutrition,__waterLogId:'coffee-water',__drinkType:'Coffee',__drinkAmount:250,__drinkUnit:'ml',__drinkAmountMl:250}}]
  waters=[{id:'coffee-water',userId:'synthetic-user',label,amount:250,unit:'ml',localDate:'2026-10-17'}]
  const d=await edit({ingredientChanges:[{match:'milk',quantity:50,unit:'ml'}]},'water','coffee')
  assert.equal(d.canConfirm,true,JSON.stringify(d));assert.match(d.recordAction.changes.label,/50 ml milk/);assert(!d.recordAction.changes.label.includes('25 ml'))
  assert.match(d.recordAction.changes.label,/8 g sugar/)
  const named=await edit({ingredientChanges:[{match:'milk',quantity:50,unit:'ml'}],label:'Morning coffee'},'water','coffee')
  assert.equal(named.recordAction.changes.label,'Morning coffee')
  foods[0].name=waters[0].label='My morning coffee'
  const unchangedName=await edit({ingredientChanges:[{match:'milk',quantity:50,unit:'ml'}]},'water','My morning coffee')
  assert.equal(unchangedName.canConfirm,true);assert.equal(unchangedName.recordAction.changes.label,undefined)
 })
 await check('natural just-logged drink reference selects the existing drink, preserves source date and refuses ambiguity',async()=>{
  const label='coffee with 8 g sugar with 25 ml milk'
  const built=await ctx.buildVoiceMealDraft({meal:'uncategorized',mealName:label,ingredients:['250 ml coffee','8 g sugar','25 ml milk'].map(text=>ctx.parseIngredientPhrase(text))},'Log coffee','2026-10-17','AU')
  foods=[{id:'coffee-food',userId:'synthetic-user',name:label,localDate:'2026-10-17',items:built.food.items,nutrients:{...built.food.nutrition,__waterLogId:'coffee-water',__drinkAmount:250,__drinkUnit:'ml',__drinkAmountMl:250}}]
  waters=[{id:'coffee-water',userId:'synthetic-user',label,amount:250,unit:'ml',localDate:'2026-10-17'}]
  const command={action:'record_action',recordAction:{operation:'update',entity:'water',query:'coffee I just logged today with 50 ml milk',localDate:'2026-10-16',changes:{ingredientChanges:[{match:'milk',quantity:50,unit:'ml'}]}}}
  const result=(await ctx.actualNormalizeRecord(command,'In the coffee I just logged today, change the milk to 50 millilitres.')).draft
  assert.equal(result.canConfirm,true,JSON.stringify(result));assert.equal(result.recordAction.id,'coffee-water');assert.equal(result.recordAction.localDate,'2026-10-17');assert(calls.filter(call=>call.entity==='water').every(call=>call.localDate==='2026-10-17'))
  assert.match(result.confirmationMessage,/50 ml/)
  waters.push({...waters[0],id:'second-coffee'});
  assert.equal((await ctx.actualNormalizeRecord(command,'In the coffee I just logged today, change the milk to 50 millilitres.')).draft.canConfirm,false)
 })
 await check('all integration calls remain read-only until signed confirmation',async()=>{
  const d=await edit({portionMultiplier:.5});assert.equal(d.canConfirm,true);assert(calls.length>=3);assert(calls.every(call=>call.method==='GET'))
 })
 console.log(`Voice food-record edits: ${count} actual-source offline groups passed; synthetic owned records and source data only.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
