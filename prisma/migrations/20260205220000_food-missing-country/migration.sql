-- Add country to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT;

-- Add country to CustomFoodItem
ALTER TABLE "CustomFoodItem" ADD COLUMN IF NOT EXISTS "country" TEXT;

-- Create FoodMissingReport
CREATE TABLE IF NOT EXISTS "FoodMissingReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "userEmail" TEXT,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "chain" TEXT,
  "size" TEXT,
  "country" TEXT,
  "kind" TEXT,
  "query" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodMissingReport_pkey" PRIMARY KEY ("id")
);

-- Foreign key
DO $$ BEGIN
  ALTER TABLE "FoodMissingReport" ADD CONSTRAINT "FoodMissingReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "FoodMissingReport_createdAt_idx" ON "FoodMissingReport"("createdAt");
CREATE INDEX IF NOT EXISTS "FoodMissingReport_country_idx" ON "FoodMissingReport"("country");
CREATE INDEX IF NOT EXISTS "FoodMissingReport_kind_idx" ON "FoodMissingReport"("kind");

-- CustomFoodItem country index
CREATE INDEX IF NOT EXISTS "CustomFoodItem_country_idx" ON "CustomFoodItem"("country");
