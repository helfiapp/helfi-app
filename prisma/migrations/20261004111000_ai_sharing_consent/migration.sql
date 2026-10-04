CREATE TABLE "AiDataSharingConsent" (
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "disclosure" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "grantedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiDataSharingConsent_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AiDataSharingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
