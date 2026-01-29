-- CreateTable
CREATE TABLE "SupplementCatalog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "brand" TEXT,
    "product" TEXT,
    "fullName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplementCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplementCatalog_brand_idx" ON "SupplementCatalog"("brand");
CREATE INDEX "SupplementCatalog_product_idx" ON "SupplementCatalog"("product");
CREATE INDEX "SupplementCatalog_fullName_idx" ON "SupplementCatalog"("fullName");
CREATE UNIQUE INDEX "SupplementCatalog_userId_fullName_dosage_source_key" ON "SupplementCatalog"("userId", "fullName", "dosage", "source");

-- AddForeignKey
ALTER TABLE "SupplementCatalog" ADD CONSTRAINT "SupplementCatalog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
