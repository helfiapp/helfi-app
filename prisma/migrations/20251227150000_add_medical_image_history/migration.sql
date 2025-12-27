-- Add Medical Image Analysis history table and file usage enum value

ALTER TYPE "FileUsage" ADD VALUE IF NOT EXISTS 'MEDICAL_IMAGE';

CREATE TABLE IF NOT EXISTS "MedicalImageAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageFileId" TEXT,
    "summary" TEXT,
    "analysisText" TEXT,
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalImageAnalysis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MedicalImageAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MedicalImageAnalysis_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MedicalImageAnalysis_userId_createdAt_idx" ON "MedicalImageAnalysis"("userId", "createdAt");
