const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function fixture(platform = 'ios') {
  const state = { receipt: '', receiptFailure: false, refreshFailure: false, availableFailure: false, verifyFailure: false,
    finishFailure: false, finishFailureId: null, finishes: [], verifies: [], events: [], credited: new Set(), grants: 0,
    purchase: { id: 'synthetic-transaction', productId: 'store.pack', purchaseToken: 'synthetic-token', transactionDate: Date.now() }, available: [] }
  const iap = {
    initConnection: async () => { state.events.push('connect') }, endConnection: async () => { state.events.push('disconnect') },
    fetchProducts: async () => [{ id: 'store.pack' }], requestPurchase: async () => state.purchase,
    purchaseUpdatedListener: () => ({ remove() {} }), purchaseErrorListener: () => ({ remove() {} }),
    getReceiptDataIOS: async () => { if (state.receiptFailure) throw Error('Synthetic missing receipt'); return state.receipt },
    requestReceiptRefreshIOS: async () => { if (state.refreshFailure) throw Error('Synthetic receipt refresh failure'); return state.receipt },
    getAvailablePurchases: async () => { if (state.availableFailure) throw Error('Synthetic store unavailable'); return state.available },
    finishTransaction: async options => {
      state.events.push('finish'); state.finishes.push(options)
      if (state.finishFailure || state.finishFailureId === options.purchase.id || (platform === 'ios' && !options.purchase.id)) throw Error('Synthetic finish failure')
    },
  }
  const mocks = { 'react-native': { Platform: { OS: platform }, Linking: {} }, 'react-native-iap': iap,
    '../config': { API_BASE_URL: 'https://fixture.invalid' }, './affiliateAttribution': { readFreshAffiliateAttribution: async () => null } }
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('native/src/lib/inAppPurchase.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, Date, setTimeout, clearTimeout,
    require: id => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id] },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body)
      if (url.endsWith('/prepare-purchase')) return { ok: true, json: async () => ({ storeProductId: 'store.pack' }) }
      assert.ok(url.endsWith('/verify-purchase')); state.events.push('verify'); state.verifies.push(body)
      if (state.verifyFailure) return { ok: false, json: async () => ({ error: 'Synthetic store verification rejected' }) }
      const identity = `${body.platform}:${body.transactionId || body.purchaseToken || 'receipt-identity'}`
      if (!state.credited.has(identity)) { state.credited.add(identity); state.grants++ }
      return { ok: true, json: async () => ({ ok: true, message: 'Synthetic verified purchase' }) }
    },
  })
  const products = [{ code: 'credits_250', kind: 'topup', iosProductId: 'store.pack', androidProductId: 'store.pack' },
    { code: 'plan_10_monthly', kind: 'subscription', iosProductId: 'store.monthly', androidProductId: 'store.monthly' }]
  return { state, products, buy: (kind = 'topup') => module.exports.runNativePurchase({ token: 'synthetic-session', code: 'credits_250', kind }),
    restore: () => module.exports.restoreNativePurchases({ token: 'synthetic-session', products }) }
}

