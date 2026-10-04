import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'
const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const wanted = new Set(['recalculateNutritionFromItems', 'effectiveServings', 'macroMultiplierForItem', 'piecesMultiplierForServing'])
const declarations: string[] = []
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && wanted.has(node.name.text)) declarations.push(`const ${node.getText(source)};`)
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'sanitizeNutritionTotals') declarations.push(node.getText(source))
  ts.forEachChild(node, visit)
}
visit(source)
const context: any = { foodNumberOrNull }
vm.createContext(context)
vm.runInContext(ts.transpileModule(declarations.join('\n')+'\nthis.recalculateNutritionFromItems = recalculateNutritionFromItems;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const totals = context.recalculateNutritionFromItems([{ calories: 0, protein_g: 1, carbs_g: 0, fat_g: 0, servings: 2 }])
assert.equal(totals.calories, 0)
assert.equal(totals.protein, 2)
assert.equal(context.recalculateNutritionFromItems([{ calories: null, protein_g: 1, carbs_g: 0, fat_g: 0, servings: 2 }]).calories, 8)
const zero = context.sanitizeNutritionTotals({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 })
assert.equal(zero.fiber, 0); assert.equal(zero.sugar, 0)
assert.equal(context.sanitizeNutritionTotals({ calories: null, protein: null, carbs: null, fat: null, fiber: null, sugar: null }), null)
console.log('PASS: actual web totals retain declared zero calories, distinguish missing energy, and preserve known zero fibre/sugar.')
