-- Add monthly wallet fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletMonthlyUsedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletMonthlyResetAt" TIMESTAMP(3);

-- Create CreditTopUp table for 12-month top-ups
CREATE TABLE IF NOT EXISTS "CreditTopUp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "usedCents" INTEGER NOT NULL DEFAULT 0,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT,
  CONSTRAINT "CreditTopUp_pkey" PRIMARY KEY ("id")
);

-- Foreign key to User
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'CreditTopUp_userId_fkey'
  ) THEN
    ALTER TABLE "CreditTopUp"
    ADD CONSTRAINT "CreditTopUp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Helpful index for FIFO consumption and listing
CREATE INDEX IF NOT EXISTS "CreditTopUp_userId_expiresAt_idx" ON "CreditTopUp"("userId","expiresAt");








