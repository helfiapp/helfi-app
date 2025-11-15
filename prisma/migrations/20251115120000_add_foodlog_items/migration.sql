-- Add items JSON column to FoodLog for structured ingredient storage
ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "items" JSONB;


