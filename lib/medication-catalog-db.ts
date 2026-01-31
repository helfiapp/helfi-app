import { prisma } from '@/lib/prisma'

/**
 * Ensure MedicationCatalog table exists (idempotent).
 * Vercel builds don't run migrations here, so we create it at runtime.
 */
export async function ensureMedicationCatalogSchema(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MedicationCatalog" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "brand" TEXT,
        "product" TEXT,
        "fullName" TEXT NOT NULL,
        "dosage" TEXT NOT NULL DEFAULT '',
        "source" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MedicationCatalog_pkey" PRIMARY KEY ("id")
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MedicationCatalog_brand_idx" ON "MedicationCatalog"("brand");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MedicationCatalog_product_idx" ON "MedicationCatalog"("product");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MedicationCatalog_fullName_idx" ON "MedicationCatalog"("fullName");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MedicationCatalog_userId_fullName_dosage_source_key"
      ON "MedicationCatalog"("userId", "fullName", "dosage", "source");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'MedicationCatalog_userId_fkey'
        ) THEN
          ALTER TABLE "MedicationCatalog"
          ADD CONSTRAINT "MedicationCatalog_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch(() => {})
  } catch (error: any) {
    console.error('❌ Error ensuring MedicationCatalog schema:', error)
    throw new Error(`Failed to ensure MedicationCatalog schema: ${error?.message || 'Unknown error'}`)
  }
}
