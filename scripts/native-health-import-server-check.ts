import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file: string, modules: Record<string, any>) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const context = { exports: {} as any, require: (id: string) => {
    assert.ok(id in modules, `Unexpected dependency ${id}`)
    return modules[id]
  }, console, Date, Number, String, Math, Promise }
  vm.runInNewContext(output, context, { filename: file })
  return context.exports
}

async function checkIngest() {
  const rows = new Map<string, any>()
  const key = (where: any) => {
    const x = where.userId_source_deviceId || where
    return `${x.userId}:${x.source}:${x.deviceId}`
  }
  let sequence = 0
  let profileReads = 0
  const exerciseEntry = {
    findFirst: async ({ where }: any) => rows.get(key(where)) || null,
    findUnique: async ({ where }: any) => rows.get(key(where)) || null,
    create: async ({ data }: any) => {
      await Promise.resolve()
      const k = key(data)
      if (rows.has(k)) throw Object.assign(new Error('unique constraint'), { code: 'P2002' })
      const row = { ...data, id: `entry-${++sequence}` }
      rows.set(k, row)
      return row
    },
    update: async ({ where, data }: any) => {
      const found = [...rows.entries()].find(([, row]) => row.id === where.id)
      assert.ok(found)
      const row = { ...found[1], ...data }
      rows.set(found[0], row)
      return row
    },
  }
  const { ingestExerciseEntry } = load('lib/exercise/ingest.ts', {
    '@/lib/prisma': { prisma: { exerciseEntry } },
    '@/lib/exercise/calories': { calculateExerciseCalories: () => 90 },
    '@/lib/exercise/health-profile': { getHealthProfileForUser: async () => {
      profileReads++
      return { weightKg: 70 }
    } },
  })
  const input = { userId: 'fixture-a', source: 'APPLE_HEALTH', deviceId: 'apple-health:2026-10-12',
    localDate: '2026-10-12', durationMinutes: 1, calories: 120, distanceKm: 1.4,
    label: 'Apple Health activity', rawPayload: { steps: 2100, distanceKm: 1.4 } }
  const results = await Promise.all([ingestExerciseEntry(input), ingestExerciseEntry(input)])
  assert.equal(rows.size, 1, 'simultaneous daily imports must retain one row')
  assert.equal(results.filter(x => x.created).length, 1, 'only the creator reports created')
  assert.equal(results[0].entry.id, results[1].entry.id)
  assert.equal(results[0].entry.distanceKm, 1.4, 'reported walking distance must be retained')
  const later = await ingestExerciseEntry({ ...input, calories: 180, distanceKm: 2.1 })
  assert.equal(later.created, false)
  assert.equal(later.entry.calories, 180, 'daily energy replaces rather than adds to the previous total')
  assert.equal(rows.size, 1)
  await ingestExerciseEntry({ ...input, userId: 'fixture-b' })
  await ingestExerciseEntry({ ...input, deviceId: 'apple-health:2026-10-13', localDate: '2026-10-13' })
  assert.equal(rows.size, 3, 'accounts and dates stay isolated')
  for (const calories of [null, undefined, 0, -1, NaN]) {
    const result = await ingestExerciseEntry({ ...input, deviceId: 'no-energy', calories, met: 4 })
    assert.equal(result.entry, null, 'missing Apple energy cannot become a MET estimate')
  }
  assert.equal(profileReads, 0)
  const fitbit = await ingestExerciseEntry({ ...input, source: 'FITBIT', deviceId: 'fitbit-fixture', calories: null, met: 4 })
  assert.equal(fitbit.entry.calories, 90, 'existing non-Apple estimation remains intact')
}

async function checkRoute() {
  const calls: any[] = []
  const { POST } = load('app/api/native-exercise-import/route.ts', {
    'next/server': { NextResponse: { json: (body: any, options: any) => ({ body, status: options?.status || 200 }) } },
    'next-auth': { getServerSession: async () => null },
    '@/lib/auth': { authOptions: {} },
    '@/lib/native-auth': { getUserIdFromNativeAuth: async (request: any) => request.userId || null },
    '@/lib/exercise/ingest': { ingestExerciseEntry: async (input: any) => {
      calls.push(input)
      return { created: false, entry: { id: 'fixture-entry', calories: input.calories } }
    } },
  })
  const body = { source: 'APPLE_HEALTH', date: '2026-10-12', caloriesKcal: 120, steps: 2100, distanceKm: 1.4 }
  const run = (data: any, userId: string | null = 'fixture-a') => POST({ userId, json: async () => data })
  assert.equal((await run(body, null)).status, 401)
  for (const value of [null, undefined, '', ' ', false, -1, 0, NaN, 50_001]) {
    assert.equal((await run({ ...body, caloriesKcal: value })).status, 400)
  }
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-01']) {
    assert.equal((await run({ ...body, date })).status, 400, 'invalid calendar dates are not importable')
  }
  assert.equal((await run({ ...body, source: 'SAMPLE' })).status, 400)
  assert.equal((await run({ ...body, steps: -1 })).status, 400)
  assert.equal((await run({ ...body, distanceKm: -1 })).status, 400)
  assert.equal(calls.length, 0, 'invalid inputs must never reach ingestion')
  assert.equal((await run(body)).status, 200)
  assert.equal(calls[0].userId, 'fixture-a')
  assert.equal(calls[0].distanceKm, 1.4)
  assert.equal(calls[0].rawPayload.steps, 2100)
  assert.equal((await run({ ...body, steps: null, distanceKm: null })).status, 200)
  assert.equal(calls[1].rawPayload.steps, null, 'unreported steps remain unreported')
  assert.equal(calls[1].rawPayload.distanceKm, null, 'unreported distance remains unreported')
  assert.equal((await run({ ...body, caloriesKcal: 0.25 })).status, 200)
  assert.equal(calls[2].calories, 0.25, 'small reported energy must not round into zero before ingestion')
}

async function main() {
  await checkIngest()
  await checkRoute()
  console.log('PASS: actual Health route/ingest preserve reported activity, single daily totals, account isolation and no guessed Apple energy.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
