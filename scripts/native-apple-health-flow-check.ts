import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const text = fs.readFileSync('native/src/screens/DashboardScreen.tsx', 'utf8')
const source = ts.createSourceFile('dashboard.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers: string[] = []
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['onAppleHealthConnect', 'onAppleHealthImportToday'].includes(node.name.text)) handlers.push(`var ${node.getText(source)}`)
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(handlers.length, 2)
assert.ok(!text.includes('onAppleHealthImportSample'))
async function run(handler: string, overrides: Record<string, any> = {}) {
  const calls: any[] = []
  const context: any = {
    appleHealthAvailable: true, session: { token: 'fixture' }, API_BASE_URL: 'https://fixture.invalid',
    APPLE_HEALTH_CONNECTED_KEY: 'connected', APPLE_HEALTH_MODE_KEY: 'mode',
    setAppleHealthBusy: () => {}, setAppleHealthConnected: (value: boolean) => calls.push({ connected: value }),
    AsyncStorage: { setItem: async () => {} }, Alert: { alert: (...args: any[]) => calls.push({ alert: args }) },
    appleHealthConnectAndReadToday: async () => ({ steps: 1200, distanceKm: 0.82, activeEnergyKcal: 64 }),
    localDateYYYYMMDD: () => '2026-10-04', Date,
    fetch: async (url: string, options: any) => { calls.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) } },
    ...overrides,
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(handlers.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
  await context[handler]()
  return calls
}
async function main() {
  const readFailure = async () => { throw new Error('permission unavailable') }
  for (const handler of ['onAppleHealthConnect', 'onAppleHealthImportToday']) {
    const failed = await run(handler, { appleHealthConnectAndReadToday: readFailure })
    assert.ok(failed.some(call => call.alert))
    assert.ok(!failed.some(call => call.url || call.connected), 'failed Health access never imports or claims connection')
    const ipad = await run(handler, { appleHealthAvailable: false })
    assert.ok(ipad.some(call => call.alert[0] === 'Apple Health is iPhone only'))
    assert.ok(!ipad.some(call => call.url || call.connected))
  }
  const success = await run('onAppleHealthImportToday')
  assert.deepEqual(success.find(call => call.url).payload, { source: 'APPLE_HEALTH', date: '2026-10-04', steps: 1200, distanceKm: 0.82, caloriesKcal: 64 })
  const rejected = await run('onAppleHealthImportToday', { fetch: async () => ({ ok: false, json: async () => ({ error: 'Import unavailable' }) }) })
  assert.ok(rejected.some(call => call.alert[0] === 'Import failed'))
  assert.ok(!rejected.some(call => call.alert[0] === 'Imported'))
  console.log('PASS: real Health activity only; unavailable/denied/iPad access does not import sample calories or claim success.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
