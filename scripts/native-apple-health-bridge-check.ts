import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const code = ts.transpileModule(fs.readFileSync('native/src/health/appleHealth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText

function loadBridge(mode: 'bridgeless' | 'legacy' | 'missing' | 'denied' | 'unavailable' | 'availability-error', isPad = false, version: string | number = '26.2', os = 'ios') {
  const calls: any[] = []
  const native: any = {}
  const methods = {
    isAvailable(callback: any) { calls.push('availability'); callback(mode === 'availability-error' ? 'Health unavailable' : null, mode !== 'unavailable') },
    initHealthKit(options: any, callback: any) { calls.push({ permission: options }); callback(mode === 'denied' ? 'Health permission unavailable' : null) },
    getStepCount(_options: any, callback: any) { calls.push('steps'); callback(null, { value: 1234 }) },
    getDistanceWalkingRunning(_options: any, callback: any) { calls.push('distance'); callback(null, { value: 820 }) },
    getActiveEnergyBurned(_options: any, callback: any) { calls.push('energy'); callback(null, [{ value: 32 }, { value: 16 }]) },
  }
  // Actual library behavior: Object.assign drops non-enumerable host methods.
  if (mode !== 'missing') for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(native, name, { value: method, enumerable: mode === 'legacy' })
  }
  const library = Object.assign({}, native, { Constants: { Permissions: { Steps: 'Steps', DistanceWalkingRunning: 'DistanceWalkingRunning', ActiveEnergyBurned: 'ActiveEnergyBurned' } } })
  if (mode === 'bridgeless') assert.equal((library as any).initHealthKit, undefined)
  const context: any = { exports: {}, Date, Promise, require(name: string) {
    if (name === 'react-native') return { Platform: { OS: os, isPad, Version: version }, NativeModules: { AppleHealthKit: mode === 'legacy' ? undefined : native } }
    if (name === 'react-native-health') return library
    throw new Error('Unexpected test dependency')
  } }
  vm.runInNewContext(code, context)
  return { api: context.exports, calls }
}

async function main() {
  for (const mode of ['bridgeless', 'legacy'] as const) {
    const test = loadBridge(mode)
    assert.deepEqual(JSON.parse(JSON.stringify(await test.api.appleHealthConnectAndReadToday())), { steps: 1234, distanceKm: 0.82, activeEnergyKcal: 48 })
    assert.deepEqual(JSON.parse(JSON.stringify(test.calls[1])), { permission: { permissions: { read: ['Steps', 'DistanceWalkingRunning', 'ActiveEnergyBurned'], write: [] } } })
    assert.equal(test.calls.length, 5)
  }
  for (const mode of ['missing', 'denied', 'unavailable', 'availability-error'] as const) {
    const test = loadBridge(mode)
    await assert.rejects(test.api.appleHealthConnectAndReadToday())
    assert.ok(!test.calls.includes('steps'), 'no activity reads after unavailable or failed permission request')
  }
  for (const version of [17, '17.0', '26.2']) {
    const ipad = loadBridge('bridgeless', true, version)
    assert.equal(ipad.api.isAppleHealthSupportedDevice(), true)
    assert.equal((await ipad.api.appleHealthConnectAndReadToday()).steps, 1234)
  }
  for (const test of [loadBridge('bridgeless', true, '16.7'), loadBridge('bridgeless', false, 36, 'android')]) {
    assert.equal(test.api.isAppleHealthSupportedDevice(), false)
    await assert.rejects(test.api.appleHealthConnectAndReadToday(), /iPadOS 17/)
    assert.equal(test.calls.length, 0)
  }
  console.log('PASS: actual Apple Health module preserves bridgeless host methods, legacy support, read-only permissions, units and failure behavior.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
