import { prisma } from '@/lib/prisma'

/**
 * Ensure SupplementCatalog table exists (idempotent).
 * Vercel builds don't run migrations here, so we create it at runtime.
 */
export async function ensureSupplementCatalogSchema(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupplementCatalog" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "brand" TEXT,
        "product" TEXT,
        "fullName" TEXT NOT NULL,
        "dosage" TEXT NOT NULL DEFAULT '',
        "source" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SupplementCatalog_pkey" PRIMARY KEY ("id")
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SupplementCatalog_brand_idx" ON "SupplementCatalog"("brand");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SupplementCatalog_product_idx" ON "SupplementCatalog"("product");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SupplementCatalog_fullName_idx" ON "SupplementCatalog"("fullName");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SupplementCatalog_userId_fullName_dosage_source_key"
      ON "SupplementCatalog"("userId", "fullName", "dosage", "source");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'SupplementCatalog_userId_fkey'
        ) THEN
          ALTER TABLE "SupplementCatalog"
          ADD CONSTRAINT "SupplementCatalog_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch(() => {})
  } catch (error: any) {
    console.error('❌ Error ensuring SupplementCatalog schema:', error)
    throw new Error(`Failed to ensure SupplementCatalog schema: ${error?.message || 'Unknown error'}`)
  }
}

