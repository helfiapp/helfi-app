CREATE TABLE IF NOT EXISTS "FoodAnalysisFeedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "scanId" TEXT,
    "analysisMode" TEXT,
    "analysisHint" TEXT,
    "scope" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reasons" JSONB,
    "comment" TEXT,
    "itemIndex" INTEGER,
    "itemName" TEXT,
    "itemServingSize" TEXT,
    "itemBrand" TEXT,

    CONSTRAINT "FoodAnalysisFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FoodAnalysisFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FoodAnalysisFeedback_userId_idx" ON "FoodAnalysisFeedback"("userId");
CREATE INDEX IF NOT EXISTS "FoodAnalysisFeedback_scanId_idx" ON "FoodAnalysisFeedback"("scanId");
