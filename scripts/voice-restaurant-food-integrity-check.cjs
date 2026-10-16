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
const allowed = new Set(['lib/native-voice-spoken-quantities.ts', 'native/src/lib/foodUnits.ts', 'lib/food/serving-measurements.ts', 'lib/food/measurement-units.ts', 'lib/food/produce-measurements.ts', 'lib/food/dry-food-measurements.ts', 'lib/food/dairy-semi-solid-measurements.ts'])
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
async function run(){
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
