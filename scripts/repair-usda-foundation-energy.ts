import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Prisma, PrismaClient } from '@prisma/client'

execFileSync(process.execPath, [path.join(process.cwd(), 'scripts/assert-no-local-openai-key.js')], { stdio: 'inherit' })
if (!process.env.DATABASE_URL) throw new Error('Supply the protected database setting privately.')
const argument = (name: string) => process.argv[process.argv.indexOf(name) + 1]
const planPath = process.argv.includes('--plan') ? argument('--plan') : ''
const backupPath = process.argv.includes('--backup') ? argument('--backup') : ''
const archivePath = process.argv.includes('--archive') ? argument('--archive') : ''
if (!planPath || !backupPath || !archivePath) throw new Error('Supply the reviewed plan, public backup and original archive.')
const apply = process.argv.includes('--apply')
const prisma = new PrismaClient({ log: [] })
const fields = ['source', 'fdcId', 'name', 'brand', 'gtinUpc', 'servingSize', 'calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG'] as const
const records = (filename: string) => fs.readFileSync(filename, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
async function sha256(filename: string) {
  const digest = createHash('sha256')
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk)
  return digest.digest('hex')
}

async function run() {
  const manifest = JSON.parse(fs.readFileSync(`${planPath}.manifest.json`, 'utf8'))
  if (manifest.scope !== 'usda_foundation_missing_calories_only'
    || manifest.planSha256 !== await sha256(planPath)
    || manifest.backupSha256 !== await sha256(backupPath)
    || manifest.archiveSha256 !== await sha256(archivePath)) throw new Error('Reviewed plan/archive/backup verification failed.')
  const backup = records(backupPath)
  const originals = new Map(backup.map(row => [row.id, row]))
  const plan = records(planPath)
  if (originals.size !== backup.length || backup.length !== manifest.backupRecords || plan.length !== manifest.counts.planned) throw new Error('Public provider record count mismatch.')
  const seen = new Set<string>()
  for (const row of plan) {
    const before = row.before
    const original = originals.get(before?.id)
    if (!original || seen.has(before.id) || fields.some(field => original[field] !== before[field])
      || before.source !== 'usda_foundation' || !Number.isInteger(before.fdcId) || before.fdcId <= 0
      || before.servingSize !== '100 g' || before.calories !== null || before.brand !== null || before.gtinUpc !== null
      || ![1008, 2047, 2048].includes(row.energyNutrientId)
      || Object.keys(row.after ?? {}).join(',') !== 'calories'
      || typeof row.after.calories !== 'number' || !Number.isFinite(row.after.calories) || row.after.calories < 0) throw new Error('Invalid or out-of-scope Foundation repair row.')
    seen.add(before.id)
  }
  const originalCount = await prisma.foodLibraryItem.count({ where: { source: 'usda_foundation' } })
  if (originalCount !== backup.length) throw new Error('Foundation record count changed after backup.')
  const input = Prisma.sql`jsonb_to_recordset(${JSON.stringify(plan)}::jsonb) AS x("before" jsonb, "after" jsonb)`
  const matches = Prisma.sql`
    f."source" = 'usda_foundation' AND f."id" = x."before"->>'id'
    AND f."fdcId" = (x."before"->>'fdcId')::integer
    AND f."name" = x."before"->>'name'
    AND f."brand" IS NOT DISTINCT FROM x."before"->>'brand'
    AND f."gtinUpc" IS NOT DISTINCT FROM x."before"->>'gtinUpc'
    AND f."servingSize" = '100 g' AND f."calories" IS NULL
    AND f."proteinG" IS NOT DISTINCT FROM (x."before"->>'proteinG')::double precision
    AND f."carbsG" IS NOT DISTINCT FROM (x."before"->>'carbsG')::double precision
    AND f."fatG" IS NOT DISTINCT FROM (x."before"->>'fatG')::double precision
    AND f."fiberG" IS NOT DISTINCT FROM (x."before"->>'fiberG')::double precision
    AND f."sugarG" IS NOT DISTINCT FROM (x."before"->>'sugarG')::double precision`
  if (!apply) {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) AS count FROM "FoodLibraryItem" f, ${input} WHERE ${matches}`)
    if (Number(result[0].count) !== plan.length) throw new Error('A provider record changed after backup; regenerate the plan.')
  } else {
    await prisma.$transaction(async tx => {
      // All rows commit together only if every original value still matches.
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "FoodLibraryItem" f SET "calories" = (x."after"->>'calories')::double precision, "updatedAt" = CURRENT_TIMESTAMP
        FROM ${input} WHERE ${matches}`)
      if (changed !== plan.length) throw new Error('Source snapshot changed; the entire repair was rolled back.')
      if (await tx.foodLibraryItem.count({ where: { source: 'usda_foundation' } }) !== originalCount) throw new Error('Provider identities changed; the entire repair was rolled back.')
    }, { timeout: 30000 })
  }
  const after = await prisma.foodLibraryItem.findMany({ where: { source: 'usda_foundation' }, select: { id: true, source: true, fdcId: true, name: true, brand: true, gtinUpc: true, servingSize: true, calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, sugarG: true } })
  const targets = new Map(plan.map(row => [row.before.id, row.after.calories]))
  if (after.length !== backup.length) throw new Error('Provider record count changed.')
  for (const row of after) {
    const before = originals.get(row.id)
    if (!before || fields.some(field => row[field] !== (field === 'calories' && apply && targets.has(row.id) ? targets.get(row.id) : before[field]))) throw new Error('Unexpected provider value changed; inspect the preserved backup.')
  }
  console.log(JSON.stringify({ apply, checked: plan.length, originalCount, finalCount: after.length, allProviderIdentitiesAndOtherValuesPreserved: true, customerTablesTouched: false, missingCaloriesAfter: after.filter(row => row.calories == null).length }))
}

run().catch(() => { console.error('Foundation repair stopped; secret details withheld. Inspect the preserved backup and reviewed plan before retrying.'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
