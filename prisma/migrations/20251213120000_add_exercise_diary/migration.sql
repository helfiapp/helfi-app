-- Food Diary: ExerciseType + ExerciseEntry (manual + device-synced)

-- Enum: ExerciseSource
DO $$ BEGIN
  CREATE TYPE "ExerciseSource" AS ENUM ('MANUAL', 'FITBIT', 'GARMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Catalog: ExerciseType (MET)
CREATE TABLE IF NOT EXISTS "ExerciseType" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "met" DOUBLE PRECISION NOT NULL,
  "intensity" TEXT,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExerciseType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExerciseType_category_idx" ON "ExerciseType" ("category");
CREATE INDEX IF NOT EXISTS "ExerciseType_name_idx" ON "ExerciseType" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "ExerciseType_name_category_key" ON "ExerciseType" ("name", "category");

-- Entries: ExerciseEntry
CREATE TABLE IF NOT EXISTS "ExerciseEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "startTime" TIMESTAMP(3),
  "durationMinutes" INTEGER NOT NULL,
  "source" "ExerciseSource" NOT NULL,
  "deviceId" TEXT,
  "exerciseTypeId" INTEGER,
  "label" TEXT NOT NULL,
  "met" DOUBLE PRECISION NOT NULL,
  "calories" DOUBLE PRECISION NOT NULL,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExerciseEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExerciseEntry_userId_localDate_idx" ON "ExerciseEntry" ("userId", "localDate");

-- De-dupe device ingests by (userId, source, deviceId). Note: Postgres allows multiple NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS "ExerciseEntry_userId_source_deviceId_key"
ON "ExerciseEntry" ("userId", "source", "deviceId");

DO $$ BEGIN
  ALTER TABLE "ExerciseEntry"
  ADD CONSTRAINT "ExerciseEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExerciseEntry"
  ADD CONSTRAINT "ExerciseEntry_exerciseTypeId_fkey"
  FOREIGN KEY ("exerciseTypeId") REFERENCES "ExerciseType" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
