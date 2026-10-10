const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
function load(file, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout, clearTimeout, ...extra, require: id => {
    assert.ok(id in mocks, `Unexpected import ${id}`)
    return mocks[id]
  } })
  return module.exports
}
const catalog = [
  { code: 'plan_10_monthly', kind: 'subscription', iosProductId: 'apple.monthly', androidProductId: 'google.monthly' },
  { code: 'credits_250', kind: 'topup', iosProductId: 'apple.credits', androidProductId: 'google.credits' },
]
async function priceFixture(platform, currencyPrice, missing = false) {
  let connections = 0, ended = 0
  const IAP = {
    initConnection: async () => { connections++ }, endConnection: async () => { ended++ },
    fetchProducts: async ({ type }) => missing ? [] : type === 'subs'
      ? [{ id: platform === 'ios' ? 'apple.monthly' : 'google.monthly', displayPrice: currencyPrice, subscriptionOfferDetailsAndroid: [
          { offerId: 'trial', offerToken: 'trial-token', pricingPhases: { pricingPhaseList: [{ billingPeriod: 'P1M', recurrenceMode: 1, formattedPrice: 'Trial price' }] } },
          { offerId: null, offerToken: 'base-token', pricingPhases: { pricingPhaseList: [{ billingPeriod: 'P1M', recurrenceMode: 1, formattedPrice: currencyPrice }] } },
        ] }]
      : [{ id: platform === 'ios' ? 'apple.credits' : 'google.credits', displayPrice: currencyPrice }],
    requestPurchase: async () => assert.fail('Price lookup must never purchase'),
  }
  const api = load('native/src/lib/inAppPurchase.ts', {
    'react-native': { Platform: { OS: platform } }, 'react-native-iap': IAP,
    '../config': {}, './affiliateAttribution': {},
  })
  const prices = await api.readNativeStorePrices(catalog)
  assert.equal(connections, 1); assert.equal(ended, 1)
  if (missing) assert.equal(Object.keys(prices).length, 0)
  else { assert.equal(prices.credits_250, currencyPrice); assert.equal(prices.plan_10_monthly, currencyPrice) }
  assert.equal(Object.keys(await api.readNativeStorePrices([])).length, 0)
  assert.equal(connections, 1)
}
function renderBilling(platform, source, prices = {}) {
  const calls = [], alerts = []
  let state = 0
  const subscription = { id: 'fixture', tier: 'plan_20_monthly', credits: 1400, monthlyPriceCents: 2000, source }
  const hooks = { ...React, useCallback: f => f, useEffect: () => {}, useMemo: f => f(), useRef: value => ({ current: value }), useState: value => {
    const index = state++
    return [index === 1 ? subscription : index === 2 ? true : index === 3 ? false : index === 9 ? prices : value, () => {}]
  } }
  const api = load('native/src/screens/BillingScreen.tsx', {
    react: hooks,
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Platform: { OS: platform }, Alert: { alert: (...a) => alerts.push(a) }, Linking: { openURL: async url => calls.push({ type: 'link', url }) } },
    '@react-navigation/native': { useFocusEffect: () => {} },
    '../config': { API_BASE_URL: 'https://fixture.invalid' },
    '../lib/inAppPurchase': {
      openNativeSubscriptionManagement: async store => calls.push({ type: 'manage', store }),
      restoreNativePurchases: async () => ({ message: 'Fixture restore' }),
      runNativePurchase: async () => { calls.push({ type: 'purchase' }); return { message: 'Fixture only' } },
      readNativeStorePrices: async () => ({}),
    },
    '../lib/nativeAuthHeaders': { buildNativeAuthHeaders: () => ({}) },
    '../state/AppModeContext': { useAppMode: () => ({ mode: 'signedIn', session: { token: 'fixture' } }) },
    '../ui/Screen': { Screen: 'Screen' }, '../ui/theme': { theme: { colors: {}, radius: {}, spacing: {}, fontSize: {} } },
  }, { fetch: async (url, opts = {}) => {
    calls.push({ type: 'fetch', url, method: opts.method || 'GET', body: opts.body })
    return { ok: true, json: async () => url.endsWith('/portal') ? { url: 'https://fixture.invalid/manage' } : url.endsWith('/catalog') ? { products: [] } : {} }
  } })
  const root = api.BillingScreen()
  const elements = []
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.props) { elements.push(node); walk(node.props.children) }
  }
  walk(root)
  return { api, calls, alerts, elements }
}
async function routingFixture(platform, source) {
  for (const action of ['manage', 'switch', 'cancel']) {
    const fixture = renderBilling(platform, source)
    const button = fixture.elements.find(e => action === 'manage' ? /^Manage/.test(e.props.label || '') : action === 'switch' ? /^Downgrade to/.test(e.props.label || '') : e.props.label === 'Cancel Subscription')
    assert.ok(button, `${platform}/${source} ${action} control missing`)
    await button.props.onPress()
    if (action === 'cancel') {
      const confirmation = fixture.alerts.find(a => Array.isArray(a[2]))
      assert.ok(confirmation)
      await confirmation[2].find(b => b.onPress).onPress()
      // Existing confirmation callbacks intentionally start async handlers with void.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const posts = fixture.calls.filter(c => c.type === 'fetch' && c.method === 'POST')
    if (source === 'google_iap') {
      assert.equal(posts.length, 0); assert.ok(fixture.calls.some(c => c.type === 'manage' && c.store === 'android'))
    } else if (source === 'apple_iap') {
      assert.equal(posts.length, 0)
      if (action === 'switch' && platform === 'ios') assert.ok(fixture.calls.some(c => c.type === 'purchase'))
      else assert.ok(fixture.calls.some(c => c.type === 'manage' && c.store === 'ios'))
    } else {
      assert.ok(posts.some(c => c.url.endsWith(action === 'manage' ? '/portal' : '/subscription')))
      assert.equal(fixture.calls.some(c => c.type === 'manage'), false)
    }
  }
}
async function managementFixture(platform, store) {
  let opened = '', native = '', connections = 0
  const api = load('native/src/lib/inAppPurchase.ts', {
    'react-native': { Platform: { OS: platform }, Linking: { openURL: async url => { opened = url } } },
    'react-native-iap': { initConnection: async () => { connections++ }, endConnection: async () => {}, showManageSubscriptionsIOS: async () => { native = 'ios' }, deepLinkToSubscriptions: async () => { native = 'android' } },
    '../config': {}, './affiliateAttribution': {},
  })
  await api.openNativeSubscriptionManagement(store)
  if (platform === store) { assert.equal(native, store); assert.equal(connections, 1); assert.equal(opened, '') }
  else { assert.match(opened, store === 'android' ? /^https:\/\/play.google.com/ : /^https:\/\/apps.apple.com/); assert.equal(connections, 0) }
}
async function connectionOrderingFixture() {
  const events = []
  let active = 0, releaseLookup, releasePurchase
  const lookupGate = new Promise(resolve => { releaseLookup = resolve })
  const purchaseGate = new Promise(resolve => { releasePurchase = resolve })
  let lookups = 0
  const product = { id: 'google.monthly', displayPrice: '€9,99', subscriptionOfferDetailsAndroid: [
    { offerId: null, offerToken: 'monthly', pricingPhases: { pricingPhaseList: [{ billingPeriod: 'P1M', recurrenceMode: 1, formattedPrice: '€9,99' }] } },
  ] }
  const api = load('native/src/lib/inAppPurchase.ts', {
    'react-native': { Platform: { OS: 'android' } }, '../config': { API_BASE_URL: 'https://fixture.invalid' },
    './affiliateAttribution': { readFreshAffiliateAttribution: async () => null },
    'react-native-iap': {
      initConnection: async () => { assert.equal(active, 0); active++; events.push('init') },
      endConnection: async () => { assert.equal(active, 1); active--; events.push('end') },
      fetchProducts: async () => { events.push('products'); if (++lookups === 1) await lookupGate; return [product] },
      purchaseUpdatedListener: () => ({ remove() {} }), purchaseErrorListener: () => ({ remove() {} }),
      requestPurchase: async () => {
        assert.equal(active, 1); events.push('purchase'); await purchaseGate; assert.equal(active, 1)
        return { productId: 'google.monthly', transactionDate: Date.now(), purchaseToken: 'fixture-token', transactionId: 'fixture-id' }
      },
      finishTransaction: async () => { assert.equal(active, 1); events.push('finish') },
    },
  }, { fetch: async url => ({ ok: true, json: async () => url.endsWith('prepare-purchase') ? { storeProductId: 'google.monthly' } : { ok: true } }) })
  const first = api.readNativeStorePrices([catalog[0]])
  await new Promise(resolve => setTimeout(resolve, 0))
  const purchase = api.runNativePurchase({ code: 'plan_10_monthly', kind: 'subscription', token: 'fixture' })
  await new Promise(resolve => setTimeout(resolve, 0))
  const focusRefresh = api.readNativeStorePrices([catalog[0]])
  assert.deepEqual(events, ['init', 'products'])
  releaseLookup()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(events, ['init', 'products', 'end', 'init', 'products', 'purchase'])
  releasePurchase()
  await Promise.all([first, purchase, focusRefresh])
  assert.deepEqual(events, ['init', 'products', 'end', 'init', 'products', 'purchase', 'finish', 'end', 'init', 'products', 'end'])
  assert.equal(active, 0)
}
async function main() {
  await priceFixture('ios', '$4.99'); await priceFixture('ios', 'A$7.99')
  await priceFixture('android', '€9,99'); await priceFixture('android', '', true)
  const { api } = renderBilling('ios', 'apple_iap')
  assert.equal(api.nativeBillingPriceLabels(250, 'topup', '$4.99').title, '250 credits — $4.99')
  assert.equal(api.nativeBillingPriceLabels(250, 'topup', 'A$7.99').buttonLabel, 'Buy 250 credits for A$7.99')
  assert.equal(api.nativeBillingPriceLabels(700, 'subscription', '€9,99').title, '€9,99 / month')
  assert.doesNotMatch(api.nativeBillingPriceLabels(250, 'topup').title, /\$/)
  assert.equal(api.nativeBillingPriceLabels(700, 'subscription').title, '700 credits / month')
  for (const platform of ['ios', 'android']) for (const source of ['apple_iap', 'google_iap', 'stripe']) await routingFixture(platform, source)
  for (const platform of ['ios', 'android']) for (const store of ['ios', 'android']) await managementFixture(platform, store)
  await connectionOrderingFixture()
  console.log('PASS: localized USD/AUD/Google base prices, missing-price fallback, 18 real screen-handler/source routing fixtures, 4 management helper fixtures and concurrent lookup/purchase connection ordering. No network, credentials or purchases.')
}
main().catch(e => { console.error(e.stack); process.exitCode = 1 })
