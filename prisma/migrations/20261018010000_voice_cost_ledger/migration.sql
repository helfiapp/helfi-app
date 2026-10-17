-- Additive voice accounting only; no existing rows or tables are changed.
CREATE TABLE "VoiceFundingLot" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL UNIQUE, "revenueEvidenceKey" TEXT UNIQUE, "sourceBucket" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "cycleStartedAt" TIMESTAMP(3), "creditsIssued" INTEGER NOT NULL DEFAULT 0,
  "committedCredits" INTEGER NOT NULL DEFAULT 0, "netUsdMicros" BIGINT NOT NULL DEFAULT 0,
  "providerBudgetCostUnits" BIGINT NOT NULL, "spentCostUnits" BIGINT NOT NULL DEFAULT 0,
  "heldCostUnits" BIGINT NOT NULL DEFAULT 0, "proof" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceFundingLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VoiceFundingLot_nonnegative" CHECK ("creditsIssued" >= 0 AND "committedCredits" >= 0 AND "committedCredits" <= "creditsIssued" AND "netUsdMicros" >= 0 AND "providerBudgetCostUnits" >= 0 AND "spentCostUnits" >= 0 AND "heldCostUnits" >= 0)
);
CREATE INDEX "VoiceFundingLot_userId_sourceBucket_sourceId_idx" ON "VoiceFundingLot"("userId", "sourceBucket", "sourceId");
CREATE TABLE "VoiceBillingSession" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "billingRunId" TEXT NOT NULL,
  "mode" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'OPEN', "operatorFundingId" TEXT,
  "reservedCredits" INTEGER NOT NULL, "chargedCredits" INTEGER NOT NULL DEFAULT 0,
  "refundedCredits" INTEGER NOT NULL DEFAULT 0, "forfeitedCredits" INTEGER NOT NULL DEFAULT 0,
  "rateNetUsdMicros" BIGINT NOT NULL DEFAULT 0, "rateCredits" INTEGER NOT NULL DEFAULT 0,
  "marginBps" INTEGER NOT NULL DEFAULT 5000, "providerBudgetCostUnits" BIGINT NOT NULL,
  "spentCostUnits" BIGINT NOT NULL DEFAULT 0, "heldCostUnits" BIGINT NOT NULL DEFAULT 0,
  "finalUsageConfirmed" BOOLEAN NOT NULL DEFAULT false, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "VoiceBillingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VoiceBillingSession_operatorFundingId_fkey" FOREIGN KEY ("operatorFundingId") REFERENCES "VoiceFundingLot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VoiceBillingSession_userId_billingRunId_key" UNIQUE ("userId", "billingRunId"),
  CONSTRAINT "VoiceBillingSession_nonnegative" CHECK ("reservedCredits" > 0 AND "chargedCredits" >= 0 AND "refundedCredits" >= 0 AND "forfeitedCredits" >= 0 AND "providerBudgetCostUnits" >= 0 AND "spentCostUnits" >= 0 AND "heldCostUnits" >= 0)
);
CREATE INDEX "VoiceBillingSession_state_expiresAt_idx" ON "VoiceBillingSession"("state", "expiresAt");
CREATE TABLE "VoiceSessionAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "fundingLotId" TEXT,
  "bucket" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "cycleStartedAt" TIMESTAMP(3),
  "reservedCredits" INTEGER NOT NULL, "chargedCredits" INTEGER NOT NULL DEFAULT 0,
  "refundedCredits" INTEGER NOT NULL DEFAULT 0, "forfeitedCredits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VoiceSessionAllocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceBillingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VoiceSessionAllocation_fundingLotId_fkey" FOREIGN KEY ("fundingLotId") REFERENCES "VoiceFundingLot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VoiceSessionAllocation_nonnegative" CHECK ("reservedCredits" > 0 AND "chargedCredits" >= 0 AND "refundedCredits" >= 0 AND "forfeitedCredits" >= 0)
);
CREATE INDEX "VoiceSessionAllocation_sessionId_idx" ON "VoiceSessionAllocation"("sessionId");
CREATE TABLE "VoiceCostReservation" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'PENDING', "providerSessionId" TEXT UNIQUE,
  "maxCostUnits" BIGINT NOT NULL, "observedCostUnits" BIGINT NOT NULL DEFAULT 0,
  "actualCostUnits" BIGINT, "receiptDigest" TEXT, "usage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceCostReservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceBillingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VoiceCostReservation_sessionId_key_key" UNIQUE ("sessionId", "key"),
  CONSTRAINT "VoiceCostReservation_nonnegative" CHECK ("maxCostUnits" >= 0 AND "observedCostUnits" >= 0 AND ("actualCostUnits" IS NULL OR "actualCostUnits" >= 0))
);
CREATE TABLE "VoiceSessionRuntime" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL,
  "providerSessionId" TEXT, "state" TEXT NOT NULL DEFAULT 'allocating', "expiresAt" TIMESTAMP(3) NOT NULL,
  "leaseTokenHash" TEXT, "leaseExpiresAt" TIMESTAMP(3), "lastHeartbeatAt" TIMESTAMP(3),
  "configuration" JSONB NOT NULL, "transcript" JSONB NOT NULL, "toolJobs" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceSessionRuntime_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceBillingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VoiceSessionRuntime_state_expiresAt_idx" ON "VoiceSessionRuntime"("state", "expiresAt");
