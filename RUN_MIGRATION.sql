-- Run this migration manually on your production database
-- The migration adds free use tracking columns and removes FREE from Plan enum

-- Add new free use tracking columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeFoodAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeInteractionAnalysis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasUsedFreeMedicalAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- Update Plan enum: Remove FREE, keep only PREMIUM
-- First, update all FREE subscriptions to PREMIUM (or delete them)
UPDATE "Subscription" SET "plan" = 'PREMIUM' WHERE "plan" = 'FREE';

-- Drop the old enum and create new one
DO $$ 
BEGIN
    -- Check if Plan enum exists and has FREE value
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Plan') THEN
        -- Create new enum type
        CREATE TYPE "Plan_new" AS ENUM ('PREMIUM');
        
        -- Alter the column to use new type
        ALTER TABLE "Subscription" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
        
        -- Drop old enum
        DROP TYPE "Plan";
        
        -- Rename new enum
        ALTER TYPE "Plan_new" RENAME TO "Plan";
        
        -- Update default value
        ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'PREMIUM';
    END IF;
END $$;

