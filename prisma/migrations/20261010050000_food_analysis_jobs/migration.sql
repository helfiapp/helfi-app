CREATE TABLE "FoodAnalysisJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "encryptedState" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorStatus" INTEGER,
  CONSTRAINT "FoodAnalysisJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FoodAnalysisJob_userId_requestId_key" ON "FoodAnalysisJob"("userId", "requestId");
CREATE INDEX "FoodAnalysisJob_userId_status_expiresAt_idx" ON "FoodAnalysisJob"("userId", "status", "expiresAt");
CREATE INDEX "FoodAnalysisJob_status_expiresAt_idx" ON "FoodAnalysisJob"("status", "expiresAt");
CREATE INDEX "FoodAnalysisJob_retainUntil_idx" ON "FoodAnalysisJob"("retainUntil");
ALTER TABLE "FoodAnalysisJob" ADD CONSTRAINT "FoodAnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
