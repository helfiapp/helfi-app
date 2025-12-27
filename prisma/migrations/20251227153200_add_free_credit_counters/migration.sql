-- Add free credit counter fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeFoodAnalysisRemaining" INTEGER DEFAULT 5;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeSymptomAnalysisRemaining" INTEGER DEFAULT 2;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeMedicalAnalysisRemaining" INTEGER DEFAULT 2;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeInteractionAnalysisRemaining" INTEGER DEFAULT 2;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeHealthIntakeRemaining" INTEGER DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeInsightsUpdateRemaining" INTEGER DEFAULT 3;

-- Set defaults for existing users (grant them free credits)
UPDATE "User" SET 
  "freeFoodAnalysisRemaining" = COALESCE("freeFoodAnalysisRemaining", 5),
  "freeSymptomAnalysisRemaining" = COALESCE("freeSymptomAnalysisRemaining", 2),
  "freeMedicalAnalysisRemaining" = COALESCE("freeMedicalAnalysisRemaining", 2),
  "freeInteractionAnalysisRemaining" = COALESCE("freeInteractionAnalysisRemaining", 2),
  "freeHealthIntakeRemaining" = COALESCE("freeHealthIntakeRemaining", 1),
  "freeInsightsUpdateRemaining" = COALESCE("freeInsightsUpdateRemaining", 3)
WHERE "freeFoodAnalysisRemaining" IS NULL;
