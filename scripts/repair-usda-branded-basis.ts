import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { execFileSync } from 'node:child_process'
import { Prisma, PrismaClient } from '@prisma/client'

execFileSync(process.execPath, [path.join(process.cwd(), 'scripts/assert-no-local-openai-key.js')], { stdio: 'inherit' })
if (!process.env.DATABASE_URL) throw new Error('Database connection must be supplied privately; no embedded fallback is used.')
const planIndex = process.argv.indexOf('--plan')
const planPath = planIndex < 0 ? '' : process.argv[planIndex + 1]
if (!planPath) throw new Error('Supply the reviewed read-only repair plan with --plan.')
const apply = process.argv.includes('--apply')
const fields = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG'] as const
const prisma = new PrismaClient({ log: [] })

async function checkOrApply(batch: any[]) {
  for (const row of batch) {
    if (!row?.before?.id || !Number.isInteger(row.before.fdcId) || row.before.fdcId <= 0 || !['100 g', '100 ml'].includes(row.after?.servingSize)) {
      throw new Error('Invalid public-provider repair plan identity or basis.')
    }
    for (const field of fields) {
      const value = row.after[field]
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        throw new Error('Invalid planned nutrient value.')
      }
    }
  }
  const input = Prisma.sql`jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x("before" jsonb, "after" jsonb)`
  // Every original value must still match. Keep all identities and customer tables unchanged.
  const matches = Prisma.sql`
    f."source" = 'usda_branded' AND f."id" = x."before"->>'id'
    AND f."fdcId" = (x."before"->>'fdcId')::integer
    AND f."name" = x."before"->>'name'
    AND f."gtinUpc" IS NOT DISTINCT FROM x."before"->>'gtinUpc'
    AND f."servingSize" IS NOT DISTINCT FROM x."before"->>'servingSize'
    AND f."calories" IS NOT DISTINCT FROM (x."before"->>'calories')::double precision
    AND f."proteinG" IS NOT DISTINCT FROM (x."before"->>'proteinG')::double precision
    AND f."carbsG" IS NOT DISTINCT FROM (x."before"->>'carbsG')::double precision
    AND f."fatG" IS NOT DISTINCT FROM (x."before"->>'fatG')::double precision
    AND f."fiberG" IS NOT DISTINCT FROM (x."before"->>'fiberG')::double precision
    AND f."sugarG" IS NOT DISTINCT FROM (x."before"->>'sugarG')::double precision`
  if (!apply) {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT count(*) AS count FROM "FoodLibraryItem" f, ${input} WHERE ${matches}`)
    if (Number(result[0].count) !== batch.length) throw new Error('A public library record changed after backup; regenerate the plan.')
    return
  }
  // A mismatching batch rolls back entirely; no partial batch is accepted.
  await prisma.$transaction(async tx => {
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "FoodLibraryItem" f SET "servingSize" = x."after"->>'servingSize',
        "calories" = (x."after"->>'calories')::double precision,
        "proteinG" = (x."after"->>'proteinG')::double precision,
        "carbsG" = (x."after"->>'carbsG')::double precision,
        "fatG" = (x."after"->>'fatG')::double precision,
        "fiberG" = (x."after"->>'fiberG')::double precision,
        "sugarG" = (x."after"->>'sugarG')::double precision,
        "updatedAt" = CURRENT_TIMESTAMP
      FROM ${input} WHERE ${matches}`)
    if (changed !== batch.length) throw new Error('A public library record changed after backup; this batch was rolled back.')
  }, { timeout: 30000 })
}

async function run() {
  const originalCount = await prisma.foodLibraryItem.count({ where: { source: 'usda_branded' } })
  let batch: any[] = [], checked = 0
  const lines = readline.createInterface({ input: fs.createReadStream(planPath), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    batch.push(JSON.parse(line))
    if (batch.length < 1000) continue
    await checkOrApply(batch)
    checked += batch.length; batch = []
    if (checked % 100000 === 0) console.log(JSON.stringify({ apply, checked }))
  }
  if (batch.length) { await checkOrApply(batch); checked += batch.length }
  const finalCount = await prisma.foodLibraryItem.count({ where: { source: 'usda_branded' } })
  if (finalCount !== originalCount) throw new Error('Public provider record count changed during the repair; inspect before continuing.')
  console.log(JSON.stringify({ apply, checked, originalCount, finalCount, providerRowsPreserved: true, customerTablesTouched: false }))
}

run().catch((error) => {
  console.error('USDA public-library repair stopped; connection and secret details withheld. Inspect the reviewed plan and preserved backup before retrying.')
  const code = String(error?.code || '')
  const databaseCode = String(error?.meta?.code || '')
  if (/^P\d{4}$/.test(code)) console.error(JSON.stringify({ code, databaseCode: /^[A-Z0-9]{5}$/.test(databaseCode) ? databaseCode : null }))
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
