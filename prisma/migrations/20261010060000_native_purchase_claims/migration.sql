CREATE TABLE "NativePurchaseClaim" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativePurchaseClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativePurchaseClaim_platform_purchaseId_key" ON "NativePurchaseClaim"("platform", "purchaseId");
CREATE INDEX "NativePurchaseClaim_userId_idx" ON "NativePurchaseClaim"("userId");
ALTER TABLE "NativePurchaseClaim" ADD CONSTRAINT "NativePurchaseClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
