import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

// Extract only the pure response formatter; never load the AI/server route.
const routeText = fs.readFileSync('app/api/analyze-food/route.ts', 'utf8')
const source = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true)
const declaration = source.statements.filter(ts.isVariableStatement).find(statement => statement.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === 'synchronizeAnalysisNutritionSummary'))
assert.ok(declaration, 'final written nutrition must be synchronized with the actual response total')
const context: any = { foodNumberOrNull }
vm.createContext(context)
vm.runInContext(ts.transpileModule(declaration.getText(source) + '\nthis.sync = synchronizeAnalysisNutritionSummary;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const total = { calories: 962, protein_g: 32.7, carbs_g: 142, fat_g: 33.3, fiber_g: 15.2, sugar_g: 51.8 }
const description = 'The plate appears to contain scrambled eggs (~3 large eggs), roasted potatoes (~¾ cup), seasoned rice (~1 cup), broccoli (~1 cup), strawberries (~¾ cup), blueberries (~⅓ cup), and pineapple (~¾ cup). Portions and added cooking fats are visually estimated, so actual nutrition may vary.\n\nComponents: scrambled eggs, roasted potatoes, seasoned rice, broccoli, strawberries, blueberries, pineapple'
const old = description + '\n\nCalories: 885, Protein: 33g, Carbs: 122g, Fat: 33g'
const expected = 'Calories: 962, Protein: 32.7g, Carbs: 142g, Fat: 33.3g, Fibre: 15.2g, Sugar: 51.8g'
const immutable = JSON.stringify(total)
const fixed = context.sync(old, total)
assert.equal(fixed, description + '\n\n' + expected, 'actual production885 versus962 discrepancy must be corrected')
assert.equal(context.sync(fixed, total), fixed, 'repeated formatting is stable')
assert.equal(JSON.stringify(total), immutable)
for (const line of ['**Calories:** 885 kcal, **Protein:** 33 g, **Carbs:** 122 g, **Fat:** 33 g', 'Calories: unknown, Protein: unknown, Carbs: unknown, Fat: unknown', 'Total Calories: 885; Protein: 33g; Carbs: 122g; Fat: 33g', 'Calories: 885, Protein: 33g, Carbs: 122g, Fat: 33g, Fiber: unknown, Sugar: 51g']) {
  assert.equal(context.sync(line, total), expected, line)
}
const ingredientText = 'Eggs: Calories: 250, Protein: 19g, Carbs: 3g, Fat: 18g\nA label states Calories: 885 per100g. Check your portion.'
assert.equal(context.sync(ingredientText, total), ingredientText + '\n\n' + expected, 'do not rewrite ingredient descriptions or label numbers')
const unknown = context.sync(old, { calories: null, protein_g: null, carbs_g: '', fat_g: undefined, fiber_g: null, sugar_g: NaN })
assert.ok(unknown.endsWith('Calories: unknown, Protein: unknown, Carbs: unknown, Fat: unknown, Fibre: unknown, Sugar: unknown'))
assert.ok(context.sync(old, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }).endsWith('Calories: 0, Protein: 0g, Carbs: 0g, Fat: 0g, Fibre: 0g, Sugar: 0g'))
assert.equal(context.sync(old, null), old, 'no final total cannot invent nutrition')
assert.ok(context.sync(old, { ...total, calories: 962.49, protein_g: 16.05 }).includes('Calories: 962, Protein: 16.1g'), 'presentation rounding matches cards without changing source numbers')
const finalProcessing = routeText.lastIndexOf('resp.total = computeTotalsFromItems(resp.items) || resp.total;')
const syncPosition = routeText.indexOf('resp.analysis = synchronizeAnalysisNutritionSummary(resp.analysis, resp.total);')
assert.ok(syncPosition > finalProcessing && syncPosition < routeText.indexOf('const finalSummary ='), 'synchronize after all final item processing')
console.log('PASS: actual final response summary matches canonical totals; estimates/descriptions, unknown/zero, decimal display and immutable values preserved.')
