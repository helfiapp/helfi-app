-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FoodMissingStatus" AS ENUM ('PENDING', 'MATCHED', 'ADDED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "FoodMissingReport" ADD COLUMN IF NOT EXISTS "status" "FoodMissingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "FoodMissingReport" ADD COLUMN IF NOT EXISTS "matchedCustomFoodId" TEXT;
ALTER TABLE "FoodMissingReport" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "FoodMissingReport" ADD COLUMN IF NOT EXISTS "processedNote" TEXT;

-- Index
CREATE INDEX IF NOT EXISTS "FoodMissingReport_status_idx" ON "FoodMissingReport"("status");
