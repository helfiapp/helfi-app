import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { NextResponse } from 'next/server'

// Execute the actual verifier and grant transactions with synthetic store
// replies and an in-memory transactional database. No app credentials,
// provider requests, purchases or live database changes occur.
type Row = Record<string, any>
let topups: Row[] = []
let subscriptions: Row[] = []
let claims: Row[] = []
let transactionTail = Promise.resolve()
let failCreate = false
let affiliateCalls = 0
let affiliateAmounts: number[] = []
let googleQuantity: any = undefined
let appleLookupQuantity: any = undefined
let lookupWorks = false
let googleState: any = 0
let googleOrder = 'GPA.offline-topup'
let subscriptionOrder = 'GPA.offline-sub..1'
let linkedToken: string | undefined
let subscriptionExpiry: any = Date.now() + 86400000
let subscriptionPaymentState: any = 1
let subscriptionCancelReason: any = undefined
let appleRevoked = false
const purchaseTime = Date.now() - 60_000
const products: Record<string, Row> = {
  credits_250: { kind: 'topup', credits: 250, priceCents: 500, iosProductId: 'helfi.credits_250', androidProductId: 'helfi_credits_250' },
  plan_10_monthly: { kind: 'subscription', credits: 700, priceCents: 1000, iosProductId: 'helfi.plan_10_monthly', androidProductId: 'helfi_plan_10' },
}
const receiptItems = [{ product_id: 'helfi.credits_250', transaction_id: 'apple-verified-topup', original_transaction_id: 'apple-verified-topup', purchase_date_ms: String(purchaseTime) },
  { product_id: 'helfi.plan_10_monthly', transaction_id: 'apple-renewal-2', original_transaction_id: 'apple-original-sub', purchase_date_ms: String(purchaseTime), expires_date_ms: String(Date.now() + 86400000) }]
