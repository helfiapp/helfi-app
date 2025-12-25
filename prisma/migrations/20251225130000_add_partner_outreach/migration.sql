CREATE TABLE IF NOT EXISTS "PartnerOutreachContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT NOT NULL,
    "region" TEXT,
    "notes" TEXT,
    "sourceUrl" TEXT,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOutreachContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerOutreachContact_email_key" ON "PartnerOutreachContact"("email");
CREATE INDEX IF NOT EXISTS "PartnerOutreachContact_company_idx" ON "PartnerOutreachContact"("company");
