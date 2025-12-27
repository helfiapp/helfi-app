-- Add Symptom Analysis history table

CREATE TABLE IF NOT EXISTS "SymptomAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symptoms" JSONB NOT NULL,
    "duration" TEXT,
    "notes" TEXT,
    "summary" TEXT,
    "analysisText" TEXT,
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymptomAnalysis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SymptomAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SymptomAnalysis_userId_createdAt_idx" ON "SymptomAnalysis"("userId", "createdAt");
