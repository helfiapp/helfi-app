import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as nutrients from '../native/src/lib/nutrientValues'

// Run the actual saved meal sum, summary labels and responsive six-card
// component. Synthetic render width only; no network, credentials or writes.
const baseline = process.argv.includes('--baseline')
function source(path: string) {
  const text = baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : fs.readFileSync(path, 'utf8')
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
const screen = source('native/src/screens/TrackCaloriesScreen.tsx')
const cardsSource = source('native/src/components/NutrientCards.tsx')
let width = 369
const context = vm.createContext({ ...nutrients, Text: 'Text', View: 'View', useState: () => [width, () => {}], React: { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }) } })
function evaluate(text: string) {
  return vm.runInContext(ts.transpile(text, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), context)
}
let summaryLabels: ts.ArrayLiteralExpression | undefined
let inputValue: ts.Expression | undefined
function bind(name: string) {
  let found: ts.FunctionDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    if (ts.isArrayLiteralExpression(node) && node.getText(screen).includes('formatNutrientGrams(favoriteEditTotals.fat)')) summaryLabels = node
    if (ts.isJsxAttribute(node) && node.name.getText(screen) === 'value' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(screen).includes("total == null ? '' : key === 'calories'")) inputValue = node.initializer.expression
    ts.forEachChild(node, visit)
  }
  visit(screen)
  assert.ok(found, `Actual ${name} exists`)
  evaluate(found.getText(screen))
}
bind('formatNutrientGrams')
bind('calculateFavoriteAdjustTotals')
assert.ok(summaryLabels, 'Actual meal summary labels exist')
assert.ok(inputValue, 'Actual ingredient nutrient field value exists')
evaluate(cardsSource.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(cardsSource).replace(/^export /, '')).join('\n'))
const item = { id: '2317111', name: 'Sanitarium Crunchy Peanut Butter 500g', servingLabel: 'Serving — 20g', servings: 1.5, calories: 127.2, protein: 5.4, carbs: 2, fat: 10.7, fiber: 1.2, sugar: .8 }
const original = JSON.stringify(item)
context.favoriteEditTotals = context.calculateFavoriteAdjustTotals([item])
const labels = evaluate(`(${summaryLabels.getText(screen)})`)
assert.equal(labels.length, 6)
assert.equal(labels[3], '16.1 g fat', 'Actual reopened summary must agree with the30g preview and precise saved16.05')
if (baseline) throw new Error('Baseline did not reproduce the native rounding mismatch')
assert.equal(context.favoriteEditTotals.fat, item.fat * item.servings, 'Keep precise original source multiplication')
context.total = context.favoriteEditTotals.fat
context.key = 'fat'
assert.equal(evaluate(`(${inputValue.getText(screen)})`), '16.1', 'Actual editable field agrees with summary and colorful card')
assert.equal(JSON.stringify(item), original, 'Rendering does not rewrite original source metadata')
for (const renderWidth of [0, 369, 1024]) {
  width = renderWidth
  const tree = context.NutrientCards({ values: context.favoriteEditTotals })
  const cards = tree.children[0]
  assert.equal(cards.length, 6)
  assert.equal(cards[3].props.accessibilityLabel, 'Fat: 16.1 g')
  assert.equal(cards[0].props.accessibilityLabel, 'Calories: 191 kcal')
  assert.equal(new Set(cards.map((card: any) => card.props.style.backgroundColor)).size, 6, 'All six colors retained')
  assert.ok(cards.every((card: any) => card.props.style.width === (width ? (width - (width >= 600 ? 20 : 10)) / (width >= 600 ? 3 : 2) : '47%')), 'Original phone/tablet responsive grid retained')
}
for (const [value, expected] of [[10.7 * 1.5, '16.1'], [4.9 * 1.5, '7.4'], [10.6999 * 1.5, '16'], [10.7001 * 1.5, '16.1'], [0, '0'], [.05, '0.1'], [null, '—'], [undefined, '—'], [NaN, '—'], [Infinity, '—']] as const) {
  const values = { calories: 190.8, protein: value, carbs: value, fat: value, fiber: value, sugar: value }
  const before = JSON.stringify(values)
  const cards = context.NutrientCards({ values }).children[0]
  assert.equal(context.formatNutrientGrams(value), expected)
  context.total = value
  context.key = 'fat'
  if (value == null || Number.isFinite(value)) assert.equal(evaluate(`(${inputValue.getText(screen)})`), value == null ? '' : expected)
  for (const card of cards.slice(1)) assert.ok(card.props.accessibilityLabel.endsWith(expected === '—' ? expected : `${expected} g`))
  assert.equal(JSON.stringify(values), before)
}
const energy = context.NutrientCards({ values: context.favoriteEditTotals, energyUnit: 'kj' }).children[0]
assert.equal(energy[0].props.accessibilityLabel, 'Kilojoules: 798 kJ')
console.log('PASS actual native meal sum/summary/six-color cards: precise source preserved, decimal ties and boundaries, missing/zero, kcal/kJ, phone/tablet layout; no network or writes')
