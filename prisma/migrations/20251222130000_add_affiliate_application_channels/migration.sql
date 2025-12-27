ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "primaryChannel" TEXT;
ALTER TABLE "AffiliateApplication" ADD COLUMN IF NOT EXISTS "audienceSize" TEXT;
