-- Create essential tables for database sync
-- These tables match the structure used in our database-sync.ts

-- User table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public."User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    gender TEXT CHECK (gender IN ('MALE', 'FEMALE')),
    weight REAL,
    height REAL,
    "bodyType" TEXT CHECK ("bodyType" IN ('ECTOMORPH', 'MESOMORPH', 'ENDOMORPH')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Health Goals table
CREATE TABLE IF NOT EXISTS public."HealthGoal" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    "currentRating" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplements table
CREATE TABLE IF NOT EXISTS public."Supplement" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    timing TEXT[] NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Medications table
CREATE TABLE IF NOT EXISTS public."Medication" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    timing TEXT[] NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HealthGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Supplement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Medication" ENABLE ROW LEVEL SECURITY;

-- Create policies (users can only access their own data)
CREATE POLICY "Users can access own data" ON public."User"
    FOR ALL USING (auth.uid()::text = id);

CREATE POLICY "Users can access own health goals" ON public."HealthGoal"
    FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can access own supplements" ON public."Supplement"
    FOR ALL USING (auth.uid()::text = "userId");

CREATE POLICY "Users can access own medications" ON public."Medication"
    FOR ALL USING (auth.uid()::text = "userId"); 