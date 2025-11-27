import { prisma } from '@/lib/prisma'

/**
 * Ensure the FitbitData table and required indexes exist.
 * Safe to run repeatedly; uses IF NOT EXISTS guards.
 */
export async function ensureFitbitDataSchema(): Promise<void> {
  try {
    // Create table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FitbitData" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "dataType" TEXT NOT NULL,
        "value" JSONB NOT NULL,
        "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FitbitData_pkey" PRIMARY KEY ("id")
      );
    `)

    // FK to User
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          WHERE tc.constraint_name = 'FitbitData_userId_fkey'
        ) THEN
          ALTER TABLE "FitbitData"
          ADD CONSTRAINT "FitbitData_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch((err) => {
      // Constraint might already exist, ignore
      console.log('FK constraint check (non-fatal):', err?.message)
    })

    // Unique and indexes
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE indexname = 'FitbitData_userId_date_dataType_key'
        ) THEN
          CREATE UNIQUE INDEX "FitbitData_userId_date_dataType_key"
          ON "FitbitData"("userId","date","dataType");
        END IF;
      END $$;
    `).catch((err) => {
      // Index might already exist, ignore
      console.log('Unique index check (non-fatal):', err?.message)
    })

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FitbitData_userId_date_idx" ON "FitbitData"("userId","date");
    `).catch((err) => {
      console.log('Index creation (non-fatal):', err?.message)
    })

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FitbitData_userId_dataType_idx" ON "FitbitData"("userId","dataType");
    `).catch((err) => {
      console.log('Index creation (non-fatal):', err?.message)
    })
  } catch (error: any) {
    console.error('❌ Error ensuring FitbitData schema:', error)
    console.error('Error message:', error?.message)
    console.error('Error code:', error?.code)
    // Re-throw so caller knows it failed
    throw new Error(`Failed to ensure FitbitData schema: ${error?.message || 'Unknown error'}`)
  }
}


