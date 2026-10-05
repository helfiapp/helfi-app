import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as nutrients from '../lib/food/nutrient-values'

// Actual preview parent and actual summary JSX, isolated from React state,
// authentication, providers, database writes and network traffic.
const baseline = process.argv.includes('--baseline')
const read = (file: string) => baseline ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) : fs.readFileSync(file, 'utf8')
const file = 'app/food/page.tsx'
const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let actual = ''
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'computeOverallMacrosAfterAddingFavorite' && node.initializer) actual = `(${node.initializer.getText(source)})`
  ts.forEachChild(node, visit)
}
visit(source); assert.ok(actual)
const targets = { calories: 2000, protein: 100, carbs: 200, fat: 80, fiber: 30, sugarMax: 40 }
const ctx = vm.createContext({ ...nutrients, dailyTargets: targets, effectiveExerciseCaloriesKcal: 0,
  sourceEntries: [], getEntryTotals: (entry: any) => entry.nutrition })
const preview = vm.runInContext(ts.transpile(actual, { target: ts.ScriptTarget.ES2020 }), ctx)
const componentModule = { exports: {} as any }
const component = 'components/food/DailyMacroSummary.tsx'
vm.runInNewContext(ts.transpileModule(read(component), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { module: componentModule, exports: componentModule.exports, require: (id: string) => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id)
    if (id === '@/lib/food/nutrient-values') return nutrients
    throw Error(`Unexpected component dependency ${id}`)
  } })
const Summary = componentModule.exports.default
const failures: string[] = []
let checked = 0
const check = (label: string, run: () => void) => { checked++; try { run() } catch (error) { failures.push(`${label}: ${(error as Error).message}`) } }
const known = { calories: 88, protein: 5.88, carbs: 11.76, fat: 0, fiber: 0, sugar: 11.76 }
const markup = (used: any) => renderToStaticMarkup(React.createElement(Summary, { targets: { calories: 2000, protein_g: 100, carbs_g: 200, fat_g: 80, fiber_g: 30, sugar_g: 40 }, used }))
const rowMarkup = (html: string, label: string) => {
  const start = html.indexOf(`<span>${label}</span>`)
  assert.ok(start >= 0, `${label} row is retained`)
  const rest = html.slice(start); const end = rest.indexOf('<div class="space-y-1">')
  return end < 0 ? rest : rest.slice(0, end)
}
for (const field of ['fiber', 'sugar']) {
  for (const unknown of [null, undefined, '', ' ', false, NaN, -1]) {
    for (const location of ['day', 'newMeal']) {
      check(`${field} ${String(unknown)} unknown in ${location}`, () => {
        const day = location === 'day' ? { ...known, [field]: unknown } : known
        const meal = location === 'newMeal' ? { ...known, [field]: unknown } : known
        ctx.sourceEntries = [{ nutrition: day }, { nutrition: known }]
        const result = preview(meal)
        assert.equal(result.overallUsed[`${field}_g`], null, 'A partial total cannot appear complete')
        const row = rowMarkup(markup(result.overallUsed), field === 'fiber' ? 'Fibre' : 'Sugar (max)')
        assert.ok(row.includes('Incomplete data'))
        assert.ok(row.includes('—'))
        assert.ok(!row.includes('g left') && !/>\d+%</.test(row), 'Unknown totals have no remaining amount or percentage')
        assert.ok(row.includes('width:0%'), 'Unknown progress must not imply a complete measured total')
      })
    }
  }
  check(`Standalone actual component ${field} unknown`, () => {
    const row = rowMarkup(markup({ calories: 88, protein_g: 5.88, carbs_g: 11.76, fat_g: 0, fiber_g: 0, sugar_g: 11.76, [`${field}_g`]: null }), field === 'fiber' ? 'Fibre' : 'Sugar (max)')
    assert.ok(row.includes('Incomplete data')); assert.ok(row.includes('—'))
    assert.ok(!row.includes('g left') && !/>\d+%</.test(row))
  })
}
check('Empty diary and genuine zero', () => {
  ctx.sourceEntries = []
  const result = preview({ ...known, fiber: 0, sugar: 0 })
  assert.equal(result.overallUsed.fiber_g, 0); assert.equal(result.overallUsed.sugar_g, 0)
  for (const label of ['Fibre', 'Sugar (max)']) {
    const row = rowMarkup(markup(result.overallUsed), label)
    assert.ok(!row.includes('Incomplete data')); assert.ok(row.includes('>0%</div>')); assert.ok(row.includes('g left'))
  }
})
check('Known totals retain original precision, targets and source records', () => {
  ctx.sourceEntries = [{ nutrition: known }]
  const before = JSON.stringify({ entries: ctx.sourceEntries, known, targets })
  const result = preview(known)
  assert.equal(result.overallUsed.calories, 176)
  assert.equal(result.overallUsed.protein_g, 11.76)
  assert.equal(result.overallUsed.sugar_g, 23.52)
  assert.equal(result.overallTargets.calories, targets.calories)
  assert.equal(result.overallTargets.fiber_g, targets.fiber)
  assert.equal(result.overallTargets.sugar_g, targets.sugarMax)
  assert.equal(JSON.stringify({ entries: ctx.sourceEntries, known, targets }), before)
})
check('Existing exercise adjustment unchanged', () => {
  ctx.effectiveExerciseCaloriesKcal = 400
  const result = preview(known)
  assert.equal(result.overallTargets.calories, 2400)
  assert.equal(result.overallTargets.fiber_g, 30); assert.equal(result.overallTargets.sugar_g, 40)
  const macroEnergy = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9
  assert.ok(Math.abs(result.overallTargets.protein_g - (targets.protein + 400 * targets.protein / macroEnergy)) < 1e-9)
  ctx.effectiveExerciseCaloriesKcal = 0
})
assert.deepEqual(failures, [], `${failures.length}/${checked} actual preview/summary cases failed`)
console.log(`PASS: ${checked} actual parent/component preview cases preserve unknown fibre/sugar, genuine zero, known precision, targets/exercise and unchanged source records.`)
