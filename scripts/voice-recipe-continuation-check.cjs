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
const ctx = vm.createContext({ ...measurement('lib/native-voice-spoken-quantities.ts'), ...measurement('lib/food/serving-measurements.ts'), ...measurement('lib/native-voice-recipe-metadata.ts'), URL, console, ...require('./voice-recorded-source-fixture.cjs'), AbortController, setTimeout, clearTimeout,
  verifiedVoiceMenuAliases: [],
  searchLocalFoods: async q => missing ? [] : [{ id:'source:'+q,name:q,source:'usda_foundation',serving_size:/milk/i.test(q)?'100 ml':'100 g',calories:100,protein_g:10,carbs_g:5,fat_g:2,fiber_g:null,sugar_g:0 }],
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
let ioCalls=[]
ctx.prepareNativeVoiceFoodLibraryFromResolved=(request,userId,raw,food,options)=>recordModule.exports.prepareNativeVoiceFoodLibraryFromResolved(request,userId,raw,food,options,async(req,call)=>{
 assert.equal(req,request);assert.equal(call.method,'GET');ioCalls.push(call)
 return {favorites:[],voiceLibraryVersion:'a'.repeat(64)}
})
// Execute the actual POST selection and continuation blocks, with only unrelated
// date/signature/HTTP plumbing replaced. This catches command-context loss.
const start=raw.indexOf('    let editableDraft = confirmationDraft || followUpDraft',raw.indexOf('export async function POST'))
const end=raw.indexOf('    const sealDraft =',start)
assert(start>0&&end>start)
const setup=raw.slice(start,end)
let continuationNode
function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='recipeContinuation && editableDraft?.recipe?.importDraft')continuationNode=n;ts.forEachChild(n,visit)}
visit(ast);assert(continuationNode)
ctx.NextResponse={json:data=>data};ctx.resolveRequestedActionDate=(_t,date)=>date;ctx.transcriptHasDateEvidence=()=>false
vm.runInContext(ts.transpileModule(`async function actualPostRecipeContinuation(followUpDraft, transcript, confirmationDraft=null) {
 const request={headers:{authorization:'synthetic-original-auth'}}, user={id:'synthetic-user',country:'AU'};
 let localDate='2026-10-17';const todayLocalDate=localDate;
 ${setup}
 const sealDraft=draft=>({...draft,signedBySyntheticTest:true});
 ${continuationNode.getText(ast)}
 return {continued:false,explicitNewCommand,editableDraft};
}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
// Exercise the exact new initial POST branch as well as continuations. Only
// billing/auth/signature transport is synthetic; no model/provider is allowed.
let initialRecipeNode
function findInitial(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='explicitUserRecipe')initialRecipeNode=n;ts.forEachChild(n,findInitial)}
findInitial(ast);assert(initialRecipeNode)
let initialCharges=[]
ctx.SIMPLE_MIN_CREDITS=2
ctx.CreditManager=class {async getWalletStatus(){return {totalAvailableCents:1000}}async chargeCents(amount){initialCharges.push(amount);return true}}
ctx.logAiUsageEvent=async()=>{}
vm.runInContext(ts.transpileModule(`async function actualPostExplicitRecipe(transcript) {
 const request={headers:{authorization:'synthetic-original-auth'}},user={id:'synthetic-user',country:'AU'},editableDraft=null;
 const localDate='2026-10-17',transcriptionCostCents=0;
 const sealDraft=draft=>({...draft,signedBySyntheticTest:true});
 const explicitUserRecipe=!editableDraft?parseExplicitVoiceRecipe(transcript):null;
 ${initialRecipeNode.getText(ast)}
 return {continued:false};
}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const confirmTexts=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='CONFIRM_DRAFT_TEXTS'));assert(confirmTexts)
vm.runInContext(ts.transpileModule(confirmTexts.getText(ast),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
let normalizeRecipeNode
function findNormalizer(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='normalizeDraft')for(const item of n.body.statements)if(ts.isIfStatement(item)&&item.expression.getText(ast)==="action === 'recipe'")normalizeRecipeNode=item;ts.forEachChild(n,findNormalizer)}
findNormalizer(ast);assert(normalizeRecipeNode)
vm.runInContext(ts.transpileModule(`async function normalizeRecipeModelShape(parsed,transcript) {
 const action='recipe',actionRequest={headers:{authorization:'synthetic-original-auth'}},userId='synthetic-user',localDate='2026-10-17',country='AU',openai={},tzOffsetMin=-660,launchContext={section:'dashboard'};
 let aiCostCents=0,usedModel;
 ${normalizeRecipeNode.getText(ast)}
}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const dictatedRequest='Create and save a recipe called Voice repair test banana milk. It makes one serving. Ingredients are 100 grams of banana and 100 millilitres of whole milk. The step is blend the banana and milk until smooth. Save it to my recipe library without logging that I ate it.'
let count=0
async function check(name,fn){ioCalls=[];await fn();count++;console.log('PASS '+name)}
async function run(){
 const proposal=await ctx.buildVoiceRecipeReviewDraft(recipe,'Create recipe','2026-10-17','AU')
 await check('actual POST preserves full recipe when choosing save to Favorites',async()=>{
  const r=await ctx.actualPostRecipeContinuation(proposal,'Save this recipe to my favorites')
  assert.equal(r.success,true);assert.equal(r.draft.action,'record_action');assert.equal(r.draft.canConfirm,true)
  assert.equal(r.draft.recordAction.entity,'favorite');assert.equal(r.draft.recordAction.operation,'create')
  assert.equal(r.draft.recordAction.changes.nutrition.__importRecipe.servings,4)
  assert.equal(r.draft.recordAction.changes.nutrition.calories,400);assert.equal(r.draft.signedBySyntheticTest,true)
  assert.equal(ioCalls.length,1);assert.equal(ioCalls[0].entity,'favorite')
 })
 await check('actual POST custom recipe choice uses custom library with no diary write',async()=>{
  const r=await ctx.actualPostRecipeContinuation(proposal,'Add this recipe to my custom foods')
  assert.equal(r.draft.recordAction.entity,'custom_food');assert.equal(r.draft.recordAction.changes.customMeal,true)
  assert.equal(r.draft.recordAction.changes.items.length,2);assert(ioCalls.every(call=>call.method==='GET'))
 })
 await check('actual POST eaten portion remains recipe and scales once',async()=>{
  const one=await ctx.actualPostRecipeContinuation(proposal,'Log one serving of this recipe for lunch')
  assert.equal(one.draft.action,'food_build_meal');assert.equal(one.draft.food.nutrition.calories,100)
  const two=await ctx.actualPostRecipeContinuation(null,'Change to two servings',one.draft)
  assert.equal(two.draft.food.nutrition.calories,200);assert.equal(two.draft.food.items[0].calories,200)
  assert.equal(two.draft.food.meal,'lunch')
  assert.equal(two.draft.food.nutrition.__importRecipe.steps[0],recipe.steps[0]);assert.equal(ioCalls.length,0)
 })
 await check('unknown portion and simultaneous destinations need a choice',async()=>{
  assert.equal((await ctx.actualPostRecipeContinuation(proposal,'Log this recipe')).draft.canConfirm,false)
  const both=await ctx.actualPostRecipeContinuation(proposal,'Save this recipe and log one serving')
  assert.equal(both.draft.canConfirm,false);assert.match(both.draft.confirmationMessage,/first/);assert.equal(ioCalls.length,0)
 })
 await check('new unrelated command is not captured by recipe context',async()=>{
  const r=await ctx.actualPostRecipeContinuation(proposal,'Log water')
  assert.equal(r.continued,false);assert.equal(r.explicitNewCommand,true);assert.equal(r.editableDraft,null)
 })
 await check('model supplied nutrition is never source proof for recipe library creation',async()=>{
  const tampered=JSON.parse(JSON.stringify(proposal));tampered.food.items[0].calories=99999
  const r=await ctx.actualPostRecipeContinuation(tampered,'Save this recipe to favorites')
  assert.equal(r.draft.recordAction.changes.nutrition.calories,400)
 })
 await check('exact actual failed request prepares signed initial recipe library review without generation or eating',async()=>{
  initialCharges=[]
  const r=await ctx.actualPostExplicitRecipe(dictatedRequest)
  assert.equal(r.success,true);assert.equal(r.draft.action,'record_action');assert.equal(r.draft.canConfirm,true,r.draft.confirmationMessage)
  assert.equal(r.draft.signedBySyntheticTest,true);assert.equal(r.draft.recordAction.entity,'favorite');assert.equal(r.draft.recordAction.operation,'create')
  const imported=r.draft.recordAction.changes.nutrition.__importRecipe
  assert.equal(imported.title,'Voice repair test banana milk');assert.equal(imported.servings,1)
  assert.deepEqual(Array.from(imported.ingredients),['100 grams of banana','100 millilitres of whole milk'])
  assert.deepEqual(Array.from(imported.steps),['blend the banana and milk until smooth'])
  assert.equal(r.draft.recordAction.changes.items.length,2);assert.equal(r.draft.recordAction.changes.nutrition.__portionScale,1)
  assert.match(r.draft.confirmationMessage,/does not add a food diary entry/);assert.equal(r.confirmNow,undefined)
  assert.deepEqual(initialCharges,[2]);assert.equal(ioCalls.length,1);assert.equal(ioCalls[0].method,'GET')
  assert.equal(r.audio,null);assert.equal(r.voiceReply,false)
 })
 await check('natural yes of the reviewed recipe uses real record executor and only the selected library mutation',async()=>{
  const r=await ctx.actualPostExplicitRecipe(dictatedRequest),draft=r.draft
  let library=[],version='a'.repeat(64);const calls=[]
  assert.equal(ctx.isConfirmingDraftText('Yes.'),true)
  const result=await recordModule.exports.executeNativeVoiceRecordAction({headers:{authorization:'synthetic-original-auth'}},'synthetic-user',draft.recordAction,async(_req,call)=>{
   calls.push(call);assert.equal(call.entity,'favorite')
   if(call.method==='GET')return {favorites:library,voiceLibraryVersion:version}
   assert.equal(call.method,'POST');assert.deepEqual(Object.keys(call.body),['voiceFavoriteMutation'])
   const mutation=call.body.voiceFavoriteMutation;assert.equal(mutation.operation,'create');assert.equal(mutation.expectedVersion,version)
   library=[{id:mutation.id,...mutation.changes}];version='b'.repeat(64);return {success:true,id:mutation.id}
  })
  assert.equal(result.kind,'favorite');assert.equal(result.operation,'create');assert.equal(library.length,1)
  assert.equal(library[0].nutrition.__importRecipe.steps.length,1);assert.equal(calls.filter(call=>call.method!=='GET').length,1)
  assert(calls.every(call=>call.entity==='favorite'),'No food diary, hydration or consumption handler may run')
 })
 await check('negated consumption stays library-only while explicit dual destinations still ask',async()=>{
  for(const phrase of ['Save this recipe to my library without logging that I ate it','Save this recipe to favorites. Do not log it in my diary','Save this recipe to my recipes; don’t record eating it']) {
   const r=await ctx.prepareRecipeDestination({},'synthetic-user',recipe,phrase,'2026-10-17','AU')
   assert.equal(r.action,'record_action');assert.equal(r.canConfirm,true);assert.equal(r.recordAction.entity,'favorite')
  }
  const dual=await ctx.prepareRecipeDestination({},'synthetic-user',recipe,'Save this recipe and log one serving','2026-10-17','AU')
  assert.equal(dual.canConfirm,false);assert.match(dual.confirmationMessage,/first/)
  assert.equal(ctx.voiceRecipeDestinationIntent('Do not save this recipe. Log one serving.').wantsLibrary,false)
 })
 await check('actual recipe normalizer accepts all complete model shapes and preserves explicit user recipe over generated changes',async()=>{
  for(const parsed of [{action:'recipe',recipe},{action:'recipe',recipe:{importDraft:recipe}},{action:'recipe',recipeDraft:recipe}]) {
   const result=await ctx.normalizeRecipeModelShape(parsed,'Save this recipe to my recipe library without logging that I ate it')
   assert.equal(result.draft.action,'record_action');assert.equal(result.draft.canConfirm,true)
   assert.equal(result.draft.recordAction.changes.nutrition.__importRecipe.title,recipe.title)
  }
  const changed={...recipe,title:'Model changed title',servings:99,steps:['Invented different step']}
  const result=await ctx.normalizeRecipeModelShape({action:'recipe',recipe:changed},dictatedRequest)
  const actual=result.draft.recordAction.changes.nutrition.__importRecipe
  assert.equal(actual.title,'Voice repair test banana milk');assert.equal(actual.servings,1)
  assert.deepEqual(Array.from(actual.steps),['blend the banana and milk until smooth'])
 })
 await check('incomplete dictated recipes never get invented yield, ingredients or steps from the direct path',async()=>{
  for(const text of [dictatedRequest.replace('It makes one serving. ',''),dictatedRequest.replace('The step is blend the banana and milk until smooth. ',''),dictatedRequest.replace('Ingredients are 100 grams of banana and 100 millilitres of whole milk. ','')]) {
   assert.equal(ctx.parseExplicitVoiceRecipe(text),null);assert.equal((await ctx.actualPostExplicitRecipe(text)).continued,false)
  }
  missing=true
  const result=await ctx.actualPostExplicitRecipe(dictatedRequest)
  assert.equal(result.draft.canConfirm,false);assert.equal(result.draft.recordAction,undefined);assert.equal(ioCalls.length,0)
 })
 console.log(`Voice recipe continuation: ${count} actual-source offline groups passed; synthetic read-only library handler and source data.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