const clone = <T>(value: T): T => structuredClone(value)
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((item: Row) => matches(row, item))
    if (key === 'platform_purchaseId') return matches(row, value)
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, expected]) =>
      operator === 'in' ? (expected as any[]).includes(row[key]) : operator === 'startsWith' ? String(row[key] || '').startsWith(String(expected)) : false)
    return row[key] === value
  })
}
const db: any = {
  $executeRaw: async () => 1,
  creditTopUp: {
    findFirst: async ({ where }: any) => clone(topups.find(row => matches(row, where)) || null),
    findMany: async ({ where }: any) => clone(topups.filter(row => matches(row, where))),
    create: async ({ data }: any) => { if (failCreate) throw new Error('offline write failure'); const row = { id: 'topup-' + topups.length, ...clone(data) }; topups.push(row); return row },
  },
  nativePurchaseClaim: {
    findUnique: async ({ where }: any) => clone(claims.find(row => matches(row, where)) || null),
    create: async ({ data }: any) => { assert.ok(!claims.some(row => row.platform === data.platform && row.purchaseId === data.purchaseId), 'unique purchase owner'); claims.push(clone(data)); return data },
  },
  subscription: {
    findMany: async ({ where }: any) => clone(subscriptions.filter(row => matches(row, where))),
    findUnique: async ({ where }: any) => clone(subscriptions.find(row => matches(row, where)) || null),
    upsert: async ({ where, update, create }: any) => { const prior = subscriptions.find(row => matches(row, where)); if (prior) Object.assign(prior, clone(update)); else subscriptions.push(clone(create)); return prior || create },
  },
}
db.$transaction = async (work: (tx: any) => Promise<any>) => {
  const prior = transactionTail
  let release!: () => void
  transactionTail = new Promise(resolve => { release = resolve })
  await prior
  const snapshot = { topups: clone(topups), claims: clone(claims), subscriptions: clone(subscriptions) }
  try { return await work(db) }
  catch (error) { ({ topups, claims, subscriptions } = snapshot); throw error }
  finally { release() }
}
const path = 'app/api/native-billing/verify-purchase/route.ts'
const source = process.argv.includes('--baseline') ? execFileSync('git', ['show', 'HEAD:' + path], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8')
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
const wanted = new Set(['NativePurchaseError', 'verifiedCreditQuantity', 'lockNativePurchaseIds', 'claimNativePurchase', 'grantNativeTopUpOnce', 'normalizeStoreProductId', 'upsertSubscriptionPreservingStartDate', 'POST'])
const declarations = ast.statements.filter(node => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && wanted.has(node.name?.text || '')).map(node => node.getText(ast).replace(/^export /, '')).join('\n')
// Run the actual Apple transport validators with a local fake fetch as well:
// a valid store response for another application must never reach the grant.
let storeBundle = 'ai.helfi.app'
const providerFunctions = ast.statements.filter(ts.isFunctionDeclaration).filter(node => ['verifyAppleReceipt', 'verifyAppleTransactionById'].includes(node.name?.text || '')).map(node => node.getText(ast)).join('\n')
const providerContext: any = { process: { env: { APPLE_IAP_BUNDLE_ID: 'ai.helfi.app' } },
  getAppleApiCredentials: () => ({ bundleId: 'ai.helfi.app' }),
  createAppleAppStoreApiToken: () => 'synthetic-provider-auth',
  parseAppleSignedTransactionInfo: () => ({ bundleId: storeBundle, transactionId: 'verified-provider-id' }),
  fetch: async () => ({ ok: true, json: async () => ({ status: 0, latest_receipt_info: [clone(receiptItems[1])], receipt: { bundle_id: storeBundle, in_app: clone(receiptItems) }, signedTransactionInfo: 'synthetic-signed-store-reply' }) }),
}
vm.createContext(providerContext)
vm.runInContext(ts.transpileModule(providerFunctions + '\nthis.receipt = verifyAppleReceipt; this.transaction = verifyAppleTransactionById;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, providerContext)
const context: any = { NextResponse, prisma: db, Date, Set, console,
  ensureSubscriptionStoreColumns: async () => {},
  getBillingUser: async (request: any) => request.account ? { id: request.account, email: 'offline@example.invalid' } : null,
  getNativeBillingProductByCode: (code: string) => products[code] || null,
  createNativeAffiliateCommission: async (options: any) => { affiliateCalls++; affiliateAmounts.push(options.amountCents) },
  verifyAppleTransactionById: async (id: string) => lookupWorks
    ? { ok: true, info: { productId: 'helfi.credits_250', transactionId: id === 'wrong-lookup-id' ? 'different-verified-id' : id, originalTransactionId: id, purchaseDate: purchaseTime, quantity: appleLookupQuantity, ...(appleRevoked ? { revocationDate: purchaseTime } : {}) } }
    : { ok: false, error: 'offline key unavailable' },
  verifyAppleReceipt: async () => ({ ok: true, items: clone(receiptItems) }),
  verifyGoogleProductPurchase: async () => ({ orderId: googleOrder, purchaseState: googleState, purchaseTimeMillis: String(purchaseTime), quantity: googleQuantity }),
  verifyGoogleSubscriptionPurchase: async () => ({ orderId: subscriptionOrder, startTimeMillis: String(purchaseTime), expiryTimeMillis: subscriptionExpiry, linkedPurchaseToken: linkedToken, paymentState: subscriptionPaymentState, cancelReason: subscriptionCancelReason }),
}
vm.createContext(context)
vm.runInContext(ts.transpileModule(declarations + '\nthis.post = POST;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
const request = (body: Row, account = 'owner-a') => ({ account, json: async () => body })
const apple = (id?: string) => ({ platform: 'ios', code: 'credits_250', receiptData: 'synthetic-offline-receipt', ...(id ? { transactionId: id } : {}) })
const google = (token = 'verified-google-token') => ({ platform: 'android', code: 'credits_250', purchaseToken: token })
const appleSub = (id = 'apple-renewal-2') => ({ platform: 'ios', code: 'plan_10_monthly', receiptData: 'synthetic-offline-receipt', transactionId: id })
const googleSub = (token = 'verified-google-sub-token') => ({ platform: 'android', code: 'plan_10_monthly', purchaseToken: token })
function reset() { topups = []; subscriptions = []; claims = []; failCreate = false; affiliateCalls = 0; affiliateAmounts = []; googleQuantity = undefined; appleLookupQuantity = undefined; delete (receiptItems[0] as any).quantity; lookupWorks = false; googleState = 0; linkedToken = undefined; googleOrder = 'GPA.offline-topup'; subscriptionOrder = 'GPA.offline-sub..1'; subscriptionExpiry = Date.now() + 86400000; subscriptionPaymentState = 1; subscriptionCancelReason = undefined; appleRevoked = false }
async function call(body: Row, account?: string) { const response = await context.post(request(body, account)); return { status: response.status, body: await response.json() } }

async function main() {
  assert.equal((await providerContext.receipt('synthetic-receipt')).ok, true)
  assert.ok((await providerContext.receipt('synthetic-receipt')).items.some((item: Row) => item.transaction_id === 'apple-verified-topup'), 'a subscription history list must not hide the verified consumable purchase')
  assert.equal((await providerContext.transaction('verified-provider-id')).ok, true)
  storeBundle = 'other.application'
  assert.equal((await providerContext.receipt('synthetic-receipt')).ok, false, 'another app receipt cannot grant Helfi products')
  assert.equal((await providerContext.transaction('verified-provider-id')).ok, false, 'another app transaction cannot grant Helfi products')
  storeBundle = 'ai.helfi.app'
  reset()
  assert.equal((await call(apple('invented-by-caller'))).status, 400, 'a verified receipt cannot turn an arbitrary client ID into a new credited transaction')
  assert.equal(topups.length, 0)
  assert.equal((await call(apple('apple-verified-topup'))).status, 200)
  assert.equal(topups[0].source, 'apple_iap:apple-verified-topup')
  assert.equal(topups[0].amountCents, 250)
  assert.equal(topups[0].usedCents, 0)
  assert.equal(+topups[0].purchasedAt, purchaseTime)
  for (let i = 0; i < 6; i++) assert.equal((await call(apple('apple-verified-topup'))).status, 200)
  assert.equal(topups.length, 1, 'retry credits exactly once')
  assert.equal(affiliateCalls, 1)
  assert.equal((await call(apple('apple-verified-topup'), 'owner-b')).status, 409)
  assert.equal(topups.length, 1)
  assert.equal((await call(apple('different-invented-id'))).status, 400)
  assert.equal((await call(apple())).status, 200, 'missing client ID uses only the verified receipt ID')
  assert.equal(topups.length, 1)
  lookupWorks = true
  assert.equal((await call(apple('wrong-lookup-id'))).status, 400, 'authoritative lookup ID must match the requested transaction')
  appleRevoked = true
  assert.equal((await call(apple('refunded-store-transaction'))).status, 400, 'a revoked store transaction cannot grant new credits')

  reset(); googleQuantity = 2
  const twoPacks = await call({ ...google(), quantity: 9000 })
  assert.equal(twoPacks.status, 200)
  assert.equal(twoPacks.body.creditsAdded, 500, 'two verified packs grant both packs, ignoring caller quantity')
  const twoPackRetries = await Promise.all(Array.from({ length: 15 }, () => call(google())))
  assert.ok(twoPackRetries.every(item => item.status === 200))
  assert.equal(topups.length, 1)
  assert.equal(topups[0].amountCents, 500, 'multiple-pack retries never grant those packs twice')
  assert.deepEqual(affiliateAmounts, [1000], 'verified pack count also preserves actual per-pack revenue')
  reset(); (receiptItems[0] as any).quantity = '2'
  assert.equal((await call({ ...apple('apple-verified-topup'), quantity: 9000 })).body.creditsAdded, 500, 'legacy Apple verified string quantity grants both packs')
  assert.equal((await call(apple('apple-verified-topup'))).status, 200)
  assert.equal(topups.length, 1)
  assert.equal(topups[0].amountCents, 500)
  assert.deepEqual(affiliateAmounts, [1000])
  reset(); lookupWorks = true; appleLookupQuantity = 2
  assert.equal((await call(apple('apple-two-pack-lookup'))).body.creditsAdded, 500, 'Apple transaction lookup uses only its authoritative quantity')
  assert.equal(topups[0].amountCents, 500)
  assert.deepEqual(affiliateAmounts, [1000])
  for (const invalid of [null, '', 'invalid', true, {}, [], 0, -1, 1.5, Infinity, 9007199254740992, 100000000]) {
    reset(); googleQuantity = invalid
    assert.equal((await call(google())).status, 400, 'invalid verified quantity is rejected before creating any claim or credits')
    assert.equal(claims.length, 0)
    assert.equal(topups.length, 0)
  }
  reset()
  assert.equal((await call({ ...google(), quantity: 9000 })).body.creditsAdded, 250, 'omitted verified quantity defaults to one, never client quantity')

  reset()
  const duplicates = await Promise.all(Array.from({ length: 15 }, () => call(google())))
  assert.ok(duplicates.every(item => item.status === 200))
  assert.equal(topups.length, 1, 'simultaneous Google retries credit once')
  assert.equal(claims.length, 1)
  assert.equal((await call(google(), 'owner-b')).status, 409)
  assert.equal(topups.length, 1)
  googleOrder = ''
  assert.equal((await call(google())).status, 200)
  assert.equal(topups.length, 1, 'the durable token claim prevents duplicate grants even if a later reply omits its order alias')
  assert.equal(affiliateCalls, 1)
  googleState = null
  assert.equal((await call(google('unknown-state-token'))).status, 400, 'absent/invalid purchase state is not completed')
  googleState = 2
  assert.equal((await call(google('pending-token'))).status, 400)
  googleState = 1
  assert.equal((await call(google('cancelled-token'))).status, 400)

  reset()
  const competingOwners = await Promise.all(Array.from({ length: 12 }, (_, i) => call(apple('apple-verified-topup'), i % 2 ? 'owner-a' : 'owner-b')))
  assert.equal(topups.length, 1, 'one verified purchase has one global account owner even during a race')
  assert.equal(claims.length, 1)
  assert.ok(competingOwners.some(item => item.status === 409))

  reset()
  claims.push({ platform: 'ios', purchaseId: 'apple-verified-topup', userId: null })
  assert.equal((await call(apple('apple-verified-topup'), 'replacement-account')).status, 409, 'a retained claim from a deleted account cannot grant credits to a new account')
  assert.equal(topups.length, 0)
  assert.equal(claims[0].userId, null, 'a retained purchase marker is never reassigned')
  claims.push({ platform: 'ios', purchaseId: 'apple-original-sub', userId: null })
  assert.equal((await call(appleSub(), 'replacement-account')).status, 409, 'a retained subscription claim from a deleted account cannot activate another account')
  assert.equal(subscriptions.length, 0)
  assert.equal(claims.length, 2)

  reset()
  topups.push({ userId: 'owner-a', source: 'apple_iap:apple-verified-topup', amountCents: 250 })
  assert.equal((await call(apple('apple-verified-topup'), 'owner-b')).status, 409, 'legacy owner is checked before a claim is created')
  assert.equal((await call(apple('apple-verified-topup'))).status, 200)
  assert.equal(topups.length, 1, 'legacy retries acquire ownership without adding credits')
  assert.equal(claims.length, 1)
  topups.push({ userId: 'owner-b', source: 'apple_iap:apple-verified-topup', amountCents: 250 })
  assert.equal((await call(apple('apple-verified-topup'))).status, 409, 'existing conflicting legacy owners are retained and rejected, never deleted')
  assert.equal(topups.length, 2)

  reset(); failCreate = true
  assert.equal((await call(google())).status, 500)
  assert.equal(claims.length, 0, 'failed credit write rolls back the ownership claim too')
  assert.equal(topups.length, 0)
  failCreate = false
  assert.equal((await call(google())).status, 200)
  assert.equal(topups.length, 1)

  reset()
  assert.equal((await call(appleSub())).status, 200)
  const originalStart = +subscriptions[0].startDate
  assert.equal((await call(appleSub(), 'owner-b')).status, 409)
  receiptItems.push({ ...receiptItems[1], transaction_id: 'apple-renewal-3' })
  assert.equal((await call(appleSub('apple-renewal-3'))).status, 200)
  assert.equal(+subscriptions[0].startDate, originalStart)
  // Switching the current subscription must not erase its older ownership.
  assert.equal((await call(googleSub('new-google-sub'))).status, 200)
  assert.equal(subscriptions[0].source, 'google_iap')
  assert.equal((await call(appleSub(), 'owner-b')).status, 409, 'original Apple ownership survives a switch to a different store subscription')

  reset()
  subscriptions.push({ userId: 'owner-a', source: 'google_iap', storeTransactionId: 'GPA.offline-sub..0', storeOriginalTransactionId: 'GPA.offline-sub..0', startDate: new Date(purchaseTime) })
  assert.equal((await call(googleSub(), 'owner-b')).status, 409, 'legacy Google renewal-order aliases retain the original owner')
  assert.equal((await call(googleSub())).status, 200)
  subscriptionOrder = 'GPA.offline-sub..2'
  assert.equal((await call(googleSub(), 'owner-b')).status, 409)
  linkedToken = 'verified-google-sub-token'; subscriptionOrder = 'GPA.upgraded-sub..0'
  assert.equal((await call(googleSub('upgrade-token'), 'owner-b')).status, 409, 'provider-linked prior token cannot transfer subscription ownership')
  assert.equal((await call(googleSub('upgrade-token'))).status, 200)
  assert.ok(claims.some(row => row.purchaseId === 'upgrade-token' && row.userId === 'owner-a'))

  reset()
  for (const expiry of [undefined, null, '', 'invalid', Date.now() - 1000, Infinity]) {
    subscriptionExpiry = expiry
    assert.equal((await call(googleSub())).status, 400, 'missing/invalid/expired store expiry cannot grant permanent premium')
  }
  subscriptionExpiry = Date.now() + 86400000
  for (const state of [0, 3]) {
    subscriptionPaymentState = state
    assert.equal((await call(googleSub())).status, 400, 'pending payment or deferred plan change cannot grant a new subscription')
  }
  subscriptionPaymentState = 1
  subscriptionCancelReason = 1
  assert.equal((await call(googleSub())).status, 400)
  subscriptionCancelReason = 0
  subscriptionPaymentState = undefined
  assert.equal((await call(googleSub())).status, 200, 'a user-canceled subscription retains access until its paid expiry')
  assert.ok(+subscriptions[0].endDate > Date.now())
  reset()
  const savedExpiry = receiptItems[1].expires_date_ms
  receiptItems[1].expires_date_ms = ''
  assert.equal((await call(appleSub())).status, 400, 'Apple missing expiry cannot grant permanent premium')
  receiptItems[1].expires_date_ms = savedExpiry
  ;(receiptItems[0] as any).cancellation_date_ms = String(purchaseTime)
  assert.equal((await call(apple('apple-verified-topup'))).status, 400, 'revoked verified receipt entries cannot grant credits')
  delete (receiptItems[0] as any).cancellation_date_ms

  reset()
  assert.equal((await call(apple('apple-verified-topup'))).status, 200)
  googleOrder = 'GPA.separate-platform'
  assert.equal((await call(google('apple-verified-topup'), 'owner-b')).status, 200, 'equal identifiers in different stores have separate ownership')
  assert.equal(topups.length, 2)
  assert.equal(claims.length, 2)

  reset()
  assert.equal((await call(apple(), '')).status, 401)
  assert.equal((await call({ platform: 'ios', code: 'unknown' })).status, 400)
  assert.equal(claims.length, 0)
  console.log('PASS: actual native verifier rejects fabricated receipt IDs, duplicates/concurrent credits, cross-account replay, invalid Google states and legacy ownership conflicts; atomic claims survive subscription switches/renewals/upgrades without changing prices or history.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
