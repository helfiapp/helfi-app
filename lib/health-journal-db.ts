import { prisma } from '@/lib/prisma'

/**
 * Ensure Health Journal table exists (idempotent).
 * Builds do not run migrations, so create the table on demand.
 */
export async function ensureHealthJournalSchema(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HealthJournalEntry" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "localDate" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HealthJournalEntry_pkey" PRIMARY KEY ("id")
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HealthJournalEntry_userId_localDate_idx" ON "HealthJournalEntry"("userId", "localDate");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HealthJournalEntry_userId_createdAt_idx" ON "HealthJournalEntry"("userId", "createdAt");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'HealthJournalEntry_userId_fkey'
        ) THEN
          ALTER TABLE "HealthJournalEntry"
          ADD CONSTRAINT "HealthJournalEntry_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch(() => {})
  } catch (error: any) {
    console.error('❌ Error ensuring Health Journal schema:', error)
    throw new Error(`Failed to ensure Health Journal schema: ${error?.message || 'Unknown error'}`)
  }
}
