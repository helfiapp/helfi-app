-- Add Health Journal entries

CREATE TABLE IF NOT EXISTS "HealthJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthJournalEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HealthJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HealthJournalEntry_userId_localDate_idx" ON "HealthJournalEntry"("userId", "localDate");
CREATE INDEX IF NOT EXISTS "HealthJournalEntry_userId_createdAt_idx" ON "HealthJournalEntry"("userId", "createdAt");
