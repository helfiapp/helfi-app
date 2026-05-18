ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeProductId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeTransactionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeOriginalTransactionId" TEXT;
