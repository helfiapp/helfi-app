import { prisma } from '@/lib/prisma'

/**
 * Ensure Garmin tables exist (idempotent).
 * Vercel builds don’t run `prisma migrate deploy` in this repo, so we defensively create tables at runtime.
 */
export async function ensureGarminSchema(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GarminRequestToken" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "oauthToken" TEXT NOT NULL,
        "oauthTokenSecret" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3),
        CONSTRAINT "GarminRequestToken_pkey" PRIMARY KEY ("id")
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GarminRequestToken_oauthToken_key" ON "GarminRequestToken"("oauthToken");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GarminRequestToken_userId_idx" ON "GarminRequestToken"("userId");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'GarminRequestToken_userId_fkey'
        ) THEN
          ALTER TABLE "GarminRequestToken"
          ADD CONSTRAINT "GarminRequestToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GarminWebhookLog" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "oauthToken" TEXT,
        "dataType" TEXT,
        "payload" JSONB NOT NULL,
        "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GarminWebhookLog_pkey" PRIMARY KEY ("id")
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GarminWebhookLog_oauthToken_idx" ON "GarminWebhookLog"("oauthToken");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GarminWebhookLog_userId_idx" ON "GarminWebhookLog"("userId");
    `).catch(() => {})

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'GarminWebhookLog_userId_fkey'
        ) THEN
          ALTER TABLE "GarminWebhookLog"
          ADD CONSTRAINT "GarminWebhookLog_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `).catch(() => {})
  } catch (error: any) {
    console.error('❌ Error ensuring Garmin schema:', error)
    throw new Error(`Failed to ensure Garmin schema: ${error?.message || 'Unknown error'}`)
  }
}

