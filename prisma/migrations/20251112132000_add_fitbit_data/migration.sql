-- Create FitbitData table to store synced Fitbit metrics
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

-- Foreign key to User
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

-- Unique constraint to avoid duplicate entries for the same day/type
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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS "FitbitData_userId_date_idx" ON "FitbitData"("userId","date");
CREATE INDEX IF NOT EXISTS "FitbitData_userId_dataType_idx" ON "FitbitData"("userId","dataType");


