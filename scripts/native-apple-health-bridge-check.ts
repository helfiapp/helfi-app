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
  const queryOptions: any = {}
  const methods = {
    isAvailable(callback: any) { calls.push('availability'); callback(mode === 'availability-error' ? 'Health unavailable' : null, mode !== 'unavailable') },
    initHealthKit(options: any, callback: any) { calls.push({ permission: options }); callback(mode === 'denied' ? 'Health permission unavailable' : null) },
    getStepCount(options: any, callback: any) { queryOptions.steps = options; calls.push('steps'); callback(null, { value: 1234 }) },
    getDistanceWalkingRunning(options: any, callback: any) { queryOptions.distance = options; calls.push('distance'); callback(null, { value: 820 }) },
    getActiveEnergyBurned(options: any, callback: any) { queryOptions.energy = options; calls.push('energy'); callback(null, [{ value: 32 }, { value: 16 }]) },
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
  return { api: context.exports, calls, queryOptions }
}

async function main() {
  for (const mode of ['bridgeless', 'legacy'] as const) {
    const test = loadBridge(mode)
    assert.deepEqual(JSON.parse(JSON.stringify(await test.api.appleHealthConnectAndReadToday())), { localDate: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'), steps: 1234, distanceKm: 0.82, activeEnergyKcal: 48 })
    assert.deepEqual(JSON.parse(JSON.stringify(test.calls[1])), { permission: { permissions: { read: ['Steps', 'DistanceWalkingRunning', 'ActiveEnergyBurned'], write: [] } } })
    assert.equal(test.calls.length, 5)
  }
  const quiet = loadBridge('bridgeless')
  const fixed = new Date(2026, 9, 12, 23, 59)
  assert.equal((await quiet.api.appleHealthReadToday(fixed)).localDate, '2026-10-12')
  assert.equal(quiet.queryOptions.steps.date, fixed.toISOString())
  assert.equal(quiet.queryOptions.distance.date, fixed.toISOString())
  assert.equal(quiet.queryOptions.distance.unit, 'meter')
  const midnight = new Date(fixed); midnight.setHours(0, 0, 0, 0)
  assert.equal(quiet.queryOptions.energy.startDate, midnight.toISOString())
  assert.equal(quiet.queryOptions.energy.endDate, fixed.toISOString())
  assert.ok(!quiet.calls.some(call => typeof call === 'object' && call.permission), 'read-only refresh never asks for authorization')
  // AWS builds install only web dependencies. Native archives additionally
  // require this installed-library contract check; never silently skip it there.
  if (process.argv.includes('--check-installed-library')) {
    const fitnessLibrary = fs.readFileSync('native/node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit+Methods_Fitness.m', 'utf8')
    assert.ok(/fitness_getStepCountOnDay[\s\S]*?key:@"date"/.test(fitnessLibrary), 'installed library step method uses date')
    assert.ok(/fitness_getDistanceWalkingRunningOnDay[\s\S]*?key:@"date"/.test(fitnessLibrary), 'installed library distance method uses date')
    console.log('PASS: installed native Health library uses the verified daily date arguments.')
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
