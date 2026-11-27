const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { execFileSync } = require('node:child_process')

// Actual checkout confirmation with synthetic Stripe replies and records only.
const file = 'app/api/billing/confirm/route.ts'
const source = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
  : fs.readFileSync(file, 'utf8')
function fixture() {
  return {
    id: 'cs_synthetic', mode: 'payment', status: 'complete', payment_status: 'paid',
    amount_total: 500, amount_subtotal: 500, currency: 'usd',
    metadata: { helfi_user_id: 'owner-a', helfi_user_email: 'owner@fixture.invalid' },
    customer_details: { email: 'owner@fixture.invalid' },
    line_items: { has_more: false, data: [{ quantity: 1, description: 'Helfi Credit Top-up (250 credits)',
      price: { id: 'price_250', type: 'one_time', currency: 'usd', unit_amount: 500 }, amount_subtotal: 500 }] },
    payment_intent: { id: 'pi_synthetic', status: 'succeeded', latest_charge: { id: 'ch_synthetic', payment_intent: 'pi_synthetic', paid: true, refunded: false, amount_refunded: 0, disputed: false } },
  }
}
function setup(checkout = fixture(), options = {}) {
  const rows = [], notifications = [], errors = [], conversionChargeIds = [], acquiredLocks = []
  const locks = new Map()
  let writes = 0, failWrite = !!options.failWrite
  const db = {
    user: { findUnique: async ({ where }) => options.missingUser ? null :
      where.id === 'owner-a' || where.email === 'owner@fixture.invalid'
        ? { id: 'owner-a', email: 'owner@fixture.invalid', name: null } : null },
    creditTopUp: {
      findFirst: async ({ where }) => rows.find(row => row.source === where.source) || null,
      findMany: async ({ where }) => { await options.afterRefundRead?.(); return rows.filter(row => row.source === where.source) },
      create: async ({ data }) => { writes++; if (failWrite) throw Error('synthetic write failure'); const row = { id: `topup-${rows.length}`, ...data }; rows.push(row); return row },
      update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data),
    },
    affiliateConversion: { findFirst: async ({ where }) => { conversionChargeIds.push(where.stripeChargeId); return null } },
    $transaction: async work => {
      const releases = []
      const tx = { ...db, $executeRaw: async (_sql, key) => {
        const prior = locks.get(key) || Promise.resolve()
        let release
        const held = new Promise(resolve => { release = resolve })
        locks.set(key, prior.then(() => held))
        await prior
        acquiredLocks.push(key)
        releases.push(release)
        return 1
      } }
      try { return await work(tx) } finally { for (const release of releases) release() }
    },
  }
  const dependencies = {
    'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
    'next-auth': { getServerSession: async () => options.guest ? null : { user: { id: options.otherUser ? 'owner-b' : 'owner-a', email: options.otherUser ? 'other@fixture.invalid' : 'owner@fixture.invalid' } } },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { prisma: db },
    stripe: { default: class {
      checkout = { sessions: { retrieve: async () => { if (options.checkoutError) throw Error('synthetic checkout outage'); await options.afterCheckoutRead?.(); return structuredClone(checkout) }, list: async () => { if (options.listError) throw Error('synthetic checkout search outage'); return { data: options.noCheckoutMatch ? [] : [structuredClone(checkout)] } } } }
      paymentIntents = { retrieve: async (id, params, requestOptions) => {
        assert.equal(id, 'pi_synthetic'); assert.equal(params.expand[0], 'latest_charge')
        assert.equal(requestOptions.maxNetworkRetries, 0); assert.ok(requestOptions.timeout <= 5000)
        if (options.providerError) throw Error('synthetic provider outage')
        const result = structuredClone(checkout.payment_intent)
        await options.afterPaymentRead?.()
        return result
      } }
      charges = { retrieve: async id => { assert.equal(id, 'ch_synthetic'); if (options.chargeError) throw Error('synthetic charge outage'); return structuredClone(options.charge || checkout.payment_intent.latest_charge) } }
      webhooks = { constructEvent: text => JSON.parse(text) }
    } },
    '@/lib/owner-notifications': { notifyOwner: async data => { notifications.push(data) } },
    '@/lib/error-reporter': { reportCriticalError: data => { errors.push(data.source) } },
  }
  const helper = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stripe-credit-purchase.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: helper, Date, process: { env: { STRIPE_PRICE_CREDITS_250: 'price_250', STRIPE_PRICE_CREDITS_500: 'price_500', STRIPE_PRICE_CREDITS_1000: 'price_1000' } },
      require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected helper dependency ${name}`); return dependencies[name] } })
  dependencies['@/lib/stripe-credit-purchase'] = helper
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Date, console: { error() {} }, process: { env: { STRIPE_SECRET_KEY: 'synthetic-test-key', STRIPE_PRICE_CREDITS_250: 'price_250', STRIPE_PRICE_CREDITS_500: 'price_500', STRIPE_PRICE_CREDITS_1000: 'price_1000' } },
      require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name] } }, { filename: file })
  const webhookExports = {}, webhookFile = 'app/api/billing/webhook/route.ts'
  const webhookDependencies = { ...dependencies,
    '@/lib/email-client': { isEmailConfigured: () => false }, '@/lib/email-footer': {}, '@/lib/practitioner-emails': {},
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(webhookFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: webhookExports, Date, console: { error() {}, log() {} }, process: { env: {} },
      require(name) { assert.ok(Object.hasOwn(webhookDependencies, name), `Unexpected webhook dependency ${name}`); return webhookDependencies[name] } }, { filename: webhookFile })
  return { rows, notifications, errors, conversionChargeIds, acquiredLocks, get writes() { return writes }, allowWrite: () => { failWrite = false }, call: async (id = 'cs_synthetic') => {
    const response = await exports.GET({ url: `https://helfi.invalid/api/billing/confirm${id === null ? '' : `?session_id=${id}`}` })
    return { status: response.status, body: await response.json() }
  }, webhook: async type => {
    const object = type.startsWith('checkout.session.') ? structuredClone(options.eventCheckout || checkout) : type === 'charge.dispute.created' ? { id: 'dp_synthetic', charge: 'ch_synthetic', payment_intent: 'pi_synthetic' } : structuredClone(checkout.payment_intent.latest_charge)
    const response = await webhookExports.POST({ headers: new Headers(), text: async () => JSON.stringify({ id: 'evt_synthetic', type, data: { object } }) })
    return { status: response.status, body: await response.json() }
  } }
}

