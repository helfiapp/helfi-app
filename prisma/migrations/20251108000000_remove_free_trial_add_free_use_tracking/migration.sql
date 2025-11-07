-- Remove FREE from Plan enum and add free use tracking fields
-- Migration: remove_free_trial_add_free_use_tracking

-- Add new free use tracking columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeFoodAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeInteractionAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeMedicalAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- Remove trial fields (keep columns but they won't be used)
-- Note: We're keeping the columns for now to avoid breaking existing data
-- ALTER TABLE "User" DROP COLUMN IF EXISTS "trialActive";
-- ALTER TABLE "User" DROP COLUMN IF EXISTS "trialFoodRemaining";
-- ALTER TABLE "User" DROP COLUMN IF EXISTS "trialInteractionRemaining";

-- Update Plan enum: Remove FREE, keep only PREMIUM
-- First, update all FREE subscriptions to PREMIUM (or delete them)
UPDATE "Subscription" SET "plan" = 'PREMIUM' WHERE "plan" = 'FREE';

-- Drop the old enum and create new one
CREATE TYPE "Plan_new" AS ENUM ('PREMIUM');
ALTER TABLE "Subscription" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
DROP TYPE "Plan";
ALTER TYPE "Plan_new" RENAME TO "Plan";

-- Update default value
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'PREMIUM';

