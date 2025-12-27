DO $$ BEGIN
  CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliateApplicationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliateRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliateRecommendation" AS ENUM ('AUTO_APPROVE', 'MANUAL_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliateConversionType" AS ENUM ('SUBSCRIPTION_INITIAL', 'TOPUP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('PENDING', 'VOIDED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliatePayoutRunStatus" AS ENUM ('SUCCEEDED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "AffiliateApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "website" TEXT,
  "promotionMethod" TEXT NOT NULL,
  "notes" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "country" TEXT,
  "region" TEXT,
  "city" TEXT,
  "riskLevel" "AffiliateRiskLevel",
  "recommendation" "AffiliateRecommendation",
  "aiReasoning" TEXT,
  "aiRawJson" JSONB,
  "status" "AffiliateApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "autoApproved" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Affiliate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT,
  "code" TEXT NOT NULL,
  "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
  "stripeConnectAccountId" TEXT,
  "stripeConnectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
  "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "stripeConnectOnboardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateClick" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip" TEXT,
  "userAgent" TEXT,
  "referer" TEXT,
  "landingPath" TEXT,
  "destinationPath" TEXT,
  "country" TEXT,
  "region" TEXT,
  "city" TEXT,

  CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateReferral" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "clickId" TEXT,
  "referredUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateConversion" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "clickId" TEXT,
  "referredUserId" TEXT,
  "type" "AffiliateConversionType" NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeChargeId" TEXT,
  "stripeInvoiceId" TEXT,
  "currency" TEXT NOT NULL,
  "amountGrossCents" INTEGER NOT NULL,
  "stripeFeeCents" INTEGER NOT NULL,
  "amountNetCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePayoutRun" (
  "id" TEXT NOT NULL,
  "createdByAdminId" TEXT,
  "currency" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "AffiliatePayoutRunStatus" NOT NULL,
  "totalCents" INTEGER NOT NULL DEFAULT 0,
  "transferCount" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliatePayoutRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePayout" (
  "id" TEXT NOT NULL,
  "payoutRunId" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "stripeTransferId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCommission" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "currency" TEXT NOT NULL,
  "netRevenueCents" INTEGER NOT NULL,
  "commissionCents" INTEGER NOT NULL,
  "payableAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "payoutId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");
CREATE UNIQUE INDEX "Affiliate_applicationId_key" ON "Affiliate"("applicationId");
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
CREATE UNIQUE INDEX "Affiliate_stripeConnectAccountId_key" ON "Affiliate"("stripeConnectAccountId");
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

CREATE INDEX "AffiliateApplication_status_createdAt_idx" ON "AffiliateApplication"("status", "createdAt");
CREATE INDEX "AffiliateApplication_userId_idx" ON "AffiliateApplication"("userId");

CREATE INDEX "AffiliateClick_affiliateId_createdAt_idx" ON "AffiliateClick"("affiliateId", "createdAt");
CREATE INDEX "AffiliateClick_affiliateId_visitorId_idx" ON "AffiliateClick"("affiliateId", "visitorId");
CREATE INDEX "AffiliateClick_createdAt_idx" ON "AffiliateClick"("createdAt");

CREATE UNIQUE INDEX "AffiliateReferral_referredUserId_key" ON "AffiliateReferral"("referredUserId");
CREATE INDEX "AffiliateReferral_affiliateId_createdAt_idx" ON "AffiliateReferral"("affiliateId", "createdAt");

CREATE UNIQUE INDEX "AffiliateConversion_stripeEventId_key" ON "AffiliateConversion"("stripeEventId");
CREATE UNIQUE INDEX "AffiliateConversion_stripeCheckoutSessionId_key" ON "AffiliateConversion"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "AffiliateConversion_stripeChargeId_key" ON "AffiliateConversion"("stripeChargeId");
CREATE INDEX "AffiliateConversion_affiliateId_occurredAt_idx" ON "AffiliateConversion"("affiliateId", "occurredAt");
CREATE INDEX "AffiliateConversion_type_occurredAt_idx" ON "AffiliateConversion"("type", "occurredAt");

CREATE UNIQUE INDEX "AffiliatePayout_stripeTransferId_key" ON "AffiliatePayout"("stripeTransferId");
CREATE INDEX "AffiliatePayout_affiliateId_createdAt_idx" ON "AffiliatePayout"("affiliateId", "createdAt");
CREATE INDEX "AffiliatePayout_payoutRunId_idx" ON "AffiliatePayout"("payoutRunId");

CREATE INDEX "AffiliatePayoutRun_runAt_idx" ON "AffiliatePayoutRun"("runAt");

CREATE UNIQUE INDEX "AffiliateCommission_conversionId_key" ON "AffiliateCommission"("conversionId");
CREATE INDEX "AffiliateCommission_affiliateId_status_idx" ON "AffiliateCommission"("affiliateId", "status");
CREATE INDEX "AffiliateCommission_status_payableAt_idx" ON "AffiliateCommission"("status", "payableAt");

ALTER TABLE "AffiliateApplication"
  ADD CONSTRAINT "AffiliateApplication_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateApplication"
  ADD CONSTRAINT "AffiliateApplication_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Affiliate"
  ADD CONSTRAINT "Affiliate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Affiliate"
  ADD CONSTRAINT "Affiliate_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "AffiliateApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateClick"
  ADD CONSTRAINT "AffiliateClick_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateReferral"
  ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateReferral"
  ADD CONSTRAINT "AffiliateReferral_clickId_fkey"
  FOREIGN KEY ("clickId") REFERENCES "AffiliateClick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateReferral"
  ADD CONSTRAINT "AffiliateReferral_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateConversion"
  ADD CONSTRAINT "AffiliateConversion_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateConversion"
  ADD CONSTRAINT "AffiliateConversion_clickId_fkey"
  FOREIGN KEY ("clickId") REFERENCES "AffiliateClick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliateConversion"
  ADD CONSTRAINT "AffiliateConversion_referredUserId_fkey"
  FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliatePayoutRun"
  ADD CONSTRAINT "AffiliatePayoutRun_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffiliatePayout"
  ADD CONSTRAINT "AffiliatePayout_payoutRunId_fkey"
  FOREIGN KEY ("payoutRunId") REFERENCES "AffiliatePayoutRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliatePayout"
  ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateCommission"
  ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateCommission"
  ADD CONSTRAINT "AffiliateCommission_conversionId_fkey"
  FOREIGN KEY ("conversionId") REFERENCES "AffiliateConversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffiliateCommission"
  ADD CONSTRAINT "AffiliateCommission_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