async function createCheckout(body, guest = false) {
  const calls = [], exports = {}
  const dependencies = {
    'next/server': { NextResponse: { json: (data, opts) => Response.json(data, opts) } },
    stripe: { default: class { prices = { retrieve: async () => ({ active: true, type: 'one_time' }) }; checkout = { sessions: { create: async params => { calls.push(params); return { url: 'https://checkout.fixture.invalid' } } } } } },
    'next-auth': { getServerSession: async () => guest ? null : { user: { id: 'owner-a', email: 'owner@fixture.invalid' } } },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { prisma: {} }, crypto: {},
    '@/lib/affiliate-cookies': { getAffiliateCookieData: () => null },
  }
  const createFile = 'app/api/billing/create-checkout-session/route.ts'
  const createSource = fs.readFileSync(createFile, 'utf8')
  vm.runInNewContext(ts.transpileModule(createSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Date, console: { error() {} }, process: { env: { STRIPE_SECRET_KEY: 'synthetic-test-key', STRIPE_PRICE_CREDITS_250: 'price_250' } },
      require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name] } }, { filename: createFile })
  const response = await exports.POST({ url: 'https://helfi.invalid/api/billing/create-checkout-session', json: async () => body })
  return { status: response.status, body: await response.json(), calls }
}

async function main() {
  const results = []
  const record = (group, detail) => { results.push({ group, ...detail }); console.log(`PASS ${group}`) }
  const paid = run => run.webhook('checkout.session.completed')
  {
    const checkout = fixture(), delayed = setup(checkout)
    const replies = await Promise.all(Array.from({ length: 8 }, () => delayed.webhook('checkout.session.async_payment_succeeded')))
    assert.ok(replies.every(reply => reply.status === 200))
    assert.equal(delayed.rows.length, 1, 'Delayed paid notice must grant without a browser redirect')
    await paid(delayed); await delayed.call()
    assert.equal(delayed.rows.length, 1, 'Completed and redirect retries cannot duplicate a delayed purchase')
    const failedCheckout = fixture(); failedCheckout.payment_status = 'unpaid'
    const failed = setup(failedCheckout)
    assert.equal((await failed.webhook('checkout.session.async_payment_failed')).status, 200)
    assert.equal(failed.rows.length, 0)
    const retryOptions = { providerError: true }, retry = setup(fixture(), retryOptions)
    assert.equal((await retry.webhook('checkout.session.async_payment_succeeded')).status, 500)
    assert.equal(retry.rows.length, 0)
    retryOptions.providerError = false
    assert.equal((await retry.webhook('checkout.session.async_payment_succeeded')).status, 200)
    assert.equal(retry.rows.length, 1)
    record('delayed payment success, retries and failed payment', { notices: 8, topUps: 1, failedTopUps: 0, failureRetryTopUps: 1 })
  }
  const race = setup()
  const replies = await Promise.all(Array.from({ length: 12 }, () => race.call()))
  assert.ok(replies.every(reply => reply.status === 200))
  assert.equal(race.rows.length, 1, 'one checkout must grant once under concurrent retries')
  assert.equal(race.rows[0].amountCents, 250)
  assert.equal(race.notifications.length, 1)
  assert.equal(replies.filter(reply => reply.body.alreadyProcessed).length, 11)

  const discounted = fixture(); discounted.amount_total = 400
  const discount = setup(discounted)
  assert.equal((await discount.call()).status, 200)
  assert.equal(discount.rows[0].amountCents, 250, 'discount changes cash paid, not the pack purchased')
  const multiple = fixture(); multiple.amount_total = 1200; multiple.amount_subtotal = 1500; multiple.line_items.data[0].quantity = 3; multiple.line_items.data[0].amount_subtotal = 1500
  const packs = setup(multiple)
  assert.equal((await packs.call()).status, 200)
  assert.equal(packs.rows[0].amountCents, 750, 'all three verified packs grant once')
  const identified = fixture(); identified.metadata.helfi_credit_plan = 'credits_250'; identified.metadata.helfi_credit_quantity = '1'
  const exact = setup(identified); assert.equal((await exact.call()).status, 200); assert.equal(exact.rows[0].amountCents, 250)
  const legacy = fixture(); legacy.line_items.data[0].price.id = 'price_inline_fallback'
  const fallback = setup(legacy); assert.equal((await fallback.call()).status, 200); assert.equal(fallback.rows[0].amountCents, 250)

  for (const change of [
    checkout => { checkout.mode = 'subscription' },
    checkout => { checkout.payment_status = 'unpaid' },
    checkout => { checkout.line_items.data[0].price.id = 'price_unrelated'; checkout.line_items.data[0].description = 'Practitioner boost' },
    checkout => { checkout.line_items.data[0].quantity = 1.5 },
    checkout => { checkout.line_items.data[0].quantity = Number.MAX_SAFE_INTEGER },
    checkout => { checkout.line_items.has_more = true },
    checkout => { checkout.metadata.helfi_credit_plan = 'credits_1000'; checkout.metadata.helfi_credit_quantity = '1' },
    checkout => { checkout.metadata.helfi_credit_plan = 'credits_250'; checkout.metadata.helfi_credit_quantity = '3' },
    checkout => { checkout.payment_intent.latest_charge.payment_intent = 'pi_other' },
    checkout => { checkout.payment_intent.latest_charge.paid = false },
  ]) {
    const checkout = fixture(); change(checkout); const run = setup(checkout)
    assert.equal((await run.call()).status, 400)
    assert.equal(run.rows.length, 0)
  }
  const other = setup(fixture(), { otherUser: true })
  assert.equal((await other.call()).status, 403); assert.equal(other.writes, 0)
  const guest = setup(fixture(), { guest: true })
  assert.equal((await guest.call()).status, 200); assert.equal(guest.rows[0].userId, 'owner-a')
  const missing = setup(fixture(), { missingUser: true })
  assert.equal((await missing.call()).status, 404); assert.equal(missing.writes, 0)
  const unidentified = fixture(); unidentified.metadata = {}; unidentified.customer_details = null
  const noBuyer = setup(unidentified, { guest: true })
  assert.equal((await noBuyer.call()).status, 404); assert.equal(noBuyer.writes, 0)
  const sessionFallback = setup(unidentified)
  assert.equal((await sessionFallback.call()).status, 200); assert.equal(sessionFallback.rows[0].userId, 'owner-a')
  const noWebhookBuyer = setup(unidentified)
  assert.equal((await noWebhookBuyer.webhook('checkout.session.completed')).status, 500); assert.equal(noWebhookBuyer.writes, 0)
  const retry = setup(fixture(), { failWrite: true })
  assert.equal((await retry.call()).status, 500); assert.equal(retry.rows.length, 0); assert.equal(retry.notifications.length, 0)
  retry.allowWrite(); assert.equal((await retry.call()).status, 200); assert.equal(retry.rows.length, 1)
  assert.equal((await retry.call(null)).status, 400)
  for (const guest of [false, true]) {
    const created = await createCheckout({ plan: 'credits_250', quantity: 2 }, guest)
    assert.equal(created.status, 200)
    assert.equal(created.calls.length, 1)
    assert.equal(created.calls[0].line_items[0].quantity, 2)
    assert.equal(created.calls[0].metadata.helfi_credit_plan, 'credits_250')
    assert.equal(created.calls[0].metadata.helfi_credit_quantity, '2')
    assert.equal(created.calls[0].payment_intent_data.metadata.helfi_credit_plan, 'credits_250')
    assert.equal(created.calls[0].allow_promotion_codes, true)
  }
  for (const body of [{ plan: 'credits_unknown' }, { plan: {} }, { plan: 'constructor' }, { plan: '__proto__' }, ...[0, -1, 0.5, Number.MAX_SAFE_INTEGER].map(quantity => ({ plan: 'credits_250', quantity }))]) {
    const created = await createCheckout(body)
    assert.equal(created.status, 400)
    assert.equal(created.calls.length, 0)
  }
  for (const [type, change] of [
    ['charge.refunded', charge => { charge.refunded = true; charge.amount_refunded = 500 }],
    ['charge.refunded', charge => { charge.amount_refunded = 100 }],
    ['charge.dispute.created', charge => { charge.disputed = true }],
  ]) {
    const before = fixture(); const refundFirst = setup(before)
    change(before.payment_intent.latest_charge)
    assert.equal((await refundFirst.webhook(type)).status, 200)
    assert.equal((await refundFirst.call()).status, 400, 'an earlier full/partial refund or dispute cannot become a fresh grant')
    assert.equal(refundFirst.rows.length, 0)
    assert.deepEqual(refundFirst.conversionChargeIds, ['ch_synthetic'], 'dispute must resolve the real charge, not its dispute ID')

    const after = fixture(); const grantFirst = setup(after)
    assert.equal((await grantFirst.call()).status, 200)
    grantFirst.rows[0].usedCents = 30
    change(after.payment_intent.latest_charge)
    assert.equal((await grantFirst.webhook(type)).status, 200)
    assert.equal(grantFirst.rows[0].usedCents, 250, 'existing policy revokes all remaining credits on any refund/dispute')
    assert.equal((await grantFirst.call()).body.alreadyProcessed, true)
    assert.equal(grantFirst.rows.length, 1)
  }
  function gate() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
  const read = gate(), resume = gate(), concurrent = fixture()
  const duringGrant = setup(concurrent, { afterPaymentRead: async () => { read.resolve(); await resume.promise } })
  const granting = duringGrant.call()
  await read.promise
  concurrent.payment_intent.latest_charge.refunded = true
  concurrent.payment_intent.latest_charge.amount_refunded = 500
  const refunding = duringGrant.webhook('charge.refunded')
  resume.resolve()
  assert.equal((await granting).status, 200)
  assert.equal((await refunding).status, 200)
  assert.equal(duringGrant.rows.length, 1)
  assert.equal(duringGrant.rows[0].usedCents, 250, 'refund waits for the active grant, then revokes its row')
  assert.ok(duringGrant.acquiredLocks.every(key => key === 'stripe:cs_synthetic'))

  const refundRead = gate(), refundResume = gate(), refundBeforeLock = fixture()
  refundBeforeLock.payment_intent.latest_charge.amount_refunded = 100
  const duringRefund = setup(refundBeforeLock, { afterRefundRead: async () => { refundRead.resolve(); await refundResume.promise } })
  const firstRefund = duringRefund.webhook('charge.refunded')
  await refundRead.promise
  const waitingGrant = duringRefund.call()
  refundResume.resolve()
  assert.equal((await firstRefund).status, 200)
  assert.equal((await waitingGrant).status, 400)
  assert.equal(duringRefund.rows.length, 0, 'grant waits for refund and reads authoritative status after acquiring its lock')

  const outage = setup(fixture(), { providerError: true })
  assert.equal((await outage.call()).status, 500); assert.equal(outage.writes, 0)
  const stringCharge = fixture(), originalCharge = stringCharge.payment_intent.latest_charge
  stringCharge.payment_intent.latest_charge = 'ch_synthetic'
  const resolvedCharge = setup(stringCharge, { charge: originalCharge })
  assert.equal((await resolvedCharge.call()).status, 200, 'a non-expanded charge ID is retrieved before granting')
  record('approved confirmation/create/refund regressions and baseline session lookup', { result: 'PASS' })
  {
    const run = setup()
    assert.equal((await paid(run)).status, 200)
    assert.equal(run.rows.length, 1)
    assert.equal(run.rows[0].amountCents, 250)
    assert.equal(run.rows[0].userId, 'owner-a')
    assert.equal(run.rows[0].source, 'stripe:cs_synthetic')
    const expectedExpiry = new Date(run.rows[0].purchasedAt); expectedExpiry.setUTCMonth(expectedExpiry.getUTCMonth() + 12)
    assert.equal(run.rows[0].expiresAt.getTime(), expectedExpiry.getTime())
    await Promise.all(Array.from({ length: 7 }, () => paid(run)))
    assert.equal(run.rows.length, 1)
    record('webhook-only delivery and duplicate retry', { notices: 8, topUps: 1, credits: 250, expiryMonths: 12 })
  }
  for (const first of ['webhook', 'confirm']) {
    const run = setup()
    if (first === 'webhook') { await paid(run); await run.call() } else { await run.call(); await paid(run) }
    assert.equal(run.rows.length, 1)
    record(`${first} first`, { topUps: 1 })
  }
  for (let repeat = 0; repeat < 4; repeat++) {
    const run = setup()
    const replies = await Promise.all([...Array.from({ length: 8 }, () => paid(run)), ...Array.from({ length: 8 }, () => run.call())])
    assert.ok(replies.every(reply => reply.status === 200))
    assert.equal(run.rows.length, 1)
    assert.equal(run.writes, 1)
    assert.ok(run.acquiredLocks.every(key => key === 'stripe:cs_synthetic'))
  }
  record('concurrent mixed delivery', { runs: 4, confirmationsPerRun: 8, webhooksPerRun: 8, topUpsPerRun: 1 })
  for (const failure of ['checkoutError', 'providerError', 'chargeError', 'failWrite']) {
    const checkout = fixture()
    const charge = checkout.payment_intent.latest_charge
    if (failure === 'chargeError') checkout.payment_intent.latest_charge = charge.id
    const options = { [failure]: true, charge }
    const run = setup(checkout, options)
    assert.equal((await paid(run)).status, 500)
    assert.equal(run.rows.length, 0)
    assert.equal(run.notifications.length, 0)
    options[failure] = false; run.allowWrite()
    assert.equal((await paid(run)).status, 200)
    assert.equal(run.rows.length, 1)
    await paid(run); assert.equal(run.rows.length, 1)
  }
  record('provider and database failure recovery', { stages: ['checkout', 'payment', 'charge', 'database'], failedStatus: 500, retryTopUps: 1 })
  {
    const checkout = fixture(), options = {}, run = setup(checkout, options)
    await paid(run); run.rows[0].usedCents = 30
    checkout.payment_intent.latest_charge.amount_refunded = 100
    options.listError = true
    assert.equal((await run.webhook('charge.refunded')).status, 500)
    assert.equal(run.rows[0].usedCents, 30)
    options.listError = false
    assert.equal((await run.webhook('charge.refunded')).status, 200)
    assert.equal(run.rows[0].usedCents, 250)
    assert.equal((await run.webhook('charge.refunded')).status, 200)
    assert.equal(run.rows.length, 1); assert.equal(run.rows[0].usedCents, 250)
    options.noCheckoutMatch = true
    assert.equal((await run.webhook('charge.refunded')).status, 200)
    assert.equal(run.rows.length, 1); assert.equal(run.rows[0].usedCents, 250)
    record('refund lookup failure retries without false acknowledgement', { failureStatus: 500, usageUnchangedOnFailure: 30, retryRevokedCredits: 250, duplicateTopUps: 1, validNoMatchStatus: 200 })
  }

  for (const change of [checkout => { checkout.status = 'open' }, checkout => { checkout.payment_status = 'unpaid' }, checkout => { checkout.payment_intent.latest_charge = null }, checkout => { delete checkout.payment_intent.latest_charge.disputed }]) {
    const checkout = fixture(), options = { eventCheckout: fixture() }
    change(checkout)
    const run = setup(checkout, options)
    assert.equal((await paid(run)).status, 500)
    assert.equal(run.rows.length, 0)
    Object.assign(checkout, fixture())
    assert.equal((await paid(run)).status, 200)
    assert.equal(run.rows.length, 1)
  }
  record('unconfirmed authoritative state retries', { cases: 4, failedStatus: 500, retryTopUps: 1 })
  for (const [type, change] of [
    ['charge.refunded', charge => { charge.refunded = true; charge.amount_refunded = 500 }],
    ['charge.refunded', charge => { charge.amount_refunded = 100 }],
    ['charge.dispute.created', charge => { charge.disputed = true }],
  ]) {
    const before = fixture(), options = { eventCheckout: fixture() }, run = setup(before, options)
    change(before.payment_intent.latest_charge)
    assert.equal((await run.webhook(type)).status, 200)
    assert.equal((await paid(run)).status, 200)
    assert.equal(run.rows.length, 0)
    const after = fixture(), granted = setup(after)
    await paid(granted); granted.rows[0].usedCents = 30
    change(after.payment_intent.latest_charge)
    await granted.webhook(type); await paid(granted); await granted.call()
    assert.equal(granted.rows.length, 1)
    assert.equal(granted.rows[0].usedCents, 250)
  }
  record('late paid notice after full/partial refund or dispute', { cases: 3, newTopUpsAfterReversal: 0, existingRemainingCredits: 0 })
  {
    const read = gate(), resume = gate(), checkout = fixture()
    const run = setup(checkout, { afterPaymentRead: async () => { read.resolve(); await resume.promise } })
    const granting = paid(run); await read.promise
    checkout.payment_intent.latest_charge.amount_refunded = 100
    const refunding = run.webhook('charge.refunded'); resume.resolve()
    assert.equal((await granting).status, 200); assert.equal((await refunding).status, 200)
    assert.equal(run.rows.length, 1); assert.equal(run.rows[0].usedCents, 250)
    const read2 = gate(), resume2 = gate(), checkout2 = fixture()
    checkout2.payment_intent.latest_charge.amount_refunded = 100
    const run2 = setup(checkout2, { afterRefundRead: async () => { read2.resolve(); await resume2.promise } })
    const refunding2 = run2.webhook('charge.refunded'); await read2.promise
    const granting2 = paid(run2); resume2.resolve()
    assert.equal((await refunding2).status, 200); assert.equal((await granting2).status, 200)
    assert.equal(run2.rows.length, 0)
    record('webhook/refund overlap both lock orders', { grantFirst: 'granted then fully revoked', refundFirst: 'no grant' })
  }
  for (const [credits, cents] of [[100, 200], [250, 500], [500, 1000], [1000, 2000]]) {
    const checkout = fixture()
    const title = `Helfi Credit Top-up (${credits === 1000 ? '1,000' : credits} credits)`
    Object.assign(checkout, { amount_subtotal: cents * 3, amount_total: cents * 2 })
    Object.assign(checkout.metadata, { helfi_credit_plan: `credits_${credits}`, helfi_credit_quantity: '3' })
    Object.assign(checkout.line_items.data[0], { quantity: 3, description: title, amount_subtotal: cents * 3, price: { id: `price_${credits}`, type: 'one_time', currency: 'usd', unit_amount: cents } })
    const run = setup(checkout); assert.equal((await paid(run)).status, 200)
    assert.equal(run.rows[0].amountCents, credits * 3)
    await run.call(); assert.equal(run.rows.length, 1)
  }
  for (const change of [checkout => { checkout.line_items.data[0].quantity = 0.5 }, checkout => { checkout.line_items.has_more = true }, checkout => { checkout.metadata.helfi_credit_plan = 'credits_1000'; checkout.metadata.helfi_credit_quantity = '1' }, checkout => { checkout.line_items.data[0].quantity = Number.MAX_SAFE_INTEGER }, checkout => { checkout.line_items.data[0].description = 'Unrelated purchase'; checkout.line_items.data[0].price.id = 'price_other' }, checkout => { checkout.mode = 'subscription' }]) {
    const checkout = fixture(); change(checkout)
    const run = setup(checkout); assert.equal((await paid(run)).status, 200); assert.equal(run.rows.length, 0)
  }
  record('all packs discounted quantities and unrelated/invalid purchases', { validPacks: 4, quantity: 3, invalidCasesIgnored: 6 })
  for (const mapping of ['metadataId', 'metadataEmail', 'checkoutEmail', 'customerEmail']) {
    const checkout = fixture()
    if (mapping !== 'metadataId') delete checkout.metadata.helfi_user_id
    if (['checkoutEmail', 'customerEmail'].includes(mapping)) delete checkout.metadata.helfi_user_email
    if (mapping === 'metadataId') checkout.customer_details.email = 'unrelated@fixture.invalid'
    if (mapping === 'metadataEmail') checkout.customer_details.email = 'unrelated@fixture.invalid'
    if (mapping === 'customerEmail') { checkout.customer_details = null; checkout.customer_email = ' OWNER@FIXTURE.INVALID ' }
    const run = setup(checkout, { guest: true })
    assert.equal((await paid(run)).status, 200); assert.equal(run.rows[0].userId, 'owner-a')
    assert.equal((await run.call()).body.alreadyProcessed, true)
  }
  {
    const checkout = fixture(); checkout.metadata.helfi_user_id = 'not-a-real-account'
    const run = setup(checkout); assert.equal((await paid(run)).status, 500); assert.equal(run.rows.length, 0)
    const options = { missingUser: true }, retry = setup(fixture(), options)
    assert.equal((await paid(retry)).status, 500); options.missingUser = false
    assert.equal((await paid(retry)).status, 200); assert.equal(retry.rows.length, 1)
  }
  record('guest and authoritative account mapping', { supportedMappings: 4, missingMetadataAccountDoesNotFallBack: true, laterAccountRetry: 1 })
  console.log('PASS: actual checkout/confirmation/refund handlers: concurrency, packs/discounts/quantity, unrelated payments, owner/guest, failure recovery, full/partial refunds, disputes and both refund/grant orderings. Synthetic only; no real payment, email, network or database.')
  return results
}
main().catch(error => { console.error(error); process.exitCode = 1 })
