-- Add monthlyInsightsGenerationUsed field to User table
-- This tracks how many times insights have been generated this month

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlyInsightsGenerationUsed" INTEGER NOT NULL DEFAULT 0;

-- Update existing users to have 0 (already default, but explicit for clarity)
UPDATE "User" SET "monthlyInsightsGenerationUsed" = 0 WHERE "monthlyInsightsGenerationUsed" IS NULL;

