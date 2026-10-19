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
const allowed = new Set(['lib/native-voice-spoken-quantities.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts', 'lib/native-voice-recipe-metadata.ts'])
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
const ctx = vm.createContext({ ...measurement('lib/native-voice-spoken-quantities.ts'), ...measurement('lib/food/serving-measurements.ts'), ...measurement('lib/native-voice-recipe-metadata.ts'), URL, console, AbortController, setTimeout, clearTimeout,
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
const recipe={title:'Chicken and rice',servings:4,prepMinutes:10,cookMinutes:20,ingredients:['200 g chicken breast','200 g cooked rice'],steps:['Simmer the rice in measured water until tender.','Cook chicken thoroughly and serve over rice.'],sourceUrl:null}
const build=(text,raw=recipe)=>ctx.buildVoiceRecipeReviewDraft(raw,text,'2026-10-17','AU')
let count=0
async function check(name,run){missing=false;saved=null;await run();count++;console.log('PASS '+name)}
async function run(){
await check('create complete recipe keeps full measured basis and actual steps, without logging',async()=>{
 const d=await build('Create a chicken and rice recipe')
 assert.equal(d.action,'recipe');assert.equal(d.canConfirm,false);assert.equal(d.food.items.length,2)
 assert.equal(d.food.nutrition.calories,400);assert.equal(d.food.nutrition.__portionScale,1)
 assert.equal(d.recipe.importDraft.servings,4);assert.deepEqual(Array.from(d.recipe.importDraft.steps),recipe.steps)
 assert.equal(d.food.nutrition.fiber_g,null);assert.equal(d.food.items[0].__voiceSourceFood.id,'source:chicken breast')
})
await check('one of four servings resolves and saves one quarter once, keeping recipe basis',async()=>{
 const d=await build('Log one serving of this recipe for dinner')
 assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,100)
 await ctx.saveBuiltMeal('synthetic-user',d,{foodLog:{create:async data=>{saved=data.data;return {id:'synthetic-food'}}}})
 assert.equal(saved.nutrients.calories,100);assert.equal(saved.nutrients.__portionScale,.25);assert.equal(saved.items[0].calories,200)
 assert.equal(saved.name,recipe.title);assert.equal(saved.description,recipe.title);assert.equal(saved.nutrients.__origin,'meal-builder')
 assert.equal(saved.nutrients.__importRecipe.steps[0],recipe.steps[0]);assert.equal(saved.nutrients.__portionAmount,1)
 const three=await build('Log three servings of this recipe');assert.equal(three.food.nutrition.calories,300)
 const again=await build('Log one serving of this recipe');assert.equal(again.food.nutrition.calories,100)
})
await check('whole and half recipe amounts have exact meanings, unknown eaten portion asks',async()=>{
 assert.equal((await build('Log the whole recipe')).food.nutrition.calories,400)
 assert.equal((await build('Log half the recipe')).food.nutrition.calories,200)
 assert.equal((await build('Log this recipe')).canConfirm,false)
})
await check('library choice cannot silently log diary or claim completed save',async()=>{
 const d=await build('Save this recipe to my recipes');assert.equal(d.action,'recipe');assert.equal(d.canConfirm,false);assert.match(d.confirmationMessage,/Nothing has been saved/)
})
await check('missing yield, cooking steps or measured amount never produces invented recipe',async()=>{
 for(const change of [{servings:undefined},{steps:[]},{ingredients:['chicken breast','200 g cooked rice']}]) assert.equal((await build('Create recipe',{...recipe,...change})).canConfirm,false)
 const d=ctx.buildRecipeHandoffDraft('Create recipe','2026-10-17');assert.equal(d.recipe.importDraft,undefined);assert.equal(d.appTarget,undefined)
 assert.equal(ctx.buildQuickRecipeDraft('Make dinner recipe','2026-10-17'),null)
})
await check('unmatched source never produces partial recipe save',async()=>{
 missing=true;const d=await build('Log one serving');assert.equal(d.canConfirm,false)
})
await check('complete multiline recipe parses all ingredients and real steps',async()=>{
 const text='Chicken and rice\nServings: 4\nIngredients:\n- 200 g chicken breast\n- 200 g cooked rice\nSteps:\n1. Simmer the rice until tender.\n2. Cook chicken thoroughly.'
 const d=await build('Log one serving',text);assert.equal(d.canConfirm,true);assert.equal(d.food.items.length,2);assert.equal(d.recipe.importDraft.steps.length,2)
})
await check('thirteen recipe ingredients are resolved in full across normal builder batches',async()=>{
 const d=await build('Create a complete recipe',{...recipe,ingredients:Array.from({length:13},()=> '100 g chicken breast')})
 assert.equal(d.food.items.length,13);assert.equal(d.food.nutrition.calories,1300);assert.equal(d.recipe.importDraft.ingredients.length,13)
})
await check('ordinary meal persistence keeps nutrition and no recipe metadata',async()=>{
 const d=await ctx.buildVoiceMealDraft({meal:'lunch',ingredients:[{name:'chicken breast',quantity:100,unit:'g'}]},'Log 100 g chicken','2026-10-17','AU')
 await ctx.saveBuiltMeal('synthetic-user',d,{foodLog:{create:async data=>{saved=data.data;return {id:'synthetic-food'}}}})
 assert.equal(saved.nutrients.calories,100);assert.equal(saved.nutrients.__importRecipe,undefined)
 assert.equal(saved.nutrients.__origin,undefined)
})
await check('named new meals use the manual creation title and origin metadata',async()=>{
 const d=await ctx.buildVoiceMealDraft({meal:'lunch',mealName:'Voice repair test lunch',ingredients:[{name:'chicken breast',quantity:100,unit:'g'},{name:'cooked rice',quantity:50,unit:'g'}]},'Log lunch','2026-10-17','AU')
 await ctx.saveBuiltMeal('synthetic-user',d,{foodLog:{create:async data=>{saved=data.data;return {id:'synthetic-food'}}}})
 assert.equal(saved.name,'Voice repair test lunch');assert.equal(saved.description,saved.name);assert.equal(saved.nutrients.__origin,'meal-builder')
 const webSource=fs.readFileSync(path.join(root,'app/food/page.tsx'),'utf8')
 const webAst=ts.createSourceFile('page.tsx',webSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let mapper
 function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(webAst)==='mapLogsToEntries')mapper=n.initializer;ts.forEachChild(n,find)}
 find(webAst);assert(mapper)
 // Execute the real normal diary mapping, isolating unrelated timing and
 // drink-normalization helpers. No protected UI or rename code is edited.
 const mappingContext={saved:{...saved,id:'synthetic-food',createdAt:'2026-10-17T12:00:00Z'},Date,
  normalizeCategory:value=>value,normalizeClientId:()=>'',alignTimestampToLocalDate:value=>value,
  parseCuidTimestampMs:()=>NaN,normalizeSuspiciousKjItems:items=>({items,changed:false}),
  applySugarFreeHotChocolateGuard:entry=>({entry}),removeInvalidDrinkMetaFromEntry:entry=>({entry})}
 vm.runInNewContext(ts.transpileModule(`const mapLogsToEntries=${mapper.getText(webAst)}; result=mapLogsToEntries([saved],'2026-10-17')[0]`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,mappingContext)
 assert.equal(mappingContext.result.description,'Voice repair test lunch');assert.equal(mappingContext.result.method,'meal-builder')
 assert.equal(saved.items.length,2);assert.equal(saved.nutrients.calories,150)
})
await check('actual recipe model adapter keeps complete structured recipe and concise spoken recommendation',async()=>{
 ctx.buildFoodDiarySnapshot=async()=>null;ctx.formatFoodDiarySnapshotForVoiceRecipe=()=>'';ctx.COMMAND_MODEL='synthetic-model'
 ctx.chatCompletionWithCost=async(_client,request)=>{
  assert.match(request.messages[0].content,/measured full-batch ingredient/)
  return {costCents:0,completion:{model:'synthetic-model',choices:[{message:{content:JSON.stringify({recommendation:'Try chicken and rice. Would you like that?',recipe})}}]}}
 }
 const response=await ctx.buildRecipe({},'Suggest dinner','synthetic-user','2026-10-17',0,{conversationFirst:true})
 assert.equal(response.text,'Try chicken and rice. Would you like that?');assert.equal(response.importDraft.servings,4)
 assert.deepEqual(Array.from(response.importDraft.steps),recipe.steps)
})
console.log(`Voice recipe integration: ${count} actual-source offline groups passed; synthetic food sources and storage only.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
