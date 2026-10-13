import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const sourceContext: any = {exports: {}, Map, Number, Error}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('native/src/health/appleHealthSources.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, sourceContext)

const code = ts.transpileModule(fs.readFileSync('native/src/health/appleHealth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText

function loadBridge(mode: 'bridgeless' | 'legacy' | 'missing' | 'denied' | 'unavailable' | 'availability-error' | 'missing-daily', isPad = false, version: string | number = '26.2', os = 'ios', perSource = false) {
  const calls: any[] = []
  const native: any = {}
  const queryOptions: any = {}
  const metadata = (quantity: number) => [{sourceId:'fixture.tracker',sourceName:'Test Tracker',quantity},{sourceId:'fixture.phone',sourceName:'Test Phone',quantity:900}]
  const methods = {
    isAvailable(callback: any) { calls.push('availability'); callback(mode === 'availability-error' ? 'Health unavailable' : null, mode !== 'unavailable') },
    initHealthKit(options: any, callback: any) { calls.push({ permission: options }); callback(mode === 'denied' ? 'Health permission unavailable' : null) },
    getStepCount(options: any, callback: any) { queryOptions.steps = options; calls.push('steps'); callback(null, { value: 1234 }) },
    getDistanceWalkingRunning(options: any, callback: any) { queryOptions.distance = options; calls.push('distance'); callback(null, { value: 820 }) },
    getActiveEnergyBurned(options: any, callback: any) { queryOptions.energy = options; calls.push('energy'); callback(null, perSource ? [{ value: 910, metadata: metadata(10) }, { value: 905, metadata: metadata(5) }] : [{ value: 32 }, { value: 16 }]) },
    getDailyStepCountSamples(options: any, callback: any) { queryOptions.sourceSteps = options; calls.push('sourceSteps'); callback(null, [{value:2100,metadata:metadata(1200)},{value:1400,metadata:metadata(500)}]) },
    getDailyDistanceWalkingRunningSamples(options: any, callback: any) { queryOptions.sourceDistance = options; calls.push('sourceDistance'); callback(null, [{value:1300,metadata:metadata(400)},{value:1100,metadata:metadata(200)}]) },
  }
  // Actual library behavior: Object.assign drops non-enumerable host methods.
  if (mode !== 'missing') for (const [name, method] of Object.entries(methods)) {
    if (mode === 'missing-daily' && name.startsWith('getDaily')) continue
    Object.defineProperty(native, name, { value: method, enumerable: mode === 'legacy' })
  }
  const library = Object.assign({}, native, { Constants: { Permissions: { Steps: 'Steps', DistanceWalkingRunning: 'DistanceWalkingRunning', ActiveEnergyBurned: 'ActiveEnergyBurned' } } })
  if (mode === 'bridgeless') assert.equal((library as any).initHealthKit, undefined)
  const context: any = { exports: {}, Date, Promise, require(name: string) {
    if (name === 'react-native') return { Platform: { OS: os, isPad, Version: version }, NativeModules: { AppleHealthKit: mode === 'legacy' ? undefined : native } }
    if (name === 'react-native-health') return library
    if (name === './appleHealthSources') return sourceContext.exports
    throw new Error('Unexpected test dependency')
  } }
  vm.runInNewContext(code, context)
  return { api: context.exports, calls, queryOptions }
}

async function main() {
  for (const mode of ['bridgeless', 'legacy'] as const) {
    const test = loadBridge(mode)
    assert.deepEqual(JSON.parse(JSON.stringify(await test.api.appleHealthConnectAndReadToday())), { localDate: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'), steps: 1234, distanceKm: 0.82, activeEnergyKcal: 48, selectedSource: null })
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
  const historical = loadBridge('bridgeless')
  const today = new Date(2026, 9, 13, 9, 15, 10, 321)
  const yesterday = await historical.api.appleHealthReadDate('2026-10-12', today)
  assert.equal(yesterday.localDate, '2026-10-12')
  assert.equal(historical.queryOptions.steps.date, new Date(2026, 9, 12, 12).toISOString())
  assert.equal(historical.queryOptions.distance.date, historical.queryOptions.steps.date)
  assert.equal(historical.queryOptions.energy.startDate, new Date(2026, 9, 12).toISOString())
  assert.equal(historical.queryOptions.energy.endDate, new Date(2026, 9, 12, 23, 59, 59, 999).toISOString())
  assert.ok(!historical.calls.some(call => typeof call === 'object' && call.permission), 'dated reads never request permission')
  const todayWindow = historical.api.appleHealthDateWindow('2026-10-13', today)
  assert.equal(todayWindow.end.toISOString(), today.toISOString(), 'today stops at the captured current moment')
  for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-10-14', 'bad-date']) {
    const invalid = loadBridge('bridgeless')
    await assert.rejects(invalid.api.appleHealthReadDate(date, today))
    assert.equal(invalid.calls.length, 0, 'invalid/future dates never read Health')
  }
  const selected = {sourceId:'fixture.tracker',sourceName:'Test Tracker'}
  const sourceRead = loadBridge('bridgeless', false, '26.2', 'ios', true)
  assert.deepEqual(JSON.parse(JSON.stringify(await sourceRead.api.appleHealthReadDate('2026-10-12', today, selected))), {localDate:'2026-10-12',steps:1700,distanceKm:0.6,activeEnergyKcal:15,selectedSource:selected}, 'exact source quantities exclude combined phone totals')
  assert.equal(sourceRead.queryOptions.sourceSteps.unit, 'count'); assert.equal(sourceRead.queryOptions.sourceDistance.unit, 'meter')
  for (const options of [sourceRead.queryOptions.sourceSteps,sourceRead.queryOptions.sourceDistance,sourceRead.queryOptions.energy]) {
    assert.equal(options.startDate,new Date(2026,9,12).toISOString()); assert.equal(options.endDate,new Date(2026,9,12,23,59,59,999).toISOString()); assert.equal(options.period,60)
  }
  assert.ok(!sourceRead.calls.some(call=>typeof call==='object' && call.permission))
  const missingSource = await sourceRead.api.appleHealthReadDate('2026-10-12',today,{sourceId:'fixture.absent',sourceName:'Absent Source'})
  assert.equal(missingSource.steps,null); assert.equal(missingSource.distanceKm,null); assert.equal(missingSource.activeEnergyKcal,null)
  const discovered = await sourceRead.api.appleHealthDiscoverSources('2026-10-12')
  assert.deepEqual(JSON.parse(JSON.stringify(discovered)).map((x:any)=>x.sourceId).sort(),['fixture.phone','fixture.tracker'])
  assert.ok(!sourceRead.calls.some(call=>typeof call==='object' && call.permission), 'discovery never requests permissions')
  const noDaily = loadBridge('missing-daily')
  await assert.rejects(noDaily.api.appleHealthReadDate('2026-10-12',today,selected), /unavailable/)
  assert.equal(noDaily.calls.length,0, 'missing native daily methods never fall back to aggregate')
  const originalTimezone = process.env.TZ
  try {
    process.env.TZ = 'Australia/Melbourne'
    for (const [date, hours] of [['2026-10-04', 23], ['2026-04-05', 25]] as const) {
      const window = historical.api.appleHealthDateWindow(date, new Date(2026, 9, 13))
      assert.equal(window.end.getTime() - window.start.getTime(), hours * 60 * 60 * 1000 - 1, 'past day follows local DST boundaries')
      assert.equal(window.end.getHours(), 23); assert.equal(window.end.getMilliseconds(), 999)
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
  // AWS builds install only web dependencies. Native archives additionally
  // require this installed-library contract check; never silently skip it there.
  if (process.argv.includes('--check-installed-library')) {
    const fitnessLibrary = fs.readFileSync('native/node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit+Methods_Fitness.m', 'utf8')
    assert.ok(/fitness_getStepCountOnDay[\s\S]*?key:@"date"/.test(fitnessLibrary), 'installed library step method uses date')
    assert.ok(/fitness_getDistanceWalkingRunningOnDay[\s\S]*?key:@"date"/.test(fitnessLibrary), 'installed library distance method uses date')
    const exports = fs.readFileSync('native/node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit.m', 'utf8')
    for (const method of ['getDailyStepCountSamples','getDailyDistanceWalkingRunningSamples','getActiveEnergyBurned']) assert.ok(exports.includes(`RCT_EXPORT_METHOD(${method}:`), 'installed host exposes source range methods')
    const queries = fs.readFileSync('native/node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit+Queries.m','utf8')
    assert.ok(queries.includes('HKStatisticsOptionSeparateBySource') && queries.includes('[result sumQuantityForSource:source]') && queries.includes('@"quantity" : @(quantity)') && queries.includes('@"metadata" : metadata'), 'source range output includes exact per-source quantities')
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
