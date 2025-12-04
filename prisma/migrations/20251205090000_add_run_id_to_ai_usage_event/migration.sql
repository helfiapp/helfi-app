-- Add runId to AIUsageEvent for per-run cost tracking
ALTER TABLE "AIUsageEvent" ADD COLUMN IF NOT EXISTS "runId" TEXT;
CREATE INDEX IF NOT EXISTS "AIUsageEvent_runId_idx" ON "AIUsageEvent" ("runId");
