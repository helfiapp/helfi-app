#!/usr/bin/env node
'use strict'
// Actual signed save followed by the unchanged authenticated manual PATCH.
// Synthetic storage, calculation and auth only; no provider or real writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const text = fs.readFileSync(path.join(__dirname, 'voice-save-integrity-check.cjs'), 'utf8').replace(/^#!.*\n/, '')
const at = text.indexOf('async function run() {'); assert(at > 0)
const { harness, signed, load } = new Function('require', '__dirname', `${text.slice(0, at)}\nreturn {harness,signed,load}`)(require, __dirname)
async function setup(caloriesKcal) {
  const h = harness(), response = await h.send(signed({ action: 'exercise', exercise: { exerciseTypeId: 1, exerciseName: 'yoga', durationMinutes: 30, ...(caloriesKcal === undefined ? {} : { caloriesKcal }) } }))
  assert.equal(response.status, 200)
  let row = { ...h.state().exercise[0], exerciseType: { id: 1, name: 'yoga', met: 3 } }, writes = 0
  const route = load('app/api/exercise-entries/[id]/route.ts', { authOptions: {}, getServerSession: async () => ({ user: { id: 'synthetic-user' } }), getUserIdFromNativeAuth: async () => null,
    Prisma: { DbNull: null }, prisma: { exerciseEntry: {
      findUnique: async () => row,
      update: async ({ where, data }) => { assert.equal(where.id, row.id); writes++; for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value; return row },
      findMany: async ({ where }) => { assert.equal(where.userId, 'synthetic-user'); return [row] },
    } }, inferMetAndLabel: ({ durationMinutes }) => ({ durationMinutes, met: 3, label: 'yoga' }),
    getHealthProfileForUser: async () => ({ weightKg: 70 }), calculateExerciseCalories: () => 200,
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
  })
  return { row: () => row, writes: () => writes, patch: body => route.PATCH({ json: async () => body }, { params: { id: row.id } }) }
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
async function main() {
  await check('voice-stated calorie amount uses normal override contract and survives duration-only edit/readback', async () => {
    const f = await setup(500.4)
    assert.equal(f.row().calories, 500); assert.equal(f.row().rawPayload.caloriesOverride, 500)
    assert.equal(f.row().rawPayload.spokenCaloriesKcal, 500); assert.equal(f.row().rawPayload.estimatedCaloriesKcal, 100)
    const response = await f.patch({ durationMinutes: 40 })
    assert.equal(response.status, 200); assert.equal(response.body.entry.calories, 500); assert.equal(response.body.entry.rawPayload.caloriesOverride, 500)
    assert.equal(response.body.entries[0].calories, 500); assert.equal(f.row().durationMinutes, 40); assert.equal(f.writes(), 1)
  })
  await check('explicit null clears override and later omission continues the normal calorie estimate', async () => {
    const f = await setup(500)
    const cleared = await f.patch({ caloriesOverride: null })
    assert.equal(cleared.status, 200); assert.equal(f.row().calories, 200); assert.equal(Object.hasOwn(f.row().rawPayload, 'caloriesOverride'), false)
    assert.equal(f.row().rawPayload.spokenCaloriesKcal, 500, 'Original speech metadata is historical, never an active override')
    assert.equal((await f.patch({ durationMinutes: 50 })).status, 200); assert.equal(f.row().calories, 200)
    assert.equal(Object.hasOwn(f.row().rawPayload, 'caloriesOverride'), false)
  })
  await check('unspecified calorie amount creates no override and duration edit retains normal recalculation', async () => {
    const f = await setup()
    assert.equal(f.row().calories, 100); assert.equal(f.row().rawPayload.spokenCaloriesKcal, null)
    assert.equal(Object.hasOwn(f.row().rawPayload, 'caloriesOverride'), false)
    assert.equal((await f.patch({ durationMinutes: 40 })).status, 200); assert.equal(f.row().calories, 200)
    assert.equal(Object.hasOwn(f.row().rawPayload, 'caloriesOverride'), false)
  })
  console.log(`Voice exercise override round trip: ${passed} actual-source offline groups passed; no normal handler or native source changed.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
