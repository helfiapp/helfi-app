#!/usr/bin/env node
'use strict'
// Real screen helpers/callbacks, synthetic React state/events/fetch only.
// No app imports, account credentials, real storage, network or provider calls.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const screenPath = 'native/src/screens/SmartHealthCoachScreen.tsx'
const source = fs.readFileSync(screenPath, 'utf8')
const ast = ts.createSourceFile(screenPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = new Map(), callbacks = new Map(), effects = []
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useCallback') callbacks.set(node.name.text, node.initializer.arguments[0].getText(ast))
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast))
  ts.forEachChild(node, visit)
}
visit(ast)
const eventEffect = effects.find(code => code.includes("addListener('helfi:settings-changed'"))
const dirtyEffect = effects.find(code => code.includes('let nextSettings: HealthTipSettings'))
assert(eventEffect && dirtyEffect)
const base = () => ({ enabled: true, time1: '11:30', time2: '15:30', time3: '20:30', timezone: 'UTC', timezoneManual: false, frequency: 1, focusFood: true, focusSupplements: true, focusLifestyle: true })
const clone = value => JSON.parse(JSON.stringify(value))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function harness(options = {}) {
  const server = base(), ui = base(), requests = [], alerts = [], dirtyStates = [], listeners = new Map()
  const account = JSON.stringify(['synthetic-a', 'synthetic-token'])
  const heldPost = deferred(), heldGet = deferred(), postEntered = deferred(), getEntered = deferred()
  let posts = 0, gets = 0, activePost = 0
  const policySource = fs.readFileSync('app/api/health-tips/settings/route.ts', 'utf8')
  const policyAst = ts.createSourceFile('settings.ts', policySource, ts.ScriptTarget.Latest, true)
  const printer = ts.createPrinter()
  const policy = policyAst.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, policyAst)).join('\n').replace(/^export\s+/gm, '')
  const timesSource = fs.readFileSync('lib/smart-health-coach.ts', 'utf8')
  const timesAst = ts.createSourceFile('coach.ts', timesSource, ts.ScriptTarget.Latest, true)
  const times = timesAst.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(timesAst) === 'SMART_COACH_AUTO_CHECK_TIMES'))
  assert(times, 'Use actual normal route canonical schedule')
  const api = vm.createContext({
    Intl, Date, console: { error() {} },
    getUserIdFromNativeAuth: async () => 'synthetic-a',
    NextResponse: { json: (body, options) => ({ ok: !options?.status || options.status < 400, status: options?.status || 200, json: async () => clone(body) }) },
    scheduleHealthTipWithQStash: async () => ({ scheduled: true }),
    prisma: {
      user: { findUnique: async () => ({ id: 'synthetic-a' }) },
      $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async (query, ...values) => {
        if (/INSERT INTO HealthTipSettings/.test(query)) {
          if (options.holdFirstPost && activePost === 1) { postEntered.resolve(); await heldPost.promise }
          const keys = ['enabled', 'time1', 'time2', 'time3', 'timezone', 'timezoneManual', 'frequency', 'focusFood', 'focusSupplements', 'focusLifestyle']
          keys.forEach((key, index) => { server[key] = values[index + 1] })
          return []
        }
        if (/SELECT enabled FROM/.test(query)) return [{ enabled: server.enabled }]
        return [clone(server)]
      },
    },
  })
  const policyCode = printer.printNode(ts.EmitHint.Unspecified, times, timesAst).replace(/^export\s+/gm, '')
  vm.runInContext(ts.transpileModule(policyCode + '\n' + policy, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, api)
  const box = {
    console, Intl, Date, Promise, AbortController, API_BASE_URL: 'https://offline.invalid',
    authHeaders: { authorization: 'synthetic-only' }, voiceReadAccount: account,
    session: { user: { id: 'synthetic-a' } },
    settingsAccountRef: { current: account }, settingsAccountGenerationRef: { current: 1 }, settingsMountedRef: { current: true },
    settingsVoiceRevisionRef: { current: 0 }, settingsVoicePatchRef: { current: {} }, settingsPendingSyncRef: { current: null }, settingsNeedsRepairRef: { current: false },
    settingsCompletionIdsRef: { current: [] }, settingsSaveQueueRef: { current: Promise.resolve() }, settingsSaveAbortControllersRef: { current: new Set() },
    snapshotRef: { current: JSON.stringify(server) }, dirtyRef: { current: false }, settingsRef: { current: clone(server) },
    loadingSettings: false, setLoadingSettings: value => { box.loadingSettings = value },
    setSavingSettings() {}, setHasUnsavedChanges: value => dirtyStates.push(value),
    Alert: { alert: (...values) => alerts.push(values) },
    DeviceEventEmitter: { addListener: (name, callback) => { listeners.set(name, callback); return { remove: () => listeners.delete(name) } } },
    fetch: async (_url, init) => {
      requests.push({ method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined })
      if (init.method === 'POST') {
        const ordinal = ++posts
        activePost = ordinal
        const body = JSON.parse(init.body)
        if (options.failRepair && ordinal === 2) return { ok: false, json: async () => ({ error: 'Synthetic repair failure' }) }
        return api.POST({ headers: { get: () => null }, json: async () => body })
      }
      const ordinal = ++gets
      const response = await api.GET({ headers: { get: () => null } })
      if (options.holdFirstGet && ordinal === 1) { getEntered.resolve(); await heldGet.promise }
      return response
    },
  }
  for (const key of Object.keys(server)) {
    const setter = `set${key[0].toUpperCase()}${key.slice(1)}`
    box[setter] = value => { ui[key] = value }
    box[key] = ui[key]
  }
  box.setTimezoneQuery = () => {}
  vm.createContext(box)
  const run = code => vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, box)
  const guard = fs.readFileSync('native/src/voice/voiceActionReadRefresh.ts', 'utf8').replace(/^export\s+/gm, '')
  run(guard + '\nglobalThis.guard = createVoiceActionReadGuard()')
  box.guard.mount(); box.guard.setAccount(account); box.voiceReadGuardRef = { current: box.guard }
  for (const name of ['normalizeCoachSettings', 'coachSettingsSnapshot', 'mergeCoachSettingsRead', 'coachVoiceSettingsPatch']) run(functions.get(name))
  for (const name of ['applySettings', 'loadSettings', 'saveSettings']) run(`globalThis.${name} = ${callbacks.get(name)}`)
  run(`globalThis.subscribe = ${eventEffect}; globalThis.dirtyEffect = ${dirtyEffect}`)
  box.subscribe()
  const render = () => { for (const key of Object.keys(ui)) box[key] = ui[key]; box.dirtyEffect() }
  const edit = patch => { Object.assign(ui, patch); render() }
  const emit = (values, id = 'synthetic-completion-1', extras = {}) => {
    Object.assign(server, values)
    listeners.get('helfi:settings-changed')({ source: 'voice-assistant', accountId: 'synthetic-a', kind: 'preference_action', action: 'coach_preferences.update', values, completionId: id, ...extras })
  }
  const settle = async () => { await box.settingsSaveQueueRef.current; for (let i = 0; i < 12; i++) await Promise.resolve() }
  return { box, server, ui, requests, alerts, dirtyStates, edit, emit, settle, render, waitPost: () => postEntered.promise, waitGet: () => getEntered.promise, releasePost: heldPost.resolve, releaseGet: heldGet.resolve }
}
async function run() {
  const h = harness({ holdFirstPost: true })
  h.edit({ timezone: 'Europe/London' })
  const oldSave = h.box.saveSettings({ silent: true, payload: h.box.settingsRef.current })
  await h.waitPost(); assert.equal(h.requests.length, 1)
  h.emit({ enabled: false })
  assert.equal(h.box.settingsRef.current.enabled, false, 'Receipt updates refs before navigation/blur')
  assert.equal(h.box.settingsRef.current.timezone, 'Europe/London', 'Unrelated dirty field survives')
  h.box.dirtyEffect() // A passive effect from the previous render must not restore enabled=true.
  assert.equal(h.box.settingsRef.current.enabled, false)
  h.releasePost(); assert.equal(await oldSave, true); await h.settle()
  assert.equal(h.requests.filter(request => request.method === 'POST').length, 2, 'Late old POST must finish a corrective save')
  assert.equal(h.server.enabled, false)
  assert.equal(h.server.timezone, 'Europe/London')
  assert.equal(h.server.timezoneManual, true)
  assert.equal(h.server.frequency, 5, 'Actual normal POST enforces its five daily check times')
  assert.equal(h.box.settingsRef.current.frequency, 5, 'Readback uses real policy rather than the old submitted frequency')
  assert.equal(h.box.settingsRef.current.time1, '08:00')
  assert.equal(h.requests.at(-1).method, 'GET', 'Verified read runs after the serialized repair')
  h.render(); h.edit({ enabled: true })
  const revision = h.box.settingsVoiceRevisionRef.current, count = h.requests.length
  h.emit({ enabled: false }) // Duplicate emitter delay. Server assignment here is fixture-only; event must not touch local edit.
  assert.equal(h.box.settingsVoiceRevisionRef.current, revision)
  assert.equal(h.requests.length, count)
  assert.equal(h.box.settingsRef.current.enabled, true, 'Duplicate receipt must not overwrite later local edit')

  const queued = harness({ holdFirstPost: true })
  queued.edit({ timezone: 'Europe/Paris' })
  const first = queued.box.saveSettings({ silent: true })
  const second = queued.box.saveSettings({ silent: true, payload: queued.box.settingsRef.current })
  await queued.waitPost(); queued.emit({ enabled: false }); queued.releasePost()
  assert.equal(await first, true); assert.equal(await second, true); await queued.settle()
  assert.equal(queued.server.enabled, false, 'A queued captured old payload cannot win after repair')
  assert.equal(queued.server.timezone, 'Europe/Paris')

  const failed = harness({ holdFirstPost: true, failRepair: true })
  failed.edit({ timezone: 'Asia/Tokyo' })
  const saving = failed.box.saveSettings({ silent: true })
  await failed.waitPost(); failed.emit({ enabled: false }); failed.releasePost()
  assert.equal(await saving, false); await failed.settle()
  assert.equal(failed.box.dirtyRef.current, true, 'Failed repair cannot claim a clean form')
  assert.equal(failed.box.settingsRef.current.enabled, false, 'Failed repair GET retains the confirmed desired value for review')
  assert.equal(failed.box.settingsRef.current.timezone, 'Asia/Tokyo')
  assert(failed.alerts.some(values => values[0] === 'Settings need another save'))

  const stale = harness({ holdFirstGet: true })
  const oldRead = stale.box.loadSettings(); await stale.waitGet()
  stale.edit({ timezone: 'Europe/Berlin' }); stale.emit({ enabled: false }); await stale.settle()
  stale.releaseGet(); await oldRead
  assert.equal(stale.box.settingsRef.current.enabled, false)
  assert.equal(stale.box.settingsRef.current.timezone, 'Europe/Berlin')

  const switched = harness({ holdFirstPost: true })
  switched.edit({ timezone: 'Europe/London' })
  const oldAccountSave = switched.box.saveSettings({ silent: true })
  await switched.waitPost()
  switched.box.settingsAccountRef.current = 'synthetic-other-account'; switched.box.settingsAccountGenerationRef.current++
  switched.box.guard.setAccount('synthetic-other-account')
  switched.box.settingsAccountRef.current = switched.box.voiceReadAccount; switched.box.settingsAccountGenerationRef.current++
  switched.box.guard.setAccount(switched.box.voiceReadAccount)
  const snapshot = switched.box.snapshotRef.current
  switched.releasePost(); assert.equal(await oldAccountSave, false)
  assert.equal(switched.box.snapshotRef.current, snapshot, 'Old account save cannot mark new account clean')
  assert.equal(switched.requests.length, 1, 'Old account cannot submit a corrective follow-up write')
  switched.box.settingsAccountRef.current = switched.box.voiceReadAccount // Switching back does not resurrect old generation.
  assert.equal(switched.box.settingsAccountGenerationRef.current, 3)

  const newerEdit = harness({ holdFirstPost: true })
  newerEdit.edit({ timezone: 'Europe/London' })
  const olderManualSave = newerEdit.box.saveSettings({ silent: true })
  await newerEdit.waitPost(); newerEdit.edit({ timezone: 'Asia/Tokyo' }); newerEdit.releasePost()
  assert.equal(await olderManualSave, true)
  assert.equal(newerEdit.server.timezone, 'Europe/London')
  assert.equal(newerEdit.box.settingsRef.current.timezone, 'Asia/Tokyo', 'New unsaved selection survives older save readback')
  assert.equal(newerEdit.box.dirtyRef.current, true)

  const invalid = harness()
  for (const extras of [{ accountId: 'another-account' }, { completionId: '' }, { action: 'profile.update' }, { source: 'unrelated' }]) {
    invalid.emit({ enabled: false }, 'synthetic-completion-invalid', extras)
  }
  assert.equal(invalid.box.settingsVoiceRevisionRef.current, 0)
  assert.equal(invalid.requests.length, 0)
  invalid.emit({ enabled: false, unexpected: true }, 'bad-values')
  assert.equal(invalid.box.settingsVoiceRevisionRef.current, 0)
  invalid.box.settingsMountedRef.current = false; invalid.emit({ enabled: false }, 'after-unmount')
  assert.equal(invalid.box.settingsVoiceRevisionRef.current, 0)

  // Ensure the behavior repair did not change product layout or styling.
  const diff = require('node:child_process').execFileSync('git', ['diff', '--', screenPath], { encoding: 'utf8' })
  assert(!diff.split('\n').some(line => /^[+-](?![+-])/.test(line) && /<\/?(?:View|Text|Pressable|Screen|Switch|Modal|ScrollView)|style=/.test(line)), 'Functional repair must not modify JSX or styles')
  console.log('PASS: actual Coach settings event/read/save callbacks retain voice changes through blur, queued and late POSTs; preserve other dirty edits; deduplicate repeated receipts; retain dirty state on failed repair; ignore stale reads/accounts/unmounted events. No real settings or network used; JSX/styles unchanged.')
}
run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
