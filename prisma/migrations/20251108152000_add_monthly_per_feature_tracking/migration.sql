-- Add monthly per-feature usage tracking fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlySymptomAnalysisUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlyFoodAnalysisUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlyMedicalImageAnalysisUsed" INTEGER NOT NULL DEFAULT 0;