async function main() {
  for (const brokenReceipt of [false, true]) {
    const f = fixture(); f.state.receiptFailure = brokenReceipt; f.state.refreshFailure = brokenReceipt
    f.state.purchase.transactionId = '   '
    await f.buy()
    assert.equal(f.state.verifies.length, 1); assert.equal(f.state.verifies[0].transactionId, 'synthetic-transaction')
    assert.equal(f.state.verifies[0].receiptData, ''); assert.equal(f.state.finishes.length, 1)
    assert.equal(f.state.finishes[0].isConsumable, true)
    assert.ok(f.state.events.indexOf('verify') < f.state.events.indexOf('finish'))
    assert.equal(f.state.events.at(-1), 'disconnect')
  }
  console.log('PASS actual iOS purchase verifies ID-only transactions despite empty/failed receipt reads, then finishes')
  {
    const f = fixture(); f.state.purchase.id = ''; f.state.receipt = 'synthetic-legacy-receipt'
    await assert.rejects(f.buy(), /verified.*Restore purchases/); assert.equal(f.state.verifies[0].receiptData, 'synthetic-legacy-receipt'); assert.equal(f.state.verifies[0].transactionId, '')
    const g = fixture(); g.state.purchase.id = ''
    await assert.rejects(g.buy(), /receipt or transaction ID/); assert.equal(g.state.verifies.length, 0); assert.equal(g.state.finishes.length, 0)
    console.log('PASS legacy receipt-only verification remains available; no receipt/ID cannot reach verification/completion')
  }
  for (const platform of ['ios', 'android']) {
    const f = fixture(platform)
    const pack = { ...f.state.purchase, transactionId: 'synthetic-pack' }
    const subscription = { ...f.state.purchase, id: 'synthetic-sub', transactionId: 'synthetic-sub', productId: 'store.monthly', purchaseToken: 'synthetic-sub-token' }
    f.state.available = [pack, subscription, { ...pack }, { id: 'foreign', productId: 'other.product' }]
    const result = await f.restore()
    assert.match(result.message, /^2 purchases restored/)
    assert.equal(f.state.verifies.length, 2); assert.equal(f.state.finishes.length, 2)
    assert.equal(f.state.finishes[0].isConsumable, true); assert.equal(f.state.finishes[1].isConsumable, false)
    assert.equal(f.state.events.filter(e => e === 'finish').length, 2)
    assert.equal(f.state.events.at(-1), 'disconnect')
    console.log(`PASS actual ${platform} restore finishes verified credit packs/subscriptions with correct classification; duplicate/foreign entries ignored`)
  }
  {
    const f = fixture()
    f.state.available = [{ ...f.state.purchase, id: 'synthetic-pack-one' }, { ...f.state.purchase, id: 'synthetic-pack-two' }]
    assert.match((await f.restore()).message, /^2 purchases restored/)
    assert.equal(f.state.verifies.length, 2); assert.equal(f.state.finishes.length, 2)
    console.log('PASS distinct StoreKit id-only purchases of the same product are both verified and finished')
  }
  {
    const f = fixture('android')
    f.state.available = [{ ...f.state.purchase, productId: 'store.monthly', isAcknowledgedAndroid: true }]
    f.state.finishFailure = true
    assert.match((await f.restore()).message, /^1 purchase restored/)
    assert.equal(f.state.verifies.length, 1); assert.equal(f.state.finishes.length, 0, 'already-acknowledged subscription must not be acknowledged twice')
    f.state.verifyFailure = true
    await assert.rejects(f.restore(), /verification rejected/)
    assert.equal(f.state.verifies.length, 2); assert.equal(f.state.finishes.length, 0, 'acknowledged subscriptions still require server verification')
    for (const acknowledged of [false, undefined, 'true']) {
      const g = fixture('android')
      g.state.available = [{ ...g.state.purchase, productId: 'store.monthly', isAcknowledgedAndroid: acknowledged }]
      await g.restore(); assert.equal(g.state.finishes.length, 1); assert.equal(g.state.finishes[0].isConsumable, false)
    }
    const pack = fixture('android')
    pack.state.available = [{ ...pack.state.purchase, isAcknowledgedAndroid: true }]
    await pack.restore(); assert.equal(pack.state.finishes.length, 1); assert.equal(pack.state.finishes[0].isConsumable, true)
    const ios = fixture('ios')
    ios.state.available = [{ ...ios.state.purchase, productId: 'store.monthly', isAcknowledgedAndroid: true }]
    await ios.restore(); assert.equal(ios.state.finishes.length, 1)
    console.log('PASS acknowledged Android subscriptions are reverified without double acknowledgement; pending acknowledgements, consumable packs and iOS still finish')
  }

  for (const platform of ['ios', 'android']) {
    for (const operation of ['buy', 'restore']) {
      const f = fixture(platform); f.state.available = [f.state.purchase]; f.state.verifyFailure = true
      await assert.rejects(f[operation](), /verification rejected/)
      assert.equal(f.state.finishes.length, 0, 'failed verification must never finish/consume purchase')
      assert.equal(f.state.events.at(-1), 'disconnect')
      f.state.verifyFailure = false; f.state.finishFailure = true
      await assert.rejects(f[operation](), /verified.*Restore purchases.*do not buy it again/)
      assert.equal(f.state.grants, 1)
      f.state.finishFailure = false
      await f.restore()
      assert.equal(f.state.grants, 1, 'retry reuses the existing once-only server verification contract')
      assert.equal(f.state.finishes.length, 2)
    }
  }
  console.log('PASS verification failures never finish; failed completion reports Restore retry; retry preserves synthetic once-only grant')
  {
    const f = fixture()
    f.state.available = [f.state.purchase, { ...f.state.purchase, id: 'synthetic-sub', productId: 'store.monthly' }]
    f.state.finishFailureId = 'synthetic-transaction'
    await assert.rejects(f.restore(), /1 purchase restored.*Some purchases could not be restored.*Restore purchases/)
    assert.equal(f.state.verifies.length, 2); assert.equal(f.state.finishes.length, 2)
    assert.equal(f.state.finishes[1].purchase.id, 'synthetic-sub', 'one failure cannot prevent another owned purchase from restoring')
    f.state.finishFailureId = null
    assert.match((await f.restore()).message, /^2 purchases restored/)
    assert.equal(f.state.grants, 2)
    console.log('PASS partial restore continues other verified purchases and accurately reports completed count plus retry guidance')
  }

  {
    const f = fixture(); f.state.availableFailure = true
    await assert.rejects(f.restore(), /store unavailable/)
    assert.equal(f.state.verifies.length, 0); assert.equal(f.state.finishes.length, 0)
    const g = fixture(); assert.match((await g.restore()).message, /No previous purchases/)
    g.state.available = [{ id: '', productId: 'store.pack' }]
    await assert.rejects(g.restore(), /receipt or transaction ID/)
    assert.equal(g.state.verifies.length, 0)
    const h = fixture('android'); h.state.available = [{ id: 'synthetic', productId: 'store.pack' }]
    await assert.rejects(h.restore(), /purchase token was missing/)
    assert.equal(h.state.finishes.length, 0)
    console.log('PASS restore store/identity failures stay truthful and retryable; genuinely empty store remains ordinary empty state')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
