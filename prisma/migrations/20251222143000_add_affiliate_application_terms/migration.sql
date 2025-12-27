ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
