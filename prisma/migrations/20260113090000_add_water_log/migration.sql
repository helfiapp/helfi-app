-- Add WaterLog table for hydration tracking

CREATE TABLE IF NOT EXISTS "WaterLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "amountMl" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "localDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WaterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WaterLog_userId_localDate_idx" ON "WaterLog"("userId", "localDate");
CREATE INDEX IF NOT EXISTS "WaterLog_userId_createdAt_idx" ON "WaterLog"("userId", "createdAt");
