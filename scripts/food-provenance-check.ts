import assert from 'node:assert/strict'
import { mapFoodNutritionChecks } from '../lib/food-photo-model'
import { fillMissingNutrition, foodNutritionLookupName, isFoodPhotoCandidateIdentity, nutritionCandidateScale } from '../lib/food/nutrition-provenance'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull, hasCoreFoodNutrition } from '../lib/food/openfoodfacts'
import { convertFoodAmount, parseFoodServing } from '../native/src/lib/foodUnits'
import { Prisma } from '@prisma/client'
import { usdaLibraryServingSize } from '../lib/food/usda-library'
import { checkFoodPhotoIdentity } from './food-photo-identity-check'
const item = { name: 'Chicken breast cooked', serving_size: '200 g', calories: null, protein_g: null, carbs_g: 0, fat_g: 0 }
const candidate = { source: 'usda', id: '123', name: 'Chicken breast cooked', serving_size: '100 g', calories: 165, protein_g: 31, carbs_g: 1, fat_g: 3 }
const filled = fillMissingNutrition(item, candidate)
assert.equal(filled.calories, 330); assert.equal(filled.protein_g, 62)
assert.equal(filled.carbs_g, 0); assert.equal(filled.fat_g, 0)
assert.equal(filled.nutritionProvenance.recordId, '123')
assert.equal(filled.nutritionProvenance.portionEstimated, true)
assert.deepEqual(fillMissingNutrition(item, { ...candidate, name: 'Chicken breast raw' }), item)
assert.deepEqual(fillMissingNutrition(item, { ...candidate, brand: 'Different brand' }), item)
assert.deepEqual(fillMissingNutrition({ ...item, serving_size: 'one plate' }, candidate), { ...item, serving_size: 'one plate' })
assert.deepEqual(fillMissingNutrition(item, { ...candidate, serving_size: '100 ml' }), item)
const fruit = { name: 'pineapple', serving_size: '1/2 cup (3 oz)', servings: 1, calories: 43, protein_g: 0.5, carbs_g: 11, fat_g: 0.1, fiber_g: null, sugar_g: null, isGuess: true }
const dried = { source: 'usda', id: '2709210', name: 'Pineapple, dried', serving_size: '100 g', calories: 347, protein_g: 1.2, carbs_g: 84.1, fat_g: 0.7, fiber_g: 2.4, sugar_g: 77.1 }
const canned = { ...dried, id: '2709284', name: 'Strawberries, canned', calories: 92 }
assert.equal(nutritionCandidateScale(fruit, dried), null, 'actual dried pineapple supplier record must not replace fresh-looking plain pineapple')
assert.equal(nutritionCandidateScale({ ...fruit, name: 'strawberries' }, canned), null, 'actual canned strawberry record must not replace plain strawberries')
for (const form of ['dried', 'dehydrated', 'freeze dried', 'canned', 'tinned', 'juice', 'puree', 'powder', 'concentrate', 'candied', 'in syrup', 'jam', 'jelly', 'pickled']) {
  const candidate = { ...dried, name: `Pineapple, ${form}` }
  assert.equal(nutritionCandidateScale(fruit, candidate), null, form)
  const matching = { ...fruit, name: `Pineapple ${form}` }
  assert.ok(nutritionCandidateScale(matching, candidate)! > 0, `explicit matching ${form} remains supported`)
  assert.equal(nutritionCandidateScale(matching, { ...dried, name: 'Pineapple, raw' }), null)
}
assert.ok(nutritionCandidateScale(fruit, { ...dried, name: 'Pineapple, raw' })! > 0)
assert.ok(nutritionCandidateScale(fruit, { ...dried, name: 'Pineapple, fresh' })! > 0)
assert.equal(fillMissingNutrition(fruit, dried), fruit, 'missing nutrients cannot borrow from an incompatible food form')
const wholeApple = { name: 'Whole apple', serving_size: '1 medium apple, about170 g edible portion excluding core', servings: 1, calories: 88, protein_g: 0.4, carbs_g: 23.5, fat_g: 0.3, fiber_g: 4.1, sugar_g: 17.7, isGuess: true }
const appleCereal = { source: 'usda', id: '171359', name: 'Babyfood, cereal, whole wheat, with apples, dry fortified', serving_size: '100 g', calories: 402, protein_g: 6.6, carbs_g: 83.2, fat_g: 4.8, fiber_g: 6.7, sugar_g: 26.7 }
assert.equal(nutritionCandidateScale(wholeApple, appleCereal), null, 'actual cereal supplier record must never replace a whole apple')
assert.equal(fillMissingNutrition({ ...wholeApple, fiber_g: null }, appleCereal).fiber_g, null)
assert.ok(nutritionCandidateScale({ ...wholeApple, name: appleCereal.name }, appleCereal)! > 0, 'explicitly requested baby cereal retains its compatible nutrition source')

