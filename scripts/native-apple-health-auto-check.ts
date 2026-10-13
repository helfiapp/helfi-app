import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const engineContext: any = { exports: {}, Date, Promise, Map, setTimeout, clearTimeout }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('native/src/health/appleHealthSync.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, engineContext)
const { createAppleHealthSync, appleHealthAutoKey } = engineContext.exports

async function main() {
  let reads = 0, posts = 0, now = 0, allow = true
  let summary = { localDate: '2026-10-12', steps: 100, distanceKm: 0.1, activeEnergyKcal: 12 as number | null }
  let release: (() => void) | null = null
  let pause = false
  const run = createAppleHealthSync({ now: () => now,
    read: async () => { reads++; if (pause) await new Promise<void>(resolve => { release = resolve }); return summary },
    importSummary: async (value: any, token: string) => { assert.equal(token, 'fixture'); assert.equal(value.localDate, summary.localDate); posts++ },
  })
  const opts = { localDate: '2026-10-12', userId: 'A', token: 'fixture', allowed: () => allow }
  allow = false
  assert.equal(await run(opts), null); assert.equal(reads, 0)
  allow = true; pause = true
  const first = run(opts)
  assert.equal(await run({ ...opts, manual: true }), null, 'manual and automatic requests cannot overlap')
  assert.ok(release); (release as unknown as () => void)()
  assert.equal((await first)?.imported, true); assert.equal(posts, 1)
  pause = false
  assert.equal(await run(opts), null, 'foreground events inside cooldown do not re-read')
  assert.equal(reads, 1)
  now = 60_000; summary = { ...summary, steps: 200, activeEnergyKcal: null }
  assert.equal((await run(opts))?.imported, false); assert.equal(posts, 1, 'steps-only never posts substitute calories')
  summary.activeEnergyKcal = 25
  assert.equal((await run({ ...opts, manual: true }))?.imported, true, 'manual retry bypasses cooldown')
  assert.equal(posts, 2)
  now += 60_000; pause = true
  const revoked = run(opts)
  allow = false; (release as unknown as () => void)()
  assert.equal(await revoked, null); assert.equal(posts, 2, 'sign-out/revocation during read prevents storage')
  allow = true; pause = false
  summary = { ...summary, localDate: '2026-10-13' }
  assert.equal((await run({ ...opts, userId: 'B', localDate: '2026-10-13' }))?.summary.localDate, '2026-10-13', 'account and date identity stay separate')
  assert.notEqual(appleHealthAutoKey('A'), appleHealthAutoKey('B'))
  for (const cancelWaiting of [false, true]) {
    const pendingReads: (() => void)[] = []
    const savedAccounts: string[] = []
    let activeAccount = 'A', bConsent = true
    const switchRun = createAppleHealthSync({
      read: async () => { await new Promise<void>(resolve => pendingReads.push(resolve)); return { localDate: '2026-10-12', steps: 100, distanceKm: 0.1, activeEnergyKcal: 20 } },
      importSummary: async (_summary: any, token: string) => { savedAccounts.push(token) },
    })
    const old = switchRun({ localDate: '2026-10-12', userId: 'A', token: 'A', allowed: () => activeAccount === 'A' })
    activeAccount = 'B'
    const next = switchRun({ localDate: '2026-10-12', userId: 'B', token: 'B', allowed: () => activeAccount === 'B' && bConsent })
    assert.equal(pendingReads.length, 1, 'new account waits without overlapping Health reads')
    if (cancelWaiting) bConsent = false
    pendingReads[0](); assert.equal(await old, null)
    await new Promise(resolve => setImmediate(resolve))
    if (cancelWaiting) {
      assert.equal(await next, null); assert.equal(pendingReads.length, 1); assert.deepEqual(savedAccounts, [], 'consent revoked while waiting prevents reads and posts')
    } else {
      assert.equal(pendingReads.length, 2, 'B proceeds without another foreground event')
      pendingReads[1](); assert.equal((await next)?.imported, true)
      assert.deepEqual(savedAccounts, ['B'], 'stale A never posts; consented B saves normally')
    }
  }
  // A third account replacing B during its wait also cancels that waiting job.
  let account = 'A', finishOld: (() => void) | null = null
  let queuedReads = 0
  const replacedRun = createAppleHealthSync({ read: async () => { queuedReads++; await new Promise<void>(resolve => { finishOld = resolve }); return { localDate: '2026-10-12', steps: 1, distanceKm: null, activeEnergyKcal: 1 } }, importSummary: async () => { throw new Error('Replaced account cannot post') } })
  const oldAccount = replacedRun({ localDate: '2026-10-12', userId: 'A', token: 'A', allowed: () => account === 'A' })
  account = 'B'
  const replacedAccount = replacedRun({ localDate: '2026-10-12', userId: 'B', token: 'B', allowed: () => account === 'B' })
  account = 'C'; (finishOld as unknown as () => void)()
  assert.equal(await oldAccount, null); assert.equal(await replacedAccount, null); assert.equal(queuedReads, 1)
  summary.localDate = '2026-10-12'
  for (const value of [0, NaN, Infinity]) {
    summary.activeEnergyKcal = value
    const before: number = posts
    await run({ ...opts, manual: true })
    assert.equal(posts, before, 'invalid/empty energy cannot alter calories')
  }
  const dayReads: string[] = [], dayPosts: string[] = []
  const datesRun = createAppleHealthSync({ now: () => 0,
    read: async (date: string) => { dayReads.push(date); return { localDate: date, steps: 10, distanceKm: 0.01, activeEnergyKcal: 2 } },
    importSummary: async (value: any) => { dayPosts.push(value.localDate) },
  })
  const dayOpts = { userId: 'fixture-date-account', token: 'fixture', allowed: () => true }
  await datesRun({ ...dayOpts, localDate: '2026-10-12' })
  await datesRun({ ...dayOpts, localDate: '2026-10-13' })
  assert.equal(await datesRun({ ...dayOpts, localDate: '2026-10-13' }), null)
  await datesRun({ ...dayOpts, localDate: '2026-10-12', manual: true })
  assert.deepEqual(dayReads, ['2026-10-12', '2026-10-13', '2026-10-12'], 'cooldown is account/day-specific; manual selected date can retry')
  assert.deepEqual(dayPosts, dayReads, 'posted snapshots retain exactly the requested day')
  const dateReleases: (() => void)[] = [], queuedDates: string[] = []
  const queuedDateRun = createAppleHealthSync({
    read: async (date: string) => { queuedDates.push(date); await new Promise<void>(resolve => dateReleases.push(resolve)); return { localDate: date, steps: 1, distanceKm: null, activeEnergyKcal: 1 } },
    importSummary: async () => {},
  })
  const previousDay = queuedDateRun({ ...dayOpts, localDate: '2026-10-12', manual: true })
  const currentDay = queuedDateRun({ ...dayOpts, localDate: '2026-10-13', manual: true })
  assert.deepEqual(queuedDates, ['2026-10-12'], 'different selected dates share one in-flight read')
  dateReleases[0](); await previousDay; await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(queuedDates, ['2026-10-12', '2026-10-13']); dateReleases[1](); await currentDay
  const mismatchRun = createAppleHealthSync({ read: async () => ({ localDate: '2026-10-13', steps: 10, distanceKm: 1, activeEnergyKcal: 20 }), importSummary: async () => { throw new Error('Wrong day cannot post') } })
  await assert.rejects(mismatchRun({ ...dayOpts, localDate: '2026-10-12' }), /different date/)
  const provider = fs.readFileSync('native/src/health/AppleHealthSyncProvider.tsx', 'utf8')
  const nativeRead = { localDate: '2026-10-12', steps: 321, distanceKm: 0.24, activeEnergyKcal: 0.25 as number | null }
  const posted: any[] = []
  const requestedDates: string[] = []
  let finishRead: (() => void) | null = null
  let delayRead = false
  const context: any = { exports: {}, AbortController, setTimeout, clearTimeout, Promise,
    fetch: async (url: string, options: any) => { posted.push({ url, options, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true }) } },
    require(name: string) {
      if (name === 'react') return { createContext: () => ({}) }
      if (name === 'react-native') return { AppState: {}, DeviceEventEmitter: { emit: () => {} } }
      if (name === '@react-native-async-storage/async-storage' || name === '../state/AppModeContext') return {}
      if (name === '../config') return { API_BASE_URL: 'https://fixture.invalid' }
      if (name === './appleHealthSync') return { createAppleHealthSync, appleHealthAutoKey }
      if (name === './appleHealth') return { isAppleHealthSupportedDevice: () => true, appleHealthReadDate: async (date: string) => {
        requestedDates.push(date)
        if (delayRead) await new Promise<void>(resolve => { finishRead = resolve })
        return { ...nativeRead, localDate: date }
      } }
      throw new Error(`Unexpected provider test dependency ${name}`)
    },
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(provider + '\nexports.__sync = runSync', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  await context.exports.__sync({ localDate: '2026-10-12', userId: 'A', token: 'fixture', manual: true, allowed: () => true })
  assert.equal(posted.length, 1)
  assert.deepEqual(posted[0].payload, { source: 'APPLE_HEALTH', date: '2026-10-12', steps: 321, distanceKm: 0.24, caloriesKcal: 0.25 }, 'actual provider sends exact snapshot/date/precision')
  assert.equal(posted[0].options.headers.authorization, 'Bearer fixture')
  assert.equal(requestedDates[0], '2026-10-12', 'actual provider passes selected day to Health reader')
  nativeRead.activeEnergyKcal = null
  await context.exports.__sync({ localDate: '2026-10-12', userId: 'A', token: 'fixture', manual: true, allowed: () => true })
  assert.equal(posted.length, 1, 'actual provider never posts a substitute for absent active energy')
  await context.exports.__sync({ userId: 'foreground-fixture', token: 'fixture', allowed: () => true })
  const clock = new Date()
  assert.equal(requestedDates[requestedDates.length - 1], `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}`, 'foreground default reads today only')

  // Execute actual provider callbacks, including asynchronous preference races.
  const ast = ts.createSourceFile('provider.tsx', provider, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declarations: Record<string, string> = {}
  function collect(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['setEnabled', 'refresh'].includes(node.name.text)) declarations[node.name.text] = node.getText(ast)
    ts.forEachChild(node, collect)
  }
  collect(ast)
  const values: boolean[] = []
  const writes: { value: string; finish: () => void }[] = []
  const callbackContext: any = {
    exports: {}, userId: 'A', token: 'fixture',
    current: { current: { userId: 'A', token: 'fixture', enabled: false, revision: 0 } },
    preferenceWrites: { current: Promise.resolve() },
    useCallback: (fn: any) => fn, updateEnabled: (value: boolean) => values.push(value), setReady: () => {}, setError: () => {}, setBusy: () => {}, setResult: () => {},
    isAppleHealthSupportedDevice: () => true, runSync: context.exports.__sync, appleHealthAutoKey,
    AsyncStorage: { setItem: async (_key: string, value: string) => new Promise<void>(resolve => writes.push({ value, finish: resolve })) },
    DeviceEventEmitter: { emit: () => { throw new Error('Stale account must not publish activity') } },
  }
  vm.createContext(callbackContext)
  vm.runInContext(ts.transpileModule(`const ${declarations.setEnabled}; const ${declarations.refresh}; exports.enable = setEnabled; exports.refresh = refresh`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, callbackContext)
  const enable = callbackContext.exports.enable(true)
  const disable = callbackContext.exports.enable(false)
  assert.equal(callbackContext.current.current.enabled, false, 'disable stops pending sync immediately')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes[0].value, '1'); writes[0].finish(); await enable
  assert.equal(callbackContext.current.current.enabled, false, 'older enable cannot resurrect disabled state')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes[1].value, '0'); writes[1].finish(); await disable
  assert.deepEqual(values, [false, false])
  delayRead = true; nativeRead.activeEnergyKcal = 20
  const switching = callbackContext.exports.refresh(true)
  callbackContext.current.current.userId = 'B'
  callbackContext.current.current.revision++
  assert.ok(finishRead); (finishRead as unknown as () => void)()
  assert.equal(await switching, null)
  assert.equal(posted.length, 1, 'actual callback stops account-switched reads before server storage')
  assert.ok(provider.includes('appleHealthReadDate') && !provider.includes('appleHealthConnectAndReadToday'), 'foreground code never requests authorization')
  assert.ok(provider.includes('appleHealthAutoKey(userId)') && !provider.includes('helfi_apple_health_connected_v1'), 'legacy global connection cannot grant automatic consent')
  assert.ok(provider.includes("state === 'active'") && provider.includes("AppState.currentState === 'active'"))
  const track = fs.readFileSync('native/src/screens/TrackCaloriesScreen.tsx', 'utf8')
  const listener = track.split("addListener('helfi:apple-health-imported'")[1].split('}, [mode, selectedDate')[0]
  assert.ok(listener.includes('/api/exercise-entries?date=') && !listener.includes('loadAll') && !listener.includes('/api/food-log') && !listener.includes('/api/water-log'), 'Health event refreshes exercise only')
  let eventCode = ''
  const trackAst = ts.createSourceFile('track.tsx', track, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let importHandler = '', healthRowTitle = '', healthRowDetail = '', baseAllowanceExpression = '', buttonCondition = ''
  const budgetCallbacks: Record<string, string> = {}
  function collectEvent(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'helfi:apple-health-imported') eventCode = node.arguments[1].getText(trackAst)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'onAppleHealthImportSelectedDate') importHandler = node.getText(trackAst)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['usedKcal', 'dailyAllowanceKcal', 'remainingKcal'].includes(node.name.text) && node.initializer && ts.isCallExpression(node.initializer)) budgetCallbacks[node.name.text] = node.initializer.arguments[0].getText(trackAst)
    if (ts.isJsxExpression(node) && node.expression) {
      const text = node.expression.getText(trackAst)
      if (text.startsWith("entry.source === 'APPLE_HEALTH' ? 'Apple Health activity'")) healthRowTitle = text
      if (text.includes('Daily total •')) healthRowDetail = text
      if (text.startsWith("Math.round(energyUnit === 'kj' ? dailyTargets.calories")) baseAllowanceExpression = text
      if (ts.isConditionalExpression(node.expression) && text.includes('onAppleHealthImportSelectedDate')) buttonCondition = node.expression.condition.getText(trackAst)
    }
    ts.forEachChild(node, collectEvent)
  }
  collectEvent(trackAst)
  assert.ok(eventCode)
  const resolves: ((value: any) => void)[] = []
  const displayedCalories: number[] = []
  const trackContext: any = { exports: {}, session: { user: { id: 'A' }, token: 'fixture' }, selectedDate: '2026-10-12', cancelled: false,
    healthExerciseRevisionRef: { current: 0 }, API_BASE_URL: 'https://fixture.invalid',
    buildNativeAuthHeaders: () => ({}), numberOrZero: (value: number) => value, setExerciseEntries: () => {}, setExerciseCalories: (value: number) => displayedCalories.push(value),
    fetch: async (url: string) => { assert.ok(url.endsWith('/api/exercise-entries?date=2026-10-12')); return new Promise(resolve => resolves.push(resolve)) },
  }
  vm.createContext(trackContext)
  vm.runInContext(ts.transpileModule(`exports.handler = ${eventCode}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, trackContext)
  trackContext.exports.handler({ userId: 'B', localDate: '2026-10-12' })
  trackContext.exports.handler({ userId: 'A', localDate: '2026-10-11' })
  assert.equal(resolves.length, 0, 'other accounts/dates do not refresh the visible day')
  for (let i = 0; i < 2; i++) trackContext.exports.handler({ userId: 'A', localDate: '2026-10-12' })
  resolves[1]({ ok: true, json: async () => ({ exerciseCalories: 20, entries: [] }) })
  await new Promise(resolve => setImmediate(resolve))
  resolves[0]({ ok: true, json: async () => ({ exerciseCalories: 10, entries: [] }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(displayedCalories, [20], 'late older exercise response cannot replace fresh totals')
  const selectedRequests: any[] = [], alerts: any[] = []
  const importContext: any = { exports: {}, selectedDate: '2026-10-12', formatLocalDate: () => '2026-10-13', Alert: { alert: (...args: any[]) => alerts.push(args) },
    healthSync: { refresh: async (...args: any[]) => { selectedRequests.push(args); return { imported: true, summary: { localDate: args[1] } } } },
  }
  vm.createContext(importContext)
  vm.runInContext(ts.transpileModule(`const ${importHandler}; exports.importDay=onAppleHealthImportSelectedDate`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, importContext)
  await importContext.exports.importDay()
  assert.deepEqual(selectedRequests, [[true, '2026-10-12']], 'actual Food handler imports its selected date')
  assert.ok(alerts[0][1].includes('2026-10-12') && alerts[0][1].includes('full day'))
  importContext.selectedDate = '2026-10-14'; await importContext.exports.importDay()
  assert.equal(selectedRequests.length, 1, 'future Food day never invokes Health')
  importContext.selectedDate = '2026-10-12'; importContext.healthSync.refresh = async () => ({ imported: false, summary: { activeEnergyKcal: null } })
  await importContext.exports.importDay(); assert.equal(alerts[alerts.length - 1][0], 'No active calories available')

  assert.ok(healthRowTitle && healthRowDetail && baseAllowanceExpression && buttonCondition, 'verify actual Health exercise JSX expressions')
  const displayContext: any = { exports: {}, entry: { source: 'APPLE_HEALTH', label: 'Apple Health activity', calories: 180, durationMinutes: 1, startTime: null }, energyUnit: 'kcal', dailyTargets: { calories: 2200 }, exerciseCalories: 180,
    numberOrZero: (value: number) => Number(value) || 0, formatCalories: (value: number, unit: string) => `${Math.round(unit === 'kj' ? value * 4.184 : value)} ${unit === 'kj' ? 'kJ' : 'kcal'}`, formatClockTime: () => '18:00', Math,
    selectedDate: '2026-10-12', formatLocalDate: () => '2026-10-13', isAppleHealthSupportedDevice: () => true,
  }
  vm.createContext(displayContext)
  vm.runInContext(ts.transpileModule(`exports.title=()=>(${healthRowTitle}); exports.detail=()=>(${healthRowDetail}); exports.base=()=>(${baseAllowanceExpression}); exports.button=()=>(${buttonCondition});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, displayContext)
  assert.equal(displayContext.exports.title(), 'Apple Health activity')
  assert.equal(displayContext.exports.detail(), 'Daily total • 180 kcal'); assert.equal(displayContext.exports.base(), 2200)
  for (const source of ['MANUAL', 'FITBIT', 'GARMIN']) {
    displayContext.entry = { source, exerciseType: { name: 'Walking' }, durationMinutes: 30, calories: 200, startTime: 'fixture' }
    assert.equal(displayContext.exports.title(), 'Walking'); assert.equal(displayContext.exports.detail(), '18:00 • 30 min • 200 kcal')
  }
  displayContext.energyUnit = 'kj'; assert.equal(displayContext.exports.base(), Math.round(2200 * 4.184), 'base target kJ line excludes exercise')
  assert.equal(displayContext.exports.button(), true)
  displayContext.selectedDate = '2026-10-14'; assert.equal(displayContext.exports.button(), false)
  displayContext.selectedDate = '2026-10-12'; displayContext.isAppleHealthSupportedDevice = () => false; assert.equal(displayContext.exports.button(), false, 'Android has no Apple import action')
  const budgetContext: any = { exports: {}, dailyTargets: { calories: 2200 }, exerciseCalories: 180, totals: { calories: 1400, protein: 0, carbs: 0, fat: 0 }, Math }
  vm.createContext(budgetContext)
  vm.runInContext(ts.transpileModule(`exports.budget=()=>{const usedKcal=(${budgetCallbacks.usedKcal})(); const dailyAllowanceKcal=(${budgetCallbacks.dailyAllowanceKcal})(); const remainingKcal=(${budgetCallbacks.remainingKcal})(); return {usedKcal,dailyAllowanceKcal,remainingKcal}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, budgetContext)
  assert.deepEqual(JSON.parse(JSON.stringify(budgetContext.exports.budget())), { usedKcal: 1400, dailyAllowanceKcal: 2380, remainingKcal: 980 })
  assert.equal(budgetContext.exports.budget().remainingKcal, 980, 'repeated daily total does not add calories again')
  budgetContext.exerciseCalories = 0; assert.equal(budgetContext.exports.budget().remainingKcal, 800)
  console.log('PASS: actual dated Health reader/provider/Food handlers preserve account/day consent, serialized refresh, per-day cooldown, exact selected-date requests, daily labels/base target, late-response safety and no invented calories.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
