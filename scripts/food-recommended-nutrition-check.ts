import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as nutrients from '../lib/food/nutrient-values'
import * as recommended from '../lib/food/recommended-nutrition'
import * as constants from '../lib/ai-meal-recommendation'

const baseline = process.argv.includes('--baseline')
const paths = ['app/food/recommended/RecommendedMealClient.tsx', 'app/api/ai-meal-recommendation/route.ts']
const sources = paths.map(path => ts.createSourceFile(path, baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
const contexts = sources.map((source, index) => {
  const context = vm.createContext({ URLSearchParams, process: { env: {} }, ...constants, ...nutrients, ...recommended, useMemo: (fn: any) => fn() })
  const code = source.statements.filter(node => !ts.isImportDeclaration(node) && !(ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) && !(ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))).map(node => node.getText(source).replace(/^export /, '')).join('\n')
  vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2020 }), context)
  return context
})
function actual(index: number, name: string) {
  let expression = ''
  const source = sources[index]
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `actual ${name} exists`)
  return vm.runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2020 }), contexts[index])
}
const known = { name: 'Measured ingredient', serving_size: '100 g', servings: .5, calories: 88.1234567, protein_g: 2.7654321, carbs_g: 3.9876543, fat_g: 0, fiber_g: null, sugar_g: 0 }
const original = JSON.stringify(known)
const parentTotals = actual(0, 'computeTotalsFromItems'), serverTotals = actual(1, 'computeTotalsFromItems')
assert.equal(parentTotals([known]).fiber_g, null, 'Actual parent cannot turn missing fibre into zero')
if (baseline) throw new Error('Baseline unexpectedly preserved missing fibre; inspect reproduction')
for (const compute of [parentTotals, serverTotals]) {
  const result = compute([known]); assert.equal(result.fiber_g, null); assert.equal(result.sugar_g, 0); assert.equal(result.fat_g, 0)
  assert.equal(result.calories, known.calories * .5, 'Preserve full sum precision before display/save')
  assert.equal(result.protein_g, known.protein_g * .5)
  assert.equal(compute([{ ...known, fiber_g: 2 }, known]).fiber_g, null, 'One missing eaten ingredient prevents a complete sum')
  assert.equal(compute([{ ...known, servings: 0 }, { ...known, fiber_g: 2 }]).fiber_g, 1, 'Removed unknown ingredient must not poison totals')
  for (const value of [null, undefined, '', ' ', false, true, -1, NaN, Infinity, 'bad']) {
    const row = { ...known, calories: value, sugar_g: value }; assert.equal(compute([row]).calories, null); assert.equal(compute([row]).sugar_g, null)
  }
}
assert.equal(JSON.stringify(known), original, 'Totals never rewrite original source items')
const normalize = actual(1, 'normalizeAndValidateItems')
for (const value of [null, undefined, '', ' ', false, true, -1, NaN, Infinity, 'bad', 0, 2.7654321, '2.7654321']) {
  const raw = { ...known, id: 'original-id', calories: value, fiber_g: value }; const before = JSON.stringify(raw)
  const row = normalize([raw])[0]; const expected = nutrients.optionalNutrient(value)
  assert.equal(row.calories, expected); assert.equal(row.fiber_g, expected); assert.equal(row.id, raw.id); assert.equal(row.serving_size, raw.serving_size); assert.equal(row.servings, raw.servings); assert.equal(JSON.stringify(raw), before)
}
const foodLog = actual(0, 'normalizeTotalsForFoodLog')(parentTotals([known]))
assert.equal(foodLog.fiber, null); assert.equal(foodLog.fat, 0); assert.equal(foodLog.sugar, 0); assert.equal(foodLog.calories, 44)
const extract = actual(1, 'extractTotalsFromNutrients'), sum = actual(1, 'sumTotals')
assert.equal(extract({ calories: 0, fiber: null, fiber_g: 3, sugar: 0 }).fiber_g, null, 'Explicit missing primary value must not use a conflicting alias')
assert.equal(extract({ calories: 0, fiber: null, sugar: 0 }).calories, 0)
assert.equal(extract({ protein_g: 1.2345678 }).protein_g, 1.2345678)
assert.equal(extract(null).calories, null)
assert.equal(sum([extract({calories:44,fiber:null,sugar:0}),extract({calories:2,fiber:3,sugar:0})]).fiber_g, null)
assert.equal(sum([extract({calories:44,fiber:null,sugar:0}),extract({calories:2,fiber:3,sugar:0})]).calories,46)
const error = recommended.recommendationNutritionError
assert.equal(error([known]), null); assert.equal(error([{...known,calories:0,protein_g:0,carbs_g:0,fat_g:0}]),null)
assert.ok(error([])); assert.ok(error([{...known,servings:0}]))
for (const amount of [-1, NaN, Infinity, 21]) assert.ok(error([{...known,servings:amount}]))
for (const key of ['calories','protein_g','carbs_g','fat_g']) assert.ok(error([{...known,[key]:null}]))
assert.equal(error([{...known,calories:null,servings:0},known]),null)
const draft = actual(0, 'buildRecipeImportDraftFromRecommendation')({ mealName: 'Measured ingredient meal', recipe: { servings: 1, steps: ['Original recipe step'] } }, [known], 'Lunch')
assert.equal(draft.prefillItems[0].fiber_g, null); assert.equal(draft.prefillItems[0].calories, known.calories); assert.ok(draft.ingredients[0].includes('50')); assert.equal(draft.steps[0], 'Original recipe step')
const format = actual(0, 'formatNumber'), macro = actual(0, 'formatMacroValue')
assert.equal(format(7.35, 1), '7.4'); assert.equal(macro(7.35,'g',1),'7.4 g'); assert.equal(format(null,1),'—'); assert.equal(format(0,1),'0.0')
// Run the real save handlers; only HTTP/clock/user state are synthetic.
async function saveHandlers() {
  const context = contexts[0]
  const active = { id: 'original-meal', mealName: 'Measured ingredient meal', items: [known], recipe: { servings: 1, steps: ['Original recipe step'] }, why: 'Original reason' }
  for (const name of ['addToDiary','saveToFavorites']) {
    let calls: any[] = [], errors: any[] = []
    Object.assign(context,{active,currentItems:[known],draftTotals:parentTotals([known]),date:'2026-10-05',category:'lunch',categoryLabel:'Lunch',userData:{favorites:[]},setError:(error:any)=>errors.push(error),setSavingDiary:()=>{},setCommitSaving:()=>{},updateUserData:()=>{},setHistory:()=>{},router:{push:()=>{}},fetch:async(url:string,options:any)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({history:[]})}}})
    await actual(0,name)(); assert.equal(errors.length,0); assert.equal(calls.length,2)
    const saved = name==='addToDiary' ? calls[0].body : calls[0].body.favorites[0]
    assert.equal(saved.nutrition.fiber,null); assert.equal(saved.nutrition.fat,0); assert.equal(saved.items[0].calories,known.calories); assert.equal(saved.items[0].servings,.5)
    if (name==='addToDiary') { assert.equal(saved.nutrition.__origin,'ai-recommended'); assert.equal(saved.nutrition.__aiMealId,active.id); assert.deepEqual(saved.nutrition.__aiRecipe,active.recipe); assert.equal(saved.nutrition.__aiWhy,active.why) }
    assert.equal(calls[1].body.recommendation.items[0].fiber_g,null); assert.equal(calls[1].body.recommendation.totals.fiber_g,null)
    for (const invalid of [{...known,calories:null},{...known,servings:0},{...known,servings:-1}]) {
      calls=[];errors=[];context.currentItems=[invalid];context.draftTotals=parentTotals([invalid]);await actual(0,name)();assert.equal(calls.length,0,'Invalid core/count cannot reach persistence/history');assert.equal(errors.length,1)
    }
  }
}
async function commitHandler() {
  const source = sources[1], context = contexts[1]
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PUT')
  assert.ok(declaration, 'actual server commit handler exists')
  vm.runInContext(ts.transpile(declaration.getText(source).replace(/^export /, ''), { target: ts.ScriptTarget.ES2020 }), context)
  const put = vm.runInContext('PUT', context)
  let stored: any[] = []
  Object.assign(context, { authOptions: {}, getServerSession: async () => ({user:{email:'synthetic-test@example.invalid'}}), NextResponse: {json:(body:any,options:any)=>({body,status:options?.status || 200})}, prisma: {user:{findUnique:async()=>({id:'synthetic-user'})},healthGoal:{findFirst:async()=>null,create:async(arg:any)=>{stored.push(JSON.parse(arg.data.category))}}} })
  const recommendation = {id:'original-meal',mealName:'Measured ingredient meal',category:'lunch',date:'2026-10-05',items:[known],recipe:{servings:1,steps:['Original recipe step']},why:'Original reason'}
  const response = await put({json:async()=>({action:'commit',recommendation})})
  assert.equal(response.status,200); assert.equal(stored.length,1)
  assert.equal(stored[0].history[0].items[0].fiber_g,null); assert.equal(stored[0].history[0].items[0].calories,known.calories)
  assert.equal(stored[0].history[0].totals.fiber_g,null); assert.equal(stored[0].history[0].totals.sugar_g,0)
  for (const invalid of [{...known,calories:null},{...known,servings:0}]) {
    stored=[]; const rejected=await put({json:async()=>({action:'commit',recommendation:{...recommendation,items:[invalid]}})})
    assert.equal(rejected.status,400);assert.equal(stored.length,0,'Incomplete core/empty meal cannot be committed to history')
  }
}
saveHandlers().then(commitHandler).then(()=>console.log('PASS: actual parent/server totals, normalization, diary context, display rounding and both normal save handlers preserve unknown/true-zero nutrients, source precision and metadata; incomplete core/count blocked before writes. Synthetic HTTP/state only; live screen evidence is separate.'))
