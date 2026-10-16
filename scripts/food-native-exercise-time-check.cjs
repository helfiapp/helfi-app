#!/usr/bin/env node
'use strict'
// Executes actual editor open/save functions in isolated process time zones.
// Synthetic fetch/storage only; no app, server, account, environment files or network.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
if (process.argv[2] !== '--zone') {
  for (const zone of ['Australia/Melbourne', 'Pacific/Kiritimati', 'UTC']) {
    process.stdout.write(execFileSync(process.execPath, [__filename, '--zone', zone], { env: { TZ: zone }, encoding: 'utf8' }))
  }
  console.log('PASS actual-source exercise time round trips: local edit display, explicit ISO POST/PATCH, DST transitions, UTC+14, invalid dates/times, omission and unchanged record isolation. Offline only.')
} else {
  const source = fs.readFileSync(path.resolve(__dirname, '../native/src/screens/TrackCaloriesScreen.tsx'), 'utf8')
  const file = ts.createSourceFile('TrackCaloriesScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), parts = new Map()
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && ['formatLocalDate', 'formatEditorTime', 'numberOrZero', 'round1'].includes(node.name.text)) parts.set(node.name.text, node.getText(file))
    if (ts.isVariableDeclaration(node) && ['openExerciseEdit', 'saveExercise'].includes(node.name.getText(file))) parts.set(node.name.getText(file), `const ${node.getText(file)}`)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(parts.size, 6)
  const code = ts.transpileModule([...parts.values(), 'globalThis.open = openExerciseEdit; globalThis.save = saveExercise'].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const zone = process.argv[3]
  let cases = 0
  function harness(date = '2026-10-17') {
    const requests = [], alerts = [], untouched = { id: 'other-record', startTime: '2026-01-01T00:00:00.000Z', durationMinutes: 45, calories: 75 }
    const box = { Date, authHeaders: { authorization: 'synthetic' }, API_BASE_URL: 'https://offline.invalid', session: { token: 'synthetic' }, selectedDate: date,
      exerciseEditId: null, exerciseTypeId: 'synthetic-type', exerciseDuration: '30', exerciseDistance: '', exerciseDistanceUnit: 'km', exerciseStartTime: '', exerciseCaloriesOverride: '150', exerciseEntries: [structuredClone(untouched)],
      buildNativeAuthHeaders: () => ({}), Alert: { alert: (...args) => alerts.push(args) },
      fetch: async (url, options) => {
        const body = JSON.parse(options.body); requests.push({ url, method: options.method, body })
        const id = box.exerciseEditId || 'synthetic-added'
        const original = box.exerciseEntries.find(item => item.id === id) || {}
        const entry = { ...original, id, exerciseType: { id: body.exerciseTypeId }, durationMinutes: body.durationMinutes, calories: body.caloriesOverride, startTime: body.startTime ?? original.startTime ?? null }
        return { ok: true, json: async () => ({ entry, exerciseCalories: 225 }) }
      },
    }
    for (const field of ['exerciseEditId', 'exerciseTypeId', 'exerciseDuration', 'exerciseDistance', 'exerciseDistanceUnit', 'exerciseStartTime', 'exerciseCaloriesPreview', 'exerciseCaloriesOverride', 'exerciseOpen', 'exerciseEntries', 'exerciseCalories']) box[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { box[field] = typeof value === 'function' ? value(box[field]) : value }
    vm.runInNewContext(code, box)
    return { box, requests, alerts, untouched }
  }
  async function roundTrip(date, time, iso, method = 'PATCH', stored = iso) {
    const h = harness(date), original = { id: 'synthetic-edit', exerciseType: { id: 'synthetic-type' }, startTime: stored, durationMinutes: 30, calories: 150 }
    if (method === 'PATCH') {
      h.box.exerciseEntries.push(original); h.box.open(original)
      assert.equal(h.box.exerciseStartTime, time, 'Opening a saved instant must use the phone local clock')
    } else h.box.exerciseStartTime = time
    await h.box.save()
    assert.equal(h.alerts.length, 0); assert.equal(h.requests.length, 1)
    const sent = h.requests[0]
    assert.equal(sent.method, method); assert.equal(sent.body.date, date); assert.equal(sent.body.startTime, iso)
    assert.equal(sent.body.durationMinutes, 30); assert.equal(sent.body.caloriesOverride, 150)
    assert.equal(sent.url, `https://offline.invalid/api/exercise-entries${method === 'PATCH' ? '/synthetic-edit' : ''}`)
    const saved = h.box.exerciseEntries.find(entry => entry.id === (method === 'PATCH' ? original.id : 'synthetic-added'))
    h.box.open(saved); assert.equal(h.box.exerciseStartTime, time, 'Normal ISO storage and reopened edit retain exact local time')
    assert.deepEqual(h.box.exerciseEntries.find(entry => entry.id === 'other-record'), h.untouched, 'Saving one record never changes another')
    cases++
  }
  async function main() {
    const expected = zone === 'Australia/Melbourne' ? ['2026-10-16T20:30:00.000Z', '2026-07-16T21:30:00.000Z'] : zone === 'Pacific/Kiritimati' ? ['2026-10-16T17:30:00.000Z', '2026-07-16T17:30:00.000Z'] : ['2026-10-17T07:30:00.000Z', '2026-07-17T07:30:00.000Z']
    for (const method of ['POST', 'PATCH']) { await roundTrip('2026-10-17', '07:30', expected[0], method); await roundTrip('2026-07-17', '07:30', expected[1], method) }
    if (zone === 'Australia/Melbourne') {
      await roundTrip('2026-10-04', '01:30', '2026-10-03T15:30:00.000Z', 'POST')
      await roundTrip('2026-10-04', '03:30', '2026-10-03T16:30:00.000Z', 'POST')
      await roundTrip('2026-04-05', '02:30', '2026-04-04T15:30:37.000Z')
      await roundTrip('2026-04-05', '02:30', '2026-04-04T16:30:42.000Z')
      const gap = harness('2026-10-04'); gap.box.exerciseStartTime = '02:30'; await gap.box.save(); assert.equal(gap.requests.length, 0); assert.equal(gap.alerts[0][0], 'Invalid start time'); cases++
    }
    for (const [date, time] of [['2026-02-30', '07:30'], ['2026-13-01', '07:30'], ['not-a-date', '07:30'], ['2026-10-17', '24:00'], ['2026-10-17', '07:60'], ['2026-10-17', '7:30']]) {
      const h = harness(date); h.box.exerciseStartTime = time; await h.box.save(); assert.equal(h.requests.length, 0); assert.equal(h.alerts[0][0], 'Invalid start time'); cases++
    }
    for (const method of ['POST', 'PATCH']) {
      const h = harness(); if (method === 'PATCH') { const entry = { id: 'synthetic-edit', startTime: null, durationMinutes: 30, calories: 150, exerciseType: { id: 'synthetic-type' } }; h.box.exerciseEntries.push(entry); h.box.open(entry); assert.equal(h.box.exerciseStartTime, '') }
      await h.box.save(); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].method, method); assert(!Object.hasOwn(h.requests[0].body, 'startTime'), 'No-time stays omitted'); cases++
    }
    console.log(`PASS ${zone}: ${cases} actual open/save cases`)
  }
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
}
