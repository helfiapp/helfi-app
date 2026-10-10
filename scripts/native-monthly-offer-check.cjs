const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const src = fs.readFileSync('native/src/lib/inAppPurchase.ts', 'utf8')
const compiled = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const phase = (period = 'P1M') => ({ billingPeriod: period, recurrenceMode: 1 })
const legacy = (token, offerId, period) => ({ offerToken: token, offerId, pricingPhases: { pricingPhaseList: [phase(period)] } })
async function check({ platform = 'android', kind = 'subscription', products, expectToken, expectError }) {
  let requested = null, ended = false, listenerCount = 0
  const sku = kind === 'subscription' ? 'monthly-plan' : 'credits-pack'
  const purchase = { productId: sku, transactionDate: Date.now(), purchaseToken: 'fixture-purchase', transactionId: 'fixture-transaction' }
  const mockIap = {
    initConnection: async () => {}, endConnection: async () => { ended = true },
    fetchProducts: async () => products,
    purchaseUpdatedListener: () => { listenerCount++; return { remove() {} } },
    purchaseErrorListener: () => ({ remove() {} }),
    requestPurchase: async (req) => { requested = req; return purchase },
    getReceiptDataIOS: async () => 'fixture-receipt', finishTransaction: async () => {},
  }
  const module = { exports: {} }
  const sandbox = { module, exports: module.exports, setTimeout, clearTimeout, require: (id) => {
    if (id === 'react-native') return { Platform: { OS: platform } }
    if (id === 'react-native-iap') return mockIap
    if (id === '../config') return { API_BASE_URL: 'https://fixture.invalid' }
    if (id === './affiliateAttribution') return { readFreshAffiliateAttribution: async () => null }
    throw new Error(id)
  }, fetch: async (url) => ({ ok: true, json: async () => url.endsWith('prepare-purchase') ? { storeProductId: sku } : { ok: true, message: 'verified fixture' } }) }
  vm.runInNewContext(compiled, sandbox)
  let error
  try { await module.exports.runNativePurchase({ code: kind === 'subscription' ? 'plan_10_monthly' : 'credits_250', kind, token: 'fixture-session' }) } catch (e) { error = e }
  assert.equal(ended, true)
  if (expectError) { assert.match(error?.message || '', /monthly plan is not available/); assert.equal(requested, null); assert.equal(listenerCount, 0); return }
  assert.equal(error, undefined)
  if (platform === 'ios') { assert.equal(requested.request.ios.sku, sku); assert.equal(requested.request.android, undefined); return }
  assert.equal(requested.request.android.skus[0], sku)
  if (kind === 'topup') assert.equal(requested.request.android.subscriptionOffers, undefined)
  else { assert.equal(requested.request.android.subscriptionOffers[0].offerToken, expectToken); assert.equal(requested.request.android.subscriptionOffers[0].sku, sku) }
}
async function main() {
  await check({ products: [{ id: 'monthly-plan', subscriptionOfferDetailsAndroid: [legacy('discount', 'intro'), legacy('base', null)] }], expectToken: 'base' })
  await check({ products: [{ id: 'monthly-plan', subscriptionOffers: [{ id: 'monthly', basePlanIdAndroid: 'monthly', offerTokenAndroid: 'standard-base', pricingPhasesAndroid: { pricingPhaseList: [phase()] } }] }], expectToken: 'standard-base' })
  await check({ products: [{ id: 'unrelated', subscriptionOfferDetailsAndroid: [legacy('wrong-product', null)] }], expectError: true })
  await check({ products: [{ id: 'monthly-plan', subscriptionOfferDetailsAndroid: [legacy('annual', null, 'P1Y')] }], expectError: true })
  await check({ products: [{ id: 'monthly-plan', subscriptionOfferDetailsAndroid: [legacy('', null)] }], expectError: true })
  await check({ kind: 'topup', products: [{ id: 'credits-pack' }] })
  await check({ platform: 'ios', products: [{ id: 'monthly-plan' }] })
  console.log('PASS: 7 native purchase request fixtures; no store calls or credentials used.')
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
