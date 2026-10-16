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
const allowed = new Set(['lib/native-voice-spoken-quantities.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts', 'lib/food/custom-serving-options.ts', 'lib/food/openfoodfacts.ts'])
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
const nutrition = {calories:100,protein_g:10,carbs_g:5,fat_g:2,fiber_g:null,sugar_g:0}
const option = (id,label,calories=100)=>({id,label,serving_size:label,...nutrition,calories})
const item = (id,name,brand,options)=>({id,name,brand,source:'custom',kind:'FAST_FOOD',...nutrition,serving_size:options?.[0]?.label||'100 g',servingOptions:options||[]})
let candidates = [], locals = [], servingReplies = {}, requests=[], diaryReply=null, menuRows=[]
class Request { constructor(url){this.url=String(url)} }
const ctx = vm.createContext({ ...measurement('lib/native-voice-spoken-quantities.ts'), ...measurement('lib/food/serving-measurements.ts'), URL, console, NextRequest:Request,
  verifiedVoiceMenuAliases:JSON.parse(fs.readFileSync(path.join(root,'data/food-overrides/voice-menu-aliases.json'),'utf8')),
  getCustomPackagedItems:async()=>menuRows,
  searchDiaryFoods:async req=>{const url=new URL(req.url);requests.push({kind:'search',q:url.searchParams.get('q'),country:url.searchParams.get('country'),localOnly:url.searchParams.get('localOnly')});return {json:async()=>({items:diaryReply?diaryReply(url):candidates})}},
  searchDiaryFoodServings:async req=>{const url=new URL(req.url);requests.push({kind:'servings',id:url.searchParams.get('id')});return {json:async()=>({options:servingReplies[url.searchParams.get('id')]||[]})}},
  searchLocalFoods:async(q,opts)=>{requests.push({kind:'local',q,sources:opts.sources});return locals},
  searchCustomFoodMacros:async()=>[],prisma:{foodLibraryItem:{findMany:async()=>[]}},
  fetch(){throw Error('Network forbidden')},
})
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
let total=0
async function check(name,fn){candidates=[];locals=[];servingReplies={};requests=[];diaryReply=null;menuRows=[];await fn();total++;console.log(`PASS ${name}`)}
const parse=text=>ctx.tryParseIngredientMealRequest(text)||ctx.tryParseDirectFoodRequest(text,{section:'dashboard',title:'Dashboard'})
const build=async text=>ctx.buildVoiceMealDraft(parse(text),text,'2026-10-17','AU')
const burgerName="McDONALD'S, DOUBLE QUARTER POUNDER with Cheese"
const nuggetsName="McDONALD'S, Chicken McNUGGETS"
const burger=()=>item('burger',burgerName,"McDonald's",[option('one-burger','1 sandwich (270 g)',800)])
const nuggets=()=>item('nuggets',nuggetsName,"McDonald's",[option('six-nuggets','6 pieces (96 g)',300)])
function actualMenuRows(){
  const exports={}
  const load=(relative)=>{
    const module={exports:{}}
    const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
    vm.runInNewContext(code,{module,exports:module.exports,process:{cwd:()=>root},require:request=>{
      if(request==='fs')return {existsSync:p=>p===path.join(root,'data/food-overrides/fast_food_menus.csv'),readFileSync:(p,encoding)=>{assert.equal(p,path.join(root,'data/food-overrides/fast_food_menus.csv'));return fs.readFileSync(p,encoding)}}
      if(request==='path')return path
      if(request==='./custom-food-import')return load('lib/food/custom-food-import.ts')
      throw Error('Unexpected menu dependency '+request)
    }},{filename:relative});return module.exports
  }
  return load('lib/food/fast-food-menus.ts').loadFastFoodMenuItems().filter(row=>row.country==='AU'&&row.chain==="McDonald's").map((row,index)=>({...row,id:`source-catalog-${index}`,brand:row.chain,kind:'FAST_FOOD'}))
}
function mappedStoredCatalog(rows){
  const module={exports:{}}
  const code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/food/custom-foods.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,Date,require:request=>{
    if(request==='server-only')return{}
    if(request==='@/lib/prisma')return{prisma:{customFoodItem:{findMany:async()=>rows}}}
    if(request==='@/lib/food/custom-serving-options')return measurement('lib/food/custom-serving-options.ts')
    throw Error('Unexpected catalog dependency '+request)
  }},{filename:'lib/food/custom-foods.ts'})
  return module.exports.getCustomPackagedItems
}
// Exact public CustomFoodItem rows captured read-only17Oct2026. Nutrients
// reside in recorded servingOptions; per100g fields are intentionally null.
function capturedStoredMenuRows(){return [{"id":"cmlc49uxq000a12sxppmnueee","key":"mcdonald s double quarter pounder|FAST_FOOD|au","name":"Double Quarter Pounder","brand":"McDonald's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Double Quarter Pounder (McDonald's)","McDonald's Double Quarter Pounder","Double Quarter Pounder (McDonald s)","McDonald s Double Quarter Pounder","Double Quarter Pounder (McDonalds)","McDonalds Double Quarter Pounder"],"servingOptions":[{"id":"serving-mcdonald s double quarter pounder 1 serving","ml":null,"fat_g":50.6,"grams":null,"label":"1 serving","carbs_g":34.2,"fiber_g":null,"sugar_g":8.3,"calories":804,"protein_g":52.3,"serving_size":"1 serving"}]},{"id":"cmvb631vg000bs76950mpd6g9","key":"mcdonald s chicken mcnuggets|FAST_FOOD|au","name":"Chicken McNuggets","brand":"McDonald's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Chicken McNuggets (McDonald's)","McDonald's Chicken McNuggets","Chicken McNuggets (McDonald s)","McDonald s Chicken McNuggets","Chicken McNuggets (McDonalds)","McDonalds Chicken McNuggets"],"servingOptions":[{"id":"serving-mcdonald s chicken mcnuggets 3 pieces","ml":null,"fat_g":6.5,"grams":null,"label":"3 pieces","carbs_g":6.2,"fiber_g":null,"sugar_g":0.2,"calories":108,"protein_g":6,"serving_size":"3 pieces"},{"id":"serving-mcdonald s chicken mcnuggets 6 pieces","ml":null,"fat_g":13,"grams":null,"label":"6 pieces","carbs_g":12.4,"fiber_g":null,"sugar_g":0.4,"calories":216,"protein_g":12.1,"serving_size":"6 pieces"},{"id":"serving-mcdonald s chicken mcnuggets 10 pieces","ml":null,"fat_g":21.7,"grams":null,"label":"10 pieces","carbs_g":20.6,"fiber_g":null,"sugar_g":0.7,"calories":360,"protein_g":20.1,"serving_size":"10 pieces"},{"id":"serving-mcdonald s chicken mcnuggets 20 pieces","ml":null,"fat_g":43.4,"grams":null,"label":"20 pieces","carbs_g":41.2,"fiber_g":null,"sugar_g":1.3,"calories":721,"protein_g":40.2,"serving_size":"20 pieces"},{"id":"serving-mcdonald s chicken mcnuggets 40 pieces","ml":null,"fat_g":86.8,"grams":null,"label":"40 pieces","carbs_g":82.5,"fiber_g":null,"sugar_g":2.7,"calories":1440,"protein_g":80.4,"serving_size":"40 pieces"}]}]}
// Captured public AU catalog competitors, in their original catalog order.
function capturedOtherRestaurantRows(){return [
  {"id":"cmlavzmo9050pvpxc5i9dl737","key":"kfc zinger crunch stacker burger|FAST_FOOD|au","name":"Zinger Crunch Stacker Burger","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Zinger Crunch Stacker Burger (KFC)","KFC Zinger Crunch Stacker Burger"],"servingOptions":[{"id":"serving-kfc zinger crunch stacker burger 1 serving","ml":null,"fat_g":42.2,"grams":351,"label":"1 serving (351 g)","carbs_g":53.8,"fiber_g":null,"sugar_g":null,"calories":814,"protein_g":53.7,"serving_size":"1 serving (351 g)"}]},
  {"id":"cmlavzmex050avpxc3kfhdahf","key":"kfc catering original recipe chicken 1pc|FAST_FOOD|au","name":"Catering - Original Recipe Chicken (1PC)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Catering - Original Recipe Chicken (1PC) (KFC)","KFC Catering - Original Recipe Chicken (1PC)"],"servingOptions":[{"id":"serving-kfc catering original recipe chicken 1pc 1 serving","ml":null,"fat_g":14.8,"grams":90,"label":"1 serving (90 g)","carbs_g":7.5,"fiber_g":null,"sugar_g":null,"calories":246,"protein_g":21.2,"serving_size":"1 serving (90 g)"}]},
  {"id":"cmlavyrjk041nvpxc77om5nh5","key":"kfc p2 2026 24 for 10 95 nuggets promo|FAST_FOOD|au","name":"P2 2026 - 24 for $10.95 Nuggets ( Promo )","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["P2 2026 - 24 for $10.95 Nuggets ( Promo ) (KFC)","KFC P2 2026 - 24 for $10.95 Nuggets ( Promo )"],"servingOptions":[{"id":"serving-kfc p2 2026 24 for 10 95 nuggets promo 1 serving","ml":null,"fat_g":86.3,"grams":494,"label":"1 serving (494 g)","carbs_g":80.4,"fiber_g":null,"sugar_g":null,"calories":1360,"protein_g":65.5,"serving_size":"1 serving (494 g)"}]},
  {"id":"cmlavz2vq04ewvpxc085cd1n1","key":"kfc 6 nuggets add on|FAST_FOOD|au","name":"6 Nuggets ADD ON","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["6 Nuggets ADD ON (KFC)","KFC 6 Nuggets ADD ON"],"servingOptions":[{"id":"serving-kfc 6 nuggets add on 1 serving","ml":null,"fat_g":15.8,"grams":127,"label":"1 serving (127 g)","carbs_g":27.1,"fiber_g":null,"sugar_g":null,"calories":316,"protein_g":16.2,"serving_size":"1 serving (127 g)"}]},
  {"id":"cmlavz2wc04exvpxcnfvsydhm","key":"kfc 6 nuggets 1|FAST_FOOD|au","name":"6 Nuggets (1)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["6 Nuggets (1) (KFC)","KFC 6 Nuggets (1)"],"servingOptions":[{"id":"serving-kfc 6 nuggets 1 1 serving","ml":null,"fat_g":15.8,"grams":127,"label":"1 serving (127 g)","carbs_g":27.1,"fiber_g":null,"sugar_g":null,"calories":316,"protein_g":16.2,"serving_size":"1 serving (127 g)"}]},
  {"id":"cmlavz2wz04eyvpxcyg4tde9h","key":"kfc 10 nuggets|FAST_FOOD|au","name":"10 Nuggets","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["10 Nuggets (KFC)","KFC 10 Nuggets"],"servingOptions":[{"id":"serving-kfc 10 nuggets 1 serving","ml":null,"fat_g":26.4,"grams":223,"label":"1 serving (223 g)","carbs_g":50.2,"fiber_g":null,"sugar_g":null,"calories":549,"protein_g":27,"serving_size":"1 serving (223 g)"}]},
  {"id":"cmlavz2zk04ezvpxc8p4x2lgf","key":"kfc 6 nuggets|FAST_FOOD|au","name":"6 Nuggets","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["6 Nuggets (KFC)","KFC 6 Nuggets"],"servingOptions":[{"id":"serving-kfc 6 nuggets 1 serving","ml":null,"fat_g":15.8,"grams":127,"label":"1 serving (127 g)","carbs_g":27.1,"fiber_g":null,"sugar_g":null,"calories":316,"protein_g":16.2,"serving_size":"1 serving (127 g)"}]},
  {"id":"cmlavz6np04i3vpxcjzbta2td","key":"kfc zinger burger|FAST_FOOD|au","name":"Zinger Burger","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Zinger Burger (KFC)","KFC Zinger Burger"],"servingOptions":[{"id":"serving-kfc zinger burger 1 serving","ml":null,"fat_g":22.3,"grams":186,"label":"1 serving (186 g)","carbs_g":34.3,"fiber_g":null,"sugar_g":null,"calories":451,"protein_g":27.1,"serving_size":"1 serving (186 g)"}]},
  {"id":"cmlavz8gi04jxvpxcgayd2u1p","key":"kfc zinger burger uber eats|FAST_FOOD|au","name":"Zinger Burger (Uber Eats)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Zinger Burger (Uber Eats) (KFC)","KFC Zinger Burger (Uber Eats)"],"servingOptions":[{"id":"serving-kfc zinger burger uber eats 1 serving","ml":null,"fat_g":22.3,"grams":186,"label":"1 serving (186 g)","carbs_g":34.3,"fiber_g":null,"sugar_g":null,"calories":451,"protein_g":27.1,"serving_size":"1 serving (186 g)"}]},
  {"id":"cmlavzejm04ruvpxcyu1z8ozu","key":"kfc 6 nuggets uber eats|FAST_FOOD|au","name":"6 Nuggets (Uber Eats)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["6 Nuggets (Uber Eats) (KFC)","KFC 6 Nuggets (Uber Eats)"],"servingOptions":[{"id":"serving-kfc 6 nuggets uber eats 1 serving","ml":null,"fat_g":15.8,"grams":127,"label":"1 serving (127 g)","carbs_g":27.1,"fiber_g":null,"sugar_g":null,"calories":316,"protein_g":16.2,"serving_size":"1 serving (127 g)"}]},
  {"id":"cmlavzzxc05gsvpxc8mqc7gkz","key":"hungry jack s nugget 3 pack|FAST_FOOD|au","name":"Nugget 3 Pack","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Nugget 3 Pack (Hungry Jack's)","Hungry Jack's Nugget 3 Pack","Nugget 3 Pack (Hungry Jack s)","Hungry Jack s Nugget 3 Pack","Nugget 3 Pack (HungryJacks)","HungryJacks Nugget 3 Pack"],"servingOptions":[{"id":"serving-hungry jack s nugget 3 pack 1 serving","ml":null,"fat_g":6.4,"grams":51,"label":"1 serving (51 g)","carbs_g":10.7,"fiber_g":null,"sugar_g":0.6,"calories":130,"protein_g":7.4,"serving_size":"1 serving (51 g)"}]},
  {"id":"cmlavzzxx05gtvpxc0svln15q","key":"hungry jack s nugget 6 pack|FAST_FOOD|au","name":"Nugget 6 Pack","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Nugget 6 Pack (Hungry Jack's)","Hungry Jack's Nugget 6 Pack","Nugget 6 Pack (Hungry Jack s)","Hungry Jack s Nugget 6 Pack","Nugget 6 Pack (HungryJacks)","HungryJacks Nugget 6 Pack"],"servingOptions":[{"id":"serving-hungry jack s nugget 6 pack 1 serving","ml":null,"fat_g":12.7,"grams":102,"label":"1 serving (102 g)","carbs_g":21.3,"fiber_g":null,"sugar_g":1.1,"calories":261,"protein_g":14.8,"serving_size":"1 serving (102 g)"}]},
  {"id":"cmlavzzyh05guvpxc80e3d45p","key":"hungry jack s nugget 12 pack|FAST_FOOD|au","name":"Nugget 12 Pack","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Nugget 12 Pack (Hungry Jack's)","Hungry Jack's Nugget 12 Pack","Nugget 12 Pack (Hungry Jack s)","Hungry Jack s Nugget 12 Pack","Nugget 12 Pack (HungryJacks)","HungryJacks Nugget 12 Pack"],"servingOptions":[{"id":"serving-hungry jack s nugget 12 pack 1 serving","ml":null,"fat_g":25.3,"grams":204,"label":"1 serving (204 g)","carbs_g":42.5,"fiber_g":null,"sugar_g":2.1,"calories":522,"protein_g":29.6,"serving_size":"1 serving (204 g)"}]},
  {"id":"cmlaw00lb05hpvpxcnold4v6n","key":"hungry jack s outback whopper|FAST_FOOD|au","name":"Outback Whopper","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Outback Whopper (Hungry Jack's)","Hungry Jack's Outback Whopper","Outback Whopper (Hungry Jack s)","Hungry Jack s Outback Whopper","Outback Whopper (HungryJacks)","HungryJacks Outback Whopper"],"servingOptions":[{"id":"serving-hungry jack s outback whopper 1 serving","ml":null,"fat_g":54.4,"grams":322,"label":"1 serving (322 g)","carbs_g":47.7,"fiber_g":null,"sugar_g":11.4,"calories":811,"protein_g":32.8,"serving_size":"1 serving (322 g)"}]},
  {"id":"cmlaw00lv05hqvpxcmx6y6znu","key":"hungry jack s outback whopper double|FAST_FOOD|au","name":"Outback Whopper Double","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Outback Whopper Double (Hungry Jack's)","Hungry Jack's Outback Whopper Double","Outback Whopper Double (Hungry Jack s)","Hungry Jack s Outback Whopper Double","Outback Whopper Double (HungryJacks)","HungryJacks Outback Whopper Double"],"servingOptions":[{"id":"serving-hungry jack s outback whopper double 1 serving","ml":null,"fat_g":81.4,"grams":424,"label":"1 serving (424 g)","carbs_g":48.5,"fiber_g":null,"sugar_g":12.1,"calories":1150,"protein_g":56.7,"serving_size":"1 serving (424 g)"}]},
  {"id":"cmlaw00nk05htvpxcrs13gywp","key":"hungry jack s whopper cheese|FAST_FOOD|au","name":"Whopper Cheese","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Whopper Cheese (Hungry Jack's)","Hungry Jack's Whopper Cheese","Whopper Cheese (Hungry Jack s)","Hungry Jack s Whopper Cheese","Whopper Cheese (HungryJacks)","HungryJacks Whopper Cheese"],"servingOptions":[{"id":"serving-hungry jack s whopper cheese 1 serving","ml":null,"fat_g":51,"grams":302,"label":"1 serving (302 g)","carbs_g":47.5,"fiber_g":null,"sugar_g":12.2,"calories":657,"protein_g":32.7,"serving_size":"1 serving (302 g)"}]},
  {"id":"cmlaw00o605huvpxcvxmvp1fv","key":"hungry jack s whopper|FAST_FOOD|au","name":"Whopper","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Whopper (Hungry Jack's)","Hungry Jack's Whopper","Whopper (Hungry Jack s)","Hungry Jack s Whopper","Whopper (HungryJacks)","HungryJacks Whopper"],"servingOptions":[{"id":"serving-hungry jack s whopper 1 serving","ml":null,"fat_g":45.2,"grams":280,"label":"1 serving (280 g)","carbs_g":46.6,"fiber_g":null,"sugar_g":11.6,"calories":582,"protein_g":28.1,"serving_size":"1 serving (280 g)"}]}
]}
// Public AU size options include McDonalds actual size-only portion labels.
function capturedSizeMenuRows(){return [
  {"id":"cmlc49viq000m12sxanfcd3qc","key":"mcdonald s fries|FAST_FOOD|au","name":"Fries","brand":"McDonald's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Fries (McDonald's)","McDonald's Fries","Fries (McDonald s)","McDonald s Fries","Fries (McDonalds)","McDonalds Fries"],"servingOptions":[{"id":"serving-mcdonald s fries small","ml":null,"fat_g":11.5,"grams":null,"label":"Small","carbs_g":24.3,"fiber_g":null,"sugar_g":0,"calories":219,"protein_g":3.5,"serving_size":"Small"},{"id":"serving-mcdonald s fries medium","ml":null,"fat_g":16.6,"grams":null,"label":"Medium","carbs_g":35.2,"fiber_g":null,"sugar_g":0,"calories":316,"protein_g":5,"serving_size":"Medium"},{"id":"serving-mcdonald s fries large","ml":null,"fat_g":20.5,"grams":null,"label":"Large","carbs_g":43.3,"fiber_g":null,"sugar_g":0,"calories":389,"protein_g":6.1,"serving_size":"Large"}]},
  {"id":"cmlavz8wr04klvpxcez6cfn0v","key":"kfc regular chips uber eats|FAST_FOOD|au","name":"Regular Chips (Uber Eats)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Regular Chips (Uber Eats) (KFC)","KFC Regular Chips (Uber Eats)"],"servingOptions":[{"id":"serving-kfc regular chips uber eats 1 serving","ml":null,"fat_g":11.5,"grams":120,"label":"1 serving (120 g)","carbs_g":40.6,"fiber_g":null,"sugar_g":null,"calories":283,"protein_g":4.4,"serving_size":"1 serving (120 g)"}]},
  {"id":"cmlavz8sr04kevpxcyinko3la","key":"kfc large chips add on|FAST_FOOD|au","name":"Large Chips ADD ON","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Large Chips ADD ON (KFC)","KFC Large Chips ADD ON"],"servingOptions":[{"id":"serving-kfc large chips add on 1 serving","ml":null,"fat_g":23,"grams":240,"label":"1 serving (240 g)","carbs_g":81.1,"fiber_g":null,"sugar_g":null,"calories":567,"protein_g":8.9,"serving_size":"1 serving (240 g)"}]},
  {"id":"cmlavz9al04l5vpxcrj9db6e5","key":"kfc large chips|FAST_FOOD|au","name":"Large Chips","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Large Chips (KFC)","KFC Large Chips"],"servingOptions":[{"id":"serving-kfc large chips 1 serving","ml":null,"fat_g":23,"grams":240,"label":"1 serving (240 g)","carbs_g":81.1,"fiber_g":null,"sugar_g":null,"calories":567,"protein_g":8.9,"serving_size":"1 serving (240 g)"}]},
  {"id":"cmlavz9cy04l9vpxcqba08lzm","key":"kfc regular chips|FAST_FOOD|au","name":"Regular Chips","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Regular Chips (KFC)","KFC Regular Chips"],"servingOptions":[{"id":"serving-kfc regular chips 1 serving","ml":null,"fat_g":11.5,"grams":120,"label":"1 serving (120 g)","carbs_g":40.6,"fiber_g":null,"sugar_g":null,"calories":283,"protein_g":4.4,"serving_size":"1 serving (120 g)"}]},
  {"id":"cmlavz9sa04lvvpxc6b416zju","key":"kfc large chips uber eats|FAST_FOOD|au","name":"Large Chips (Uber Eats)","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Large Chips (Uber Eats) (KFC)","KFC Large Chips (Uber Eats)"],"servingOptions":[{"id":"serving-kfc large chips uber eats 1 serving","ml":null,"fat_g":23,"grams":240,"label":"1 serving (240 g)","carbs_g":81.1,"fiber_g":null,"sugar_g":null,"calories":567,"protein_g":8.9,"serving_size":"1 serving (240 g)"}]},
  {"id":"cmlavzfc704t0vpxcxq9wovxy","key":"kfc regular chips cheesy loaded bowl|FAST_FOOD|au","name":"Regular Chips - Cheesy Loaded Bowl","brand":"KFC","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Regular Chips - Cheesy Loaded Bowl (KFC)","KFC Regular Chips - Cheesy Loaded Bowl"],"servingOptions":[{"id":"serving-kfc regular chips cheesy loaded bowl 1 serving","ml":null,"fat_g":11.8,"grams":120,"label":"1 serving (120 g)","carbs_g":41.6,"fiber_g":null,"sugar_g":null,"calories":291,"protein_g":4.6,"serving_size":"1 serving (120 g)"}]},
  {"id":"cmlavzzv005govpxc1qivx19b","key":"hungry jack s chips medium|FAST_FOOD|au","name":"Chips Medium","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Chips Medium (Hungry Jack's)","Hungry Jack's Chips Medium","Chips Medium (Hungry Jack s)","Hungry Jack s Chips Medium","Chips Medium (HungryJacks)","HungryJacks Chips Medium"],"servingOptions":[{"id":"serving-hungry jack s chips medium 1 serving","ml":null,"fat_g":14.3,"grams":108,"label":"1 serving (108 g)","carbs_g":41.1,"fiber_g":null,"sugar_g":0.3,"calories":308,"protein_g":3.8,"serving_size":"1 serving (108 g)"}]},
  {"id":"cmlavzzw705gqvpxcibn0cc6s","key":"hungry jack s chips small|FAST_FOOD|au","name":"Chips Small","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Chips Small (Hungry Jack's)","Hungry Jack's Chips Small","Chips Small (Hungry Jack s)","Hungry Jack s Chips Small","Chips Small (HungryJacks)","HungryJacks Chips Small"],"servingOptions":[{"id":"serving-hungry jack s chips small 1 serving","ml":null,"fat_g":11.8,"grams":89,"label":"1 serving (89 g)","carbs_g":33.9,"fiber_g":null,"sugar_g":0.2,"calories":254,"protein_g":3.1,"serving_size":"1 serving (89 g)"}]},
  {"id":"cmlavzzwt05grvpxc40dcwlwd","key":"hungry jack s chips large|FAST_FOOD|au","name":"Chips Large","brand":"Hungry Jack's","country":"AU","kind":"FAST_FOOD","caloriesPer100g":null,"proteinPer100g":null,"carbsPer100g":null,"fatPer100g":null,"fiberPer100g":null,"sugarPer100g":null,"aliases":["Chips Large (Hungry Jack's)","Hungry Jack's Chips Large","Chips Large (Hungry Jack s)","Hungry Jack s Chips Large","Chips Large (HungryJacks)","HungryJacks Chips Large"],"servingOptions":[{"id":"serving-hungry jack s chips large 1 serving","ml":null,"fat_g":20.4,"grams":155,"label":"1 serving (155 g)","carbs_g":58.8,"fiber_g":null,"sugar_g":0.4,"calories":440,"protein_g":5.4,"serving_size":"1 serving (155 g)"}]}
]}
async function run(){
  await check('actual AU named sizes and regional fries/chips wording use exact portions; missing sizes never default',async()=>{
    const matrix=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const at=matrix.indexOf('async function run() {');assert(at>0)
    const real=new Function('require','__dirname',matrix.slice(0,at)+'\nreturn {ctx,send}')(require,__dirname)
    real.ctx.getCustomPackagedItems=mappedStoredCatalog(capturedSizeMenuRows())
    real.ctx.verifiedVoiceMenuAliases=JSON.parse(fs.readFileSync(path.join(root,'data/food-overrides/voice-menu-aliases.json'),'utf8'))
    real.ctx.prisma.user.findUnique=async()=>({id:'synthetic-user',country:'AU'});real.ctx.getOpenAIClient=()=>null
    let fallbackReads=0,writes=0
    real.ctx.searchDiaryFoods=async()=>{fallbackReads++;return{json:async()=>({items:[]})}}
    real.ctx.searchLocalFoods=async()=>[]
    real.ctx.prisma.foodLog.create=async()=>{writes++;throw Error('No write permitted')}
    const cases=[['Log McDonald’s small fries',219,'Fries'],['Log McDonald’s medium fries',316,'Fries'],['Log McDonald’s large fries',389,'Fries'],['Log McDonald’s fries',null,null],['Log one Hungry Jack’s small chips',254,'Chips Small'],['Log one Hungry Jack’s medium chips',308,'Chips Medium'],['Log one Hungry Jack’s large chips',440,'Chips Large'],['Log Hungry Jack’s chips',null,null],['Log Hungry Jack’s large fries',440,'Chips Large'],['Log KFC regular chips',283,'Regular Chips'],['Log KFC large chips',567,'Large Chips'],['Log KFC small chips',null,null],['Log KFC chips',null,null],['Log KFC large fries',567,'Large Chips']]
    for(const[text,calories,name]of cases){fallbackReads=0;const r=await real.send(text),d=r.body?.draft;assert.equal(r.status,200,JSON.stringify(r));assert.equal(d.autoSave,false)
      if(calories===null){assert.equal(d.canConfirm,false,text);assert.equal(d.food.items.length,0);if(!text.includes('KFC small'))assert.equal(fallbackReads,0,text)}
      else{assert.equal(d.canConfirm,true,d.confirmationMessage);assert.equal(d.food.nutrition.calories,calories,text);assert.equal(d.food.items[0].name,name);assert.equal(d.food.items[0].country,'AU');assert.equal(d.food.items[0].fiber_g,null);assert.equal(fallbackReads,0,text)}
    }
    const two=(await real.send('Log two large McDonald’s fries')).body.draft
    assert.equal(two.canConfirm,true);assert.equal(two.food.nutrition.calories,778);assert.equal(two.food.items[0].selectedServingId,'serving-mcdonald s fries large');assert.equal(two.food.items[0].estimatedPortion,false)
    for(const text of ['Log five pieces of McDonald’s large fries','Log five pieces of Hungry Jack’s large chips','Log five pieces of KFC large chips'])assert.equal((await real.send(text)).body.draft.canConfirm,false,text)
    const grams=(await real.send('Log 100 g KFC large chips')).body.draft
    assert.equal(grams.canConfirm,true);assert.equal(grams.food.items[0].name,'Large Chips');assert.equal(grams.food.items[0].calories,236.25);assert.equal(grams.food.items[0].serving_size,'100 g');assert.equal(grams.food.items[0].estimatedPortion,false);assert.equal(writes,0)
  })
  await check('size-only portions require explicit packet-size intent and stored source options; chips synonym is AUfastfood only',()=>{
    const ingredient={name:"McDonald's large fries",brand:"McDonald's",size:'large',quantity:1,unit:'each',requiresSourceServing:true}
    const row={...item('fries','Fries',"McDonald's",[option('large','Large',389)]),country:'AU',kind:'FAST_FOOD'}
    assert.equal(ctx.sourceCountedVoiceServing(ingredient,row).ratio,1)
    assert.equal(ctx.sourceCountedVoiceServing({...ingredient,unit:'piece'},row),null)
    assert.equal(ctx.sourceCountedVoiceServing({...ingredient,size:undefined,name:"McDonald's fries"},row),null)
    assert.equal(ctx.sourceCountedVoiceServing(ingredient,{...row,servingOptions:[],serving_size:'Large'}),null)
    const chips={...row,name:'Chips'}
    assert.equal(ctx.voicePreparedIdentityMatches(ingredient,chips),true)
    assert.equal(ctx.voicePreparedIdentityMatches(ingredient,{...chips,kind:'PACKAGED'}),false)
    assert.equal(ctx.voicePreparedIdentityMatches(ingredient,{...chips,country:'US'}),false)
    assert.equal(ctx.voicePreparedIdentityMatches(ingredient,{...chips,name:'Potato Chips'}),false)
  })
  await check('actual AU catalog competitors resolve13 common HJ/KFC POST requests to exact products without providers or writes',async()=>{
    const matrix=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const at=matrix.indexOf('async function run() {');assert(at>0)
    const real=new Function('require','__dirname',matrix.slice(0,at)+'\nreturn {ctx,send}')(require,__dirname)
    real.ctx.getCustomPackagedItems=mappedStoredCatalog([...capturedOtherRestaurantRows(),...capturedStoredMenuRows()])
    real.ctx.verifiedVoiceMenuAliases=JSON.parse(fs.readFileSync(path.join(root,'data/food-overrides/voice-menu-aliases.json'),'utf8'))
    real.ctx.prisma.user.findUnique=async()=>({id:'synthetic-user',country:'AU'});real.ctx.getOpenAIClient=()=>null
    let fallbacks=0,writes=0
    real.ctx.searchDiaryFoods=real.ctx.searchDiaryFoodServings=real.ctx.searchLocalFoods=async()=>{fallbacks++;throw Error('Provider/USDA fallback forbidden for exact local menu')}
    for(const method of ['create','createMany','update','delete'])real.ctx.prisma.foodLog[method]=async()=>{writes++;throw Error('Preparation cannot save')}
    const cases=[
      ['Log one Hungry Jack’s Whopper for lunch',582,['Whopper']],
      ['Prepare a meal for today: one Hungry Jack’s Whopper. Don’t save it yet.',582,['Whopper']],
      ["Log two Hungry Jack's Whoppers for dinner",1164,['Whopper']],
      ['Log one Hungry Jack’s Whopper with Cheese',657,['Whopper Cheese']],
      ['Log one Hungry Jack’s Whopper Cheese',657,['Whopper Cheese']],
      ['Log a pack of six Hungry Jack’s nuggets',261,['Nugget 6 Pack']],
      ['Log one KFC Zinger Burger for lunch',451,['Zinger Burger']],
      ['Log two KFC Zinger Burgers for dinner',902,['Zinger Burger']],
      ['Prepare a meal for today: one KFC Zinger Burger and a pack of six nuggets. Don’t save it yet.',767,['Zinger Burger','6 Nuggets']],
      ['Log one piece of KFC Original Recipe chicken',246,['Catering - Original Recipe Chicken (1PC)']],
      ['Log two pieces of KFC Original Recipe chicken',492,['Catering - Original Recipe Chicken (1PC)']],
      ['Log six KFC nuggets',316,['6 Nuggets']],
      ['Log a pack of six KFC nuggets',316,['6 Nuggets']],
    ]
    for(const[text,calories,names]of cases){const r=await real.send(text,{launchContext:{section:'food',title:'Food Diary',meal:'lunch',date:'2026-10-17'}}),d=r.body?.draft
      assert.equal(r.status,200,JSON.stringify(r));assert.equal(d.canConfirm,true,d.confirmationMessage);assert.equal(d.food.nutrition.calories,calories,text);assert.deepEqual(Array.from(d.food.items.map(item=>item.name)),names,text);assert(d.food.items.every(item=>item.country==='AU'&&item.fiber_g===null));assert.equal(d.autoSave,false)
    }
    for(const[first,change,calories,name]of [
      ['Log one Hungry Jack’s Whopper for lunch','Change the Whopper to two',1164,'Whopper'],
      ['Log one KFC Zinger Burger for lunch','Change the burger to two',902,'Zinger Burger'],
      ['Log six KFC nuggets','Change the nuggets to three',158,'6 Nuggets'],
      ['Log a pack of six Hungry Jack’s nuggets','Change the nuggets to three',131,'Nugget 6 Pack'],
    ]){const original=(await real.send(first)).body.draft,r=await real.send(change,{confirmationDraft:original}),d=r.body?.draft
      assert.equal(r.status,200,JSON.stringify(r));assert.equal(d.canConfirm,true,d.confirmationMessage);assert.equal(d.food.nutrition.calories,calories);assert.equal(d.food.items[0].name,name);assert.equal(d.food.items[0].id,original.food.items[0].id)
      assert.deepEqual(JSON.parse(JSON.stringify(d.food.items[0].__voiceSourceFood)),JSON.parse(JSON.stringify(original.food.items[0].__voiceSourceFood)))
      const ratio=/three/.test(change)?0.5:2
      for(const nutrient of ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g'])assert.equal(d.food.items[0][nutrient],original.food.items[0][nutrient]===null?null:original.food.items[0][nutrient]*ratio,nutrient)
    }
    const mc=(await real.send('Prepare a meal for today: one McDonald’s Double Quarter Pounder with Cheese and a pack of six McNuggets. Don’t save it yet.')).body.draft
    const half=(await real.send('Change the nuggets to three',{confirmationDraft:mc})).body.draft,back=(await real.send('Change the nuggets to six',{confirmationDraft:half})).body.draft
    assert.equal(mc.food.nutrition.calories,1020);assert.equal(half.food.nutrition.calories,912);assert.equal(back.food.nutrition.calories,1020)
    assert.deepEqual(Array.from(back.food.items.map(item=>item.id)),Array.from(mc.food.items.map(item=>item.id)));assert.equal(fallbacks,0);assert.equal(writes,0)
  })
  await check('piece counts require unambiguous source units and never digits from prices or decimal suffixes',()=>{
    for(const label of ['$10.95 Nuggets','10.95 Nuggets','10,95 Nuggets','P2 2026 - 24 for $10.95 Nuggets ( Promo )','$95 nuggets','6 pieces (12 pc)'])assert.equal(ctx.voiceRecordedPieceCount(label),null,label)
    for(const[label,count]of [['6 Nuggets',6],['Nugget 6 Pack',6],['Chicken Tender Strips 3 x pack',3],['1PC',1],['6 pieces (127 g)',6]])assert.equal(ctx.voiceRecordedPieceCount(label),count,label)
    const source=item('pack','Nugget 6 Pack',"Hungry Jack's",[option('pack','1 pack',261)])
    assert.equal(ctx.sourceCountedVoiceServing({name:"Hungry Jack's nuggets",quantity:6,unit:'each'},source).ratio,1)
    assert.equal(ctx.sourceCountedVoiceServing({name:'KFC Original Recipe chicken',quantity:1,unit:'each'},item('chicken','Original Recipe Chicken (2PC)','KFC',[option('two','1 serving',492)])).ratio,0.5)
    assert.equal(ctx.sourceCountedVoiceServing({name:'KFC nuggets',quantity:6,unit:'each'},item('price','P2 2026 - 24 for $10.95 Nuggets ( Promo )','KFC',[option('one','1 serving',1360)])),null)
  })
  await check('extra product variants and equal-ranked conflicting nutrition cannot silently become the plain requested food',async()=>{
    for(const[request,name,brand]of [['Log one Hungry Jack’s Whopper','Outback Whopper',"Hungry Jack's"],['Log one KFC Zinger Burger','Zinger Crunch Stacker Burger','KFC'],['Log six KFC nuggets','Nuggets Box','KFC']]){
      candidates=[item('wrong',name,brand,[option('one','1 serving',800)])];assert.equal((await build(request)).canConfirm,false)
    }
    const ingredient={name:'KFC Zinger Burger',brand:'KFC',quantity:1,unit:'each',requiresSourceServing:true}
    const a={...item('a','Zinger Burger','KFC',[option('one','1 serving',451)]),country:'AU'},b={...item('b','Zinger Burger','KFC',[option('one','1 serving',500)]),country:'AU'}
    assert.equal(ctx.selectPreparedVoiceFood(ingredient,[a,b],'AU').ambiguous,true)
    b.servingOptions=a.servingOptions;b.calories=a.calories
    assert.equal(ctx.selectPreparedVoiceFood(ingredient,[a,b],'AU').ambiguous,false)
    b.servingOptions=[{...a.servingOptions[0],fiber_g:0}]
    assert.equal(ctx.selectPreparedVoiceFood(ingredient,[a,b],'AU').ambiguous,true)
  })
  await check('exact physical53 meal/date/colon preamble cannot become part of a restaurant product',async()=>{
    menuRows=actualMenuRows()
    const products="one McDonald's Double Quarter Pounder with Cheese and a pack of six McNuggets"
    const exact=`Prepare a meal for today: ${products}. Don't save it yet.`
    const requests=[exact,...['Prepare a meal for today','Prepare a meal today','Prepare a meal for lunch today','Prepare lunch for today','Prepare a meal for yesterday','Prepare a meal for tomorrow','Prepare a meal on 2026-10-18','Prepare a meal for 18 October','Prepare a meal for October 18, 2026','Prepare a meal for two days ago'].flatMap(prefix=>[`${prefix}: ${products}. Don't save it yet.`,`${prefix} ${products}. Don’t save it yet.`])]
    for(const text of requests){
      const p=parse(text);assert.equal(p.ingredients.length,2,text)
      assert.match(p.ingredients[0].name,/^(?:McDonald's )?Double Quarter Pounder with Cheese$/i,text)
      assert.equal(ctx.numberFromWords(p.ingredients[0].quantity),1,text);assert.equal(ctx.numberFromWords(p.ingredients[1].quantity),6,text)
      const d=await build(text);assert.equal(d.canConfirm,true,`${text}: ${d.confirmationMessage}`);assert.equal(d.food.nutrition.calories,1020);assert.equal(d.autoSave,false)
    }
  })
  await check('actual POST composes timing, no-save control, parser and AU source resolution for physical53 sentence',async()=>{
    const matrix=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const at=matrix.indexOf('async function run() {');assert(at>0)
    const real=new Function('require','__dirname',matrix.slice(0,at)+'\nreturn {ctx,send}')(require,__dirname)
    const rows=actualMenuRows();real.ctx.getCustomPackagedItems=async()=>rows
    real.ctx.verifiedVoiceMenuAliases=JSON.parse(fs.readFileSync(path.join(root,'data/food-overrides/voice-menu-aliases.json'),'utf8'))
    real.ctx.prisma.user.findUnique=async()=>({id:'synthetic-user',country:'AU'})
    let writes=0;real.ctx.prisma.foodLog.create=async()=>{writes++;throw Error('No save allowed during preparation')}
    real.ctx.getOpenAIClient=()=>null // no provider is configured in this actual-route fixture
    const products="one McDonald's Double Quarter Pounder with Cheese and a pack of six McNuggets"
    for(const[command,date]of [[`Prepare a meal for today: ${products}. Don't save it yet.`,'2026-10-17'],[`Prepare lunch for yesterday ${products}. Don’t save it yet.`,'2026-10-16'],[`Prepare a meal for 2026-10-18: ${products}. Don't save it yet.`,'2026-10-18'],[`Prepare a meal for October 18, 2026: ${products}. Don't save it yet.`,'2026-10-18']]){
      const response=await real.send(command)
      assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.success,true)
      const d=response.body.draft;assert.equal(d.canConfirm,true,d.confirmationMessage);assert.equal(d.action,'food_build_meal');assert.equal(d.autoSave,false);assert.equal(d.localDate,date)
      assert.equal(d.food.items.length,2);assert.equal(d.food.nutrition.calories,1020);assert(d.food.items.every(item=>item.country==='AU'));assert.equal(writes,0)
    }
    for(const localized of ['Додај една банана за ручек денес','Agrega una banana para almuerzo hoy']){
      const p=real.ctx.tryParseIngredientMealRequest(localized)||real.ctx.tryParseDirectFoodRequest(localized,{section:'food',title:'Food Diary'})
      assert(p);assert.equal(p.meal,'lunch');assert.match(p.ingredients[0].name,/banana/);assert.equal(real.ctx.resolveRequestedActionDate(localized,'2026-10-17'),'2026-10-17')
    }
  })
  await check('retained failed review cannot turn a complete all-curly new meal into a with-cheese addition or provider fallback',async()=>{
    const matrix=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const at=matrix.indexOf('async function run() {');assert(at>0)
    const real=new Function('require','__dirname',matrix.slice(0,at)+'\nreturn {ctx,send}')(require,__dirname)
    real.ctx.getCustomPackagedItems=mappedStoredCatalog(capturedStoredMenuRows())
    real.ctx.verifiedVoiceMenuAliases=JSON.parse(fs.readFileSync(path.join(root,'data/food-overrides/voice-menu-aliases.json'),'utf8'))
    real.ctx.prisma.user.findUnique=async()=>({id:'synthetic-user',country:'AU'})
    real.ctx.getOpenAIClient=()=>null
    let fallbacks=0,writes=0
    real.ctx.searchDiaryFoods=async()=>{fallbacks++;throw Error('Unexpected provider/diary fallback')}
    real.ctx.searchLocalFoods=async()=>{fallbacks++;throw Error('Unexpected fallback')}
    real.ctx.prisma.foodLog.create=async()=>{writes++;throw Error('Unexpected save')}
    const products='one McDonald’s Double Quarter Pounder with Cheese and a pack of six McNuggets'
    const exact=`Prepare a meal for today: ${products}. Don’t save it yet.`
    const fresh=await real.send(exact);assert.equal(fresh.status,200);assert.equal(fresh.body.draft.food.nutrition.calories,1020)
    const prior={...fresh.body.draft,action:'food_draft',canConfirm:false,confirmationMessage:'I cannot finish this meal yet. Please clarify for : one McDonald’s Double Quarter Pounder with Cheese with a supported amount or choose a matching food. Nothing has been saved.',food:{...fresh.body.draft.food,draftText:'1 for : one McDonald’s Double Quarter Pounder with Cheese, 6 McNuggets',items:fresh.body.draft.food.items.filter(item=>item.name==='Chicken McNuggets')}}
    for(const text of [exact,`Prepare a meal for today: ${products}.`,`Please prepare a meal for today: ${products}. Don’t save it yet.`,`Log a meal for today: ${products}. Don’t save it yet.`,...['include','add'].map(verb=>`Prepare a new meal with one McDonald’s Double Quarter Pounder with Cheese and ${verb} a pack of six McNuggets. Don’t save it yet.`)]){
      assert.equal(real.ctx.extractReviewedFoodAddition(prior,text),null,text)
      const response=await real.send(text,{followUpDraft:prior,launchContext:{section:'food',title:'Food Diary',meal:'breakfast',date:'2026-10-17'},conversationHistory:[{role:'user',text:exact},{role:'assistant',text:prior.confirmationMessage}]})
      assert.equal(response.status,200,JSON.stringify(response));const d=response.body.draft
      assert.equal(d.canConfirm,true,d.confirmationMessage);assert.equal(d.food.items.length,2);assert.equal(d.food.nutrition.calories,1020);assert.equal(d.localDate,'2026-10-17');assert.equal(d.autoSave,false)
      assert.deepEqual(Array.from(d.food.items.map(item=>item.id)),['custom:cmlc49uxq000a12sxppmnueee','custom:cmvb631vg000bs76950mpd6g9'])
    }
    for(const correction of ['Add three McDonald’s nuggets','Include three McDonald’s nuggets','with three McDonald’s nuggets','Add three McDonald’s nuggets to this meal']){
      const added=real.ctx.extractReviewedFoodAddition(fresh.body.draft,correction);assert(added,correction);assert.equal(added.correctedParts.length,3)
    }
    assert(real.ctx.extractReviewedFoodCountCorrection(fresh.body.draft,'Change the nuggets to three'))
    assert.equal(fallbacks,0);assert.equal(writes,0)
  })
  await check('trailing no-save sentence does not become nugget product punctuation',async()=>{
    const parsed=parse("Prepare a double quarter pounder with cheese and a pack of six nuggets from McDonald's for lunch. Don't save it yet.")
    assert.equal(parsed.ingredients.length,2)
    assert(!/[.!?]/.test(parsed.ingredients[1].display))
    assert(!/save|yet/i.test(parsed.ingredients[1].name))
    assert.equal(parsed.ingredients[1].quantity,6)
  })
  await check('official AU source data and cheese alias resolve locally to 1020kcal with no provider lookup',async()=>{
    menuRows=actualMenuRows()
    const d=await build("Log a double quarter pounder with cheese and a pack of six nuggets from McDonald's for lunch")
    assert.equal(d.canConfirm,true);assert.equal(d.food.items.length,2);assert.equal(d.food.nutrition.calories,1020)
    assert.equal(d.food.items[0].name,'Double Quarter Pounder');assert.equal(d.food.items[0].calories,804)
    assert.equal(d.food.items[1].name,'Chicken McNuggets');assert.equal(d.food.items[1].calories,216)
    assert.equal(d.food.items[1].protein_g,12.1);assert.equal(d.food.items[1].fiber_g,null)
    assert(d.food.items.every(item=>item.country==='AU'&&!item.estimatedPortion));assert.equal(requests.length,0)
    const counts=menuRows.find(row=>row.name==='Chicken McNuggets').servingOptions
    assert.equal(counts.length,5);assert.deepEqual(Array.from(counts.map(s=>s.calories)),[108,216,360,721,1440])
    assert(counts.every(s=>s.grams===null&&s.fiber_g===null))
  })
  await check('official cheese alias cannot hide extra cheese or missing-bun modifications',async()=>{
    menuRows=actualMenuRows()
    for(const change of ['with extra cheese','with cheese without bun'])assert.equal((await build(`Log a McDonald's double quarter pounder ${change}`)).canConfirm,false)
  })
  await check('trusted original source survives country/count correction and scales original nutrition once',async()=>{
    candidates=[{...nuggets(),id:'original-canadian',country:'CA'}]
    const original=await build("Log six McDonald's nuggets for lunch")
    assert.equal(original.food.items[0].calories,300)
    menuRows=actualMenuRows();candidates=[{...nuggets(),id:'replacement-uk',country:'UK'}]
    const parsed=parse("Log three McDonald's nuggets for lunch")
    const corrected=await ctx.buildVoiceMealDraft(parsed,'Correct the count','2026-10-17','AU',original.food.items)
    assert.equal(corrected.canConfirm,true);assert.equal(corrected.food.items[0].id,'original-canadian');assert.equal(corrected.food.items[0].country,'CA');assert.equal(corrected.food.items[0].calories,150)
    const repeated=await ctx.buildVoiceMealDraft(parse("Log six McDonald's nuggets"),'Correct again','2026-10-17','AU',corrected.food.items)
    assert.equal(repeated.food.items[0].id,'original-canadian');assert.equal(repeated.food.items[0].calories,300)
  })
  await check('restaurant list keeps with cheese, two foods and shared brand',()=>{
    for(const suffix of ['', ' for lunch']){
      const p=parse("Log a double quarter pounder with cheese and a pack of six nuggets from McDonald's"+suffix)
      assert.equal(p.ingredients.length,2);assert.match(p.ingredients[0].name,/double quarter pounder with cheese/i)
      assert.equal(Number(p.ingredients[1].quantity)||ctx.numberFromWords(p.ingredients[1].quantity),6)
      assert(p.ingredients.every(i=>i.brand==="McDonald's"));assert(!p.ingredients.some(i=>/for lunch/.test(i.name)))
    }
  })
  await check('six-piece, six pack and simple counts agree',()=>{
    for(const wording of ['a pack of six nuggets','six-piece nuggets','6 piece nuggets','six nuggets','6 pack nuggets']){
      const p=parse(`Log ${wording} from McDonald's for lunch`)
      assert.equal(ctx.numberFromWords(p.ingredients[0].quantity),6,wording);assert.equal(p.ingredients[0].unit,'each')
    }
    assert.equal(parse("Log two packs of six nuggets from McDonald's").ingredients[0].quantity,12)
  })
  await check('McDonalds whole source burger and six-piece source saveable without extra cheese',async()=>{
    candidates=[burger(),nuggets()]
    const d=await build("Log a double quarter pounder with cheese and a pack of six nuggets from McDonald's for lunch")
    assert.equal(d.canConfirm,true);assert.equal(d.food.items.length,2);assert.equal(d.food.nutrition.calories,1100)
    assert.equal(d.food.items[1].selectedServingId,'six-nuggets');assert.equal(d.food.items[1].estimatedPortion,false)
    assert.equal(d.food.nutrition.fiber_g,null);assert.equal(d.food.nutrition.sugar_g,0)
    assert(requests.filter(r=>r.kind==='search').every(r=>r.country==='AU'&&r.localOnly==='1'))
  })
  await check('three/six/twelve nuggets scale recorded six-piece source once',async()=>{
    candidates=[nuggets()]
    for(const count of [3,6,12]){
      const d=await build(`Log ${count} McDonald's nuggets for lunch`)
      assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,count*50)
      assert.equal(d.food.items[0].nutritionCoversServing,true)
    }
  })
  await check('count in recorded menu name applies to complete one-item nutrition',async()=>{
    candidates=[item('ten','10 Chicken McNuggets',"McDonald's",[option('ten','1 item',510)]),item('six','6 Piece Chicken McNuggets',"McDonald's",[option('six','1 item',300)])]
    const d=await build("Log a pack of six nuggets from McDonald's for lunch")
    assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,300);assert.equal(d.food.items[0].id,'six')
  })
  await check('current-country menu precedes alternatives and cross-country fallback is disclosed',async()=>{
    candidates=[{...nuggets(),id:'CA',country:'CA'},{...nuggets(),id:'AU',country:'AU'}]
    const home=await build("Log six McDonald's nuggets");assert.equal(home.food.items[0].id,'AU')
    candidates=candidates.filter(item=>item.country==='CA')
    const away=await build("Log six McDonald's nuggets");assert.match(away.confirmationMessage,/Canadian menu data/)
  })
  await check('external fallback reuses diary only after local options fail',async()=>{
    diaryReply=url=>url.searchParams.get('localOnly')==='1'?[]:[nuggets()]
    const d=await build("Log six McDonald's nuggets");assert.equal(d.canConfirm,true)
    const searches=requests.filter(r=>r.kind==='search')
    assert(searches.some(r=>r.localOnly==='1'));assert(searches.some(r=>r.localOnly===null))
    assert(searches.some(r=>/McNuggets/.test(r.q)))
    assert.equal(searches.at(-1).localOnly,null)
  })
  await check('food name count never converts a 100g nutrient basis to a full pack',async()=>{
    candidates=[{...item('six','6 Piece Chicken McNuggets',"McDonald's",[]),serving_size:'100 g'}]
    assert.equal((await build("Log six McDonald's nuggets")).canConfirm,false)
  })
  await check('spoken nugget count correction retains burger and pack identity',async()=>{
    candidates=[burger(),nuggets()]
    const d=await build("Log a double quarter pounder with cheese and a pack of six nuggets from McDonald's for lunch")
    const correction=ctx.extractReviewedFoodCountCorrection(d,'Change the nuggets to three')
    assert(correction);assert.equal(correction.correctedParts.length,2)
    const corrected=await ctx.buildVoiceMealDraft({meal:correction.meal,ingredients:correction.correctedParts.map(ctx.parseIngredientPhrase)},'Count correction','2026-10-17','AU')
    assert.equal(corrected.canConfirm,true);assert.equal(corrected.food.nutrition.calories,950)
  })
  await check('KFC and Hungry Jacks retain exact brand and whole-item source',async()=>{
    for(const [brand,name] of [['KFC','Zinger Burger'],["Hungry Jack's",'Whopper with Cheese']]){
      candidates=[item('correct',name,brand,[option('one','1 item',500)]),item('wrong',name,'Other brand',[option('one','1 item',900)])]
      const d=await build(`Log two ${brand} ${name} for dinner`)
      assert.equal(d.canConfirm,true);assert.equal(d.food.items[0].brand,brand);assert.equal(d.food.nutrition.calories,1000)
    }
  })
  await check('wrong chain and plain/double/bacon/meal variants cannot silently substitute',async()=>{
    for(const candidate of [item('wrong',burgerName,'KFC',[option('one','1 item')]),item('plain','Quarter Pounder with Cheese',"McDonald's",[option('one','1 item')]),item('extra','Double Quarter Pounder with Cheese Bacon',"McDonald's",[option('one','1 item')])]){
      candidates=[candidate];const d=await build("Log a McDonald's double quarter pounder with cheese for lunch")
      assert.equal(d.canConfirm,false)
    }
  })
  await check('no per-piece metadata never invents 600g or a saveable partial meal',async()=>{
    candidates=[burger(),item('nuggets',nuggetsName,"McDonald's",[])]
    const d=await build("Log a McDonald's double quarter pounder with cheese and six nuggets for lunch")
    assert.equal(d.canConfirm,false);assert.match(d.confirmationMessage,/Nothing has been saved/)
    assert.equal(d.food.items.length,1);assert(!d.food.items.some(i=>/600 g/.test(i.serving_size)))
  })
  await check('legacy 100g lookup hydrates identity-checked source serving details',async()=>{
    locals=[{...nuggets(),source:'usda',id:'source-id',serving_size:'100 g',servingOptions:[]}]
    servingReplies['source-id']=[{...option('six','6 pieces (96 g)',300),foodName:nuggetsName}]
    const d=await build("Log six McDonald's nuggets for lunch")
    assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,300);assert.equal(d.food.items[0].id,'source-id')
    assert(requests.some(r=>r.kind==='servings'&&r.id==='source-id'))
  })
  await check('wrong-food provider detail cannot replace selected identity',async()=>{
    locals=[{...nuggets(),source:'usda',id:'source-id',serving_size:'100 g',servingOptions:[]}]
    servingReplies['source-id']=[{...option('wrong','6 pieces',300),foodName:'KFC Chicken Wings'}]
    const d=await build("Log six McDonald's nuggets for lunch");assert.equal(d.canConfirm,false)
  })
  await check('ambiguous menu size requires clarification; explicit size uses its source',async()=>{
    candidates=[item('fries','Fries',"McDonald's",[option('small','Small 1 serving',200),option('large','Large 1 serving',400)])]
    assert.equal((await build("Log McDonald's fries for lunch")).canConfirm,false)
    const d=await build("Log McDonald's large fries for lunch");assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,400)
  })
  await check('explicit grams retain measured source ratio instead of piece estimate',async()=>{
    candidates=[{...nuggets(),serving_size:'100 g',servingOptions:[]}]
    const d=await build("Log 150 g McDonald's nuggets for lunch")
    assert.equal(d.canConfirm,true);assert.equal(d.food.nutrition.calories,150);assert.equal(d.food.items[0].serving_size,'150 g')
  })
  await check('unresolved modifications never silently select standard item',async()=>{
    candidates=[burger()]
    assert.equal((await build("Log a McDonald's double quarter pounder with cheese without bun for lunch")).canConfirm,false)
  })
  console.log(`Restaurant voice food integrity: ${total} scenario groups passed (synthetic source replies, no network).`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
