import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { hasSameDiaryNutrientContent, hasSameDiaryEntryTime } from '../lib/food/diary-entry-comparison'

// Exercise the real page refresh guard without importing app/server dependencies.
const page = fs.readFileSync('app/food/page.tsx', 'utf8')
const source = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let guard = ''
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'hasSameEntryMembers' && node.initializer) {
    guard = node.initializer.getText(source)
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(guard)
const context = vm.createContext({ hasSameDiaryNutrientContent, hasSameDiaryEntryTime, entryIdentityKey: (entry: any) => entry.clientId ? `client:${entry.clientId}` : entry.dbId ? `db:${entry.dbId}` : entry.id != null ? `id:${entry.id}` : '' })
const check = vm.runInContext(ts.transpile(`(${guard})`, { target: ts.ScriptTarget.ES2020 }), context)
const before = { id: 7, clientId: 'saved-food', dbId: 'persisted', nutrition: { calories: 127, sugar: 0.8 }, total: { calories: 127 }, items: [{ calories: 127.2, servings: 1, sugar_g: 0.8 }] }
const after = { ...before, nutrition: { calories: 636, sugar: 4 }, total: { calories: 636 }, items: [{ calories: 127.2, servings: 5, sugar_g: 0.8 }] }
const original = JSON.stringify(before)
assert.equal(check([before], [after]), false, 'same IDs must accept updated server nutrients')
assert.equal(check([before], [structuredClone(before)]), true)
assert.equal(check([before], [{ ...before, nutrition: { sugar: 0.8, calories: 127 } }]), true, 'property order is immaterial')
assert.equal(check([before], [{ ...before, items: [{ ...before.items[0], servings: 2 }] }]), false)
assert.equal(check([before], [{ ...before, nutrition: { ...before.nutrition, sugar: null } }]), false)
assert.equal(check([before], [{ ...before, nutrition: { ...before.nutrition, sugar: 0 } }]), false)
assert.equal(check([before], [{ ...before, clientId: 'different' }]), false)
assert.equal(check([before, before], [before, before]), false, 'duplicate identity guard remains')
assert.equal(check([{ ...before, dbId: undefined }], [before]), false, 'new DB links still update')
assert.equal(check([before], []), false)
const savedTime = { ...before, createdAt: '2026-10-05T03:22:00.000Z', time: '02:22 pm', localDate: '2026-10-05' }
assert.equal(check([savedTime], [{ ...savedTime, createdAt: '2026-10-05T03:26:00.000Z', time: '02:26 pm' }]), false, 'same IDs and nutrients must accept updated saved time')
assert.equal(check([savedTime], [{ ...savedTime, createdAt: '2026-10-05T03:22:10.000Z' }]), false, 'sub-minute saved time changes still replace cache')
assert.equal(check([savedTime], [{ ...savedTime, time: '02:23 pm' }]), false, 'displayed clock metadata must refresh')
assert.equal(check([savedTime], [{ ...savedTime, localDate: '2026-10-04' }]), false, 'saved date metadata must refresh')
assert.equal(check([savedTime], [structuredClone(savedTime)]), true, 'unchanged saved metadata does not remount summary')
assert.equal(JSON.stringify(before), original, 'comparison never mutates a local entry')

// Evaluate the actual native persisted-item expression with precise serving values.
const native = fs.readFileSync('native/src/screens/AddIngredientScreen.tsx', 'utf8')
const nativeSource = ts.createSourceFile('native.tsx', native, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let item = ''
const findItem = (node: ts.Node) => {
  if (ts.isObjectLiteralExpression(node) && node.getText(nativeSource).startsWith('{\n              ...adjustItem,')) item = node.getText(nativeSource)
  ts.forEachChild(node, findItem)
}
findItem(nativeSource)
assert.ok(item, 'saved native ingredient expression exists')
const stored = vm.runInNewContext(ts.transpile(`(${item})`, { target: ts.ScriptTarget.ES2020 }), {
  adjustItem: {}, title: 'Peanut butter', servingText: 'Serving — 20g', servings: 1,
  caloriesBase: 127.2, proteinBase: 5.4, carbsBase: 2, fatBase: 10.7, fiberBase: null, sugarBase: 0.8,
})
assert.equal(stored.calories * 5, 636, 'native save retains precise base for later 100g portion')
assert.equal(stored.sugar_g * 5, 4)
assert.equal(stored.fiber_g, null)
console.log('PASS: actual web refresh guard accepts saved nutrient/portion changes, retains identity safeguards; native saves preserve original nutrient precision.')
