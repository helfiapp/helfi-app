import { PrismaClient } from '@prisma/client'
import { attachWriteGuard } from './prisma-write-guard'

// Database credentials belong only in protected environment settings.
const datasourceUrl = process.env.DATABASE_URL?.trim()
if (!datasourceUrl) {
  throw new Error('DATABASE_URL must be configured for Helfi database access.')
}

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
