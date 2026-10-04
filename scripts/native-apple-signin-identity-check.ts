import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(fs.readFileSync('app/api/native-auth/apple/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function run(payload: Record<string, any>, body: Record<string, any> = {}, linked = false, invalidToken = false) {
  const calls: any[] = []
  const victim = { id: 'victim', email: 'victim@fixture.invalid', name: 'Fixture', image: null }
  let current = linked ? { id: 'linked-user', email: 'linked@fixture.invalid', name: 'Linked', image: null } : null
  const prisma = {
    user: {
      findFirst: async (options: any) => { calls.push({ findSubject: options }); return current },
      findUnique: async (options: any) => { calls.push({ findUser: options }); return options.where.email === victim.email ? victim : current },
      create: async (options: any) => { calls.push({ created: options.data }); current = { id: 'new-user', email: options.data.email, name: options.data.name, image: null }; return current },
      update: async (options: any) => { calls.push({ updated: options }); return current },
    },
    account: {
      upsert: async (options: any) => { calls.push({ linked: options }); if (options.create.userId === victim.id) current = victim },
      updateMany: async (options: any) => { calls.push({ refreshed: options }) },
    },
  }
  const context: any = {
    exports: {}, URL, Date, console: { error() {} }, process: { env: { NEXTAUTH_SECRET: 'fixture-only-secret', APPLE_CLIENT_ID: 'fixture.service' } },
    require(name: string) {
      if (name === 'next/server') return { NextResponse: { json: (value: any, options: any) => Response.json(value, options) } }
      if (name === 'next-auth/jwt') return { encode: async (options: any) => { calls.push({ sessionUser: options.token.sub }); return 'fixture-session' } }
      if (name === 'jose') return {
        createRemoteJWKSet: () => 'fixture-keys',
        jwtVerify: async (_token: string, keys: any, options: any) => {
          assert.equal(keys, 'fixture-keys')
          assert.equal(options.issuer, 'https://appleid.apple.com')
          assert.ok(options.audience.includes('ai.helfi.app'))
          if (invalidToken) throw new Error('Synthetic invalid signature')
          return { payload }
        },
      }
      if (name === '@/lib/free-credits') return { ensureFreeCreditColumns: async () => {}, NEW_USER_FREE_CREDITS: {} }
      if (name === '@/lib/prisma') return { prisma }
      throw new Error('Unexpected fixture dependency')
    },
  }
  vm.runInNewContext(code, context)
  const response: Response = await context.exports.POST({ json: async () => ({ identityToken: 'fixture-identity', ...body }) })
  return { response, body: await response.json(), calls }
}

async function main() {
  for (const payload of [
    { sub: 'attacker' },
    { sub: 'attacker', email: 'victim@fixture.invalid', email_verified: false },
    { sub: 'attacker', email: 'victim@fixture.invalid', email_verified: 'false' },
    { sub: 'attacker', email: 'victim@fixture.invalid' },
  ]) {
    const denied = await run(payload, { email: 'victim@fixture.invalid' })
    assert.equal(denied.response.status, 400)
    assert.ok(!denied.calls.some(call => call.created || call.linked || call.sessionUser || call.findUser), 'untrusted email must not select/link an account')
  }
  for (const verified of [true, 'true']) {
    const created = await run({ sub: 'apple-new', email: 'new@fixture.invalid', email_verified: verified }, { email: 'victim@fixture.invalid' })
    assert.equal(created.response.status, 200)
    assert.equal(created.body.user.email, 'new@fixture.invalid')
    assert.equal(created.calls.find(call => call.linked).linked.create.userId, 'new-user')
  }
  const returning = await run({ sub: 'linked-apple' }, { email: 'victim@fixture.invalid' }, true)
  assert.equal(returning.response.status, 200)
  assert.equal(returning.body.user.id, 'linked-user')
  assert.equal(returning.calls.find(call => call.refreshed).refreshed.where.providerAccountId, 'linked-apple')
  assert.ok(!returning.calls.some(call => call.linked || call.created))
  const legitimateLink = await run({ sub: 'apple-existing', email: 'victim@fixture.invalid', email_verified: true })
  assert.equal(legitimateLink.response.status, 200)
  assert.equal(legitimateLink.body.user.id, 'victim')
  for (const test of [await run({}, { identityToken: '' }), await run({ sub: 'bad' }, {}, false, true)]) {
    assert.ok(test.response.status >= 400)
    assert.equal(test.calls.length, 0)
  }
  console.log('PASS: actual Apple sign-in route trusts only verified signed email, rejects client-email account takeover, keeps linked returning sign-in and validates issuer/audience before account work.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
