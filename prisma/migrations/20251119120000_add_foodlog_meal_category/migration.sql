-- Store meal/category metadata so diary entries keep their section across saves
ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "meal" TEXT;
ALTER TABLE "FoodLog" ADD COLUMN IF NOT EXISTS "category" TEXT;
