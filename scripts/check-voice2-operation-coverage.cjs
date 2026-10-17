#!/usr/bin/env node
'use strict'
// This check deliberately fails release coverage while any manual operation
// lacks a real registered executor/continuing person workflow. --allow-gaps
// validates the inventory/proof only; it MUST NOT be used as a release gate.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'voice2-manual-operation-inventory.json'), 'utf8'))
const modules = new Map()
function load(name) {
  if (modules.has(name)) return modules.get(name)
  assert(['native-assistant-catalog', 'native-assistant-registry', 'native-assistant-domain-adapters', 'native-assistant-action-id'].includes(name))
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'lib', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; new Function('exports', 'require', source)(exports, id => { if (id === 'crypto') return crypto; if (id.startsWith('./native-assistant-')) return load(id.slice(2)); throw Error('Forbidden dependency ' + id) }); modules.set(name, exports); return exports
}
const never = async () => { throw Error('Coverage inspection must not invoke an app handler') }
function routeNames(relative, tag) {
  const ast = ts.createSourceFile(relative, fs.readFileSync(path.join(root, relative), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), names = []
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === tag) {
      const name = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'name')
      assert(name?.initializer && ts.isStringLiteral(name.initializer), 'New dynamic screen registration requires explicit coverage review')
      names.push(name.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast); return names
}
function checkInventory(snapshot = inventory, options = {}) {
  const operations = snapshot.operations, ids = new Set()
  assert(Array.isArray(operations) && operations.length > 0)
  for (const operation of operations) {
    assert(!ids.has(operation.id), 'Duplicate manual operation: ' + operation.id); ids.add(operation.id)
    assert(['read', 'write', 'paid', 'person'].includes(operation.kind)); assert(['existing', 'partial', 'missing'].includes(operation.readiness))
    assert(operation.handler && operation.sources.length, 'Missing normal operation evidence')
    for (const source of operation.sources) {
      const match = source.match(/^(.*):(\d+)$/); assert(match, 'Invalid source reference')
      const absolute = path.resolve(root, match[1]); assert(absolute.startsWith(root + path.sep), 'Source must belong to the real checkout')
      assert(Number(match[2]) > 0 && Number(match[2]) <= fs.readFileSync(absolute, 'utf8').split('\n').length, 'Source line no longer exists: ' + source)
    }
  }
  assert.equal(snapshot.counts.total, operations.length); assert.equal(snapshot.counts.domain, operations.filter(operation => operation.section !== 'navigation').length)
  for (const source of snapshot.sourceFiles) {
    const contents = options.sourceOverrides?.[source.path] ?? fs.readFileSync(path.join(root, source.path))
    assert.equal(crypto.createHash('sha256').update(contents).digest('hex'), source.sha256, 'Manual source changed; reconcile operation coverage: ' + source.path)
  }
  assert.deepEqual(routeNames('native/src/navigation/MainNavigator.tsx', 'Stack.Screen'), snapshot.routeInventory.stack, 'Reachable stack routes changed; register and test their actual operations')
  assert.deepEqual(routeNames('native/src/navigation/MainTabs.tsx', 'Tab.Screen'), snapshot.routeInventory.tabs, 'Reachable tabs changed; register and test their actual operations')
  const registry = load('native-assistant-catalog').createNativeAssistantCatalog({ authenticatedActor: never, foodRead: never, healthJournal: { create: never, read: never } })
  // These five operations prove the architecture locally. None is marked as
  // production-complete while transport/durable normal receipts are absent.
  const mappings = registry.coverage()
  for (const mapping of mappings) {
    assert(mapping.coverage?.manualIds.length && mapping.coverage.scope, 'Registry changes require explicit manual-operation coverage and evidence')
    for (const manual of mapping.coverage.manualIds) assert(ids.has(manual), 'Registry maps to an invented manual operation')
  }
  const proofs = mappings.filter(mapping => mapping.coverage.status === 'offline-proof').map(mapping => ({ registered: mapping.id, manual: mapping.coverage.manualIds, scope: mapping.coverage.scope }))
  const releaseMappings = mappings.filter(mapping => mapping.coverage.status === 'production')
  const gaps = operations.filter(operation => !releaseMappings.some(mapping => mapping.coverage.manualIds.includes(operation.id)))
  const core = require('./voice2-core-catalog.cjs').collectCoreCatalog()
  return { manualOperations: operations.length, domainOperations: snapshot.counts.domain, navigationEntries: snapshot.counts.navigation, sourceSnapshots: snapshot.sourceFiles.length, offlineRegisteredOperations: registry.ids().length, coreRegisteredOperations: core.ids.length, coreUnavailablePaidOperations: core.unavailablePaid, productionGeneralAssistantOperations: releaseMappings.length, releaseCoverageGaps: gaps.length, proofScopes: proofs }
}
function main() {
  const result = checkInventory()
  console.log(JSON.stringify(result, null, 2))
  if (result.releaseCoverageGaps && !process.argv.includes('--allow-gaps')) {
    console.error('Release coverage REFUSED: general assistant operation/host/receipt mappings remain. --allow-gaps checks offline inventory integrity only.')
    process.exitCode = 1
  }
}
if (require.main === module) { try { main() } catch (error) { console.error(error.message); process.exitCode = 1 } }
module.exports = { checkInventory, inventory }
