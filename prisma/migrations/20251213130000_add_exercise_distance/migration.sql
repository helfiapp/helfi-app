-- Food Diary: optional distance on ExerciseEntry (km)
ALTER TABLE "ExerciseEntry" ADD COLUMN IF NOT EXISTS "distanceKm" DOUBLE PRECISION;

