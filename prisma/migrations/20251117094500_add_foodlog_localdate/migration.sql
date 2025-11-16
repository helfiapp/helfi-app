-- Add localDate column to FoodLog to store the user's selected calendar date (YYYY-MM-DD)
ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "localDate" TEXT;



