import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

// Run the real route's pure portion helpers without loading its server, keys or AI client.
const source = ts.createSourceFile('route.ts', fs.readFileSync('app/api/analyze-food/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const wanted = new Set(['EGG_KEYWORDS', 'DISCRETE_PIECE_KEYWORDS', 'replaceWordNumbers', 'stripWeightPhrases', 'extractExplicitPieceCount', 'parseServingWeight', 'computeTotalsFromItems', 'harmonizeDiscretePortionItems', 'enforceEggCountFromAnalysis'])
const declarations = source.statements.filter(ts.isVariableStatement).filter(statement => statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text))).map(statement => statement.getText(source))
assert.equal(declarations.length, wanted.size, 'all real route helpers must be present')
const context: any = { foodNumberOrNull }
vm.createContext(context)
vm.runInContext(ts.transpileModule(declarations.join('\n') + '\nthis.enforce = enforceEggCountFromAnalysis; this.harmonize = harmonizeDiscretePortionItems; this.total = computeTotalsFromItems;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const plain = (value: any) => JSON.parse(JSON.stringify(value))
const egg = { name: 'scrambled eggs', serving_size: '3 eggs', servings: 1, calories: 250, protein_g: 19, carbs_g: 3, fat_g: 18, fiber_g: 0, sugar_g: 1, isGuess: true }
const finish = (items: any[], text: string) => context.enforce(context.harmonize(items).items, text)
const before = JSON.stringify(egg)
const full = finish([egg], 'Estimated portions are about 3 eggs.')
assert.equal(full[0].calories, 250, '250 kcal already covers the whole three-egg portion; do not triple it')
for (const key of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']) assert.equal(full[0][key], (egg as any)[key], key)
assert.equal(JSON.stringify(egg), before, 'never mutate input')
assert.deepEqual(plain(finish(full, 'Estimated portions are about 3 eggs.')), plain(full), 'repeated normalization must not count eggs again')
const single = { ...egg, serving_size: '1 egg', calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5, fiber_g: null, sugar_g: null }
const corrected = finish([single], 'There are three eggs.')
assert.equal(corrected[0].calories, 210, 'an explicitly single-egg portion can be corrected to three eggs')
assert.equal(corrected[0].servings, 1)
assert.equal(corrected[0].customGramsPerServing, 150)
assert.equal(corrected[0].fiber_g, null)
assert.equal(corrected[0].sugar_g, null)
assert.deepEqual(plain(finish(corrected, 'There are three eggs.')), plain(corrected))
assert.equal(finish([{ ...single, serving_size: '3 eggs' }], 'There are three eggs.')[0].calories, 210, 'existing undercount safety correction still works exactly once')
assert.equal(finish([{ ...single, servings: 3 }], 'There are three eggs.')[0].calories, 210, 'three single-egg servings must become one whole portion')
assert.equal(context.harmonize([{ ...egg, servings: 2 }]).items[0].calories, 250, 'a second serving must not multiply per-serving nutrition')
assert.equal(context.total(context.harmonize([{ ...egg, servings: 2 }]).items).calories, 500)
assert.equal(context.harmonize([{ ...egg, serving_size: '6 eggs' }]).items[0].calories, 250, 'a smaller whole portion is not evidence that nutrition represents one egg')
assert.equal(context.harmonize([{ ...single, serving_size: '3 eggs', calories: null }]).items[0].calories, null, 'count heuristics must not invent missing energy')
assert.equal(context.harmonize([{ ...single, serving_size: '3 eggs', calories: 0 }]).items[0].calories, 0, 'count heuristics preserve a declared zero')
assert.equal(context.harmonize([{ name: 'bacon', serving_size: '4 strips bacon', servings: 2, calories: 180, protein_g: 12, fat_g: 14 }]).items[0].calories, 180, 'other counted foods keep their per-serving values')
assert.equal(context.enforce([{ ...egg, serving_size: '150 g' }], 'There are three eggs.')[0].calories, 250, 'weight-only portion gives no evidence that nutrition is per egg')
assert.equal(context.enforce([{ ...single, calories: null, protein_g: null }], 'There are three eggs.')[0].calories, null, 'missing energy must not become zero')
assert.equal(context.enforce([{ ...single, calories: 0 }], 'There are three eggs.')[0].calories, 0, 'explicit zero remains zero')
assert.equal(context.enforce([egg], 'Scrambled eggs on the plate.')[0].calories, 250)
const nonEgg = { ...egg, name: 'rice', serving_size: '1 cup' }
assert.deepEqual(plain(context.enforce([nonEgg], 'There are three eggs.')), [nonEgg])
// The production result's unchanged six companions: 559 kcal plus the correct 250-kcal eggs.
const companions = [240, 190, 40, 27, 21, 41].map((calories, i) => ({ name: `companion ${i}`, serving_size: '1 serving', servings: 1, calories }))
assert.equal(context.total(finish([egg, ...companions], 'Estimated portions are about 3 eggs.')).calories, 809)
const routeText = fs.readFileSync('app/api/analyze-food/route.ts', 'utf8')
assert.match(routeText, /eggCountItemsBefore !== resp\.items[\s\S]*?resp\.total = computeTotalsFromItems\(resp\.items\)/, 'changed counts must refresh response totals, even when the old total looks plausible')
console.log('PASS: actual route preserves whole three-egg nutrition, corrects explicit single-egg portions once, keeps weights and totals consistent, and preserves missing/zero values.')
