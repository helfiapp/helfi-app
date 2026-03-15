const { PrismaClient } = require('@prisma/client')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing DATABASE_URL. Set it to the live Helfi database before running this script.')
  process.exit(1)
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
})

const statements = [
  'CREATE EXTENSION IF NOT EXISTS pg_trgm',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "FoodLibraryItem_name_trgm_idx" ON "FoodLibraryItem" USING GIN ("name" gin_trgm_ops)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "FoodLibraryItem_brand_trgm_idx" ON "FoodLibraryItem" USING GIN ("brand" gin_trgm_ops)',
]

async function run() {
  try {
    for (const sql of statements) {
      console.log(`Running: ${sql}`)
      await prisma.$executeRawUnsafe(sql)
    }
    console.log('Done.')
  } catch (error) {
    console.error('Failed to add search indexes:', error)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

run()
