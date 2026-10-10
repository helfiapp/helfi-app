import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { mapFoodNutritionChecks } from '../lib/food-photo-model'
import { foodNumberOrNull, hasCoreFoodNutrition } from '../lib/food/openfoodfacts'
import { convertFoodAmount, parseFoodServing } from '../native/src/lib/foodUnits'
import { NUTRITION_FIELDS, foodNutritionLookupName, isFoodPhotoCandidateIdentity, nutritionCandidateScale } from '../lib/food/nutrition-provenance'

// Original imported USDA records, read without mutation on 10 October 2026.
// The portions/names reproduce the ordinary app's 8 October breakfast response.
const eggs = { name: 'Scrambled eggs', serving_size: 'Approximately 120g; egg count not discernible', servings: 1, calories: 157, protein_g: 15.7, carbs_g: 9, fat_g: 6.7, fiber_g: 0, sugar_g: 9, isGuess: true }
const broccoli = { name: 'Cooked broccoli', serving_size: 'Approximately 85g, about 1/2 cup', servings: 1, calories: 21, protein_g: 3.3, carbs_g: 2.7, fat_g: 0.4, fiber_g: 2.4, sugar_g: 0.5, isGuess: true }
const frozenEggs = { source: 'usda', id: '169904', name: 'Eggs, scrambled, frozen mixture', brand: null, serving_size: '100 g', calories: 131, protein_g: 13.1, carbs_g: 7.5, fat_g: 5.6, fiber_g: 0, sugar_g: 7.5 }
const wholeEgg = { source: 'usda', id: '172187', name: 'Egg, whole, cooked, scrambled', brand: null, serving_size: '100 g', calories: 149, protein_g: 9.99, carbs_g: 1.61, fat_g: 10.98, fiber_g: 0, sugar_g: 1.39 }
const raab = { source: 'usda', id: '170382', name: 'Broccoli raab, cooked', brand: null, serving_size: '100 g', calories: 25, protein_g: 3.83, carbs_g: 3.12, fat_g: 0.52, fiber_g: 2.8, sugar_g: 0.62 }
const chinese = { source: 'usda', id: '169392', name: 'Broccoli, chinese, cooked', brand: null, serving_size: '100 g', calories: 22, protein_g: 1.14, carbs_g: 3.81, fat_g: 0.72, fiber_g: 2.5, sugar_g: 0.84 }
const conventional = { source: 'usda', id: '169967', name: 'Broccoli, cooked, boiled, drained, without salt', brand: null, serving_size: '100 g', calories: 35, protein_g: 2.38, carbs_g: 7.18, fat_g: 0.41, fiber_g: 3.3, sugar_g: 1.39 }
const accepts = (item: any, candidate: any) => isFoodPhotoCandidateIdentity(item, candidate) && nutritionCandidateScale(item, candidate) != null

assert.equal(nutritionCandidateScale(eggs, frozenEggs), null, 'a prepared plate does not establish frozen egg mixture identity')
assert.equal(nutritionCandidateScale(eggs, { ...frozenEggs, name: 'Eggs, scrambled, mixture' }), null, 'mixture remains distinct without the frozen word')
assert.equal(nutritionCandidateScale(eggs, wholeEgg), 1.2, 'plural eggs must match the correct singular USDA egg record')
assert.equal(nutritionCandidateScale({ ...eggs, name: 'Scrambled egg' }, { ...wholeEgg, name: 'Eggs, cooked, scrambled' }), 1.2, 'singular/plural identity must work in both directions')
assert.equal(nutritionCandidateScale({ ...eggs, name: frozenEggs.name }, frozenEggs), 1.2, 'explicitly named frozen mixture keeps its original source')
for (const candidate of [raab, chinese]) {
  assert.equal(nutritionCandidateScale(broccoli, candidate), null)
  assert.equal(isFoodPhotoCandidateIdentity(broccoli, candidate), false)
  assert.equal(nutritionCandidateScale({ ...broccoli, name: candidate.name }, candidate), 0.85, 'an explicitly requested subtype remains supported')
}
assert.equal(nutritionCandidateScale(broccoli, conventional), 0.85)
assert.equal(nutritionCandidateScale({ ...broccoli, name: 'Cooked broccoli rabe' }, { ...raab, name: 'Broccoli rabe, cooked' }), 0.85)
assert.equal(nutritionCandidateScale(broccoli, { ...conventional, name: 'Broccoli, frozen, cooked' }), null)

