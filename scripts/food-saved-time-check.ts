import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Run the real root editor's timestamp calculation without React, credentials,
// a database, network requests, or persistence.
const source = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let calculation = ''
const findCalculation = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'updateFoodEntry' && node.initializer && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
    const statements = node.initializer.body.statements
    const start = statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'newCreatedAt'))
    const end = statements.findIndex((statement, index) => index > start && ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'meta'))
    assert.ok(start >= 0 && end > start, 'actual saved timestamp calculation exists before metadata/persistence')
    calculation = statements.slice(start, end).map(statement => statement.getText(source)).join('\n')
  }
  ts.forEachChild(node, findCalculation)
}
findCalculation(source)
assert.ok(calculation, 'actual updateFoodEntry calculation extracted')
const code = ts.transpile(`(() => { ${calculation}; return newCreatedAt })()`, { target: ts.ScriptTarget.ES2020 })
const context = vm.createContext({})
const originalZone = process.env.TZ
let checks = 0
try {
  for (const zone of ['Australia/Melbourne', 'America/Los_Angeles', 'UTC']) {
    process.env.TZ = zone
    for (const timestamp of ['2026-10-05T02:54:21.987Z', '2026-10-04T01:30:12.456Z', '2026-04-04T15:30:59.999Z', '2026-10-04T23:30:39.624Z', '2026-10-05T13:54:21.987+11:00']) {
      const originalDate = new Date(timestamp)
      const clock = `${String(originalDate.getHours()).padStart(2, '0')}:${String(originalDate.getMinutes()).padStart(2, '0')}`
      const entry = { createdAt: timestamp, localDate: '2026-10-05', description: 'Original saved title' }
      const before = JSON.stringify(entry)
      context.editingEntry = entry; context.entryTime = clock; context.selectedDate = '2026-10-06'
      assert.equal(vm.runInContext(code, context), timestamp, `${zone}: untouched clock must retain original exact timestamp and original string`)
      assert.equal(JSON.stringify(entry), before, 'timestamp calculation cannot mutate original row')
      context.entryTime = '09:17'
      assert.equal(vm.runInContext(code, context), new Date(2026, 9, 5, 9, 17, 0, 0).toISOString(), `${zone}: changed clock remains anchored to entry localDate`)
      context.editingEntry = { ...entry, localDate: '' }
      assert.equal(vm.runInContext(code, context), new Date(2026, 9, 6, 9, 17, 0, 0).toISOString(), 'changed clock without entry date retains selected-date fallback')
      context.editingEntry = entry; context.entryTime = ''
      assert.equal(vm.runInContext(code, context), timestamp, 'empty clock retains original timestamp')
      checks += 4
    }
    for (const createdAt of [undefined, null, '', 'invalid timestamp']) {
      context.editingEntry = { createdAt, localDate: '2026-10-05' }; context.entryTime = '00:00'
      assert.equal(vm.runInContext(code, context), new Date(2026, 9, 5, 0, 0, 0, 0).toISOString(), 'missing original cannot masquerade as an unchanged epoch clock')
      context.editingEntry = { createdAt, localDate: '2026-10-05' }; context.entryTime = '09:17'; context.selectedDate = '2026-10-06'
      assert.equal(vm.runInContext(code, context), new Date(2026, 9, 5, 9, 17, 0, 0).toISOString(), 'valid chosen clock for missing/invalid original retains existing behavior')
      context.entryTime = ''
      assert.equal(vm.runInContext(code, context), createdAt, 'empty clock cannot invent a replacement original timestamp')
      checks += 3
    }
  }
} finally {
  if (originalZone === undefined) delete process.env.TZ
  else process.env.TZ = originalZone
}
console.log(`PASS: ${checks} actual root editor timestamp checks; unchanged clock retains exact original timestamp, explicit clock edits retain entry-date/timezone behavior; no credentials or network.`)
