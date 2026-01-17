-- CreateTable
CREATE TABLE "FoodLibraryItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fdcId" INTEGER,
    "gtinUpc" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "servingSize" TEXT,
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "fiberG" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodLibraryItem_name_idx" ON "FoodLibraryItem"("name");
CREATE INDEX "FoodLibraryItem_brand_idx" ON "FoodLibraryItem"("brand");
CREATE INDEX "FoodLibraryItem_gtinUpc_idx" ON "FoodLibraryItem"("gtinUpc");
CREATE INDEX "FoodLibraryItem_source_idx" ON "FoodLibraryItem"("source");

-- CreateIndex
CREATE UNIQUE INDEX "FoodLibraryItem_source_fdcId_key" ON "FoodLibraryItem"("source", "fdcId");
