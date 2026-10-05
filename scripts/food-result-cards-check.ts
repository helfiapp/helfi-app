import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Render the actual common result JSX and actual card component, without app state,
// authentication, uploads, writes or model requests.
const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let actual: ts.Node | null = null
const visit = (node: ts.Node) => {
  if (ts.isJsxExpression(node) && node.getText(source).includes('data-testid="food-result-nutrient-cards"')) {
    if (!actual || node.getWidth(source) < actual.getWidth(source)) actual = node
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(actual, 'The shared overall food-result area must always render the nutrient-card block')
const expression = (actual as ts.Node).getText(source).slice(1, -1)
assert.ok(!/editingEntry|photoPreview|lg:hidden|sm:hidden/.test(expression), 'cards cannot depend on an editing/photo branch or be hidden on a viewport')
const componentModule = { exports: {} as any }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/food/NutrientCards.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { module: componentModule, exports: componentModule.exports, require: (id: string) => {
    if (id === 'react/jsx-runtime') return require(id)
    throw Error(`Unexpected card dependency ${id}`)
  } })
const NutrientCards = componentModule.exports.default
const known = { calories: 781, protein: 31, carbs: 108, fat: 27, fiber: 13, sugar: 21 }
let checked = 0
for (const editingEntry of [null, { id: 'saved-entry' }]) {
  for (const photoPreview of [null, 'photo.jpg']) {
    for (const energyUnit of ['kcal', 'kJ']) {
      for (const analyzedNutrition of [known, { ...known, fiber: null, sugar: null }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, null]) {
        const analyzedItems = [{ name: 'Food with unknown nutrition' }]
        const before = JSON.stringify({ analyzedNutrition, analyzedItems })
        const ctx: any = { React, NutrientCards, analyzedNutrition, analyzedItems, editingEntry, photoPreview, energyUnit }
        const jsx = ts.transpileModule(`result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
        vm.runInNewContext(jsx, ctx)
        const html = renderToStaticMarkup(ctx.result)
        assert.equal((html.match(/aria-label="(?:Calories|Kilojoules|Protein|Carbs|Fat|Fibre|Sugar):/g) || []).length, 6, 'all six nutrient cards remain visible')
        for (const color of ['orange', 'blue', 'green', 'purple', 'yellow', 'pink']) assert.ok(html.includes(`from-${color}-50`), color)
        for (const label of [energyUnit === 'kJ' ? 'Kilojoules' : 'Calories', 'Protein', 'Carbs', 'Fat', 'Fibre', 'Sugar']) assert.ok(html.includes(`aria-label="${label}:`), label)
        if (!analyzedNutrition) assert.equal((html.match(/: —/g) || []).length, 6)
        else {
          const expectedEnergy = Math.round(analyzedNutrition.calories * (energyUnit === 'kJ' ? 4.184 : 1))
          assert.ok(html.includes(`: ${expectedEnergy} ${energyUnit}`))
          if (analyzedNutrition.fiber === null) assert.ok(html.includes('Fibre: —'))
          if (analyzedNutrition.fiber === 0) assert.ok(html.includes('Fibre: 0 g'))
          if (analyzedNutrition.sugar === null) assert.ok(html.includes('Sugar: —'))
          if (analyzedNutrition.sugar === 0) assert.ok(html.includes('Sugar: 0 g'))
        }
        assert.equal(JSON.stringify({ analyzedNutrition, analyzedItems }), before, 'rendering cannot modify source amounts/nutrition')
        checked++
      }
    }
  }
}
const emptyCtx: any = { React, NutrientCards, analyzedNutrition: null, analyzedItems: [], energyUnit: 'kcal' }
vm.runInNewContext(ts.transpileModule(`result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText, emptyCtx)
assert.ok(!emptyCtx.result, 'no empty result block before any analysis exists')
console.log(`PASS: ${checked} actual overall-result/card renders retain six colours on photo/saved/desktop/mobile branches, unknown/zero values and both energy units without changing nutrition.`)