// Execute the real calibration route with only an offline supplier stub.
const source = ts.createSourceFile('route.ts', fs.readFileSync('app/api/analyze-food/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const wanted = new Set(['replaceWordNumbers', 'normalizeLookupQuery', 'scoreLookupNameMatch', 'getItemWeightInGrams', 'selectDatabaseCandidate', 'enrichItemsWithDatabaseIfOutlier', 'computeTotalsFromItems', 'enrichItemsWithFatSecretIfMissing', 'sanitizeStructuredItems', 'looksLikeNonFoodArtifact', 'normalizeComponentName'])
const declarations = source.statements.filter(ts.isVariableStatement).filter(statement => statement.declarationList.declarations.some(d => ts.isIdentifier(d.name) && wanted.has(d.name.text))).map(s => s.getText(source))
assert.equal(declarations.length, wanted.size)
const context: any = { mapFoodNutritionChecks, foodNumberOrNull, parseFoodServing, convertFoodAmount, nutritionCandidateScale, foodNutritionLookupName, isFoodPhotoCandidateIdentity, fillMissingNutrition, NUTRITION_FIELDS: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'], lookupFoodNutrition: async () => [dried], console: { warn: () => {} } }
vm.createContext(context)
vm.runInContext(ts.transpileModule(declarations.join('\n') + '\nthis.calibrate = enrichItemsWithDatabaseIfOutlier; this.fill = enrichItemsWithFatSecretIfMissing; this.sanitize = sanitizeStructuredItems; this.total = computeTotalsFromItems;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const run = async () => {
  await checkFoodPhotoIdentity()
  const foodDataAst = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const genericDeclaration = foodDataAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'searchPhotoGenericLibrary')!
  assert.ok(genericDeclaration)
  const observedQueries: any[] = []
  const genericContext: any = { Prisma, usdaLibraryServingSize, foodNumberOrNull, prisma: { $queryRaw: async (query: any) => {
    observedQueries.push(query)
    return [{ source: 'usda_sr_legacy', id: 'spinach-local', fdcId: 168462, name: 'Spinach, raw', servingSize: '100 g', calories: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, fiberG: null, sugarG: 0 }]
  } } }
  vm.createContext(genericContext)
  vm.runInContext(ts.transpileModule(genericDeclaration.getText(foodDataAst).replace(/^export /, '')+'\nthis.search = searchPhotoGenericLibrary;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, genericContext)
  const genericItems = await genericContext.search('raw spinach', 20)
  const sql = observedQueries[0]
  assert.ok(sql.text.includes('WITH generic_foods AS MATERIALIZED'))
  assert.ok(sql.text.indexOf('WHERE "source" IN') < sql.text.indexOf('SELECT * FROM generic_foods WHERE'), 'generic-source extraction must precede name matching/sorting to avoid a global branded-archive name-index walk')
  assert.ok(sql.text.includes("'usda_foundation', 'usda_sr_legacy'"))
  assert.deepEqual(sql.values, ['(^| )raw[a-z0-9]*($| )', '(^| )spinach[a-z0-9]*($| )', 20])
  assert.equal(genericItems[0].id, '168462'); assert.equal(genericItems[0].calories, 23)
  assert.equal(genericItems[0].fiber_g, null); assert.equal(genericItems[0].sugar_g, 0)
  await genericContext.search('almonds', 1000)
  assert.deepEqual(observedQueries[1].values, ['(^| )almond[a-z0-9]*($| )', 50])
  await genericContext.search("apple'); DROP TABLE food;--", 20)
  assert.ok(!observedQueries[2].text.includes('DROP'), 'typed food words must stay bound parameters, never SQL text')
  const beforeBlank = observedQueries.length
  assert.equal((await genericContext.search('  ',20)).length,0)
  assert.equal(observedQueries.length,beforeBlank)
  const lookupDeclaration = foodDataAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'lookupFoodNutrition')!
  assert.ok(lookupDeclaration)
  const rawApple = { ...appleCereal, id: 'raw-apple', name: 'Apples, raw, with skin', calories: 52, protein_g: 0.3, carbs_g: 13.8, fat_g: 0.2, fiber_g: null, sugar_g: 10.4 }
  let providerCalls: string[] = []
  const providers: any = { hasCoreFoodNutrition, console: { log: () => {}, warn: () => {} },
    searchCustomFoodMacros: async () => { providerCalls.push('custom'); return [{ ...rawApple, id: 'curated-apple' }] },
    searchPhotoGenericLibrary: async () => { providerCalls.push('local'); return [appleCereal, rawApple] },
    searchUsdaFoods: async () => { providerCalls.push('usda'); return [rawApple] },
    searchFatSecretFoods: async () => { providerCalls.push('fatsecret'); return [rawApple] } }
  vm.createContext(providers)
  vm.runInContext(ts.transpileModule(lookupDeclaration.getText(foodDataAst).replace(/^export /, '') + '\nthis.lookup = lookupFoodNutrition;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, providers)
  const lookupOptions = { localFirst: true, preferSource: 'usda', usdaDataType: 'generic', maxResults: 20, acceptCandidate: (x: any) => nutritionCandidateScale(wholeApple, x) != null }
  assert.equal((await providers.lookup('apple', lookupOptions))[0].id, 'custom:curated-apple')
  assert.deepEqual(providerCalls, ['custom'], 'Helfi curated database must be checked before imported libraries or APIs')
  providers.searchCustomFoodMacros = async () => { providerCalls.push('custom'); return [] }
  providerCalls = []
  assert.equal((await providers.lookup('apple', lookupOptions))[0].id, 'raw-apple')
  assert.deepEqual(providerCalls, ['custom', 'local'], 'compatible saved food must prevent external API calls')
  providers.searchPhotoGenericLibrary = async () => { providerCalls.push('local'); return [appleCereal] }
  providerCalls = []
  assert.equal((await providers.lookup('apple', lookupOptions))[0].id, 'raw-apple')
  assert.deepEqual(providerCalls, ['custom', 'local', 'usda'], 'wrong saved match must fall back to compatible external source')
  providers.searchUsdaFoods = async () => { providerCalls.push('usda'); return [appleCereal] }
  providerCalls = []
  assert.equal((await providers.lookup('apple', lookupOptions))[0].id, 'raw-apple')
  assert.deepEqual(providerCalls, ['custom', 'local', 'usda', 'fatsecret'], 'wrong external match must not stop the next provider')
  context.lookupFoodNutrition = (query: string, options: any) => providers.lookup(query, options)
  const localFirstApple = await context.calibrate([wholeApple], { preferDatabase: true, lookupConcurrency: 4 })
  assert.equal(localFirstApple.items[0].calories, 88, 'saved/source52kcal per100g must scale once to170g')
  assert.equal(localFirstApple.items[0].fiber_g, null, 'unknown supplier nutrient stays unknown')
  const finalApple = context.sanitize(localFirstApple.items, true)[0]
  assert.equal(finalApple.fiber_g, null, 'final photo response must not turn unavailable supplier fibre into a claimed zero')
  for (const unknown of [null, undefined, '', 'unknown', -1]) {
    const result = context.sanitize([{ ...wholeApple, fiber_g: unknown, sugar_g: unknown }], true)[0]
    assert.equal(result.fiber_g, null); assert.equal(result.sugar_g, null)
  }
  const genuineZero = context.sanitize([{ ...wholeApple, fiber_g: 0, sugar_g: 0 }], true)[0]
  assert.equal(genuineZero.fiber_g, 0); assert.equal(genuineZero.sugar_g, 0)
  const partial = context.total([finalApple, genuineZero], true)
  assert.equal(partial.fiber_g, null, 'meal total must not claim complete fibre when a component is unreported')
  assert.equal(partial.calories, finalApple.calories + genuineZero.calories)
  assert.equal(context.total([genuineZero], true).fiber_g, 0)
  assert.equal(context.total([genuineZero], true).sugar_g, 0)
  assert.equal(context.total([finalApple]).fiber_g, 0, 'other analysis modes keep their current total behavior')
  const sanitizerCalls: ts.CallExpression[] = []
  const collectCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'sanitizeStructuredItems') sanitizerCalls.push(node)
    ts.forEachChild(node, collectCalls)
  }
  collectCalls(source)
  assert.equal(sanitizerCalls.length, 13)
  for (const call of sanitizerCalls) assert.equal(call.arguments[1]?.getText(source), 'useFoodPhotoModel', 'every ordinary photo repair pass must preserve unknown optional nutrients')
  assert.equal(context.sanitize([{ ...wholeApple, fiber_g: null }])[0].fiber_g, 0, 'other analysis modes retain their existing sanitizer behavior')
  assert.equal(localFirstApple.items[0].nutritionProvenance.recordId, 'raw-apple')
  assert.equal(localFirstApple.items[0].isGuess, true, 'photo portion is still estimated')
  console.log('PASS: actual photo lookup checks saved library first, uses APIs only for a compatible fallback, replaces estimated nutrients with sourced values and retains unknowns/estimated portions.')
  const original = JSON.stringify(fruit)
  const spinach = { ...wholeApple, name: 'Raw spinach', serving_size: '20g', calories: 5 }
  const spinachSource = { ...rawApple, id: 'spinach-raw', name: 'Spinach, raw', calories: 23 }
  const mustardSource = { ...spinachSource, id: '168438', name: 'Mustard spinach, (tendergreen), raw', calories: 21 }
  assert.equal(isFoodPhotoCandidateIdentity(spinach, mustardSource), false)
  assert.equal(isFoodPhotoCandidateIdentity(spinach, spinachSource), true)
  assert.equal(isFoodPhotoCandidateIdentity({ name: 'Almonds' }, { name: 'Nuts, almonds' }), true)
  assert.equal(isFoodPhotoCandidateIdentity({ name: 'Cooked salmon' }, { name: 'Fish, salmon, cooked' }), true)
  context.lookupFoodNutrition = async () => [mustardSource, spinachSource]
  const selectedSpinach = await context.calibrate([spinach], { preferDatabase: true })
  assert.equal(selectedSpinach.items[0].nutritionProvenance.recordId, 'spinach-raw', 'primary identity must beat a food that merely contains spinach in its name')
  for (const food of ['pie', 'cereal', 'cake', 'juice', 'sauce', 'smoothie']) {
    assert.equal(nutritionCandidateScale({ ...wholeApple, name: 'Apple' }, { ...rawApple, name: `Apple ${food}` }), null, 'plain apple cannot borrow processed/composite '+food+' nutrition')
  }
  context.lookupFoodNutrition = async () => [appleCereal]
  for (const lookupConcurrency of [1, 4]) {
    const appleChecked = await context.calibrate([wholeApple], { lookupConcurrency })
    assert.equal(appleChecked.changed, false)
    assert.equal(appleChecked.items[0].calories, 88, 'real calibration must not inflate170g whole apple to683 cereal calories')
    assert.equal(appleChecked.items[0].nutritionProvenance, undefined)
  }
  context.lookupFoodNutrition = async () => [dried]
  const rejected = await context.calibrate([fruit])
  assert.equal(rejected.changed, false)
  assert.equal(rejected.items[0].calories, 43, 'real calibration must not inflate85g fresh pineapple to295 dried calories')
  assert.equal(rejected.items[0].fiber_g, null)
  assert.equal(rejected.items[0].nutritionProvenance, undefined)
  assert.equal(JSON.stringify(fruit), original)
  const matched = await context.calibrate([{ ...fruit, name: 'dried pineapple' }])
  assert.equal(matched.changed, true, 'explicit dried pineapple still uses its measured compatible source')
  assert.equal(matched.items[0].calories, 295)
  assert.equal(matched.items[0].nutritionProvenance.recordId, '2709210')
  context.lookupFoodNutrition = async () => [canned]
  assert.equal((await context.calibrate([{ ...fruit, name: 'strawberries' }])).changed, false)
  const fresh = { ...dried, id: 'fresh-reference', name: 'Pineapple, raw', calories: 50, protein_g: 0.5, carbs_g: 13, fat_g: 0.1, fiber_g: null, sugar_g: 0 }
  context.lookupFoodNutrition = async () => [dried, fresh]
  const freshMatched = await context.calibrate([{ ...fruit, calories: 100 }])
  assert.equal(freshMatched.changed, true)
  assert.equal(freshMatched.items[0].calories, 43, 'choose the compatible raw source rather than the denser dried source')
  assert.equal(freshMatched.items[0].nutritionProvenance.recordId, 'fresh-reference')
  assert.equal(freshMatched.items[0].fiber_g, null)
  assert.equal(freshMatched.items[0].sugar_g, 0)
  assert.equal(freshMatched.items[0].isGuess, true, 'photo portion remains an estimate after compatible database nutrition')
  // Real multi-food calibration must keep the serial nutrition result while
  // avoiding seven consecutive waits in the slower6.1 photo pipeline.
  const referenceCalories: Record<string, number> = { apple: 52, spinach: 23, almonds: 579, strawberries: 32, pineapple: 50, blueberries: 57, broccoli: 35 }
  const plate = Object.keys(referenceCalories).map(name => ({ name, serving_size: '100 g', servings: 1, calories: 900, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: null, sugar_g: 0, isGuess: true }))
  const plateOriginal = JSON.stringify(plate)
  let active = 0, peak = 0, requests: string[] = []
  const delayedLookup = async (query: string) => {
    requests.push(query); active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    return [{ source: 'usda', id: 'offline-' + query, name: query, serving_size: '100 g', calories: referenceCalories[query], protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: null, sugar_g: 0 }]
  }
  context.lookupFoodNutrition = delayedLookup
  const serial = await context.calibrate(plate)
  assert.equal(peak, 1, 'existing text/label path stays serial')
  requests = []; peak = 0
  const parallel = await context.calibrate(plate, { lookupConcurrency: 4 })
  assert.equal(peak, 4, 'normal meal photos must check foods together with a bounded provider load')
  assert.deepEqual(requests, Object.keys(referenceCalories), 'every food still gets the same lookup')
  assert.deepEqual(JSON.parse(JSON.stringify(parallel)), JSON.parse(JSON.stringify(serial)), 'same corrections, order, provenance, unknowns and totals as the existing serial path')
  assert.deepEqual(parallel.items.map((x: any) => x.calories), Object.values(referenceCalories))
  assert.equal(JSON.stringify(plate), plateOriginal, 'do not mutate the model result')
  requests = []; peak = 0
  await context.calibrate(plate, { lookupConcurrency: 99, maxItems: 2 })
  assert.equal(peak, 2)
  assert.equal(requests.length, 2, 'item limit still applies with parallel lookups')
  context.searchFatSecretFoods = delayedLookup
  const missingPlate = plate.map(x => ({ ...x, calories: null }))
  const serialFill = await context.fill(missingPlate)
  peak = 0
  const parallelFill = await context.fill(missingPlate, 4)
  assert.equal(peak, 4)
  assert.deepEqual(JSON.parse(JSON.stringify(parallelFill)), JSON.parse(JSON.stringify(serialFill)), 'missing-value enrichment also preserves exactly the serial result')
  console.log('PASS: actual meal nutrition checks overlap at most4 supplier requests, retain every eligible lookup/item limit and produce the same sourced results as serial calibration and missing-value enrichment.')
  console.log('PASS: real source-form identity and calibration reject incompatible dried/canned/processed food; matching forms, measured portions, unknown/zero, brands and original records preserved. No network or credentials.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
