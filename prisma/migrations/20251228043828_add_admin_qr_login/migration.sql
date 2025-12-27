-- CreateTable
CREATE TABLE "AdminQrLogin" (
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "adminId" TEXT,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "AdminQrLogin_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "AdminQrLogin_status_idx" ON "AdminQrLogin"("status");

-- CreateIndex
CREATE INDEX "AdminQrLogin_expiresAt_idx" ON "AdminQrLogin"("expiresAt");
