import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as off from '../lib/food/openfoodfacts'
import { normalizeBarcodeFood, summarizeDiscreteItemsForLog } from '../lib/food-normalization'

// Recorded public provider response, not a fabricated nutrition baseline.
const bad = JSON.parse(fs.readFileSync('docs/release-evidence/2026-10-05/current-weetbix-label-barcode.json', 'utf8')).publicOpenFoodFactsPayload
const good = { code: 'fixture-only', product_name: 'Verified fixture cereal', brands: 'Fixture', serving_size: '31 g', nutriments: { 'energy-kcal_100g':355, proteins_100g:12.4, carbohydrates_100g:65.9, fat_100g:1.3, fiber_100g:12.9, sugars_100g:3 } }
function bind(path: string, ctx: any, name: string) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(node, `Actual ${name} exists`)
  vm.runInContext(ts.transpile(node.getText(source).replace(/^export\s+/, ''), {target:ts.ScriptTarget.ES2022}),ctx)
}
async function check() {
  const ctx:any = vm.createContext({ ...off, console:{ log(){},warn(){},error(){} } })
  bind('lib/food-data.ts',ctx,'normalizeOpenFoodFactsProduct')
  assert.equal(ctx.normalizeOpenFoodFactsProduct(bad),null,'Current real Weet-Bix record with a declared nutrition error must never become a usable search result')
  for (const product of [good,{...good,data_quality_errors_tags:['en:packaging-data-incomplete']},{...good,data_quality_warnings_tags:bad.data_quality_warnings_tags}]) {
    const before=JSON.stringify(product)
    const food=ctx.normalizeOpenFoodFactsProduct(product)
    assert.ok(food,'Non-nutrition errors and warnings alone cannot reject otherwise usable nutrition')
    assert.equal(food.calories,355*.31);assert.equal(food.protein_g,12.4*.31)
    assert.equal(food.fat_g,1.3*.31);assert.equal(food.fiber_g,12.9*.31)
    assert.equal(JSON.stringify(product),before,'Never repair or rewrite original provider data')
  }
  let product:any=bad, charges=0
  Object.assign(ctx,{
    URL,OPENFOODFACTS_USER_AGENT:'fixture-only',BARCODE_SCAN_COST_CENTS:3,
    fetch:async()=>({ok:true,json:async()=>({status:1,product})}),
    isServingNutritionPlausible:()=>true,parseGramsFromLabel:()=>31,
    NextResponse:{json:(body:any,init?:any)=>({body,status:init?.status??200})},
    getServerSession:async()=>({user:{email:'fixture@example.invalid'}}),authOptions:{},
    prisma:{user:{findUnique:async()=>({id:'fixture-only'})}},
    CreditManager:class{ async getWalletStatus(){return{totalAvailableCents:100}} async chargeCents(){charges++;return true} },
    fetchFoodFromHelfiBarcode:async()=>null,fetchFoodFromLocalBarcode:async()=>null,fetchFoodFromFatSecret:async()=>null,
    searchFoodFromUSDA:async()=>null,shouldProbeOpenFoodFactsForNameOrder:()=>false,
    normalizeBarcodeFood,summarizeDiscreteItemsForLog,isLikelyOilProduct:()=>false,
  })
  bind('app/api/barcode/lookup/route.ts',ctx,'fetchFoodFromOpenFoodFacts')
  bind('app/api/barcode/lookup/route.ts',ctx,'GET')
  const lookup=()=>ctx.GET({url:'https://fixture.invalid/api/barcode/lookup?code=9300652805048'})
  const rejected=await lookup()
  assert.equal(rejected.status,422);assert.equal(rejected.body.found,false)
  assert.equal(rejected.body.error,'nutrition_suspect');assert.equal(rejected.body.product.name,'Weet-Bix')
  assert.equal(rejected.body.food,undefined);assert.equal(charges,0,'Rejected nutrition must not charge')
  product=good
  const usable=await lookup()
  assert.equal(usable.status,200);assert.equal(usable.body.found,true);assert.equal(charges,1)
  assert.equal(usable.body.food.calories,355*.31);assert.equal(usable.body.food.fat_g,1.3*.31)
  // A reliable exact-barcode alternate remains usable after the unsafe source is rejected.
  product=bad
  ctx.searchFoodFromUSDA=async()=>({...usable.body.food,source:'usda'})
  const fallback=await lookup();assert.equal(fallback.status,200);assert.equal(fallback.body.food.source,'usda');assert.equal(charges,2)
  ctx.searchFoodFromUSDA=async()=>null
  product={...good,nutriments:{'energy-kcal_100g':0,proteins_100g:0,carbohydrates_100g:0,fat_100g:0}}
  const zero=await lookup();assert.equal(zero.body.food.calories,0);assert.equal(zero.body.food.fat_g,0)
  assert.equal(zero.body.food.fiber_g,null);assert.equal(zero.body.food.sugar_g,null)
  console.log('PASS: actual packaged mapper and barcode endpoint reject recorded public nutrition errors, retain warning-only/good/zero/unknown values and exact alternate sources, request label review, never repair source records or charge for rejected data. No network, database or credentials.')
}
void check().catch(error=>{console.error(error);process.exitCode=1})
