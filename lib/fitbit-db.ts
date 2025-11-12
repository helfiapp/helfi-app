import { prisma } from '@/lib/prisma'

/**
 * Ensure the FitbitData table and required indexes exist.
 * Safe to run repeatedly; uses IF NOT EXISTS guards.
 */
export async function ensureFitbitDataSchema(): Promise<void> {
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
  `)

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
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FitbitData_userId_date_idx" ON "FitbitData"("userId","date");
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FitbitData_userId_dataType_idx" ON "FitbitData"("userId","dataType");
  `)
}


