import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import * as measurements from '../lib/food/serving-measurements'
import { DRY_FOOD_MEASUREMENTS } from '../lib/food/dry-food-measurements'
import { PRODUCE_MEASUREMENTS } from '../lib/food/produce-measurements'
import { DAIRY_SEMI_SOLID_MEASUREMENTS } from '../lib/food/dairy-semi-solid-measurements'

// Execute the real component and its actual input/dropdown handlers with a
// minimal hook harness. This is calculation evidence, not a live UI pass.
const path = 'components/food/RecommendedIngredientCard.tsx'
const baseline = process.argv.includes('--baseline')
const source = ts.createSourceFile(path, baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let slots: any[] = [], dependencies: any[][] = [], effects: (() => void)[] = [], cursor = 0, effectCursor = 0, changed = false
const context = vm.createContext({
  ...measurements, DRY_FOOD_MEASUREMENTS, PRODUCE_MEASUREMENTS, DAIRY_SEMI_SOLID_MEASUREMENTS,
  NutrientCards: 'NutrientCards',
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children: children.flat() }),
  useMemo: (fn: any) => fn(),
  useState: (initial: any) => {
    const position = cursor++
    if (!(position in slots)) slots[position] = typeof initial === 'function' ? initial() : initial
    return [slots[position], (value: any) => { const next = typeof value === 'function' ? value(slots[position]) : value; if (!Object.is(next, slots[position])) changed = true; slots[position] = next }]
  },
  useEffect: (fn: any, deps: any[]) => {
    const position = effectCursor++, previous = dependencies[position]
    if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) effects.push(fn)
    dependencies[position] = deps
  },
})
const code = source.statements.filter(node => !ts.isImportDeclaration(node) && !(ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression))).map(node => node.getText(source).replace(/^export default /, '')).join('\n')
vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: 'createElement' }), context)
const component = vm.runInContext('RecommendedIngredientCard', context)
function nodes(tree: any, type: string): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [...(tree.type === type ? [tree] : []), ...(tree.children || []).flatMap((child: any) => nodes(child, type))]
}
const close = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-10, `${value} must equal ${expected}`)
function harness(original: any, country = 'AU') {
  slots = []; dependencies = []
  let item = { ...original }, callbacks = 0, tree: any
  const render = () => {
    for (let pass = 0; pass < 8; pass++) {
      cursor = 0; effectCursor = 0; effects = []; changed = false
      tree = component({ item, index: 2, country, onServingsChange: (index: number, next: number) => { assert.equal(index, 2); callbacks++; item = { ...item, servings: next } } })
      effects.forEach(fn => fn())
      if (!changed) return tree
    }
    throw new Error('Component effects did not settle')
  }
  render(); nodes(tree, 'button')[0].props.onClick(); render()
  return {
    render, item: () => item, callbacks: () => callbacks,
    input: () => nodes(tree, 'input')[0].props.value,
    units: () => nodes(tree, 'option').map(option => option.props.value),
    labels: () => nodes(tree, 'option').map(option => option.children.join('')),
    cards: () => nodes(tree, 'NutrientCards')[0].props.values,
    amount: (raw: string) => { nodes(tree, 'input')[0].props.onChange({ target: { value: raw } }); render() },
    unit: (unit: string) => { nodes(tree, 'select')[0].props.onChange({ target: { value: unit } }); render() },
    country: (next: string) => { country = next; render() },
  }
}
const oil = { id: '171413', source: 'usda', name: 'Olive oil', serving_size: '100 ml', servings: 1, calories: 813.2800000000001, protein_g: 0, carbs_g: 0, fat_g: 92, fiber_g: null, sugar_g: 0 }
let view = harness(oil)
view.unit('g'); close(Number(view.input()), 92)
if (baseline) throw new Error('The baseline unexpectedly passed oil density; review the reproduction')
const original = JSON.stringify(oil)
assert.equal(view.callbacks(), 0, 'Unit changes conserve the committed count without rounded callbacks')
view.amount('100'); close(view.item().servings, 100 / 92); assert.equal(view.cards().calories, 884)
view.unit('ml'); close(Number(view.input()), 100 / .92)
assert.equal(view.cards().fiber, null); assert.equal(view.cards().sugar, 0)
assert.equal(Object.keys(view.cards()).length, 6)
assert.equal(view.item().id, oil.id); assert.equal(view.item().source, oil.source); assert.equal(view.item().calories, oil.calories)
assert.equal(JSON.stringify(oil), original, 'Original recommendation is never mutated')
for (const [country, unit, amount] of [['AU','tbsp',20],['AU','quarter-cup',62.5],['AU','cup',250],['US','tbsp',15],['US','cup',240]] as const) {
  view = harness(oil, country); view.unit(unit); view.amount('1'); close(view.item().servings, amount / 100)
  view.unit('ml'); close(Number(view.input()), amount)
}
view = harness(oil, 'US'); view.unit('cup'); view.country('AU'); close(Number(view.input()), .4); close(view.item().servings, 1)
for (let repeat = 0; repeat < 10; repeat++) { view.unit('oz'); view.unit('fl oz'); view.unit('cup'); view.unit('g'); view.unit('ml') }
close(view.item().servings, 1); assert.equal(view.callbacks(), 0, 'Repeated display conversions must not accumulate precision loss')
for (const serving_size of ['1 tsp', '1 cup', '2 tbsp', '1 serving', '2 large eggs', 'unknown']) {
  view = harness({ ...oil, serving_size, servings: .5 })
  assert.deepEqual(view.units(), ['serving']); close(Number(view.input()), .5)
  view.amount('2'); close(view.item().servings, 2); assert.equal(view.cards().calories, 1627)
  view.unit('g'); assert.deepEqual(view.units(), ['serving']); close(view.item().servings, 2)
}
view = harness({ ...oil, name: 'Apple juice diluted with water', serving_size: '100 g' })
assert.ok(!view.units().includes('ml')); assert.ok(!view.units().includes('cup'), 'Unknown density cannot invent a household weight')
view.unit('ml'); close(Number(view.input()), 100)
const provider = { ...oil, name: 'Apple juice diluted with water', serving_size: '100 g', servingOptions: [{ label: '1 cup — 239g', grams: 239 }, { label: '1 tbsp — 13.5g', grams: 13.5 }] }
view = harness(provider); assert.ok(view.labels().includes('cup — 239 g')); assert.ok(view.labels().includes('tbsp — 13.5 g'))
view.unit('cup'); view.amount('.5'); close(view.item().servings, 1.195)
view.unit('g'); close(Number(view.input()), 119.5)
for (const serving_size of ['100 g (3.53 oz)', '3.53 oz (100 g)', '100 ml (3.38 fl oz)', '3.38 fl oz (100 ml)']) {
  view = harness({ ...oil, serving_size }); close(Number(view.input()), 100)
}
view = harness({ ...oil, serving_size: '1 fl oz' }); view.unit('ml'); close(Number(view.input()), 29.5735295625)
view = harness({ ...oil, name: 'Egg, whole', serving_size: '100 g' }); assert.ok(view.units().includes('egg-large')); assert.ok(!view.units().includes('cup'))
view = harness({ ...oil, name: 'Banana', serving_size: '100 g' }); assert.ok(view.units().includes('piece-medium'))
for (const raw of ['', ' ', '-1', 'NaN', 'Infinity']) { view = harness(oil); view.amount(raw); close(view.item().servings, 1); assert.equal(view.callbacks(), 0) }
view = harness(oil); view.amount('0'); close(view.item().servings, 0); assert.equal(view.cards().calories, 0)
view = harness({ ...oil, calories: 0, fat_g: 0, fiber_g: 0 }); assert.ok(Object.values(view.cards()).every(value => value === 0), 'Genuine zero nutrients remain zero')
const parent = fs.readFileSync('app/food/recommended/RecommendedMealClient.tsx', 'utf8')
assert.match(parent, /const userCountry = String\(userData\?\.country \|\| ''\)\.trim\(\)/)
assert.match(parent, /country=\{userCountry\}/)
console.log('PASS: real recommended component/hooks/amount/dropdown handlers conserve precise portions, recorded provider choices and AU/non-AU measures; unknown portions remain count-only, optional null/true-zero six cards survive; no network or credentials. Live UI evidence is separate.')
