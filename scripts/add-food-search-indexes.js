const { PrismaClient } = require('@prisma/client')

const FALLBACK_DB_URL =
  'postgresql://neondb_owner:npg_6Pwm8JLiQUxb@ep-shiny-silence-a7jm0pec-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || FALLBACK_DB_URL,
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
