#!/usr/bin/env node
'use strict'
// Actual favorite preparation, review signatures and normal favorite persistence
// with synthetic saved recipe/account/transaction data only. No app imports,
// environment files, providers, network, credentials or real database access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value))
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
function pure(relative){const module={exports:{}};vm.runInNewContext(compile(fs.readFileSync(path.join(root,relative),'utf8')),{module,exports:module.exports,URL,crypto,Buffer,process:{env:{NODE_ENV:'test'}},require:name=>{if(name==='crypto')return crypto;throw Error('Imports forbidden')}});return module.exports}
const readAst=relative=>{const raw=fs.readFileSync(path.join(root,relative),'utf8');return ts.createSourceFile(relative,raw,ts.ScriptTarget.Latest,true)}
const route=readAst('app/api/native/voice-assistant/route.ts'),confirm=readAst('app/api/native/voice-assistant/confirm/route.ts')
const box=vm.createContext({...pure('lib/native-voice-spoken-quantities.ts'),...pure('lib/native-voice-recipe-metadata.ts'),URL,Date,crypto,AbortController,setTimeout,clearTimeout,Prisma:{JsonNull:null},console,fetch:()=>{throw Error('Network forbidden')}})
vm.runInContext(compile(route.statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>n.getText(route).replace(/^export\s+/,'')).join('\n')),box)
vm.runInContext(compile(confirm.statements.filter(n=>ts.isFunctionDeclaration(n)&&['saveFavoriteFood','reviewedTimestamp','localDate','mealTargetFromText'].includes(n.name.text)).map(n=>n.getText(confirm)).join('\n')),box)
const tokens=pure('lib/native-voice-review-token.ts')
function fixture(scale=1,title='Voice repair test two serving banana milk'){
 const items=[{id:'synthetic-banana',name:'banana',serving_size:'100 g',nutritionCoversServing:true,calories:89,protein_g:1.09,carbs_g:22.84,fat_g:.33,fiber_g:null,sugar_g:12.23},{id:'synthetic-milk',name:'whole milk',serving_size:'100 ml',nutritionCoversServing:true,calories:61.8,protein_g:3.2,carbs_g:4.8,fat_g:3.3,fiber_g:0,sugar_g:5}]
 const recipe={title,servings:2,ingredients:['100 g banana','100 ml whole milk'],steps:['Blend the banana and milk until smooth.'],prepMinutes:null,cookMinutes:null,sourceUrl:null}
 const nutrition={__importRecipe:recipe,__portionScale:scale,__portionControlEnabled:scale!==1,__portionUnit:'serving',__portionAmount:2*scale,__portionRecipeServings:2,__nativeRecipeServingsEaten:2*scale,__portionTotalWeightG:null}
 for(const [primary,alias]of [['calories','calories_kcal'],['protein_g','protein'],['carbs_g','carbs'],['fat_g','fat'],['fiber_g','fiber'],['sugar_g','sugar']]){const values=items.map(i=>i[primary]);nutrition[primary]=nutrition[alias]=values.some(v=>v===null)?null:values.reduce((a,b)=>a+b,0)*scale}
 return{id:'synthetic-owned-recipe',label:title,description:title,meal:'dinner',nutrition,total:clone(nutrition),items}
}
const build=(request,favorite=fixture())=>box.buildFavoriteFoodDraft(request,'2026-10-17',[favorite])
let count=0
async function check(name,run){await run();count++;console.log('PASS '+name)}
async function main(){
 await check('exact actual request selects one of two servings, all six totals and a natural spoken review',async()=>{
  const original=fixture(),before=clone(original),draft=await build('Log one serving of Voice repair test two serving banana milk for snacks today',original),n=draft.food.favorite.nutrition
  assert.equal(draft.action,'food_favorite');assert.equal(draft.canConfirm,true);assert.equal(draft.autoSave,false);assert.equal(draft.food.meal,'snacks')
  assert.equal(n.calories,75.4);assert.equal(n.protein_g,2.145);assert.equal(n.carbs_g,13.82);assert.equal(n.fat_g,1.815);assert.equal(n.fiber_g,null);assert.equal(n.sugar_g,8.615)
  assert.equal(n.__portionScale,.5);assert.equal(n.__portionAmount,1);assert.equal(n.__portionControlEnabled,true);assert.equal(n.__portionRecipeServings,2)
  assert.deepEqual(clone(draft.food.favorite.items),before.items);assert.deepEqual(clone(original),before)
  for(const text of ['1 of 2 recipe servings','75.4 calories','grams protein','grams carbohydrate','grams fat','fibre unknown','grams sugar','Would you like me to save it?'])assert(draft.confirmationMessage.includes(text),text)
  assert(!/tap|button/i.test(draft.confirmationMessage))
 })
 await check('no amount excludes numeric serving words inside selected names and preserves existing saved portion',async()=>{
  for(const title of ['Voice repair test two serving banana milk','Half of the recipe milk','Recipe 2 servings (banana milk)']){
   const favorite=fixture(.25,title),draft=await build(`Log ${title} for snacks today`,favorite)
   assert.equal(draft.canConfirm,true);assert.equal(draft.food.favorite.nutrition,favorite.nutrition);assert.equal(draft.food.favorite.total,favorite.total);assert.equal(draft.food.favorite.items,favorite.items)
   assert.equal(draft.food.favorite.nutrition.calories,37.7)
  }
 })
 await check('one serving from a previously partial favorite scales the whole ingredient basis once',async()=>{
  const draft=await build('Log one serving of Voice repair test two serving banana milk',fixture(.25))
  assert.equal(draft.canConfirm,true);assert.equal(draft.food.favorite.nutrition.calories,75.4);assert.equal(draft.food.favorite.items[0].calories,89)
  assert.equal(draft.food.favorite.nutrition.__portionAmount,1)
 })
 await check('whole, half recipe, quarter recipe, fractional serving and explicit one of two servings retain exact meaning',async()=>{
  for(const [request,expected,amount]of [['Log the whole recipe Voice repair test two serving banana milk',150.8,2],['Log half of Voice repair test two serving banana milk',75.4,1],['Log quarter of Voice repair test two serving banana milk',37.7,.5],['Log half a serving of Voice repair test two serving banana milk',37.7,.5],['Log one of two recipe servings of Voice repair test two serving banana milk',75.4,1],['Log three servings of Voice repair test two serving banana milk',226.2,3]]){
   const draft=await build(request);assert.equal(draft.canConfirm,true,draft.confirmationMessage);assert(Math.abs(draft.food.favorite.nutrition.calories-expected)<1e-10);assert.equal(draft.food.favorite.nutrition.__portionAmount,amount)
  }
 })
 await check('unsupported, zero, negative, uncertain, conflicting and malformed portions never silently log the whole',async()=>{
  for(const amount of ['zero servings','-1 serving','one or two servings','some servings','100 g','one bowl','one portion','one serving and two servings','one of three recipe servings','.5 serving']){
   const draft=await build(`Log ${amount} of Voice repair test two serving banana milk`)
   assert.equal(draft.canConfirm,false,`${amount}: ${draft.confirmationMessage}`);assert.equal(draft.food.favorite,undefined)
  }
 })
 await check('missing or inconsistent recipe yield/scale/whole ingredient basis requires a new review',async()=>{
  for(const alter of [f=>{delete f.nutrition.__importRecipe},f=>{f.nutrition.__importRecipe.servings=0},f=>{f.nutrition.__portionScale=0},f=>{f.nutrition.__portionRecipeServings=3},f=>{f.nutrition.__portionAmount=1},f=>{f.nutrition.__portionUnit='g'},f=>{f.items.pop()},f=>{f.items[0].calories=40},f=>{f.nutrition.fiber=0},f=>{f.nutrition.calories_kcal=0}]){
   const favorite=fixture();alter(favorite);const draft=await build('Log one serving of Voice repair test two serving banana milk',favorite);assert.equal(draft.canConfirm,false)
  }
 })
 await check('optional unknown nutrients remain unknown and genuine zero stays zero in both aliases',async()=>{
  const favorite=fixture();favorite.items.forEach(i=>{i.sugar_g=null;i.fat_g=0});favorite.nutrition.sugar=favorite.nutrition.sugar_g=null;favorite.nutrition.fat=favorite.nutrition.fat_g=0
  const draft=await build('Log one serving of Voice repair test two serving banana milk',favorite),n=draft.food.favorite.nutrition
  assert.equal(n.fiber_g,null);assert.equal(n.fiber,null);assert.equal(n.sugar_g,null);assert.equal(n.sugar,null);assert.equal(n.fat_g,0);assert.equal(n.fat,0)
 })
 await check('actual signature binds exact account, requested portion and whole ingredient source',async()=>{
  const draft={...await build('Log one serving of Voice repair test two serving banana milk'),reviewIssuedAt:Date.now(),reviewNonce:'synthetic-portion-review'}
  draft.reviewToken=tokens.signNativeVoiceDraft('synthetic-user',draft)
  assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user',draft),true);assert.equal(tokens.verifyNativeVoiceDraft('another-user',draft),false)
  for(const alter of [d=>{d.food.favorite.nutrition.__portionAmount=2},d=>{d.food.favorite.nutrition.calories=150.8},d=>{d.food.favorite.items[0].calories=40}]){const changed=clone(draft);alter(changed);assert.equal(tokens.verifyNativeVoiceDraft('synthetic-user',changed),false)}
 })
 await check('unchanged normal favorite confirmation saves reviewed75.4 and original ingredient basis only once to caller account',async()=>{
  const draft=await build('Log one serving of Voice repair test two serving banana milk for snacks today'),rows=[]
  const db={foodLog:{create:async({data})=>{rows.push(clone(data));return{id:'synthetic-new-food'}}}}
  const receipt=await box.saveFavoriteFood('synthetic-user',draft,db)
  assert.deepEqual(Array.from(receipt.ids),['synthetic-new-food']);assert.equal(rows.length,1);assert.equal(rows[0].userId,'synthetic-user');assert.equal(rows[0].meal,'snacks')
  assert.equal(rows[0].nutrients.calories,75.4);assert.equal(rows[0].nutrients.__portionScale,.5);assert.equal(rows[0].nutrients.__portionAmount,1);assert.equal(rows[0].nutrients.fiber,null)
  assert.equal(rows[0].items[0].calories,89);assert.equal(rows[0].items[1].calories,61.8);assert.equal(rows[0].nutrients.__importRecipe.servings,2)
 })
 console.log(`Voice favorite recipe portions: ${count} actual-source offline groups passed; synthetic favorite/signature/account/save fixtures only.`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
