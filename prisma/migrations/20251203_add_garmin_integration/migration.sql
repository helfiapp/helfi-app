-- Garmin OAuth request tokens (short-lived, maps user -> oauth_token_secret)
CREATE TABLE IF NOT EXISTS "GarminRequestToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "oauthToken" TEXT NOT NULL,
  "oauthTokenSecret" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "GarminRequestToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GarminRequestToken_oauthToken_key" ON "GarminRequestToken"("oauthToken");
CREATE INDEX IF NOT EXISTS "GarminRequestToken_userId_idx" ON "GarminRequestToken"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'GarminRequestToken_userId_fkey'
  ) THEN
    ALTER TABLE "GarminRequestToken"
    ADD CONSTRAINT "GarminRequestToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Garmin webhook payload logging for debugging/audit
CREATE TABLE IF NOT EXISTS "GarminWebhookLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "oauthToken" TEXT,
  "dataType" TEXT,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GarminWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GarminWebhookLog_oauthToken_idx" ON "GarminWebhookLog"("oauthToken");
CREATE INDEX IF NOT EXISTS "GarminWebhookLog_userId_idx" ON "GarminWebhookLog"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'GarminWebhookLog_userId_fkey'
  ) THEN
    ALTER TABLE "GarminWebhookLog"
    ADD CONSTRAINT "GarminWebhookLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
