const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const file = 'native/src/screens/BillingScreen.tsx'
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = []
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['startCheckout', 'handleRestorePurchases'].includes(node.name.getText(source))) handlers.push(`const ${node.getText(source)};`)
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(handlers.length, 2)
const code = ts.transpileModule(handlers.join('\n') + '\nexport { startCheckout, handleRestorePurchases }', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

function fixture(platform = 'ios', signedIn = true) {
  const session = { token: 'synthetic-token', user: { id: 'synthetic-owner' } }
  let identity = signedIn ? { ...session } : null
  const state = { attempts: 0, refreshes: 0, catalog: 0, alerts: [], checkout: null, restoring: false,
    failure: null, refreshFailure: false, operationGate: null, catalogGate: null }
  const priceLookup = { current: null }
  const operation = async () => {
    state.attempts++
    if (state.operationGate) await state.operationGate.promise
    if (state.failure) throw Error(state.failure)
    return { message: 'Synthetic completed operation' }
  }
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports,
    mode: signedIn ? 'signedIn' : 'signedOut', session: signedIn ? session : null,
    getCurrentNativeAuthSession: () => identity, storePriceLookup: priceLookup, nativeProducts: [],
    fetchNativeCatalog: async () => { state.catalog++; if (state.catalogGate) await state.catalogGate.promise; return [] },
    runNativePurchase: operation, restoreNativePurchases: operation,
    loadBillingData: async () => { state.refreshes++; if (state.refreshFailure) throw Error('Synthetic balance refresh failed') },
    setIsCreatingCheckout: value => { state.checkout = value }, setIsRestoringPurchases: value => { state.restoring = value },
    Platform: { OS: platform }, Alert: { alert: (...args) => { state.alerts.push(args) } },
  })
  return { state, priceLookup, purchase: () => module.exports.startCheckout('credits_250'), restore: module.exports.handleRestorePurchases,
    switchAccount: (replacement = true) => { identity = replacement ? { ...session } : null } }
}

async function main() {
  for (const platform of ['ios', 'android']) {
    for (const action of ['purchase', 'restore']) {
      for (const failure of [null, 'Your purchase was verified, but the store could not finish it. Use Restore purchases to retry; do not buy it again.', '1 purchase restored. Some purchases could not be restored. Use Restore purchases to retry.']) {
        const f = fixture(platform); f.state.failure = failure
        await f[action]()
        assert.equal(f.state.attempts, 1); assert.equal(f.state.refreshes, 1, 'one started attempt must refresh balance once on success or error')
        assert.equal(f.state.alerts.length, 1); assert.equal(f.state.alerts[0][1], failure || 'Synthetic completed operation')
        assert.equal(f.state.checkout, null); assert.equal(f.state.restoring, false)
        if (failure) assert.match(f.state.alerts[0][0], /error$/)
      }
      const failedRefresh = fixture(platform); failedRefresh.state.failure = 'Original store completion error'; failedRefresh.state.refreshFailure = true
      await failedRefresh[action]()
      assert.equal(failedRefresh.state.refreshes, 1); assert.equal(failedRefresh.state.alerts.length, 1)
      assert.equal(failedRefresh.state.alerts[0][1], 'Original store completion error', 'balance refresh failure must not replace original purchase/restore error')
      const signedOut = fixture(platform, false); await signedOut[action]()
      assert.equal(signedOut.state.attempts, 0); assert.equal(signedOut.state.refreshes, 0); assert.equal(signedOut.state.alerts[0][0], 'Not signed in')
    }
  }
  console.log('PASS actual iOS/Android purchase and restore handlers refresh once for started success/failure/partial completion; preserve primary errors and ignore signed-out attempts')
  for (const action of ['purchase', 'restore']) {
    {
      const f = fixture(), gate = deferred(); f.priceLookup.current = gate.promise
      const attempt = f[action](); f.switchAccount(); gate.resolve(); await attempt
      assert.equal(f.state.attempts, 0); assert.equal(f.state.refreshes, 0); assert.equal(f.state.alerts.length, 0)
      assert.equal(f.state.catalog, 0, 'account switch while price lookup waits must not start a later catalog request')
    }
    for (const replacement of [true, false]) {
      const f = fixture(); f.state.operationGate = deferred()
      const attempt = f[action](); await tick(); assert.equal(f.state.attempts, 1)
      f.switchAccount(replacement); f.state.operationGate.resolve(); await attempt
      assert.equal(f.state.refreshes, 0); assert.equal(f.state.alerts.length, 0, 'late old-session results must not show for another or replacement session')
      assert.equal(f.state.checkout, null); assert.equal(f.state.restoring, false)
    }
  }
  {
    const f = fixture(); f.state.catalogGate = deferred()
    const attempt = f.restore(); await tick(); f.switchAccount(); f.state.catalogGate.resolve(); await attempt
    assert.equal(f.state.attempts, 0); assert.equal(f.state.refreshes, 0)
  }
  console.log('PASS account replacement/sign-out during price, catalog or store waits cannot start stale store work, show late results or refresh another session')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
