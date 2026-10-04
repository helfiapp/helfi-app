const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { redactDatabaseUrls } = require('./lib/redact-database-urls')

const source = fs.readFileSync('lib/prisma.ts', 'utf8')
assert.ok(!/postgres(?:ql)?:\/\//i.test(source), 'Prisma must not contain a built-in database URL')
assert.ok(!source.includes('FALLBACK_DB_URL'))
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 })

function load(databaseUrl, nodeEnv = 'production') {
  const clients = []
  const guards = []
  const events = []
  class PrismaClient {
    constructor(options) { this.options = options; clients.push(this) }
    async $disconnect() { this.disconnected = true }
  }
  const context = {
    exports: {}, process: { env: { DATABASE_URL: databaseUrl, NODE_ENV: nodeEnv }, on: (name, fn) => events.push({ name, fn }) },
    require: (name) => name === '@prisma/client' ? { PrismaClient } : name === './prisma-write-guard' ? { attachWriteGuard: (client) => guards.push(client) } : assert.fail('Unexpected dependency'),
  }
  vm.runInNewContext(compiled, context)
  return { clients, guards, events, context }
}

;(async () => {
  for (const missing of [undefined, '', '   ']) {
    assert.throws(() => load(missing), /DATABASE_URL must be configured/)
  }
  const valid = load('  postgresql://fixture.invalid/fixture  ')
  assert.equal(valid.clients.length, 1)
  assert.equal(valid.clients[0].options.datasources.db.url, 'postgresql://fixture.invalid/fixture')
  assert.equal(valid.guards[0], valid.clients[0], 'write guard remains attached')
  assert.equal(valid.events[0].name, 'beforeExit')
  await valid.events[0].fn()
  assert.equal(valid.clients[0].disconnected, true)
  const dev = load('postgresql://fixture.invalid/fixture', 'development')
  assert.equal(dev.context.prisma, dev.clients[0], 'development client cache remains')
  const sample = "const url = 'postgresql://test-user:synthetic-password@fixture.invalid/db?sslmode=require';\nsecond=postgres://other:synthetic@fixture.invalid/other\nordinary source"
  const redacted = redactDatabaseUrls(sample)
  assert.ok(!redacted.includes('synthetic-password'))
  assert.ok(!/postgres(?:ql)?:\/\//i.test(redacted))
  assert.ok(redacted.includes('ordinary source'))
  assert.equal((redacted.match(/REDACTED_DATABASE_URL/g) || []).length, 2)
  assert.ok(fs.readFileSync('scripts/build-support-code-index.js', 'utf8').includes('redactDatabaseUrls(fs.readFileSync'))
  console.log('PASS: actual Prisma module requires protected database settings, preserves write guard/cache/disconnect; generated support excerpts redact database URLs.')
})().catch(() => { console.error('Database environment safety fixture failed; no values displayed.'); process.exitCode = 1 })
