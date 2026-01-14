DO $$ BEGIN
  CREATE TYPE "PractitionerServiceType" AS ENUM ('IN_PERSON', 'TELEHEALTH', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'HIDDEN', 'SUSPENDED', 'REJECTED', 'DELETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerVisibilityReason" AS ENUM ('TRIAL_ACTIVE', 'SUB_ACTIVE', 'SUB_LAPSED', 'ADMIN_HIDDEN', 'PAYMENT_FAILED', 'POLICY', 'AI_REVIEW_PENDING', 'AI_FLAGGED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerAiRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerSubscriptionProvider" AS ENUM ('STRIPE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerSubscriptionPlan" AS ENUM ('LISTING_4_95');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerBoostStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerRadiusTier" AS ENUM ('R5', 'R10', 'R25', 'R50');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerEmailType" AS ENUM ('TRIAL_14D', 'TRIAL_7D', 'TRIAL_1D', 'TRIAL_ENDED', 'SUB_FAILED', 'SUB_CANCELED', 'BOOST_PURCHASED', 'WEEKLY_REENGAGE', 'LISTING_SUBMITTED', 'LISTING_APPROVED', 'LISTING_FLAGGED', 'LISTING_REJECTED', 'LISTING_ACTIVATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PractitionerModerationAction" AS ENUM ('APPROVE', 'HIDE', 'SUSPEND', 'UNSUSPEND', 'EDIT', 'DELETE', 'REJECT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "PractitionerAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PractitionerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "parentId" TEXT,
  "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PractitionerCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerListing" (
  "id" TEXT NOT NULL,
  "practitionerAccountId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "subcategoryId" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "description" TEXT,
  "phone" TEXT,
  "websiteUrl" TEXT,
  "emailPublic" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "suburbCity" TEXT,
  "stateRegion" TEXT,
  "postcode" TEXT,
  "country" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "serviceType" "PractitionerServiceType" NOT NULL DEFAULT 'IN_PERSON',
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hoursJson" JSONB,
  "images" JSONB,
  "status" "PractitionerListingStatus" NOT NULL DEFAULT 'DRAFT',
  "visibilityReason" "PractitionerVisibilityReason",
  "reviewStatus" "PractitionerReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNotes" TEXT,
  "reviewFlagReason" TEXT,
  "reviewDecisionAt" TIMESTAMP(3),
  "reviewedByAdminId" TEXT,
  "aiRiskLevel" "PractitionerAiRiskLevel",
  "aiReasoning" TEXT,
  "aiRawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PractitionerListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerListingSubscription" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "provider" "PractitionerSubscriptionProvider" NOT NULL DEFAULT 'STRIPE',
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "plan" "PractitionerSubscriptionPlan" NOT NULL DEFAULT 'LISTING_4_95',
  "trialStartAt" TIMESTAMP(3),
  "trialEndAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "status" "PractitionerSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PractitionerListingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerBoostPurchase" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "geoKey" TEXT NOT NULL,
  "radiusTier" "PractitionerRadiusTier" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "PractitionerBoostStatus" NOT NULL DEFAULT 'ACTIVE',
  "priceCents" INT NOT NULL,
  "currency" TEXT NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "remainingSeconds" INT,
  "providerCheckoutSessionId" TEXT,
  "providerPaymentIntentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PractitionerBoostPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerBoostRotationState" (
  "id" TEXT NOT NULL,
  "bucketKey" TEXT NOT NULL,
  "lastServedListingId" TEXT,
  "lastServedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PractitionerBoostRotationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerEmailLog" (
  "id" TEXT NOT NULL,
  "practitionerAccountId" TEXT,
  "listingId" TEXT,
  "type" "PractitionerEmailType" NOT NULL,
  "toEmail" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PractitionerEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PractitionerModerationLog" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "listingId" TEXT NOT NULL,
  "action" "PractitionerModerationAction" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PractitionerModerationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PractitionerAccount_userId_key" ON "PractitionerAccount"("userId");

CREATE UNIQUE INDEX "PractitionerCategory_slug_key" ON "PractitionerCategory"("slug");
CREATE INDEX "PractitionerCategory_parentId_idx" ON "PractitionerCategory"("parentId");
CREATE INDEX "PractitionerCategory_sortOrder_idx" ON "PractitionerCategory"("sortOrder");

CREATE UNIQUE INDEX "PractitionerListing_slug_key" ON "PractitionerListing"("slug");
CREATE INDEX "PractitionerListing_practitionerAccountId_idx" ON "PractitionerListing"("practitionerAccountId");
CREATE INDEX "PractitionerListing_categoryId_idx" ON "PractitionerListing"("categoryId");
CREATE INDEX "PractitionerListing_subcategoryId_idx" ON "PractitionerListing"("subcategoryId");
CREATE INDEX "PractitionerListing_status_idx" ON "PractitionerListing"("status");
CREATE INDEX "PractitionerListing_reviewStatus_idx" ON "PractitionerListing"("reviewStatus");
CREATE INDEX "PractitionerListing_createdAt_idx" ON "PractitionerListing"("createdAt");

CREATE UNIQUE INDEX "PractitionerListingSubscription_listingId_key" ON "PractitionerListingSubscription"("listingId");
CREATE INDEX "PractitionerListingSubscription_status_idx" ON "PractitionerListingSubscription"("status");
CREATE INDEX "PractitionerListingSubscription_currentPeriodEnd_idx" ON "PractitionerListingSubscription"("currentPeriodEnd");

CREATE INDEX "PractitionerBoostPurchase_listingId_idx" ON "PractitionerBoostPurchase"("listingId");
CREATE INDEX "PractitionerBoostPurchase_categoryId_idx" ON "PractitionerBoostPurchase"("categoryId");
CREATE INDEX "PractitionerBoostPurchase_status_idx" ON "PractitionerBoostPurchase"("status");
CREATE INDEX "PractitionerBoostPurchase_geoKey_idx" ON "PractitionerBoostPurchase"("geoKey");
CREATE INDEX "PractitionerBoostPurchase_startsAt_endsAt_idx" ON "PractitionerBoostPurchase"("startsAt", "endsAt");

CREATE UNIQUE INDEX "PractitionerBoostRotationState_bucketKey_key" ON "PractitionerBoostRotationState"("bucketKey");

CREATE INDEX "PractitionerEmailLog_listingId_idx" ON "PractitionerEmailLog"("listingId");
CREATE INDEX "PractitionerEmailLog_type_idx" ON "PractitionerEmailLog"("type");
CREATE INDEX "PractitionerEmailLog_sentAt_idx" ON "PractitionerEmailLog"("sentAt");

CREATE INDEX "PractitionerModerationLog_listingId_idx" ON "PractitionerModerationLog"("listingId");
CREATE INDEX "PractitionerModerationLog_adminUserId_idx" ON "PractitionerModerationLog"("adminUserId");
CREATE INDEX "PractitionerModerationLog_createdAt_idx" ON "PractitionerModerationLog"("createdAt");

ALTER TABLE "PractitionerAccount"
  ADD CONSTRAINT "PractitionerAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PractitionerCategory"
  ADD CONSTRAINT "PractitionerCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "PractitionerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PractitionerListing"
  ADD CONSTRAINT "PractitionerListing_practitionerAccountId_fkey"
  FOREIGN KEY ("practitionerAccountId") REFERENCES "PractitionerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PractitionerListing"
  ADD CONSTRAINT "PractitionerListing_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PractitionerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PractitionerListing"
  ADD CONSTRAINT "PractitionerListing_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "PractitionerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PractitionerListing"
  ADD CONSTRAINT "PractitionerListing_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PractitionerListingSubscription"
  ADD CONSTRAINT "PractitionerListingSubscription_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PractitionerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PractitionerBoostPurchase"
  ADD CONSTRAINT "PractitionerBoostPurchase_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PractitionerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PractitionerBoostPurchase"
  ADD CONSTRAINT "PractitionerBoostPurchase_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PractitionerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PractitionerEmailLog"
  ADD CONSTRAINT "PractitionerEmailLog_practitionerAccountId_fkey"
  FOREIGN KEY ("practitionerAccountId") REFERENCES "PractitionerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PractitionerEmailLog"
  ADD CONSTRAINT "PractitionerEmailLog_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PractitionerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PractitionerModerationLog"
  ADD CONSTRAINT "PractitionerModerationLog_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PractitionerModerationLog"
  ADD CONSTRAINT "PractitionerModerationLog_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "PractitionerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
