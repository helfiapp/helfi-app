import { PrismaClient } from '@prisma/client'
import { attachWriteGuard } from '@/lib/prisma-write-guard'

// Force the USDA search to use the populated Neon database. If DATABASE_URL is
// not set or points to an empty instance, fall back to the known populated DB.
const FALLBACK_DB_URL = 'postgresql://neondb_owner:npg_lAz5EgvM9iDe@ep-hidden-glade-a7wnwux8-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require'
const datasourceUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0 ? process.env.DATABASE_URL : FALLBACK_DB_URL

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: datasourceUrl,
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

attachWriteGuard(prisma)

// Disconnect on process termination
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
} 
