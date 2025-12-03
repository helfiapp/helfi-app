-- Create AIUsageEvent table for persistent AI usage logging
CREATE TABLE IF NOT EXISTS "AIUsageEvent" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "feature" TEXT NOT NULL,
    "userId" TEXT,
    "userLabel" TEXT,
    "scanId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "imageBytes" INTEGER,
    "imageMime" TEXT,
    "endpoint" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT TRUE,
    "errorMessage" TEXT,
    "detail" TEXT
);

CREATE INDEX IF NOT EXISTS "AIUsageEvent_createdAt_idx" ON "AIUsageEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_feature_idx" ON "AIUsageEvent" ("feature");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_user_idx" ON "AIUsageEvent" ("userId");
