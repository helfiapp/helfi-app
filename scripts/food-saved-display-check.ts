import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'

// Execute actual saved-ingredient calculations and card JSX. No server, data
// writes, credentials or provider calls; --baseline reproduces the old result.
const path = 'app/food/page.tsx'
const baseline = process.argv.includes('--baseline')
const source = ts.createSourceFile(path, baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declarations = new Map<string, ts.VariableDeclaration>()
let cardMap: ts.CallExpression | undefined
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(source), node)
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'ITEM_NUTRIENT_META.map' && node.getText(source).includes('totalsByField')) cardMap = node
  ts.forEachChild(node, visit)
}
visit(source)
const context = vm.createContext({ React: { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }) }, index: 0, energyUnit: 'kcal' })
function evaluate(code: string) {
  return vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }), context)
}
function actual(name: string) {
  const node = declarations.get(name)
  assert.ok(node?.initializer, `Actual ${name} exists`)
  return evaluate(`(${node.initializer.getText(source)})`)
}
context.formatMacroValue = actual('formatMacroValue')
context.KCAL_TO_KJ = 4.184
context.formatEnergyNumber = actual('formatEnergyNumber')
context.ITEM_NUTRIENT_META = actual('ITEM_NUTRIENT_META')
assert.ok(cardMap, 'Actual six-card saved ingredient map exists')
function textOf(node: any): string {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object') return textOf(node.children)
  return String(node)
}
function render(value: number | null, count: number, multiplier = 1) {
  Object.assign(context, { baseProtein: value, baseCarbs: value, baseFat: value, baseFiber: value, baseSugar: value, effectiveCaloriesPerServing: 127.2, servingsCount: count, macroMultiplier: multiplier })
  for (const name of ['totalCalories', 'totalProtein', 'totalCarbs', 'totalFat', 'totalFiber', 'totalSugar', 'totalsByField']) context[name] = actual(name)
  return evaluate(`(${cardMap!.getText(source)})`)
}
const before = JSON.stringify({ base: 10.7, count: 1.5 })
let cards = render(10.7, 1.5)
assert.equal(cards.length, 6)
assert.ok(textOf(cards[3]).includes('16.1g'), 'Actual reopened30g fat card must match original10.7g x1.5 and preview16.1g')
if (baseline) throw new Error('Baseline did not reproduce saved-card rounding mismatch')
assert.equal(context.totalFat, 10.7 * 1.5, 'Keep source multiplication precise until display')
assert.equal(before, JSON.stringify({ base: context.baseFat, count: context.servingsCount }), 'Rendering preserves original source/count')
for (const [base, count, expected] of [[10.7, 1.5, '16.1g'], [4.9, 1.5, '7.4g'], [1.01, 1, '1g'], [10.6999, 1.5, '16g'], [10.7001, 1.5, '16.1g'], [0, 1, '0g'], [0.1, .5, '0.1g']] as const) {
  cards = render(base, count)
  assert.equal(cards.length, 6)
  for (const card of cards.slice(1)) assert.ok(textOf(card).includes(expected), `Actual card ${base} x${count}: ${expected}`)
  assert.ok(cards.every((card: any) => card.props.className.includes('rounded-2xl') && card.props.className.includes('border')), 'Keep actual colorful card layout')
}
cards = render(null, 1)
assert.ok(cards.slice(1).every((card: any) => textOf(card).includes('Missing')), 'Missing stays unavailable in all five macro cards')
for (const value of [null, undefined, NaN, Infinity]) assert.equal(context.formatMacroValue(value, 'g'), '—')
assert.equal(context.formatMacroValue(190.8, ''), '191', 'Whole kcal behavior unchanged')
context.energyUnit = 'kJ'
assert.ok(textOf(render(10.7, 1.5)[0]).includes('798'), 'Existing kcal/kJ toggle preserved')
console.log('PASS actual saved-ingredient source precision, decimal ties, below/above boundaries, all6cards, missing/zero and energy toggle; no network/data writes')
