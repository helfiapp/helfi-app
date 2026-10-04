import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.createSourceFile('credit.ts', fs.readFileSync('lib/credit-system.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const code = source.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(source)).join('\n')
async function main() {
  const now = new Date()
  let ledger: any = {
    users: {
      a: { id: 'a', additionalCredits: 10, walletMonthlyUsedCents: 0, walletMonthlyResetAt: now, subscription: null },
      b: { id: 'b', additionalCredits: 10, walletMonthlyUsedCents: 0, walletMonthlyResetAt: now, subscription: null },
      mixed: { id: 'mixed', additionalCredits: 2, walletMonthlyUsedCents: 698, walletMonthlyResetAt: now, subscription: { status: 'ACTIVE', plan: 'PREMIUM', monthlyPriceCents: 1000, startDate: now } },
      empty: { id: 'empty', additionalCredits: 0, walletMonthlyUsedCents: 0, walletMonthlyResetAt: now, subscription: null },
    },
    topups: [{ id: 'early', userId: 'mixed', amountCents: 3, usedCents: 0, expiresAt: new Date(now.getTime() + 86400000) }, { id: 'later', userId: 'mixed', amountCents: 10, usedCents: 0, expiresAt: new Date(now.getTime() + 172800000) }],
    events: [],
  }
  let queue = Promise.resolve()
  let markerFails = false
  let locks = 0
  const prisma = { $transaction: (operation: any) => {
    const pending = queue.then(async () => {
      const saved = structuredClone(ledger)
      let locked = false
      const requireLock = () => assert.equal(locked, true, 'wallet/marker access follows the PostgreSQL transaction lock')
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray) => { assert.match(strings.join('?'), /pg_advisory_xact_lock/); locked = true; locks++ },
        user: {
          findUnique: async ({ where }: any) => { requireLock(); return ledger.users[where.id] },
          update: async ({ where, data }: any) => { requireLock(); const user = ledger.users[where.id]; for (const [key, value] of Object.entries(data)) user[key] = typeof value === 'object' && value && 'decrement' in value ? user[key] - (value as any).decrement : value; return user },
        },
        creditTopUp: {
          findMany: async ({ where }: any) => { requireLock(); return ledger.topups.filter((item: any) => item.userId === where.userId && item.expiresAt > where.expiresAt.gt).sort((a: any, b: any) => +a.expiresAt - +b.expiresAt) },
          update: async ({ where, data }: any) => { requireLock(); Object.assign(ledger.topups.find((item: any) => item.id === where.id), data) },
        },
        aIUsageEvent: {
          findFirst: async ({ where }: any) => { requireLock(); return ledger.events.find((e: any) => e.userId === where.userId && e.runId === where.runId && e.feature === where.feature && e.createdAt >= where.createdAt.gte) || null },
          create: async ({ data }: any) => { requireLock(); if (markerFails) throw Error('Marker save failed'); ledger.events.push({ ...data, createdAt: new Date() }) },
        },
      }
      try { return await operation(tx) } catch (e) { ledger = saved; throw e }
    })
    queue = pending.then(() => {}, () => {})
    return pending
  } }
  const box: any = { exports: {}, prisma, Date, Math, Error, console, isSubscriptionActive: (sub: any) => sub?.status === 'ACTIVE' }
  vm.createContext(box)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box)
  const options = { feature: 'voice-assistant:realtime-charge-marker', runId: 'same-conversation', model: 'synthetic-model' }
  const a = new box.exports.CreditManager('a')
  const concurrent = await Promise.all([a.chargeCentsOnce(3, options), a.chargeCentsOnce(3, options), a.chargeCentsOnce(3, options)])
  assert.equal(concurrent.filter((r: any) => r.charged).length, 1)
  assert.equal(concurrent.filter((r: any) => r.reused).length, 2)
  assert.equal(ledger.users.a.additionalCredits, 7)
  assert.equal(ledger.events.length, 1)
  assert.equal(ledger.events[0].costCents, 0, 'retry claim does not double-count the route usage charge')
  const b = new box.exports.CreditManager('b')
  assert.equal((await b.chargeCentsOnce(3, options)).charged, true, 'charge reuse is isolated to the account')
  const mixed = new box.exports.CreditManager('mixed')
  assert.equal(await mixed.chargeCents(9), true)
  assert.equal(ledger.users.mixed.walletMonthlyUsedCents, 700)
  assert.equal(ledger.users.mixed.additionalCredits, 0)
  assert.equal(ledger.topups[0].usedCents, 3)
  assert.equal(ledger.topups[1].usedCents, 2, 'monthly, additional and earliest top-ups retain their charging order')
  const empty = new box.exports.CreditManager('empty')
  assert.equal((await empty.chargeCentsOnce(3, options)).success, false)
  assert.equal((await empty.chargeCentsOnce(3, options)).charged, false)
  assert.equal(ledger.users.empty.additionalCredits, 0)
  markerFails = true
  await assert.rejects(() => a.chargeCentsOnce(3, { ...options, runId: 'new-conversation' }), /Marker save failed/)
  assert.equal(ledger.users.a.additionalCredits, 7, 'failed marker rolls back the wallet update')
  markerFails = false
  assert.equal((await a.chargeCentsOnce(3, { ...options, runId: 'new-conversation' })).charged, true)
  assert.equal(ledger.users.a.additionalCredits, 4)
  assert.ok(locks >= 9)
  console.log('PASS: actual wallet methods charge concurrent retries once, isolate users, preserve monthly/manual/FIFO order, refuse insufficient balances and roll back failed charge claims.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
