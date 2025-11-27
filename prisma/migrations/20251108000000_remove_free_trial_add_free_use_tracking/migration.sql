-- Remove FREE from Plan enum and add free use tracking fields
-- Migration: remove_free_trial_add_free_use_tracking

-- Add new free use tracking columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeFoodAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeInteractionAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeMedicalAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- Update Plan enum: Remove FREE, keep only PREMIUM
-- First, update all FREE subscriptions to PREMIUM (or delete them)
UPDATE "Subscription" SET "plan" = 'PREMIUM' WHERE "plan" = 'FREE';

-- Drop the old enum and create new one
-- Step 1: Drop default constraint
ALTER TABLE "Subscription" ALTER COLUMN "plan" DROP DEFAULT;

-- Step 2: Create new enum type
CREATE TYPE "Plan_new" AS ENUM ('PREMIUM');

-- Step 3: Alter the column to use new type
ALTER TABLE "Subscription" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");

-- Step 4: Drop old enum
DROP TYPE "Plan";

-- Step 5: Rename new enum
ALTER TYPE "Plan_new" RENAME TO "Plan";

-- Step 6: Update default value
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'PREMIUM';

