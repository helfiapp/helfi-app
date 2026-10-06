import assert from 'node:assert/strict'
import fs from 'node:fs'
import jwt from 'jsonwebtoken'
import { issueAdminSession, verifyAdminRefreshClaims, canRefreshAdminSession } from '../lib/admin-session'
import { readStoredAdminSession, writeStoredAdminSession, refreshStoredAdminSession } from '../lib/admin-browser-session'

async function main() {
// Synthetic fixture credentials only. No real accounts, environment secrets or services.
const secret = 'offline-admin-session-fixture-only'
const account = { id: 'fixture-admin', email: 'admin@example.test', role: 'ADMIN', password: 'fixture-password-hash', isActive: true }
const token = issueAdminSession(account, secret)
const claims = verifyAdminRefreshClaims(token, secret)!
assert.ok(claims)
assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60)
assert.throws(() => jwt.verify(token, secret, { clockTimestamp: claims.iat + 8 * 86400 }))
assert.ok(canRefreshAdminSession(claims, account, secret, (claims.iat + 366 * 86400) * 1000), 'remembered browser survives a long idle period')
for (const changed of [
  { ...account, isActive: false }, { ...account, password: 'changed-password-hash' },
  { ...account, role: 'REVOKED' }, { ...account, id: 'different-admin' }, { ...account, email: 'changed@example.test' },
]) assert.equal(canRefreshAdminSession(claims, changed, secret), false)
assert.equal(verifyAdminRefreshClaims(token, 'wrong-signing-key'), null)
assert.equal(verifyAdminRefreshClaims(token + 'tampered', secret), null)
assert.equal(verifyAdminRefreshClaims(jwt.sign({ adminId: account.id }, secret), secret), null)
assert.equal(canRefreshAdminSession({ ...claims, sessionVersion: 'broken' }, account, secret), false)
assert.equal(canRefreshAdminSession({ ...claims, iat: claims.iat + 86400 }, account, secret), false)
const legacy = { ...claims, sessionVersion: undefined }
assert.ok(canRefreshAdminSession(legacy, account, secret, (claims.iat + 29 * 86400) * 1000))
assert.equal(canRefreshAdminSession(legacy, account, secret, (claims.iat + 31 * 86400) * 1000), false)

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } } as Storage
}
const storage = () => ({ localStorage: memory(), sessionStorage: memory() })
const fresh = { token: 'new-fixture-token', admin: { id: 'fixture-admin' } }
const older = { token: 'stale-fixture-token', admin: { id: 'fixture-admin' } }
const s = storage()
writeStoredAdminSession(s, older)
s.localStorage.setItem('adminUser', JSON.stringify(fresh.admin))
s.localStorage.setItem('adminToken', fresh.token)
assert.equal(readStoredAdminSession(s)?.token, fresh.token, 'fresh other-tab login beats stale session storage')
const success = await refreshStoredAdminSession(s, (async () => new Response(JSON.stringify({ token: 'renewed-fixture', admin: fresh.admin }), { status: 200 })) as typeof fetch)
assert.equal(success.session?.token, 'renewed-fixture')
assert.equal(s.sessionStorage.getItem('adminToken'), 'renewed-fixture')
assert.equal(s.localStorage.getItem('adminToken'), 'renewed-fixture')
for (const status of [500, 502, 503, 504]) {
  const result = await refreshStoredAdminSession(s, (async () => new Response('', { status })) as typeof fetch)
  assert.equal(result.invalid, false)
  assert.equal(result.session?.token, 'renewed-fixture', 'server outages must not log the owner out')
}
const offline = await refreshStoredAdminSession(s, (async () => { throw new Error('offline fixture') }) as typeof fetch)
assert.equal(offline.invalid, false)
assert.equal(offline.session?.token, 'renewed-fixture')
for (const status of [401, 403]) {
  const result = await refreshStoredAdminSession(s, (async () => new Response('', { status })) as typeof fetch)
  assert.equal(result.invalid, true, 'a genuinely invalid/revoked session must still sign out')
}
const changedInFlight = await refreshStoredAdminSession(s, (async () => {
  writeStoredAdminSession(s, fresh)
  return new Response('', { status: 401 })
}) as typeof fetch)
assert.equal(changedInFlight.invalid, false)
assert.equal(changedInFlight.session?.token, fresh.token, 'late rejection must not clear a new login')
const newerInFlight = await refreshStoredAdminSession(s, (async () => {
  writeStoredAdminSession(s, { ...fresh, token: 'other-tab-newer' })
  return new Response(JSON.stringify({ token: 'obsolete-response', admin: fresh.admin }), { status: 200 })
}) as typeof fetch)
assert.equal(newerInFlight.session?.token, 'other-tab-newer')
const signedOutInFlight = await refreshStoredAdminSession(s, (async () => {
  for (const source of [s.localStorage, s.sessionStorage]) {
    source.removeItem('adminToken'); source.removeItem('adminUser')
  }
  return new Response(JSON.stringify({ token: 'late-response', admin: fresh.admin }), { status: 200 })
}) as typeof fetch)
assert.equal(signedOutInFlight.session, null, 'late refresh must not undo explicit Logout')

for (const file of ['auth/route.ts', 'refresh-token/route.ts', 'qr-login/status/route.ts', 'qr-generate/route.ts']) {
  const source = fs.readFileSync(`app/api/admin/${file}`, 'utf8')
  assert.ok(source.includes('issueAdminSession(adminUser, JWT_SECRET)'), `${file} must issue credential-bound remembered sessions`)
  assert.ok(!source.includes('jwt.sign('))
}
const page = fs.readFileSync('app/admin-panel/page.tsx', 'utf8')
assert.ok(page.includes("window.addEventListener('storage', onStorage)"))
assert.ok(page.includes("window.addEventListener('focus', renew)"))
assert.ok(page.includes("document.addEventListener('visibilitychange', renew)"))
assert.ok(page.includes("window.addEventListener('online', renew)"))
assert.ok(page.includes('window.clearInterval(timer)'))
assert.ok(page.includes("event.newValue === null"), 'cross-tab Logout must clear stale tab sessions')
assert.ok(!page.includes("sessionStorage.getItem('adminToken')"), 'admin actions must use the current remembered session')
console.log('PASS: remembered admin renewal, seven-day API expiry, credential/account revocation, stale tabs, network outages and delayed login/logout responses.')

}
main().catch(() => { console.error("Admin session regression failed."); process.exitCode = 1 })
