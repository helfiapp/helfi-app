-- Additive only: preserve every existing barcode and food record.
CREATE TABLE "BarcodeUserCorrection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "servingSize" TEXT,
  "calories" DOUBLE PRECISION,
  "proteinG" DOUBLE PRECISION,
  "carbsG" DOUBLE PRECISION,
  "fatG" DOUBLE PRECISION,
  "fiberG" DOUBLE PRECISION,
  "sugarG" DOUBLE PRECISION,
  "quantityG" DOUBLE PRECISION,
  "piecesPerServing" DOUBLE PRECISION,
  "source" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reportCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BarcodeUserCorrection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BarcodeUserCorrection_userId_barcode_key" ON "BarcodeUserCorrection"("userId", "barcode");
CREATE INDEX "BarcodeUserCorrection_barcode_idx" ON "BarcodeUserCorrection"("barcode");

ALTER TABLE "BarcodeUserCorrection" ADD CONSTRAINT "BarcodeUserCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing submissions remain available to their last submitting account.
-- Do not delete or rewrite the original cache records, or promote them globally.
INSERT INTO "BarcodeUserCorrection" (
  "id", "userId", "barcode", "name", "brand", "servingSize", "calories",
  "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "quantityG", "piecesPerServing",
  "source", "version", "reportCount", "createdAt", "updatedAt"
)
SELECT
  'legacy-' || b."id", u."id", b."barcode", b."name", b."brand", b."servingSize", b."calories",
  b."proteinG", b."carbsG", b."fatG", b."fiberG", b."sugarG", b."quantityG", b."piecesPerServing",
  'legacy-user-correction', 1, b."reportCount", b."createdAt", b."updatedAt"
FROM "BarcodeProduct" b
JOIN "User" u ON u."id" = COALESCE(b."updatedById", b."createdById")
WHERE b."updatedById" IS NOT NULL OR b."createdById" IS NOT NULL;