const route = ts.createSourceFile('route.ts', fs.readFileSync('app/api/analyze-food/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const wanted = new Set(['replaceWordNumbers', 'normalizeLookupQuery', 'scoreLookupNameMatch', 'getItemWeightInGrams', 'selectDatabaseCandidate', 'enrichItemsWithDatabaseIfOutlier', 'computeTotalsFromItems'])
const declarations = route.statements.filter(ts.isVariableStatement).filter(statement => statement.declarationList.declarations.some(d => ts.isIdentifier(d.name) && wanted.has(d.name.text))).map(s => s.getText(route))
assert.equal(declarations.length, wanted.size)
const context: any = { mapFoodNutritionChecks, foodNumberOrNull, parseFoodServing, convertFoodAmount, nutritionCandidateScale, foodNutritionLookupName, isFoodPhotoCandidateIdentity, NUTRITION_FIELDS, console: { warn: () => {} } }
vm.createContext(context)
vm.runInContext(ts.transpileModule(declarations.join('\n') + '\nthis.calibrate = enrichItemsWithDatabaseIfOutlier;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)

const foodData = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const lookup = foodData.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'lookupFoodNutrition')!
assert.ok(lookup)
let calls: string[] = []
const sourceCandidates = (query: string) => query.includes('egg') ? [frozenEggs, wholeEgg] : [raab, chinese, conventional]
const providers: any = {
  hasCoreFoodNutrition, console: { log: () => {}, warn: () => {} },
  searchCustomFoodMacros: async () => { calls.push('custom'); return [] },
  searchPhotoGenericLibrary: async (query: string) => { calls.push('local:' + query); return sourceCandidates(query) },
  searchUsdaFoods: async () => { calls.push('usda'); return [wholeEgg] },
  searchFatSecretFoods: async () => { calls.push('fatsecret'); return [wholeEgg] },
}
vm.createContext(providers)
vm.runInContext(ts.transpileModule(lookup.getText(foodData).replace(/^export /, '') + '\nthis.lookup = lookupFoodNutrition;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, providers)
context.lookupFoodNutrition = (query: string, options: any) => providers.lookup(query, options)

export async function checkFoodPhotoIdentity() {
  const plate = [eggs, broccoli]
  const original = JSON.stringify(plate)
  const corrected = await context.calibrate(plate, { preferDatabase: true, lookupConcurrency: 4 })
  assert.equal(corrected.changed, true)
  assert.deepEqual(corrected.items.map((item: any) => item.nutritionProvenance.recordId), ['172187', '169967'])
  assert.deepEqual(corrected.items.map((item: any) => item.calories), [179, 30], 'actual route scales original reference nutrients exactly once to original estimated grams')
  assert.deepEqual(corrected.items.map((item: any) => item.serving_size), plate.map(item => item.serving_size))
  assert.equal(corrected.items[0].fiber_g, 0)
  assert.ok(corrected.items.every((item: any) => item.isGuess && item.nutritionProvenance.portionEstimated))
  assert.equal(JSON.stringify(plate), original, 'model result and portion labels remain unchanged')
  assert.equal(calls.filter(call => call === 'usda' || call === 'fatsecret').length, 0, 'correct saved generic records prevent external API work')
  assert.equal(calls.filter(call => call === 'custom').length, 2, 'each item still checks curated Helfi records first')

  providers.searchPhotoGenericLibrary = async () => { calls.push('local'); return [frozenEggs] }
  calls = []
  const fallback = await providers.lookup('scrambled eggs', { localFirst: true, preferSource: 'usda', usdaDataType: 'generic', maxResults: 20, acceptCandidate: (candidate: any) => accepts(eggs, candidate) })
  assert.equal(fallback[0].id, '172187')
  assert.deepEqual(calls, ['custom', 'local', 'usda'], 'a wrong local frozen record must continue to the compatible provider')
  context.lookupFoodNutrition = async () => [frozenEggs]
  const rejected = await context.calibrate([eggs], { preferDatabase: true })
  assert.equal(rejected.changed, false)
  assert.equal(rejected.items[0].nutritionProvenance, undefined, 'no source attribution can be invented when only a mismatched food is available')
  context.lookupFoodNutrition = async () => [{ ...conventional, fiber_g: null, sugar_g: 0 }]
  const optional = await context.calibrate([broccoli], { preferDatabase: true })
  assert.equal(optional.items[0].fiber_g, null)
  assert.equal(optional.items[0].sugar_g, 0)
  console.log('PASS: original USDA egg/broccoli records reject frozen mixture, raab and Chinese broccoli, accept correct saved foods, scale once, retain estimated portions/null/zero and fall back only for compatible sources. No network or credentials.')
}
if (require.main === module) checkFoodPhotoIdentity().catch(error => { console.error(error); process.exitCode = 1 })
