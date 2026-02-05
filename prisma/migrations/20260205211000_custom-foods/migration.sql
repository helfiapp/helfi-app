-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CustomFoodKind" AS ENUM ('SINGLE', 'PACKAGED', 'FAST_FOOD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomFoodItem" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "kind" "CustomFoodKind" NOT NULL DEFAULT 'SINGLE',
  "group" TEXT,
  "caloriesPer100g" DOUBLE PRECISION,
  "proteinPer100g" DOUBLE PRECISION,
  "carbsPer100g" DOUBLE PRECISION,
  "fatPer100g" DOUBLE PRECISION,
  "fiberPer100g" DOUBLE PRECISION,
  "sugarPer100g" DOUBLE PRECISION,
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "servingOptions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomFoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomFoodItem_key_key" ON "CustomFoodItem"("key");
CREATE INDEX IF NOT EXISTS "CustomFoodItem_name_idx" ON "CustomFoodItem"("name");
CREATE INDEX IF NOT EXISTS "CustomFoodItem_brand_idx" ON "CustomFoodItem"("brand");
CREATE INDEX IF NOT EXISTS "CustomFoodItem_kind_idx" ON "CustomFoodItem"("kind");
