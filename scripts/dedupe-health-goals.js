const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function countDuplicates() {
  const [row] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT ("userId","name"))::bigint AS distinct_count FROM "HealthGoal"'
  )
  const total = Number(row?.total || 0)
  const distinctCount = Number(row?.distinct_count || 0)
  const duplicates = Math.max(0, total - distinctCount)
  return { total, distinctCount, duplicates }
}

async function main() {
  console.log('HealthGoal dedupe starting...')
  const before = await countDuplicates()
  console.log('Before:', before)

  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM "HealthGoal"
    WHERE ctid NOT IN (
      SELECT DISTINCT ON ("userId", "name") ctid
      FROM "HealthGoal"
      ORDER BY "userId", "name", "updatedAt" DESC, "createdAt" DESC
    )
  `)
  console.log('Deleted duplicate rows:', deleted)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS healthgoal_user_visible_name_uq
    ON "HealthGoal" ("userId", "name")
    WHERE "name" NOT LIKE '\\_\\_%' ESCAPE '\\'
  `)
  console.log('Ensured unique index for visible health goals')

  const after = await countDuplicates()
  console.log('After:', after)
}

main()
  .catch((error) => {
    console.error('HealthGoal dedupe failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
