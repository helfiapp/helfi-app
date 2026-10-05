import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { foodNumberOrNull } from '../lib/food/openfoodfacts'

// Render both actual result-chart branches without mounting the app or its services.
const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const expressions: string[] = []
const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node) && ts.isParenthesizedExpression(node.expression) && ts.isArrowFunction(node.expression.expression)) {
    const text = node.getText(source)
    if (text.includes('const macroSegments:') && text.includes('const caloriesValue =') && text.includes('formatMacroValue')) expressions.push(text)
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(expressions.length, 2, 'both desktop editing and common phone/photo chart branches must be exercised')
const formatter = source.statements.filter(ts.isVariableStatement).find(s => s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === 'formatMacroValue'))!
const MacroRing = ({ macros }: { macros: any[] }) => React.createElement('svg', { 'data-drawing': JSON.stringify(macros.map(m => ({ key: m.key, grams: m.grams }))) })
const known = { calories: 88, protein: 5.9, carbs: 11.8, fat: 0, fiber: 1.2, sugar: 11.8 }
const cases = [known, { ...known, fiber: null }, { ...known, sugar: undefined }, { ...known, calories: null }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, {}, { calories: NaN, protein: null, carbs: null, fat: null, fiber: null, sugar: null }]
let count = 0
for (const expression of expressions) for (const energyUnit of ['kcal', 'kJ']) for (const editingEntry of [null, { id: 'existing' }]) for (const analyzedNutrition of cases) {
  const before = JSON.stringify(analyzedNutrition)
  const context: any = { React, MacroRing, analyzedNutrition, energyUnit, editingEntry, foodNumberOrNull, setEnergyUnit: () => {} }
  vm.runInNewContext(ts.transpileModule(formatter.getText(source) + `\nresult = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText, context)
  const html = renderToStaticMarkup(context.result)
  for (const [field, label] of [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat'], ['fiber', 'Fibre'], ['sugar', 'Sugar']]) {
    const value = foodNumberOrNull((analyzedNutrition as any)[field])
    const expected = value === null ? '—' : `${Math.round(value * 10) / 10}g`
    assert.ok(html.includes(`${label} ${expected}`), `${label} must preserve missing versus zero in both actual chart branches`)
  }
  const energy = foodNumberOrNull(analyzedNutrition.calories)
  const expectedEnergy = energy === null ? '—' : String(Math.round(energy * (energyUnit === 'kJ' ? 4.184 : 1)))
  assert.ok(html.includes(`>${expectedEnergy}</div>`), 'unknown energy must not be displayed as a false zero')
  assert.equal(JSON.stringify(analyzedNutrition), before)
  assert.ok(html.includes('data-drawing='), 'existing ring still renders from its original drawing values')
  count++
}
console.log(`PASS: ${count} actual result-chart renders retain unknown labels, genuine zero, both energy units and original source/drawing values.`)
