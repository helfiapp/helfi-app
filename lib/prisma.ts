import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with error handling for missing DATABASE_URL
let prisma: PrismaClient

try {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not found. Some features may not work properly.');
    // Create a mock client that won't crash the app
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://dummy:dummy@localhost:5432/dummy'
        }
      }
    });
  } else {
    prisma = globalForPrisma.prisma ?? new PrismaClient()
  }
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  // Fallback to a basic client
  prisma = new PrismaClient();
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export { prisma } 